using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.EventSystems;
using System.Collections.Generic;

/// Flow/pipe tarzı çizim aracı + StrokeLink segmentleri (sprite tabanlı görselleştirme).
/// - Spool veya kendi rengindeki boyalı bir hücreden başlar.
/// - Sürüklerken hücre hücre boyar; hızlı çekişte aradaki kareleri doldurur (4-yön).
/// - Geri gelirken backtrack: boyadıklarını ve segmentleri sök + anchor'ı taşı.
/// - Başka renge (spool hariç) giremez.
/// - Bırakınca bağlanmadıysa: sadece bu stroke temizlenir (kalıcılar korunur).
/// - Hedef spool’a girince: StrokeLink son segmenti bırakır, çift kilitlenir.
/// BLOK hücreler kalıcıdır ve asla silinmez.
public class PathDrawer : MonoBehaviour, IPointerDownHandler, IDragHandler, IPointerUpHandler
{
    public static System.Action<int> OnLevelComplete;      // oyuncunun kullandığı toplam taş sayısını bildirir
    public static System.Action OnLevelCompleteFunctions;   
    public static System.Action<int, List<Cell>> OnPairCommitted; // bağlanan bir çifti (pairId ve patika) bildirir

    [Header("Refs")]
    public GridManager gridManager;
    public StrokeLink strokeLink;

    [Header("Audio")]
    public AudioManager audioManager; // Inspector'dan atanır

    [Header("Kurallar")]
    public bool validateOnConnect = true;
    public bool validateOnRelease = false;
    public bool requireFillAllToWin = true;
    public bool clearUnconnectedOnRelease = true;

    [Header("Görsel")]
    [Range(0,1)] public float emptyAlpha = 0.08f;
    public Sprite blockHitGlow;           // paketindeki halka/glow sprite’ı
    public RectTransform shakeTarget;     // istersen gridRoot veya canvas
    [Header("Screen Shake")]
    public bool screenShakeOnBlock = true;
    [Tooltip("UI (shakeTarget) için genlik")]
    public float uiShakeIntensity = 8f;
    [Tooltip("UI shake süresi")]
    public float uiShakeDuration = 0.12f;

    public FullscreenChannelFX fullscreenChannelFX;

    [Tooltip("Kamera titremesi için opsiyonel Transform. Boşsa Camera.main kullanılır.")]
    public Transform cameraToShake;
    [Tooltip("Kamera shake genliği (dünya birimi)")]
    public float camShakeAmplitude = 0.06f;
    [Tooltip("Kamera shake frekansı (salınım/s)")]
    public float camShakeFrequency = 22f;
    [Tooltip("Kamera shake süresi")]
    public float camShakeDuration = 0.12f;
    [Tooltip("UI shake frekansı (salınım/s)")]
    public float uiShakeFrequency = 28f;

    [Header("Block FX Cooldown")]
    [Tooltip("Blok (duvar) çarpma efektlerinin saniyedeki maksimum tetiklenme sayısı")] public float blockFxPerSecond = 2f; // 2 Hz
    float _nextBlockFxTime = 0f; // unscaled time tabanlı

    [Header("Debug")]
    public bool verboseLogging = false;
    public bool logInterpolation = false;
    
    [Header("Block Glow (URP Bloom)")]
    public Material blockGlowMat;        // Shader Graph: UI_EmissiveGlow
    [Min(0f)] public float blockGlowIntensity = 6f; // 4–10 arası iyi
    public Color blockGlowColor = new Color(1f, 0.85f, 0.35f, 1f); // sıcak sarımsı

    // durum
    int activePair = -1;
    private int activeColorIndex = 0;
    Cell lastCell = null;
    readonly List<Cell> currentPath = new();
    readonly HashSet<Cell> strokePainted = new();
    readonly HashSet<int> lockedPairs  = new();
    Cell strokeStartSpool = null;
    Camera lastEventCam = null;
    
    // Shake state
    Coroutine _camShakeCo = null;
    Coroutine _uiShakeCo  = null;
    Vector3  _camBaseLocalPos;
    bool     _camBaseSet = false;
    Vector2  _uiBaseAnchoredPos;
    bool     _uiBaseSet = false;

    void Log(string msg) { if (verboseLogging) Debug.Log("[PathDrawer] " + msg); }
    string CellStr(Cell c) => c == null ? "null" : $"({c.x},{c.y}) owner={c.ownerId} spool={c.isSpool} blocked={c.isBlocked}";
    string C(Cell c) => CellStr(c);

