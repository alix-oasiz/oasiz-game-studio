using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// Tek bir "zaman" hücresi spawn eder. Çizilen yol o hücreden GEÇEREK pair yapılınca
/// anında sayaçtan +X saniye ekler. Görsel/FX ve popup sistemi GoldCellManager ile aynıdır.
[DisallowMultipleComponent]
public class TimeCellManager : MonoBehaviour
{
    public static TimeCellManager Instance { get; private set; }

    [Header("Refs")]
    [SerializeField] private GridManager grid;
    [Tooltip("Zaman ikonunun görüneceği Image oluşturmak için parent (genelde hücre Image'ının olduğu Grid canvas)")]
    [SerializeField] private Transform gridCanvasRoot;

    [Header("Time Visuals")]
    [Tooltip("Zaman hücre overlay Sprite")]
    public Sprite timeSprite;
    [Tooltip("Zaman overlay için opsiyonel Material (HDR emissive vs.)")]
    public Material timeMaterial;
    [Tooltip("Zaman ikonunun hücre üzerindeki yüzdesel boyutu (1 = hücre boyutu)")]
    [Range(0.1f, 1.5f)] public float timeSizeOnCell = 0.8f;
    [Tooltip("Zaman ikonuna hafif pop animasyonu ver")]
    public bool popOnSpawn = true;

    [Header("Defaults")]
    [Tooltip("Konfig verilmezse eklenecek varsayılan saniye (+)")]
    public int defaultAddSeconds = 3;

    [Header("Time Notice Visual")]
    [Tooltip("TIME bildirimi için Text (Unity UI) prefab'ini ver.")]
    public GameObject timeTextPrefab;
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

    [Header("Time Collect FX")]
    [Tooltip("Zaman hücresi toplanınca oynatılacak parıltı/pulse efektinin toplam süresi (sn).")]
    public float collectFxDuration = 0.38f;
    [Tooltip("Toplanma anında ikonun tepe ölçek çarpanı (startScale * bu).")]
    public float collectFxScalePeak = 1.25f;
    [Tooltip("Parıltı (glow) görselinin tepe alfa değeri.")]
    [Range(0f, 1f)] public float collectFxGlowAlpha = 0.55f;

