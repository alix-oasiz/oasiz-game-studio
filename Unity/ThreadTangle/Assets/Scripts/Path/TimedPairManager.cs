using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// Seviye içinde 1+ adet "zamanlı pair" belirler.
/// - RandomLevelGenerator çözülebilir leveli kabul ETTİKTEN sonra PrepareForNewLevel çağırılmalı.
/// - Seçilen pair(ler) için iki spool'un üstünde 3-2-1 geri sayım textleri gösterir.
/// - Süre bitmeden pair bağlanırsa sayaç iptal olur; bitmeden bağlanmazsa Lose tetikler.
[DisallowMultipleComponent]
public class TimedPairManager : MonoBehaviour
{
    public static TimedPairManager Instance { get; private set; }

    [Header("Refs")]
    [SerializeField] private GridManager grid; // tarayıp spool lokasyonlarını bulmak için

    [Header("Tutorial Mode")]
    [Tooltip("Tutorial modunda zamanlı pair'ler için süre 1'de kalır, label'lar yanıp söner, Lose çağrılmaz.")]
    public bool tutorialMode = false;
    [Tooltip("Tutorial blink hızı (ölçek animasyonu)")]
    public float tutorialBlinkSpeed = 5f;

    [Header("UI")]
    [Tooltip("Geri sayım yazısı için Text (Unity UI) prefab'ı")] public GameObject countdownTextPrefab;
    [Tooltip("UI parent (Canvas). Boşsa otomatik bulunur")] public RectTransform uiParent;

    [Header("Label Placement")]
    [Tooltip("Etiketi hücrenin merkezinden ne kadar yukarı koyacağımız (px).")]
    public float labelYOffset = 24f;

    [Header("Timer")]
    [Tooltip("Varsayılan geri sayım süresi (s)")] public int defaultSeconds = 3;
    [Tooltip("Time.unscaledTime kullan (önerilir)")] public bool useUnscaledTime = true;
    [Tooltip("Zamanlı pair label ve geri sayım başlamadan önceki gecikme (s)")]
    public float timedPairsSpawnDelay = 1f;

    [Header("Anim")]
    [Tooltip("Her saniyede yazı için pop ölçek çarpanı")] public float tickPopScale = 1.35f;
    [Tooltip("Pop animasyon süresi (s)")] public float tickPopDuration = 0.12f;

    [Header("Label Show/Hide")]
    [Tooltip("Label spawn anim süresi (s)")] public float labelSpawnDuration = 0.18f;
    [Tooltip("Label despawn anim süresi (s)")] public float labelDespawnDuration = 0.15f;
    [Tooltip("Spawn başlangıç ölçeği (1 = normal)")] public float labelSpawnStartScale = 0.6f;

    [Header("Lose")]
    [Tooltip("Süre biterse LevelCountdown.Lose() çağır")] public bool callLevelCountdownLose = true;

    // runtime
    private readonly HashSet<int> _timedPairs = new();
    private readonly Dictionary<int, (GameObject a, GameObject b)> _labels = new();
    private readonly Dictionary<int, Coroutine> _pairCountdowns = new(); // pairId -> coroutine
    private readonly Dictionary<int, Coroutine> _pairBlinkers = new();   // pairId -> blink coroutine
    private readonly Dictionary<GameObject, RectTransform> _followTargets = new(); // labelGO -> cell.rectTransform
    private Coroutine _prepareCo;

    void Awake()
    {
        if (Instance && Instance != this) { Destroy(gameObject); return; }
        Instance = this;
        if (!grid) grid = FindFirstObjectByType<GridManager>();
        if (!uiParent)
        {
            var canvas = FindFirstObjectByType<Canvas>();
            if (canvas) uiParent = canvas.transform as RectTransform;
        }
    }

    void OnEnable()
    {
        PathDrawer.OnPairCommitted += HandlePairCommitted;
        PathDrawer.OnLevelComplete += OnLevelCompleteHandler;
    }
    void OnDisable()
    {
        PathDrawer.OnPairCommitted -= HandlePairCommitted;
        PathDrawer.OnLevelComplete -= OnLevelCompleteHandler;
    }

    // Dedicated handler (avoid lambda capture so we can unsubscribe correctly)
    void OnLevelCompleteHandler(int _)
    {
        CancelAll();
    }