    #region Pointer events
    public void OnPointerDown(PointerEventData e)
    {
        lastEventCam = e.pressEventCamera;
        Log($"DOWN screen={e.position} cam={(e.pressEventCamera ? e.pressEventCamera.name : "null")}");
        if (!CoordinateUtil.TryScreenToCell(gridManager, e.position, e.pressEventCamera, out var c))
        { Log("DOWN: hit=NONE (koordinat eşleşmedi)"); return; }
        Log("DOWN: hit=" + C(c));

        // Kilitli bir çiftin spool veya gerçek boyalı hücresi ise oynatmayalım
        bool isRealPaint = (c.ownerId >= 0) && (c.img != null && c.img.color.a > 0.5f);
        if (lockedPairs.Contains(c.ownerId) && (c.isSpool || isRealPaint))
        { Log("DOWN: locked pair " + c.ownerId + ", ignore"); return; }

        // Spool’a bastıysak başlangıç
        if (c.isSpool)
        {
            BeginFromSpool(c);
            if (strokeLink && c.img) {
                strokeLink.BeginStrokeWithGroup(activePair, c.img.rectTransform, activeColorIndex, lastEventCam);
            }
            return;
        }

        // Kendi rengimizde boyalı hücreye bastıysak başlangıç
        if (c.ownerId >= 0)
        {
            BeginFromPainted(c);
            if (strokeLink && c.img) {
                strokeLink.BeginStrokeWithGroup(activePair, c.img.rectTransform, activeColorIndex, lastEventCam);
            }
            return;
        }

        // Boş veya bloklu hücre — başlamıyoruz
        Log("DOWN: empty or blocked cell, ignored");
    }

    public void OnDrag(PointerEventData e)
    {
        // henüz bir aktivite yoksa sadece geçici çizgiyi güncelle
        if (activePair < 0) { strokeLink?.UpdateToScreen(e.position, lastEventCam); return; }
        if (!CoordinateUtil.TryScreenToCell(gridManager, e.position, e.pressEventCamera, out var target))
        { strokeLink?.UpdateToScreen(e.position, lastEventCam); return; }
        if (lastCell == null || target == lastCell)
        { strokeLink?.UpdateToScreen(e.position, lastEventCam); return; }

        if (logInterpolation) Log($"Interpolate from {C(lastCell)} to {C(target)}");
        foreach (var step in InterpolateOrthogonal(lastCell, target))
        {
            if (!StepTo(step)) { Log("StepTo blocked at " + C(step)); break; }
        }
        strokeLink?.UpdateToScreen(e.position, lastEventCam);
    }

    public void OnPointerUp(PointerEventData e)
    {
        Log("UP");
        bool connectedByStroke = false;
        if (activePair >= 0)
        {
            connectedByStroke = StrokeReachedOppositeSpool();
            Log("UP: StrokeReachedOppositeSpool = " + connectedByStroke);
        }

        if (activePair >= 0 && connectedByStroke)
        {
            // bağlanıp bitirdik: kilitle ve commit et
            Log("UP: LOCK pair " + activePair);
            LockPair(activePair);

            if (strokeLink != null && TryGetSpools(activePair, out var a, out var b))
            {
                var end = (strokeStartSpool == a) ? b : a;
                if (end && end.img) strokeLink.CommitToEnd(end.img.rectTransform);
            }

            // kalıcı bağlar tutulduğu için state sıfırla
            ResetCurrentStrokeState();
        }
        else if (activePair >= 0 && clearUnconnectedOnRelease)
        {
            audioManager?.Play("path_cancel");
            // bağlanmadı — sadece bu strokta boyananlar temizle
            Log("UP: Not connected → clear ONLY strokePainted (" + strokePainted.Count + ")");
            foreach (var c in strokePainted) if (!c.isSpool) Unpaint(c);
            strokePainted.Clear();
            currentPath.Clear();
            strokeLink?.CancelStroke(); // sadece geçici segmentleri sil
            ResetCurrentStrokeState();
        }
        else
        {
            // hiçbir şey başlamamıştı — geçici çizgiyi kapat
            strokeLink?.CancelStroke();
        }

        if (validateOnRelease && activePair >= 0) { Log("UP: ValidateWin()"); ValidateWin(); }
    }
    #endregion

