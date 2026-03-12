using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// Tek bir "altın" hücreyi spawn eder, çizilen yol o hücreden geçerse level sonunda bonus verir.
/// - Sprite ve Material'ı Inspector’dan verirsin.
/// - RandomLevelGenerator yeni level kurarken PrepareForNewLevel(...) çağırır.
[DisallowMultipleComponent]
public class GoldCellManager : MonoBehaviour
{
    public static GoldCellManager Instance { get; private set; }

    [Header("Refs")]
    [SerializeField] private GridManager grid;
    [Tooltip("Altın ikonunun görüneceği Image oluşturmak için parent (genelde hücre Image'ının olduğu Grid canvas)")]
    [SerializeField] private Transform gridCanvasRoot;

    [Header("Gold Visuals")]
    [Tooltip("Altın hücre overlay Sprite")]
    public Sprite goldSprite;
    [Tooltip("Altın overlay için opsiyonel Material (HDR emissive vs.)")]
    public Material goldMaterial;
    [Tooltip("Altın ikonunun hücre üzerindeki yüzdesel boyutu (1 = hücre boyutu)")]
    [Range(0.1f, 1.5f)] public float goldSizeOnCell = 0.8f;
    [Tooltip("Altın ikonuna hafif pop animasyonu ver")]
    public bool popOnSpawn = true;

    [Header("Defaults")]
    [Tooltip("Konfig verilmezse kullanılacak varsayılan bonus")]
    public int defaultGoldBonus = 50;



[Header("Gold Notice Visual")]
[Tooltip("GOLD bildirimi için Text (Unity UI) prefab'ini ver.")]
public GameObject goldTextPrefab;

[Tooltip("Bildirimi hangi parent altında spawn'layalım? (genelde Canvas)")]
public RectTransform noticeSpawnParent;

[Tooltip("Spawn pozisyonu (anchored). Boşsa ortalanır.")]
public Vector2 noticeSpawnAnchoredPos = new Vector2(0f, 0f);

[Tooltip("Spawn pozisyonuna küçük rastgele sapma (px).")]
public float noticeRandomJitter = 16f;

[Tooltip("Pop+fade toplam süresi (sn).")]
public float noticePopupLifetime = 0.9f;

[Tooltip("Pop tepe ölçeği çarpanı (startScale * bu).")]
public float noticePopupPeakScale = 1.15f;

[Tooltip("Yukarı doğru kayma (px).")]
public float noticePopupRise = 48f;

[Header("Gold Collect FX")]
[Tooltip("Altın hücre toplanınca oynatılacak parıltı/pulse efektinin toplam süresi (sn).")]
public float collectFxDuration = 0.38f;
[Tooltip("Toplanma anında altın ikonunun tepe ölçek çarpanı (startScale * bu).")]
public float collectFxScalePeak = 1.25f;
[Tooltip("Parıltı (glow) görselinin tepe alfa değeri.")]
[Range(0f, 1f)] public float collectFxGlowAlpha = 0.55f;

    // Runtime state
    private Cell _goldCell;
    public Cell GoldCell => _goldCell;
    private GameObject _goldVisualGO;
    private bool _collectedThisLevel;
    private int _bonusThisLevel;

    void Awake()
    {
        if (Instance && Instance != this) { Destroy(gameObject); return; }
        Instance = this;

        if (!grid) grid = FindFirstObjectByType<GridManager>();
        if (!gridCanvasRoot && grid) gridCanvasRoot = grid.grid.transform;
        if (!noticeSpawnParent)
        {
            var canvas = FindFirstObjectByType<Canvas>();
            if (canvas) noticeSpawnParent = canvas.transform as RectTransform;
        }
    }

    void OnEnable()
    {
        PathDrawer.OnPairCommitted += OnPairCommittedCheckGold;
        PathDrawer.OnLevelComplete += OnLevelCompleteAwardBonus;
    }
    void OnDisable()
    {
        PathDrawer.OnPairCommitted -= OnPairCommittedCheckGold;
        PathDrawer.OnLevelComplete  -= OnLevelCompleteAwardBonus;
    }