    void OnDestroy()
    {
        PathDrawer.OnPairCommitted -= HandlePairCommitted;
        PathDrawer.OnLevelComplete -= OnLevelCompleteHandler;
    }

    public void PrepareForNewLevel(bool enableTimedPairs, int timedPairCount, int seconds)
    {
        CancelAll();
        if (!enableTimedPairs) return;
        if (!grid || grid.width <= 0 || grid.height <= 0) return;
        if (!countdownTextPrefab || !uiParent) return;

        int pairCount = ComputePairCount();
        if (pairCount <= 0) return;

        // kaç tane istendiyse benzersiz pairId seç
        var pool = new List<int>();
        for (int id = 0; id < pairCount; id++) pool.Add(id);
        Shuffle(pool);
        int need = Mathf.Clamp(timedPairCount, 1, pairCount);
        for (int i = 0; i < need; i++) _timedPairs.Add(pool[i]);

        // Label'lar ve countdown'lar gecikmeli başlasın
        if (_prepareCo != null) { StopCoroutine(_prepareCo); }
        _prepareCo = StartCoroutine(CoSpawnTimedPairsAfterDelay(seconds));
    }

    IEnumerator CoSpawnTimedPairsAfterDelay(int seconds)
    {
        float delay = Mathf.Max(0f, timedPairsSpawnDelay);
        if (delay > 0f)
        {
            float t = 0f;
            while (t < delay)
            {
                t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
                yield return null;
            }
        }

        // Her seçilen pair için iki etiket spawnla
        foreach (var pid in _timedPairs)
        {
            if (!TryGetSpools(pid, out var a, out var b)) continue;
            var goA = SpawnLabelAtCell(a);
            var goB = SpawnLabelAtCell(b);
            _labels[pid] = (goA, goB);

            int s = (seconds > 0 ? seconds : defaultSeconds);
            var co = StartCoroutine(CoCountdownPair(pid, s));
            _pairCountdowns[pid] = co;
        }

        _prepareCo = null;
    }

    void CancelAll()
    {
        if (!this) return; // object already destroyed
        if (_prepareCo != null)
        {
            StopCoroutine(_prepareCo);
            _prepareCo = null;
        }
        foreach (var kv in _pairCountdowns)
        {
            if (!this) return;
            if (kv.Value != null) StopCoroutine(kv.Value);
        }
        _pairCountdowns.Clear();

        foreach (var kv in _pairBlinkers)
        {
            if (!this) return;
            if (kv.Value != null) StopCoroutine(kv.Value);
        }
        _pairBlinkers.Clear();

        foreach (var kv in _labels)
        {
            if (kv.Value.a) { _followTargets.Remove(kv.Value.a); StartCoroutine(CoDespawnAndDestroy(kv.Value.a)); }
            if (kv.Value.b) { _followTargets.Remove(kv.Value.b); StartCoroutine(CoDespawnAndDestroy(kv.Value.b)); }
        }
        _labels.Clear();
        _timedPairs.Clear();
        _followTargets.Clear();
    }

    GameObject SpawnLabelAtCell(Cell cell)
    {
        if (!cell?.img) return null;
        var go = Instantiate(countdownTextPrefab, uiParent);
        var rt = go.GetComponent<RectTransform>();
        if (!rt) rt = go.AddComponent<RectTransform>();
        rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.pivot = new Vector2(0.5f, 0.5f);
        rt.localScale = Vector3.one;
        // İlk konumlandırma
        PositionLabelAtCell(rt, cell.img.rectTransform);
        // Takip etmesi için kaydet
        _followTargets[go] = cell.img.rectTransform;

        // Spawn anim için hazırlık
        var cg = go.GetComponent<CanvasGroup>();
        if (!cg) cg = go.AddComponent<CanvasGroup>();
        cg.alpha = 0f;
        var lrt = go.transform as RectTransform;
        lrt.localScale = Vector3.one * Mathf.Max(0.01f, labelSpawnStartScale);
        StartCoroutine(CoSpawnLabel(lrt, cg));

        return go;
    }

    void PositionLabelAtCell(RectTransform labelRt, RectTransform cellRt)
    {
        if (!labelRt || !cellRt || !uiParent) return;
        var canvas = uiParent.GetComponentInParent<Canvas>();
        Camera cam = null;
        if (canvas && canvas.renderMode != RenderMode.ScreenSpaceOverlay)
            cam = canvas.worldCamera;
        Vector3 world = cellRt.TransformPoint(Vector3.zero);
        Vector2 screen = RectTransformUtility.WorldToScreenPoint(cam, world);
        Vector2 local;
        if (RectTransformUtility.ScreenPointToLocalPointInRectangle(uiParent, screen, cam, out local))
        {
            labelRt.anchoredPosition = local + new Vector2(0f, labelYOffset);
        }
    }

