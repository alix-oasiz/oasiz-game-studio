using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// Tutorial için zamanlı pair sistemi
/// - Normal TimedPairManager'ın aynısı ama 1 saniye kala DURUR ve kaybettirmez
/// - Tutorial bittikten sonra devam etmez, sadece gösterim amaçlıdır
[DisallowMultipleComponent]
public class TutorialTimedPair : MonoBehaviour
{
    public static TutorialTimedPair Instance { get; private set; }

    [Header("Refs")]
    [SerializeField] private GridManager grid;

    [Header("UI")]
    [Tooltip("Geri sayım yazısı için Text (Unity UI) prefab'ı")] 
    public GameObject countdownTextPrefab;
    [Tooltip("UI parent (Canvas). Boşsa otomatik bulunur")] 
    public RectTransform uiParent;

    [Header("Label Placement")]
    [Tooltip("Etiketi hücrenin merkezinden ne kadar yukarı koyacağımız (px).")]
    public float labelYOffset = 24f;

    [Header("Timer")]
    [Tooltip("Tutorial için geri sayım süresi (s)")] 
    public int tutorialSeconds = 3;
    [Tooltip("Time.unscaledTime kullan (önerilir)")] 
    public bool useUnscaledTime = true;
    [Tooltip("1 saniye kala dur (kaybettirme)")] 
    public bool stopAtOneSecond = true;

    [Header("Anim")]
    [Tooltip("Her saniyede yazı için pop ölçek çarpanı")] 
    public float tickPopScale = 1.35f;
    [Tooltip("Pop animasyon süresi (s)")] 
    public float tickPopDuration = 0.12f;

    [Header("Label Show/Hide")]
    [Tooltip("Label spawn anim süresi (s)")] 
    public float labelSpawnDuration = 0.18f;
    [Tooltip("Label despawn anim süresi (s)")] 
    public float labelDespawnDuration = 0.15f;
    [Tooltip("Spawn başlangıç ölçeği (1 = normal)")] 
    public float labelSpawnStartScale = 0.6f;