    /// RandomLevelGenerator yeni level kurarken çağırır.
    /// hasGold=false ise temizler ve çıkış yapar.
    public void PrepareForNewLevel(bool hasGold, int goldBonus)
    {
        ClearGoldVisual();

        _goldCell = null;
        _collectedThisLevel = false;
        _bonusThisLevel = (goldBonus > 0 ? goldBonus : defaultGoldBonus);

        if (!hasGold) return;
        if (!grid || grid.width <= 0 || grid.height <= 0) return;

        var candidates = new List<Cell>();
        for (int y = 0; y < grid.height; y++)
        for (int x = 0; x < grid.width; x++)
        {
            var c = grid.cells[x, y];
            if (c == null) continue;
            if (c.isBlocked) continue;
            if (c.isSpool)   continue;
            candidates.Add(c);
        }

        if (candidates.Count == 0) return;
        _goldCell = candidates[Random.Range(0, candidates.Count)];

        SpawnGoldVisual(_goldCell);
    }

    public void PrepareForNewLevel(bool hasGold, int goldBonus, IEnumerable<Cell> allowed)
    {
        ClearGoldVisual();

        _goldCell = null;
        _collectedThisLevel = false;
        _bonusThisLevel = (goldBonus > 0 ? goldBonus : defaultGoldBonus);

        if (!hasGold) return;
        if (!grid || grid.width <= 0 || grid.height <= 0) return;

        List<Cell> pool = null;
        if (allowed != null)
        {
            pool = new List<Cell>();
            foreach (var c in allowed)
            {
                if (c == null) continue;
                if (c.isBlocked) continue;
                if (c.isSpool) continue;
                if (IsCorner(c)) continue;
                if (FreeNeighborCount(c) < 2) continue;
                pool.Add(c);
            }
        }

        if (pool == null || pool.Count == 0)
        {
            pool = new List<Cell>();
            for (int y = 0; y < grid.height; y++)
            for (int x = 0; x < grid.width; x++)
            {
                var c = grid.cells[x, y];
                if (c == null) continue;
                if (c.isBlocked) continue;
                if (c.isSpool) continue;
                if (IsCorner(c)) continue;
                if (FreeNeighborCount(c) < 2) continue;
                pool.Add(c);
            }
        }

        if (pool.Count == 0) return;
        _goldCell = pool[Random.Range(0, pool.Count)];
        SpawnGoldVisual(_goldCell);
    }

    bool IsCorner(Cell c)
    {
        return (c.x == 0 || c.x == grid.width - 1) && (c.y == 0 || c.y == grid.height - 1);
    }

    int FreeNeighborCount(Cell c)
    {
        int count = 0;
        int x = c.x, y = c.y;
        if (x > 0)
        {
            var n = grid.cells[x - 1, y];
            if (!n.isBlocked && !n.isSpool) count++;
        }
        if (x < grid.width - 1)
        {
            var n = grid.cells[x + 1, y];
            if (!n.isBlocked && !n.isSpool) count++;
        }
        if (y > 0)
        {
            var n = grid.cells[x, y - 1];
            if (!n.isBlocked && !n.isSpool) count++;
        }
        if (y < grid.height - 1)
        {
            var n = grid.cells[x, y + 1];
            if (!n.isBlocked && !n.isSpool) count++;
        }
        return count;
    }

    void SpawnGoldVisual(Cell cell)
    {
        if (!cell?.img) return;
        if (!gridCanvasRoot) gridCanvasRoot = cell.img.transform.parent;

        // Altın overlay için child GO
        _goldVisualGO = new GameObject("GoldCellOverlay", typeof(RectTransform), typeof(Image));
        var rt = _goldVisualGO.GetComponent<RectTransform>();
        var img = _goldVisualGO.GetComponent<Image>();

        _goldVisualGO.transform.SetParent(cell.img.transform, false);
        rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.pivot = new Vector2(0.5f, 0.5f);
        rt.anchoredPosition = Vector2.zero;
        rt.localRotation = Quaternion.identity;

        // Boyut → hücre görselini baz al
        var pr = cell.img.rectTransform.rect;
        float size = Mathf.Max(pr.width, pr.height) * Mathf.Clamp(goldSizeOnCell, 0.1f, 1.5f);
        rt.sizeDelta = new Vector2(size, size);

        img.sprite = goldSprite;
        img.material = goldMaterial ? new Material(goldMaterial) : null; // instance
        img.raycastTarget = false;
        img.color = Color.white;

        if (popOnSpawn)
        {
            rt.localScale = Vector3.one * 0.6f;
            StartCoroutine(SimplePop.PopIn(_goldVisualGO, 0.18f));
        }
    }