    void LateUpdate()
    {
        if (_followTargets.Count == 0) return;
        foreach (var kv in _followTargets)
        {
            var go = kv.Key;
            var target = kv.Value;
            if (!go || !target) continue;
            var rt = go.transform as RectTransform;
            PositionLabelAtCell(rt, target);
        }
    }

    void StartBlinkForPair(int pairId)
    {
        if (_pairBlinkers.ContainsKey(pairId)) return;
        if (!_labels.TryGetValue(pairId, out var duo)) return;
        var co = StartCoroutine(CoBlinkPair(pairId));
        _pairBlinkers[pairId] = co;
    }

    void StopBlinkForPair(int pairId)
    {
        if (_pairBlinkers.TryGetValue(pairId, out var co) && co != null)
        {
            StopCoroutine(co);
        }
        _pairBlinkers.Remove(pairId);

        if (_labels.TryGetValue(pairId, out var duo))
        {
            ResetLabelScale(duo.a);
            ResetLabelScale(duo.b);
        }
    }

    void ResetLabelScale(GameObject go)
    {
        if (!go) return;
        var rt = go.transform as RectTransform;
        if (rt) rt.localScale = Vector3.one;
    }

    IEnumerator CoBlinkPair(int pairId)
    {
        float t = 0f;
        while (true)
        {
            if (!_labels.TryGetValue(pairId, out var duo))
            {
                _pairBlinkers.Remove(pairId);
                yield break;
            }

            var rtA = duo.a ? duo.a.transform as RectTransform : null;
            var rtB = duo.b ? duo.b.transform as RectTransform : null;

            if (!rtA && !rtB)
            {
                _pairBlinkers.Remove(pairId);
                yield break;
            }

            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float s = Mathf.Sin(t * tutorialBlinkSpeed);   // -1..1
            float n = (s + 1f) * 0.5f;                     // 0..1
            float scale = Mathf.Lerp(0.9f, 1.15f, n);      // min-max ölçek

            if (rtA) rtA.localScale = Vector3.one * scale;
            if (rtB) rtB.localScale = Vector3.one * scale;

            yield return null;
        }
    }

    IEnumerator CoCountdownPair(int pairId, int seconds)
    {
        int remain = Mathf.Max(1, seconds);
        while (remain > 0 && _timedPairs.Contains(pairId))
        {
            // Tutorial modunda son saniyede sabitle ve blink başlat
            if (tutorialMode && remain <= 1)
            {
                if (_labels.TryGetValue(pairId, out var tduo))
                {
                    SetText(tduo.a, 1);
                    SetText(tduo.b, 1);
                    StartBlinkForPair(pairId);
                }
                yield break;
            }

            // Sadece bu pair'in etiketlerini güncelle
            if (_labels.TryGetValue(pairId, out var duo))
            {
                SetText(duo.a, remain);
                SetText(duo.b, remain);
                if (duo.a) StartCoroutine(CoPop(duo.a.transform as RectTransform));
                if (duo.b) StartCoroutine(CoPop(duo.b.transform as RectTransform));
            }

            // 1 saniye bekle
            float t = 0f, d = 1f;
            while (t < d && _timedPairs.Contains(pairId))
            {
                t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
                yield return null;
            }
            if (!_timedPairs.Contains(pairId)) yield break; // pair bu arada tamamlandı
            remain--;
        }

        // Süre bitti ve pair hâlâ tamamlanmamışsa → Lose (tutorial modunda asla Lose yok)
        if (_timedPairs.Contains(pairId) && !tutorialMode)
        {
            var lc = FindFirstObjectByType<LevelCountdown>();
            if (callLevelCountdownLose && lc) lc.Lose();
            CancelAll();
        }
    }

    void SetText(GameObject go, int n)
    {
        if (!go) return;
        var txt = go.GetComponent<Text>();
        if (txt) txt.text = n.ToString();
    }