    // Runtime state
    private Cell _timeCell;
    public Cell TimeCell => _timeCell;
    private GameObject _timeVisualGO;
    private bool _collectedThisLevel;
    private int _secondsThisLevel;

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
        PathDrawer.OnPairCommitted += OnPairCommittedCheckTime;
        PathDrawer.OnLevelComplete += OnLevelCompleteReset;
    }
    void OnDisable()
    {
        PathDrawer.OnPairCommitted -= OnPairCommittedCheckTime;
        PathDrawer.OnLevelComplete  -= OnLevelCompleteReset;
    }

    /// RandomLevelGenerator yeni level kurarken çağırır.
    /// hasTime=false ise temizler ve çıkış yapar.
    public void PrepareForNewLevel(bool hasTime, int addSeconds)
    {
        ClearTimeVisual();
        _timeCell = null;
        _collectedThisLevel = false;
        _secondsThisLevel = (addSeconds > 0 ? addSeconds : defaultAddSeconds);

        if (!hasTime) return;
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
        _timeCell = candidates[Random.Range(0, candidates.Count)];
        SpawnTimeVisual(_timeCell);
    }

    public void PrepareForNewLevel(bool hasTime, int addSeconds, IEnumerable<Cell> allowed)
    {
        ClearTimeVisual();
        _timeCell = null;
        _collectedThisLevel = false;
        _secondsThisLevel = (addSeconds > 0 ? addSeconds : defaultAddSeconds);

        if (!hasTime) return;
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
        _timeCell = pool[Random.Range(0, pool.Count)];
        SpawnTimeVisual(_timeCell);
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

    void SpawnTimeVisual(Cell cell)
    {
        if (!cell?.img) return;
        if (!gridCanvasRoot) gridCanvasRoot = cell.img.transform.parent;

        _timeVisualGO = new GameObject("TimeCellOverlay", typeof(RectTransform), typeof(Image));
        var rt = _timeVisualGO.GetComponent<RectTransform>();
        var img = _timeVisualGO.GetComponent<Image>();

        _timeVisualGO.transform.SetParent(cell.img.transform, false);
        rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.pivot = new Vector2(0.5f, 0.5f);
        rt.anchoredPosition = Vector2.zero;
        rt.localRotation = Quaternion.identity;

        var pr = cell.img.rectTransform.rect;
        float size = Mathf.Max(pr.width, pr.height) * Mathf.Clamp(timeSizeOnCell, 0.1f, 1.5f);
        rt.sizeDelta = new Vector2(size, size);

        img.sprite = timeSprite;
        img.material = timeMaterial ? new Material(timeMaterial) : null;
        img.raycastTarget = false;
        img.color = Color.white;

        if (popOnSpawn)
        {
            rt.localScale = Vector3.one * 0.6f;
            StartCoroutine(SimplePop.PopIn(_timeVisualGO, 0.18f));
        }
    }

    void ClearTimeVisual()
    {
        if (_timeVisualGO) Destroy(_timeVisualGO);
        _timeVisualGO = null;
    }

    // ── Dinleyiciler ─────────────────────────────────────────────────────────────
    void OnPairCommittedCheckTime(int pairId, List<Cell> committedPath)
    {
        if (_collectedThisLevel) return;
        if (_timeCell == null || committedPath == null || committedPath.Count == 0) return;

        for (int i = 0; i < committedPath.Count; i++)
        {
            if (committedPath[i] == _timeCell)
            {
                _collectedThisLevel = true;
                // Anında +saniye uygula
                ApplyTimeBonus(_secondsThisLevel);
                // Bildirim ve FX
                SpawnTimeNotice(_secondsThisLevel);
                StartCoroutine(CoTimeCollectFX());
                break;
            }
        }
    }

    void OnLevelCompleteReset(int _)
    {
        // Sırf state temizliği; yeni level hazırlanırken Prepare çağrılacak
        _collectedThisLevel = false;
    }

    void ApplyTimeBonus(int add)
    {
        var timer = FindFirstObjectByType<LevelCountdown>();
        if (!timer)
        {
            Debug.LogWarning("[TimeCellManager] LevelCountdown bulunamadı; zaman eklenemedi.");
            return;
        }

        // LevelCountdown'a küçük bir API eklediğini varsayıyoruz: AddSeconds(int, bool)
        timer.AddSeconds(add, withPop: true);
    }

    void SpawnTimeNotice(int add)
    {
        if (!timeTextPrefab || !noticeSpawnParent) return;

        var go = Instantiate(timeTextPrefab, noticeSpawnParent);
        var rt = go.GetComponent<RectTransform>();
        if (!rt) rt = go.AddComponent<RectTransform>();

        Vector2 jitter = (noticeRandomJitter > 0f)
            ? new Vector2(Random.Range(-noticeRandomJitter, noticeRandomJitter), Random.Range(-noticeRandomJitter, noticeRandomJitter))
            : Vector2.zero;
        rt.anchoredPosition = noticeSpawnAnchoredPos + jitter;

        var uiText = go.GetComponent<Text>();
        if (uiText) uiText.text = $"+{add}s";

        StartCoroutine(CoPopFadeDestroy(go, noticePopupLifetime, noticePopupPeakScale, noticePopupRise));
    }

    IEnumerator CoTimeCollectFX()
    {
        if (!_timeVisualGO) yield break;
        var rt  = _timeVisualGO.GetComponent<RectTransform>();
        var img = _timeVisualGO.GetComponent<Image>();
        if (!rt || !img) yield break;

        Vector3 startScale = rt.localScale;
        Color   startCol   = img.color;

        Material mat = img.material;
        bool hasEmission = mat && mat.HasProperty("_EmissionColor");
        Color emissionStart = hasEmission ? mat.GetColor("_EmissionColor") : Color.black;

        GameObject glow = new GameObject("TimeGlowPulse", typeof(RectTransform), typeof(Image));
        var glowRt = glow.GetComponent<RectTransform>();
        var glowImg = glow.GetComponent<Image>();
        glow.transform.SetParent(_timeVisualGO.transform.parent, false);
        glowRt.anchorMin = glowRt.anchorMax = new Vector2(0.5f, 0.5f);
        glowRt.pivot = new Vector2(0.5f, 0.5f);
        glowRt.anchoredPosition = rt.anchoredPosition;
        glowRt.localRotation = Quaternion.identity;
        glowRt.sizeDelta = rt.sizeDelta * 1.15f;
        glowImg.sprite = img.sprite;
        glowImg.raycastTarget = false;
        glowImg.material = null;
        glowImg.color = new Color(0.45f, 0.9f, 1f, 0f); // mavi-siyan tonlu glow

        float dur  = Mathf.Max(0.06f, collectFxDuration);
        float half = dur * 0.5f;
        float t = 0f;

        while (t < half)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / half);
            float overshoot = 1.70158f;
            float ease = 1f + overshoot * Mathf.Pow(k - 1f, 3) + overshoot * Mathf.Pow(k - 1f, 2);

            rt.localScale = startScale * Mathf.Lerp(1f, collectFxScalePeak, Mathf.SmoothStep(0f, 1f, ease));
            img.color = Color.Lerp(startCol, new Color(0.85f, 0.95f, 1f, startCol.a), k);

            if (hasEmission)
            {
                Color targetEmiss = new Color(0.3f, 0.7f, 1f) * 2.0f;
                mat.SetColor("_EmissionColor", Color.Lerp(emissionStart, targetEmiss, k));
            }

            glowRt.localEulerAngles = new Vector3(0f, 0f, Mathf.Lerp(0f, 22f, k));
            glowRt.sizeDelta = Vector2.Lerp(rt.sizeDelta * 1.05f, rt.sizeDelta * 1.35f, k);
            glowImg.color = new Color(0.45f, 0.9f, 1f, Mathf.Lerp(0f, collectFxGlowAlpha, k));
            yield return null;
        }

        float t2 = 0f;
        float d2 = Mathf.Max(0.01f, dur - half);
        while (t2 < d2)
        {
            t2 += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t2 / d2);

            rt.localScale = startScale * Mathf.Lerp(collectFxScalePeak, 1f, Mathf.SmoothStep(0f, 1f, k));
            img.color = Color.Lerp(new Color(0.85f, 0.95f, 1f, startCol.a), startCol, k);

            if (hasEmission)
            {
                mat.SetColor("_EmissionColor", Color.Lerp(new Color(0.3f, 0.7f, 1f) * 2.0f, emissionStart, k));
            }

            glowRt.localEulerAngles = new Vector3(0f, 0f, Mathf.Lerp(22f, 42f, k));
            glowRt.sizeDelta = Vector2.Lerp(rt.sizeDelta * 1.35f, rt.sizeDelta * 1.6f, k);
            glowImg.color = new Color(0.45f, 0.9f, 1f, Mathf.Lerp(collectFxGlowAlpha, 0f, k));
            yield return null;
        }

        if (hasEmission) mat.SetColor("_EmissionColor", emissionStart);
        img.color = startCol;
        rt.localScale = startScale;
        Destroy(glow);
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

// ==== LevelCountdown'a küçük bir API ekle (aynı dosyaya koyman gerekmiyor) ====
public static class LevelCountdownExtensions
{
    /// Güvenli bir şekilde süre eklemek için yardımcı.
    public static void AddSeconds(this LevelCountdown lc, int delta, bool withPop)
    {
        // LevelCountdown içinde public AddSeconds varsa onu kullan; yoksa Reflection veya
        // aşağıdaki gibi bir wrapper kullanamazsın. Bu extension sadece dış API'yi çağırır.
        lc.AddSeconds(delta, withPop);
    }
}