    void ClearGoldVisual()
    {
        if (_goldVisualGO) Destroy(_goldVisualGO);
        _goldVisualGO = null;
    }

    // ── Dinleyiciler ─────────────────────────────────────────────────────────────

    // Her kilitlenen pair patikası geldiğinde kontrol et: Altın hücre var mı?
    void OnPairCommittedCheckGold(int pairId, List<Cell> committedPath)
    {
        if (_collectedThisLevel) return;
        if (_goldCell == null || committedPath == null || committedPath.Count == 0) return;

        for (int i = 0; i < committedPath.Count; i++)
        {
            if (committedPath[i] == _goldCell)
            {
                _collectedThisLevel = true;
                //GoldCollectedFX();
                //SpawnGoldNotice(_bonusThisLevel);
                StartCoroutine(CoGoldCollectFX());
                break;
            }
        }
    }

    // Level tamamlandığında bonusu uygula
    void OnLevelCompleteAwardBonus(int _playerUsedTiles)
    {
        if (!_collectedThisLevel) return;

        var scorer = FindFirstObjectByType<LevelScoreManager>();
        if (!scorer)
        {
            Debug.LogWarning("[GoldCellManager] LevelScoreManager bulunamadı; bonus uygulanamadı.");
            return;
        }

        scorer.AwardBonus(_bonusThisLevel, alsoPopText: true, label: "GOLD");
        // Sonraki level için görseli temizle (RandomLevelGenerator zaten Prepare çağıracak)
    }


    // Gold collect FX animation
    IEnumerator CoGoldCollectFX()
    {
        if (!_goldVisualGO) yield break;

        var rt  = _goldVisualGO.GetComponent<RectTransform>();
        var img = _goldVisualGO.GetComponent<Image>();
        if (!rt || !img) yield break;

        Vector3 startScale = rt.localScale;
        Color   startCol   = img.color;

        // Opsiyonel emissive desteği
        Material mat = img.material;
        bool hasEmission = mat && mat.HasProperty("_EmissionColor");
        Color emissionStart = hasEmission ? mat.GetColor("_EmissionColor") : Color.black;

        // Geçici glow child
        GameObject glow = new GameObject("GoldGlowPulse", typeof(RectTransform), typeof(Image));
        var glowRt = glow.GetComponent<RectTransform>();
        var glowImg = glow.GetComponent<Image>();
        glow.transform.SetParent(_goldVisualGO.transform.parent, false);
        glowRt.anchorMin = glowRt.anchorMax = new Vector2(0.5f, 0.5f);
        glowRt.pivot = new Vector2(0.5f, 0.5f);
        glowRt.anchoredPosition = rt.anchoredPosition;
        glowRt.localRotation = Quaternion.identity;
        glowRt.sizeDelta = rt.sizeDelta * 1.15f;
        glowImg.sprite = img.sprite;
        glowImg.raycastTarget = false;
        glowImg.material = null; // sade image
        glowImg.color = new Color(1f, 0.9f, 0.25f, 0f);

        float dur  = Mathf.Max(0.06f, collectFxDuration);
        float half = dur * 0.5f;
        float t = 0f;

        // İlk yarı: scale -> peak, glow alfa yüksel, hafif döndür
        while (t < half)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / half);
            // easeOutBack benzeri
            float overshoot = 1.70158f;
            float ease = 1f + overshoot * Mathf.Pow(k - 1f, 3) + overshoot * Mathf.Pow(k - 1f, 2);

            rt.localScale = startScale * Mathf.Lerp(1f, collectFxScalePeak, Mathf.SmoothStep(0f, 1f, ease));
            img.color = Color.Lerp(startCol, new Color(1f, 0.95f, 0.6f, startCol.a), k);

            if (hasEmission)
            {
                // Emission pik yapıp dönecek
                Color targetEmiss = new Color(1f, 0.85f, 0.2f) * 2.2f;
                mat.SetColor("_EmissionColor", Color.Lerp(emissionStart, targetEmiss, k));
            }