    #region Begin modes
    void BeginFromSpool(Cell spool)
    {
        // daha önce bu renge ait çizilmiş grubun hepsini sil
        if (strokeLink != null)
            strokeLink.DestroyGroupForPair(spool.ownerId);

        strokeStartSpool = spool;
        activePair = spool.ownerId;

        // ip rengi paletten
        var vis = spool?.img ? spool.img.GetComponent<CellVisual>() : null;
        Color lineCol = Color.white;
        if (vis && vis.palette) lineCol = vis.palette.GetLineColor(activePair);
        activeColorIndex = activePair;

        strokePainted.Clear();
        ClearPairPaint(activePair);

        currentPath.Clear();
        currentPath.Add(spool);
        lastCell = spool;
    }

    void BeginFromPainted(Cell painted)
    {
        // daha önce bu renge ait çizilmiş grubun hepsini sil
        if (strokeLink != null)
            strokeLink.DestroyGroupForPair(painted.ownerId);

        strokeStartSpool = null;
        activePair = painted.ownerId;

        // ip rengi paletten
        var vis = painted?.img ? painted.img.GetComponent<CellVisual>() : null;
        Color lineCol = Color.white;
        if (vis && vis.palette) lineCol = vis.palette.GetLineColor(activePair);
        activeColorIndex = activePair;

        strokePainted.Clear();
        currentPath.Clear();
        currentPath.Add(painted);
        lastCell = painted;
    }
    #endregion
    
    static readonly int _BaseColorID     = Shader.PropertyToID("_BaseColor");
static readonly int _EmissionColorID = Shader.PropertyToID("_EmissionColor");

    #region Step logic
    bool StepTo(Cell next)
    {
        Log("StepTo " + C(next));
        if (next == null) return false;

        // Duvar/blok: geçilmez
        if (next.isBlocked)
        {
            // log her zaman, fakat FX'leri cooldown ile sınırla
            Log("StepTo blocked: WALL at " + CellStr(next));

            bool canFx = Time.unscaledTime >= _nextBlockFxTime;
            if (canFx)
            {
                _nextBlockFxTime = Time.unscaledTime + 1f / Mathf.Max(0.01f, blockFxPerSecond);

                audioManager?.Play("step_blocked");
                fullscreenChannelFX?.Pulse();

                var rt  = next?.img ? next.img.rectTransform : null;
                var img = next?.img;

                // 1) puflayan ölçek
                if (rt) StartCoroutine(SmoothTweens.ScalePunch(rt));

                // 2) mevcut 2D glow halkası (sprite overlay)
                if (rt && blockHitGlow)
                    UIFx.BurstGlow(this, rt, blockHitGlow, new Color(1f, 0.75f, 0.2f, 0.9f), 0.65f, 1.35f, 0.22f);

                // 2.5) — YENİ — URP Bloom'lu emissive halka
                if (rt && blockHitGlow && blockGlowMat)
                {
                    var glowCol = blockGlowColor;
                    StartCoroutine(CoBlockBloomRing(rt, blockHitGlow, glowCol, 0.70f, 1.40f, 0.22f, blockGlowMat, blockGlowIntensity));
                }

                RetroFXOrchestrator.HitBlock();

                // 3) minik flash
                if (img)
                    UIFx.HitFlash(this, img, new Color(1f, 1f, 1f, 0.9f), 0.06f);

                // 4) ekran/grid shake — cooldown'a tabi
                if (screenShakeOnBlock)
                    TriggerScreenShake();
            }
            else
            {
                // Cooldown sırasında sadece hafif (veya hiç) işlem yap — burada efekt atlanır
            }

            return false;
        }

        // Başka renge ait spool’a girme (aktif renkten farklı spool)
        if (next.isSpool && next.ownerId != activePair) return false;

        // Geri dönüş / backtrack
        int idx = currentPath.IndexOf(next);
        if (idx >= 0)
        {
            // path listesinde geri gidiyoruz — boyanan hücreleri siliyoruz
            audioManager?.Play("path_backtrack");
            for (int i = currentPath.Count - 1; i > idx; i--)
            {
                var rem = currentPath[i];
                if (!rem.isSpool && strokePainted.Contains(rem))
                {
                    Unpaint(rem);
                    strokePainted.Remove(rem);
                }
                currentPath.RemoveAt(i);
            }
            lastCell = currentPath[currentPath.Count - 1];

            // segment ve knot’ları tekrar kur
            if (strokeLink != null)
            {
                var list = new List<RectTransform>();
                foreach (var cell in currentPath)
                    if (cell?.img) list.Add(cell.img.rectTransform);
                strokeLink.RebuildFromCells(list);
            }
            return true;
        }

        // Engel: başka renge boyalı hücreye giremeyiz
        if (next.ownerId >= 0 && next.ownerId != activePair)
        { Log("StepTo blocked: other color cell " + C(next)); return false; }

        // İleri yönde kendi boyalı hücreye giremeyiz (backtrack hariç)
        if (!next.isSpool && next.ownerId == activePair)
        { Log("StepTo blocked: own painted cell ahead " + C(next)); return false; }

        // Hücre boyama (spool hariç)
        if (!next.isSpool)
        {
            if (next.ownerId != activePair) strokePainted.Add(next);
            Paint(next, activePair);

            if (strokeLink && lastCell?.img && next.img)
                strokeLink.AddSegmentToCell(next.img.rectTransform);
            audioManager?.Play("path_step");
        }

        currentPath.Add(next);
        lastCell = next;

        // Hedef spool’a ulaştıysak
        if (next.isSpool && next.ownerId == activePair)
        {
            audioManager?.Play("pair_complete");
            if (strokeLink && next.img) strokeLink.CommitToEnd(next.img.rectTransform);

            // snapshot: geri alabilmek için path’i bildir
            var snapshot = new List<Cell>(currentPath);
            OnPairCommitted?.Invoke(activePair, snapshot);

            Log("LOCK pair " + activePair);
            LockPair(activePair);

            // state reset
            ResetCurrentStrokeState();

            if (validateOnConnect) ValidateWin();
            return true;
        }

        // geçici çizgiyi son hücreye sabitle
        if (strokeLink && lastCell?.img) strokeLink.UpdateToCell(lastCell.img.rectTransform);
        return true;
    }
    #endregion
    