    IEnumerator CoPop(RectTransform rt)
    {
        if (!rt) yield break;
        float t = 0f; float half = Mathf.Max(0.01f, tickPopDuration * 0.5f);
        Vector3 start = Vector3.one; Vector3 over = Vector3.one * tickPopScale;
        while (t < half)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / half);
            float ease = 1f - (1f - k) * (1f - k);
            rt.localScale = Vector3.Lerp(start, over, ease);
            yield return null;
        }
        t = 0f;
        while (t < half)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / half);
            float ease = k * k;
            if(rt)rt.localScale = Vector3.Lerp(over, Vector3.one, ease);
            else
            {
                yield break;
            }
            yield return null;
        }
        rt.localScale = Vector3.one;
    }

    IEnumerator CoSpawnLabel(RectTransform rt, CanvasGroup cg)
    {
        if (!rt || !cg) yield break;
        float t = 0f;
        float d = Mathf.Max(0.01f, labelSpawnDuration);
        Vector3 from = rt.localScale;
        Vector3 to   = Vector3.one;
        while (t < d)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / d);
            // easeOutBack
            float s = 1f + 1.70158f * Mathf.Pow(k - 1f, 3) + 1.70158f * Mathf.Pow(k - 1f, 2);
            rt.localScale = Vector3.LerpUnclamped(from, to, s);
            cg.alpha = Mathf.Lerp(0f, 1f, k);
            yield return null;
        }
        rt.localScale = to; cg.alpha = 1f;
    }

    IEnumerator CoDespawnLabel(RectTransform rt, CanvasGroup cg)
    {
        if (!rt || !cg) yield break;
        float t = 0f;
        float d = Mathf.Max(0.01f, labelDespawnDuration);
        Vector3 from = rt.localScale;
        Vector3 to   = Vector3.one * Mathf.Max(0.01f, labelSpawnStartScale);
        while (t < d)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / d);
            // easeInQuad for alpha/scale
            float e = k * k;
            rt.localScale = Vector3.Lerp(from, to, e);
            cg.alpha = Mathf.Lerp(1f, 0f, e);
            yield return null;
        }
        rt.localScale = to; cg.alpha = 0f;
    }

    IEnumerator CoDespawnAndDestroy(GameObject go)
    {
        if (!go) yield break;
        var rt = go.transform as RectTransform;
        var cg = go.GetComponent<CanvasGroup>();
        if (!cg) cg = go.AddComponent<CanvasGroup>();
        yield return StartCoroutine(CoDespawnLabel(rt, cg));
        if (go) Destroy(go);
    }

    void HandlePairCommitted(int pairId, List<Cell> _)
    {
        if (!_timedPairs.Contains(pairId)) return;

        // Olası blink coroutine'ini durdur
        StopBlinkForPair(pairId);

        // Etiketleri sil
        if (_labels.TryGetValue(pairId, out var duo))
        {
            if (duo.a) { _followTargets.Remove(duo.a); StartCoroutine(CoDespawnAndDestroy(duo.a)); }
            if (duo.b) { _followTargets.Remove(duo.b); StartCoroutine(CoDespawnAndDestroy(duo.b)); }
            _labels.Remove(pairId);
        }
        // Sayaç coroutine'ini durdur
        if (_pairCountdowns.TryGetValue(pairId, out var co) && co != null)
        {
            StopCoroutine(co);
            _pairCountdowns.Remove(pairId);
        }
        // Bu pair zamanlı setten çıkar
        _timedPairs.Remove(pairId);
        // Diğer zamanlı pair'ler kalabilir; hepsi bitti ise zaten aktif sayaç kalmaz
    }

    int ComputePairCount()
    {
        int maxId = -1;
        for (int y = 0; y < grid.height; y++)
        for (int x = 0; x < grid.width; x++)
        {
            var c = grid.cells[x, y];
            if (c.isSpool) maxId = Mathf.Max(maxId, c.ownerId);
        }
        return maxId + 1;
    }

    bool TryGetSpools(int pairId, out Cell a, out Cell b)
    {
        a = null; b = null;
        for (int y = 0; y < grid.height; y++)
        for (int x = 0; x < grid.width; x++)
        {
            var c = grid.cells[x, y];
            if (c.isSpool && c.ownerId == pairId)
            { if (a == null) a = c; else if (b == null) { b = c; break; } }
        }
        return (a != null && b != null);
    }

    void Shuffle<T>(IList<T> list)
    {
        for (int i = list.Count - 1; i > 0; i--)
        {
            int j = Random.Range(0, i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
    }
}