    // runtime
    private int _tutorialPairId = -1;
    private (GameObject a, GameObject b) _labels;
    private Coroutine _countdownCoroutine;
    private readonly Dictionary<GameObject, RectTransform> _followTargets = new();

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
    }
    
    void OnDisable()
    {
        PathDrawer.OnPairCommitted -= HandlePairCommitted;
    }

    void OnDestroy()
    {
        PathDrawer.OnPairCommitted -= HandlePairCommitted;
    }

    /// <summary>
    /// Tutorial için belirli bir pair'e zamanlı sayaç başlat
    /// </summary>
    public void StartTutorialTimer(int pairId)
    {
        CancelTimer();
        
        if (!grid || grid.width <= 0 || grid.height <= 0) return;
        if (!countdownTextPrefab || !uiParent) return;

        _tutorialPairId = pairId;

        // Pair'in iki spool'unu bul
        if (!TryGetSpools(pairId, out var a, out var b))
        {
            Debug.LogWarning($"Tutorial pair {pairId} için spool'lar bulunamadı!");
            return;
        }

        // İki etiket spawnla
        var goA = SpawnLabelAtCell(a);
        var goB = SpawnLabelAtCell(b);
        _labels = (goA, goB);

        // Sayaç başlat
        _countdownCoroutine = StartCoroutine(CoCountdownPair(tutorialSeconds));
    }

    /// <summary>
    /// Aktif tutorial timer'ı iptal et ve etiketleri kaldır
    /// </summary>
    public void CancelTimer()
    {
        if (!this) return;
        
        if (_countdownCoroutine != null)
        {
            StopCoroutine(_countdownCoroutine);
            _countdownCoroutine = null;
        }

        if (_labels.a) 
        { 
            _followTargets.Remove(_labels.a); 
            StartCoroutine(CoDespawnAndDestroy(_labels.a)); 
        }
        if (_labels.b) 
        { 
            _followTargets.Remove(_labels.b); 
            StartCoroutine(CoDespawnAndDestroy(_labels.b)); 
        }
        
        _labels = (null, null);
        _tutorialPairId = -1;
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
        
        PositionLabelAtCell(rt, cell.img.rectTransform);
        _followTargets[go] = cell.img.rectTransform;

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

    IEnumerator CoCountdownPair(int seconds)
    {
        int remain = Mathf.Max(1, seconds);
        
        while (remain > 0)
        {
            // Etiketleri güncelle
            SetText(_labels.a, remain);
            SetText(_labels.b, remain);
            
            if (_labels.a) StartCoroutine(CoPop(_labels.a.transform as RectTransform));
            if (_labels.b) StartCoroutine(CoPop(_labels.b.transform as RectTransform));

            // ⭐ TUTORIAL ÖZEL: 1 saniye kala DUR (kaybettirme)
            if (stopAtOneSecond && remain == 1)
            {
                Debug.Log("Tutorial timer: 1 saniye kaldı, durduruluyor (kaybettirmez)");
                yield break; // Burada bitir, kaybettirme
            }

            // 1 saniye bekle
            float t = 0f, d = 1f;
            while (t < d)
            {
                t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
                yield return null;
            }
            
            remain--;
        }

        // Eğer buraya geldiyse (stopAtOneSecond = false ise) süre bitti
        // Ama tutorial'da bu duruma gelmeyeceğiz çünkü 1'de duruyoruz
        Debug.Log("Tutorial timer süresi bitti");
        CancelTimer();
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
        float t = 0f; 
        float half = Mathf.Max(0.01f, tickPopDuration * 0.5f);
        Vector3 start = Vector3.one; 
        Vector3 over = Vector3.one * tickPopScale;
        
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
            if (rt) rt.localScale = Vector3.Lerp(over, Vector3.one, ease);
            else yield break;
            yield return null;
        }
        
        if (rt) rt.localScale = Vector3.one;
    }

    IEnumerator CoSpawnLabel(RectTransform rt, CanvasGroup cg)
    {
        if (!rt || !cg) yield break;
        float t = 0f;
        float d = Mathf.Max(0.01f, labelSpawnDuration);
        Vector3 from = rt.localScale;
        Vector3 to = Vector3.one;
        
        while (t < d)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / d);
            float s = 1f + 1.70158f * Mathf.Pow(k - 1f, 3) + 1.70158f * Mathf.Pow(k - 1f, 2);
            rt.localScale = Vector3.LerpUnclamped(from, to, s);
            cg.alpha = Mathf.Lerp(0f, 1f, k);
            yield return null;
        }
        
        rt.localScale = to; 
        cg.alpha = 1f;
    }

    IEnumerator CoDespawnLabel(RectTransform rt, CanvasGroup cg)
    {
        if (!rt || !cg) yield break;
        float t = 0f;
        float d = Mathf.Max(0.01f, labelDespawnDuration);
        Vector3 from = rt.localScale;
        Vector3 to = Vector3.one * Mathf.Max(0.01f, labelSpawnStartScale);
        
        while (t < d)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / d);
            float e = k * k;
            rt.localScale = Vector3.Lerp(from, to, e);
            cg.alpha = Mathf.Lerp(1f, 0f, e);
            yield return null;
        }
        
        rt.localScale = to; 
        cg.alpha = 0f;
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
        // Eğer tutorial pair'i tamamlandıysa timer'ı iptal et
        if (pairId == _tutorialPairId)
        {
            Debug.Log("Tutorial pair tamamlandı, timer iptal ediliyor");
            CancelTimer();
        }
    }

    bool TryGetSpools(int pairId, out Cell a, out Cell b)
    {
        a = null; b = null;
        for (int y = 0; y < grid.height; y++)
        for (int x = 0; x < grid.width; x++)
        {
            var c = grid.cells[x, y];
            if (c.isSpool && c.ownerId == pairId)
            { 
                if (a == null) a = c; 
                else if (b == null) { b = c; break; } 
            }
        }
        return (a != null && b != null);
    }
}