    void TriggerScreenShake()
    {
        // UI: anchoredPosition üzerinden, drift yok
        if (shakeTarget)
        {
            if (!_uiBaseSet)
            {
                _uiBaseAnchoredPos = shakeTarget.anchoredPosition;
                _uiBaseSet = true;
            }
            if (_uiShakeCo != null) StopCoroutine(_uiShakeCo);
            _uiShakeCo = StartCoroutine(CoUIRectShake(shakeTarget, uiShakeIntensity, uiShakeFrequency, uiShakeDuration));
        }

        // Kamera: localPosition üzerinden, drift yok
        var t = cameraToShake ? cameraToShake : (Camera.main ? Camera.main.transform : null);
        if (t)
        {
            if (!_camBaseSet)
            {
                _camBaseLocalPos = t.localPosition;
                _camBaseSet = true;
            }
            if (_camShakeCo != null) StopCoroutine(_camShakeCo);
            _camShakeCo = StartCoroutine(CoCameraShakeImproved(t, camShakeAmplitude, camShakeFrequency, camShakeDuration));
        }
    }
    
    System.Collections.IEnumerator CoCameraShakeImproved(Transform target, float amplitude, float frequency, float duration)
    {
        if (!target || amplitude <= 0f || frequency <= 0f || duration <= 0f) yield break;

        var basePos = _camBaseSet ? _camBaseLocalPos : target.localPosition;
        float t = 0f;
        while (t < duration)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / duration);
            float damper = 1f - Mathf.SmoothStep(0f, 1f, k);

            float n1 = (Mathf.PerlinNoise(0.123f, Time.unscaledTime * frequency) - 0.5f) * 2f;
            float n2 = (Mathf.PerlinNoise(1.234f, Time.unscaledTime * frequency) - 0.5f) * 2f;