            glowRt.localEulerAngles = new Vector3(0f, 0f, Mathf.Lerp(0f, 28f, k));
            glowRt.sizeDelta = Vector2.Lerp(rt.sizeDelta * 1.05f, rt.sizeDelta * 1.35f, k);
            glowImg.color = new Color(1f, 0.9f, 0.25f, Mathf.Lerp(0f, collectFxGlowAlpha, k));

            yield return null;
        }

        // İkinci yarı: scale 1'e dön, glow sön, emission geri
        float t2 = 0f;
        float d2 = Mathf.Max(0.01f, dur - half);
        while (t2 < d2)
        {
            t2 += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t2 / d2);
            if(!rt) break;
            rt.localScale = startScale * Mathf.Lerp(collectFxScalePeak, 1f, Mathf.SmoothStep(0f, 1f, k));
            img.color = Color.Lerp(new Color(1f, 0.95f, 0.6f, startCol.a), startCol, k);

            if (hasEmission)
            {
                mat.SetColor("_EmissionColor", Color.Lerp(new Color(1f, 0.85f, 0.2f) * 2.2f, emissionStart, k));
            }

            glowRt.localEulerAngles = new Vector3(0f, 0f, Mathf.Lerp(28f, 48f, k));
            glowRt.sizeDelta = Vector2.Lerp(rt.sizeDelta * 1.35f, rt.sizeDelta * 1.6f, k);
            glowImg.color = new Color(1f, 0.9f, 0.25f, Mathf.Lerp(collectFxGlowAlpha, 0f, k));

            yield return null;
        }
        if(!rt) yield break;
        // Temizlik
        if (hasEmission) mat.SetColor("_EmissionColor", emissionStart);
        img.color = startCol;
        rt.localScale = startScale;
        Destroy(glow);
    }


    void SpawnGoldNotice(int bonus)
    {
        if (!goldTextPrefab || !noticeSpawnParent) return;

        var go = Instantiate(goldTextPrefab, noticeSpawnParent);
        var rt = go.GetComponent<RectTransform>();
        if (!rt) rt = go.AddComponent<RectTransform>();

        // position
        Vector2 jitter = (noticeRandomJitter > 0f)
            ? new Vector2(Random.Range(-noticeRandomJitter, noticeRandomJitter), Random.Range(-noticeRandomJitter, noticeRandomJitter))
            : Vector2.zero;
        rt.anchoredPosition = noticeSpawnAnchoredPos + jitter;

        // text
        var uiText = go.GetComponent<Text>();
        if (uiText) uiText.text = $"{bonus}";

        StartCoroutine(CoPopFadeDestroy(go, noticePopupLifetime, noticePopupPeakScale, noticePopupRise));
    }

    IEnumerator CoPopFadeDestroy(GameObject go, float duration, float peakScale, float risePx)
    {
        if (!go) yield break;
        var rt = go.GetComponent<RectTransform>();
        var cg = go.GetComponent<CanvasGroup>();
        if (!cg) cg = go.AddComponent<CanvasGroup>();

        Vector3 startScale = rt.localScale;

        float t = 0f;
        float half = Mathf.Clamp(duration * 0.4f, 0.05f, duration - 0.05f);
        Vector2 startPos = rt.anchoredPosition;
        Vector2 endPos   = startPos + new Vector2(0f, Mathf.Max(0f, risePx));

        while (t < half)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / half);
            rt.localScale = startScale * Mathf.Lerp(1f, peakScale, k);
            cg.alpha = Mathf.Lerp(0f, 1f, k);
            rt.anchoredPosition = Vector2.LerpUnclamped(startPos, endPos, k * 0.5f);
            yield return null;
        }

        float t2 = 0f;
        float d2 = Mathf.Max(0.01f, duration - half);
        while (t2 < d2)
        {
            t2 += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t2 / d2);
            rt.localScale = startScale * Mathf.Lerp(peakScale, 1f, k);
            cg.alpha = Mathf.Lerp(1f, 0f, k);
            rt.anchoredPosition = Vector2.LerpUnclamped(startPos + new Vector2(0, risePx*0.5f), endPos, k);
            yield return null;
        }

        Destroy(go);
    }
}