            Vector3 offset = new Vector3(n1, n2, 0f) * (amplitude * damper);
            target.localPosition = basePos + offset;
            yield return null;
        }
        target.localPosition = basePos;
    }
    
    System.Collections.IEnumerator CoUIRectShake(RectTransform target, float amplitudePx, float frequency, float duration)
    {
        if (!target || amplitudePx <= 0f || frequency <= 0f || duration <= 0f) yield break;

        var basePos = _uiBaseSet ? _uiBaseAnchoredPos : target.anchoredPosition;
        float t = 0f;
        while (t < duration)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / duration);
            float damper = 1f - Mathf.SmoothStep(0f, 1f, k);

            float n1 = (Mathf.PerlinNoise(5.678f, Time.unscaledTime * frequency) - 0.5f) * 2f;
            float n2 = (Mathf.PerlinNoise(6.789f, Time.unscaledTime * frequency) - 0.5f) * 2f;

            Vector2 offset = new Vector2(n1, n2) * (amplitudePx * damper);
            target.anchoredPosition = basePos + offset;
            yield return null;
        }
        target.anchoredPosition = basePos;
    }

    System.Collections.IEnumerator CoCameraShake(Transform target, float amplitude, float frequency, float duration)
    {
        if (!target || amplitude <= 0f || frequency <= 0f || duration <= 0f) yield break;

        Vector3 basePos = target.localPosition;
        float t = 0f;

        // TimeScale'den etkilenmesin diye unscaled kullan
        while (t < duration)
        {
            t += Time.unscaledDeltaTime;
            float k = t / duration;

            // sönümleme (başta yüksek, sonra azalan)
            float damper = 1f - Mathf.SmoothStep(0f, 1f, k);

            // basit perlin benzeri salınım
            float sx = (Mathf.PerlinNoise(0f, Time.unscaledTime * frequency) - 0.5f) * 2f;
            float sy = (Mathf.PerlinNoise(1f, Time.unscaledTime * frequency) - 0.5f) * 2f;

            target.localPosition = basePos + new Vector3(sx, sy, 0f) * (amplitude * damper);
            yield return null;
        }

        target.localPosition = basePos;
    }
    
    IEnumerator CoBlockBloomRing(RectTransform parent, Sprite ringSprite, Color baseCol, float scaleFrom, float scaleTo, float duration, Material glowMat, float intensity) 
    {
        if (!parent || !ringSprite || !glowMat) yield break;

        // Child GO + Image
        var go = new GameObject("BlockBloomFX", typeof(RectTransform), typeof(Image));
        var rt = go.GetComponent<RectTransform>();
        var img = go.GetComponent<Image>();

        go.transform.SetParent(parent, false);
        rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.pivot     = new Vector2(0.5f, 0.5f);
        rt.anchoredPosition = Vector2.zero;   // hücrenin merkezinde
        rt.localRotation    = Quaternion.identity;

        // Boyut: hücre görselinin boyutuna yakın
        var pr = parent.rect;
        float size = Mathf.Max(pr.width, pr.height);
        rt.sizeDelta = new Vector2(size, size);

        // Sprite + materyal (INSTANCE!)
        img.sprite = ringSprite;
        img.raycastTarget = false;

        var mat = new Material(glowMat);
        img.material = mat;

        // Renkler (Base + Emission HDR)
        if (mat.HasProperty(_BaseColorID))     mat.SetColor(_BaseColorID, baseCol);
        if (mat.HasProperty(_EmissionColorID)) mat.SetColor(_EmissionColorID, baseCol * intensity);

        // Başlangıç transform/alpha
        float t = 0f;
        float aFrom = 1f, aTo = 0f;
        rt.localScale = Vector3.one * scaleFrom;
        var col = img.color; col.a = aFrom; img.color = col;

        // Animasyon
        while (t < 1f)
        {
            t += Time.unscaledDeltaTime / Mathf.Max(0.0001f, duration);
            float k = Mathf.SmoothStep(0f, 1f, t);

            // scale
            float s = Mathf.LerpUnclamped(scaleFrom, scaleTo, k);
            rt.localScale = new Vector3(s, s, 1f);

            // fade out
            float a = Mathf.LerpUnclamped(aFrom, aTo, k);
            col.a = a; img.color = col;

            yield return null;
        }

        Destroy(go);
    }

    #region Painting helpers
    IEnumerable<Cell> InterpolateOrthogonal(Cell from, Cell to)
    {
        int cx = from.x, cy = from.y;
        int tx = to.x, ty = to.y;
        while (cx != tx || cy != ty)
        {
            if (Mathf.Abs(tx - cx) >= Mathf.Abs(ty - cy)) cx += (tx > cx) ? 1 : -1;
            else                                          cy += (ty > cy) ? 1 : -1;
            yield return gridManager.cells[cx, cy];
        }
    }

    void Paint(Cell c, int pairId)
    {
        // blok veya spool ise boyama yapma
        if (c.isBlocked || c.isSpool) return;
        c.ownerId = pairId;
        var vis = c?.img ? c.img.GetComponent<CellVisual>() : null;
        if (vis != null)
        {
            vis.SetPaintSprite(pairId); vis.emptyAlpha = emptyAlpha; 
            
        }
        else if (c.img)   { c.img.color = Color.white; }
        Log($"PAINT {C(c)} (sprite)");
    }

    void Unpaint(Cell c)
    {
        if (c == null || c.isSpool || c.isBlocked) return;
        c.ownerId = -1;
        var vis = c?.img ? c.img.GetComponent<CellVisual>() : null;
        if (vis != null) { vis.SetEmpty(); vis.emptyAlpha = emptyAlpha; }
        else if (c.img)   { c.img.color = new Color(1f,1f,1f,emptyAlpha); }
        Log("UNPAINT " + C(c));
    }

    void ClearPairPaint(int pairId)
    {
        if (lockedPairs.Contains(pairId)) { Log("ClearPairPaint blocked: locked pair"); return; }
        for (int y=0; y<gridManager.height; y++)
        for (int x=0; x<gridManager.width; x++)
        {
            var c = gridManager.cells[x,y];
            // Spool veya blok değil ise ve bu pair’e aitse temizle
            if (!c.isSpool && !c.isBlocked && c.ownerId == pairId) Unpaint(c);
            strokePainted.Remove(c);
        }
    }
    #endregion

    #region Win/validation
    void ValidateWin()
    {
        bool pairsOk = InternalPairsConnected();
        bool filledOk = !requireFillAllToWin || InternalAllFilled();
        Log($"ValidateWin: pairsOk={pairsOk} filledOk={filledOk}");
        if (pairsOk && filledOk)
        {
            Debug.Log("LEVEL COMPLETE! 🎉");
            int used = CountPaintedTiles();          // oyuncunun kullandığı hücre sayısı
            Log($"LevelComplete: playerUsedTiles={used}");
            OnLevelComplete?.Invoke(used);
            OnLevelCompleteFunctions?.Invoke();
            //
            audioManager.Play("level_complete");
        }
    }

    int CountPaintedTiles()
    {
        int cnt = 0;
        for (int y = 0; y < gridManager.height; y++)
        for (int x = 0; x < gridManager.width; x++)
        {
            var c = gridManager.cells[x, y];
            if (!c.isSpool && !c.isBlocked && c.ownerId >= 0) cnt++;
        }
        return cnt;
    }

    bool InternalAllFilled()
    {
        for (int y=0; y<gridManager.height; y++)
        for (int x=0; x<gridManager.width; x++)
        {
            var c = gridManager.cells[x,y];
            if (!c.isSpool && !c.isBlocked && c.ownerId < 0) return false;
        }
        return true;
    }

    bool InternalPairsConnected()
    {
        var pairs = new Dictionary<int, List<Cell>>();
        for (int y=0; y<gridManager.height; y++)
        for (int x=0; x<gridManager.width; x++)
        {
            var c = gridManager.cells[x,y];
            if (c.isSpool)
            {
                if (!pairs.ContainsKey(c.ownerId)) pairs[c.ownerId] = new List<Cell>();
                pairs[c.ownerId].Add(c);
            }
        }
        foreach (var kv in pairs)
        {
            var list = kv.Value;
            if (list.Count < 2) return false;
            if (!BFS_IsConnected(kv.Key, list[0], list[1])) return false;
        }
        return true;
    }

    bool StrokeReachedOppositeSpool()
    {
        if (activePair < 0) return false;
        foreach (var c in currentPath)
        {
            if (c == null) continue;
            if (c.isSpool && c.ownerId == activePair)
            {
                if (strokeStartSpool != null) { if (c != strokeStartSpool) return true; }
                else return true;
            }
        }
        return false;
    }

    void LockPair(int pairId)
    {
        if (!lockedPairs.Add(pairId)) return;

        // Spool görsellerini connected/locked yap
        if (TryGetSpools(pairId, out var a, out var b))
        {
            var va = a?.img ? a.img.GetComponent<CellVisual>() : null;
            var vb = b?.img ? b.img.GetComponent<CellVisual>() : null;
            if (va != null) { va.SetSpoolConnected(pairId); va.SetLocked(true); }
            if (vb != null) { vb.SetSpoolConnected(pairId); vb.SetLocked(true); }
        }

        // Dalga/pulse animasyonu
        StartCoroutine(CoPulseWaveAlongCurrentPath());
    }
    #endregion

    #region Connectivity + neighbours
    System.Collections.IEnumerator CoPulseWaveAlongCurrentPath()
    {
        var snapshot = new List<Cell>(currentPath);
        float delayStep = 0.02f;
        for (int i = 0; i < snapshot.Count; i++)
        {
            var c = snapshot[i];
            var vis = c?.img ? c.img.GetComponent<CellVisual>() : null;
            if (vis != null) vis.Pulse(1.08f, 0.12f);
            yield return new WaitForSecondsRealtime(delayStep);
        }
    }

    bool TryGetSpools(int pairId, out Cell a, out Cell b)
    {
        a=null; b=null;
        for (int y=0; y<gridManager.height; y++)
        for (int x=0; x<gridManager.width; x++)
        {
            var c = gridManager.cells[x,y];
            if (c.isSpool && c.ownerId == pairId)
            { if (a==null) a=c; else if (b==null){ b=c; break; } }
        }
        return (a!=null && b!=null);
    }
    
    // PathDrawer.cs içine, class'ın içine ekle
    /// Yeni level yüklenmeden/ yüklendikten hemen sonra çağır.
    /// - Geçici çizgiyi ve path listelerini temizler
    /// - (opsiyonel) kilitli çift listesini sıfırlar
    /// - (opsiyonel) StrokeLink üzerindeki tüm grup objelerini de temizler
    public void ResetForNewLevel(bool clearLockedPairs = true, bool clearStrokeGroups = true)
    {
        // Geçici çizgiyi kapat
        if (strokeLink) strokeLink.CancelStroke();

        // Anlık stroke state
        activePair = -1;
        lastCell = null;
        strokeStartSpool = null;

        // Listeler
        currentPath.Clear();
        strokePainted.Clear();
        if (clearLockedPairs) lockedPairs.Clear();
    }

    bool BFS_IsConnected(int pairId, Cell a, Cell b)
    {
        var q = new Queue<Cell>();
        var seen = new bool[gridManager.width, gridManager.height];
        q.Enqueue(a); seen[a.x, a.y] = true;
        while (q.Count > 0)
        {
            var c = q.Dequeue();
            if (c == b) return true;
            foreach (var n in Neigh(c))
            {
                if (seen[n.x, n.y]) continue;
                // geçilebilirlik: aynı pair’e ait yol ya da spool
                if ((n.isSpool && n.ownerId == pairId) || (!n.isSpool && !n.isBlocked && n.ownerId == pairId))
                {
                    seen[n.x, n.y] = true;
                    q.Enqueue(n);
                }
            }
        }
        return false;
    }

    IEnumerable<Cell> Neigh(Cell c)
    {
        int x=c.x, y=c.y;
        if (x>0) yield return gridManager.cells[x-1,y];
        if (x<gridManager.width-1) yield return gridManager.cells[x+1,y];
        if (y>0) yield return gridManager.cells[x,y-1];
        if (y<gridManager.height-1) yield return gridManager.cells[x,y+1];
    }
    #endregion

    #region Reset + undo
    void ResetCurrentStrokeState()
    {
        activePair = -1;
        lastCell = null;
        strokePainted.Clear();
        currentPath.Clear();
        strokeStartSpool = null;
    }

    // UndoController çağırır: bir çift kilidini açar, boyalıları temizler, spool’ları idle’a döndürür
    public int UnlockAndClearPair(int pairId)
    {
        int cleared = 0;
        // kilidi aç
        if (lockedPairs.Contains(pairId)) lockedPairs.Remove(pairId);

        for (int y = 0; y < gridManager.height; y++)
        for (int x = 0; x < gridManager.width; x++)
        {
            var c = gridManager.cells[x, y];
            if (c.isSpool && c.ownerId == pairId)
            {
                // spool görselini idle yap
                var vis = c?.img ? c.img.GetComponent<CellVisual>() : null;
                if (vis != null) { vis.SetSpoolIdle(pairId); vis.SetLocked(false); }
            }
            else if (!c.isSpool && !c.isBlocked && c.ownerId == pairId)
            {
                Unpaint(c);
                cleared++;
            }
        }
        Log($"Undo: pair {pairId} clearedTiles={cleared}");
        return cleared;
    }
    #endregion
}