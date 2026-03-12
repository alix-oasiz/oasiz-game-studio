using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UI;

/// Düz çizgi segmentleri (bar) + her hücre merkezine minik "knot" (düğüm) bırakır.
/// Backtrack/rebuild destekli. Commit sonrası kalıcılar sahnede kalır.
public class StrokeLink : MonoBehaviour
{
    // aktif stroke'un kalıcı parent grubu
    GameObject currentGroup;
    // pairId -> son çizilen grup
    readonly Dictionary<int, GameObject> groupsByPair = new();
    int currentPairId = -1;
    [Header("Debug")]
    public bool verbose = false;
    void Log(string msg) { if (verbose) Debug.Log("[StrokeLink] " + msg); }

    [Header("Layer")]
    public RectTransform layer;              // Canvas altı stretch RT
    public Transform permanentParent;        // kalıcı çizgiler/düğümler parent

    [Header("Line Visuals")]
    public Sprite barSprite;                 // ince şerit (kare uçlu, ip/pipe gibi)
    public float thickness = 16f;
    public bool useSliced = true;

    [Header("Knot Visuals")]
    [Tooltip("Her hücre merkezine konacak küçük düğüm sprite")]
    public Sprite knotSprite;
    [Tooltip("Knot boyutu = thickness * knotScale")]
    public float knotScale = 0.9f;
    [Tooltip("Bitişte bırakılan knot için ekstra ölçek")]
    public float endKnotScale = 1.1f;
    public bool knotPopAnim = true;
    public SpritePalette palette;

    [Header("Animation")]
    public bool animateSegments = true;
    public float segmentGrowDuration = 0.08f;
    public float knotPopOvershoot = 1.10f;
    public float knotPopDuration  = 0.12f;

    [Tooltip("Segment shrink animasyonu sondan başa oynatılsın mı?")]
    public bool shrinkFromEnd = true;
    
    [Header("Sparkle FX Prefab")]
    public GameObject sparklePrefab;  // ParticleSystem prefab

    [Header("Sparkle FX Settings")]
    [Tooltip("Knot durdukça partikül efekti sürekli yansın mı?")]
    public bool sparklePersistent = true;
    [Range(0f, 50f)] public float sparkleRateOverTime = 6f;
    [Range(0.05f, 3f)] public float sparkleStartLifetime = 0.6f;

    public float undoClearDuration = 0.12f; // Undo ile silerken segment shrink süresi

    // Geçici (parmağa giden) çizgi
    Image dynImg;
    RectTransform dynRT;

    // Durum
    RectTransform lastAnchor;                // son hücre Rect
    Camera evtCam;
    int linkIndex = 0;

    // Kalıcı objeler (sadece referans listeleri; objelerin parent'ı currentGroup)
    readonly List<GameObject> segs   = new();   // bar parçaları
    readonly List<GameObject> knots  = new();   // her anchor için düğüm

    // Sıra: path boyunca RectTransform listesi
    readonly List<RectTransform> anchors = new();

    void Awake()
    {
        if (!layer) layer = GetComponent<RectTransform>();
        if (!permanentParent) permanentParent = layer;

        var go = new GameObject("DynamicLink", typeof(RectTransform), typeof(Image));
        go.transform.SetParent(layer, false);
        dynRT = go.GetComponent<RectTransform>();
        dynImg = go.GetComponent<Image>();
        dynImg.sprite = barSprite;
        dynImg.raycastTarget = false;
        dynImg.enabled = false;
    }

    // ========= Public API =========
    public void BeginStroke(RectTransform start, int colorIndex, Camera cam)
    {
        Log($"BeginStroke start={(start ? start.name : "null")} color={linkIndex} cam={(cam ? cam.name : "null")} pair={currentPairId} group={(currentGroup ? currentGroup.name : "null")}");
        CancelStroke(); // yarım kalanı temizle
        lastAnchor = start;
        evtCam = cam;
        linkIndex = colorIndex;

        anchors.Clear();
        if (start) anchors.Add(start);

        dynImg.enabled = true;
        dynImg.color = (palette ? palette.GetLineColor(colorIndex) : Color.white);
        dynImg.material = (palette ? palette.GetMaterial(colorIndex) : null);
        dynImg.sprite = barSprite;
        dynImg.type   = useSliced ? Image.Type.Sliced : Image.Type.Simple;

        UpdateToCell(start);

        // Başlangıç düğümü
        AddKnotAt(start, knotScale, knotPopAnim, linkIndex);
    }

    /// Başlangıcı hem çizim, hem de grup başlatılarak yapar.
    public void BeginStrokeWithGroup(int pairId, RectTransform start, int colorIndex, Camera cam)
    {
        // Başlayacak pair için önceki geçici çizgiyi ve objeleri temizle
        CancelStroke();
        currentPairId = pairId;
        // Yeni grup oluştur
        currentGroup = new GameObject($"Stroke_{pairId}_{Time.frameCount}");
        currentGroup.transform.SetParent(permanentParent ? permanentParent : layer, false);

        lastAnchor = start;
        evtCam = cam;
        linkIndex = colorIndex;

        anchors.Clear();
        if (start) anchors.Add(start);

        dynImg.enabled = true;
        dynImg.color = (palette ? palette.GetLineColor(colorIndex) : Color.white);
        dynImg.material = (palette ? palette.GetMaterial(colorIndex) : null);
        dynImg.sprite = barSprite;
        dynImg.type   = useSliced ? Image.Type.Sliced : Image.Type.Simple;

        UpdateToCell(start);

        // İlk düğüm grup içinde oluşturulacak
        AddKnotAt(start, knotScale, knotPopAnim, linkIndex);
    }

    public IEnumerator ClearAll(bool immediate = true)
    {
        float clearSegmentDuration = 0.03f;
        Log("ClearAll()");

        if (immediate)
        {
            // Çocuk objeleri doğrudan temizle
            foreach (var go in segs)  if (go) Destroy(go);
            foreach (var go in knots) if (go) Destroy(go);
            segs.Clear();
            knots.Clear();
            anchors.Clear();

            // Dinamik (parmağa giden) çizgiyi kapat
            CancelDynamic();
            lastAnchor = null;

            // Açık grup varsa anında yok et
            if (currentGroup)
            {
                Log($"ClearAll: destroying currentGroup {currentGroup.name}");
                Destroy(currentGroup);
                currentGroup = null;
            }
            currentPairId = -1;

            // Sözlükteki tüm grupları yok et
            if (groupsByPair.Count > 0)
            {
                Log($"ClearAll: destroying {groupsByPair.Count} stored group(s)");
                var copy = new List<KeyValuePair<int, GameObject>>(groupsByPair);
                foreach (var kv in copy)
                {
                    var go = kv.Value;
                    if (go) Destroy(go);
                }
                groupsByPair.Clear();
            }

            // Emniyet: parent altında "Stroke_" ile başlayan ne varsa sil
            var parent = (permanentParent ? permanentParent : (Transform)layer);
            if (parent)
            {
                int destroyed = 0;
                for (int i = parent.childCount - 1; i >= 0; i--)
                {
                    var t = parent.GetChild(i);
                    if (!t) continue;
                    if (t.name.StartsWith("Stroke_"))
                    {
                        Destroy(t.gameObject);
                        destroyed++;
                    }
                }
                if (destroyed > 0) Log($"ClearAll: safety-scan destroyed {destroyed} leftover group(s).");
            }
        }
        else
        {
            // Animasyonlu temizlik: segmentleri içerden küçült ve gecikmeli Destroy planla
            ClearAllLinkSegments(clearSegmentDuration);

            // Bekleme süresini, planlanan maksimum gecikmeye göre hesapla
            float wait = CalcClearWait(clearSegmentDuration);
            yield return new WaitForSeconds(wait);

            // Referans/state temizliği (grupları BİZ yok etmiyoruz; Destroy() zaten planlandı)
            segs.Clear();
            knots.Clear();
            anchors.Clear();

            CancelDynamic();
            lastAnchor = null;
            currentPairId = -1;

            // Sadece referans sözlüğünü temizle; GameObject'ler zamanlı Destroy ile gidecek
            groupsByPair.Clear();
            currentGroup = null;
        }
    }

    private void ClearAllLinkSegments(float duration)
    {
        if (!permanentParent) return;

        for (int i = permanentParent.childCount - 1; i >= 0; i--)
        {
            var child = permanentParent.GetChild(i);
            if (!child) continue;
            if (!child.name.StartsWith("Stroke")) continue;

            // 1) Bu gruptaki tüm partikülleri anında durdur + yok et
            KillParticlesUnder(child);

            // 2) Segment sayısına göre gecikmeli destroy planla
            int segCount = 0;
            for (int j = 0; j < child.childCount; j++)
            {
                var segChild = child.GetChild(j);
                if (segChild && segChild.name == "LinkSeg") segCount++;
            }
            if (segCount == 0) segCount = 1; // emniyet: en az bir birim gecikme

            // 3) İçerden küçülme animasyonu + zamanlı destroy
            StartCoroutine(SlideIn(child, duration));
            Destroy(child.gameObject, duration * segCount + 0.05f);
        }
    }
    private void AnimateAndDestroyGroup(Transform group, float duration)
    {
        if (!group) return;
        
        KillParticlesUnder(group);

        int segCount = 0;
        for (int i = 0; i < group.childCount; i++)
        {
            var c = group.GetChild(i);
            if (!c) continue;
            if (c.name == "LinkSeg") segCount++;
        }
        if (segCount == 0) segCount = 1; // en az bir segment varsay

        // Segmentleri içerden kapat (genişliği 0'a animasyonla indir)
        StartCoroutine(SlideIn(group, duration));

        // Grubu, segment sayısına orantılı gecikmeyle yok et
        Destroy(group.gameObject, duration * segCount + 0.05f);
    }

    private float CalcClearWait(float duration)
    {
        if (!permanentParent) return duration + 0.05f;

        float maxDelay = 0f;
        for (int i = 0; i < permanentParent.childCount; i++)
        {
            var child = permanentParent.GetChild(i);
            if (!child) continue;
            if (!child.name.StartsWith("Stroke")) continue;

            int segCount = 0;
            for (int j = 0; j < child.childCount; j++)
            {
                var segChild = child.GetChild(j);
                if (segChild && segChild.name == "LinkSeg") segCount++;
            }
            if (segCount == 0) segCount = 1; // en az bir frame'lik gecikme

            float d = duration * segCount + 0.05f;
            if (d > maxDelay) maxDelay = d;
        }

        // En azından tek segmentlik süre kadar bekle
        return Mathf.Max(maxDelay, duration + 0.05f);
    }

    private IEnumerator SlideIn(Transform strokeLinkTransform, float duration)
    {
        if (!strokeLinkTransform) yield break;

        // Sadece "LinkSeg" olanları snapshot'a al
        var segments = new List<RectTransform>();
        for (int i = 0; i < strokeLinkTransform.childCount; i++)
        {
            var t = strokeLinkTransform.GetChild(i);
            if (!t) continue;
            if (t.name != "LinkSeg")
            {
                t.gameObject.SetActive(false);
                continue; // parent zaten Destroy edilecek, bunlara dokunma
            }
            if (t is RectTransform rt) segments.Add(rt);
        }

        // İstenen yön: sondan başa animasyon
        if (shrinkFromEnd)
        {
            segments.Reverse();
        }

        // Her segment için genişliği 0'a animasyonla kıs
        foreach (var rt in segments)
        {
            if (!rt) continue;

            float start = rt.sizeDelta.x;
            float end   = 0f;
            float t     = 0f;

            while (t < 1f)
            {
                // Parent yok olduysa veya segment gitti ise temiz çık
                if (!strokeLinkTransform) yield break;
                if (!rt) break;

                t += Time.deltaTime / Mathf.Max(0.0001f, duration);
                var sd = rt.sizeDelta;
                rt.sizeDelta = Vector2.LerpUnclamped(
                    new Vector2(start, sd.y),
                    new Vector2(end,   sd.y),
                    Mathf.SmoothStep(0f, 1f, t)
                );
                yield return null;
            }

            if (rt)
                rt.sizeDelta = new Vector2(end, rt.sizeDelta.y);
        }
    }

    public void AddSegmentToCell(RectTransform next)
    {
        if (!lastAnchor || !next) return;

        // düz parça
        var seg = CreateBarBetween(lastAnchor, next, linkIndex);
        segs.Add(seg);

        // bu hedef anchor için knot (küçük düğüm)
        AddKnotAt(next, knotScale, knotPopAnim, linkIndex);

        // state
        lastAnchor = next;
        anchors.Add(next);
    }

    /// Backtrack sonrasında veya genel senk gerektiğinde path’i sıfırdan kur.
    public void RebuildFromCells(List<RectTransform> orderedCells)
    {
        foreach (var g in segs)  if (g) Destroy(g);
        foreach (var g in knots) if (g) Destroy(g);
        segs.Clear(); knots.Clear();

        anchors.Clear();
        if (orderedCells != null) anchors.AddRange(orderedCells);

        if (anchors.Count > 0)
        {
            // İlk düğüm
            AddKnotAt(anchors[0], knotScale, false, linkIndex);
            for (int i = 0; i < anchors.Count - 1; i++)
            {
                var a = anchors[i];
                var b = anchors[i + 1];
                var seg = CreateBarBetween(a, b, linkIndex);
                segs.Add(seg);
                // ara düğüm (hedef nokta)
                AddKnotAt(b, knotScale, false, linkIndex);
            }

            lastAnchor = anchors[^1];
            if (dynImg && lastAnchor) UpdateToCell(lastAnchor);
        }
        else
        {
            lastAnchor = null;
        }
    }

    public void SetAnchor(RectTransform anchor)
    {
        lastAnchor = anchor;
        if (dynImg && lastAnchor) UpdateToCell(lastAnchor);
    }

    public void TrimSegments(int keepCount)
    {
        keepCount = Mathf.Max(0, keepCount);
        while (segs.Count > keepCount)
        {
            var go = segs[^1];
            segs.RemoveAt(segs.Count - 1);
            if (go) Destroy(go);
        }
    }

    public void UpdateToScreen(Vector2 screenPos, Camera cam)
    {
        if (!dynImg.enabled || !lastAnchor) return;
        if (cam) evtCam = cam;
        Vector2 a = WorldToLocal(lastAnchor.position, evtCam);
        RectTransformUtility.ScreenPointToLocalPointInRectangle(layer, screenPos, evtCam, out var b);
        SetLine(dynRT, a, b, thickness);
    }

    public void UpdateToCell(RectTransform endRect)
    {
        if (!dynImg.enabled || !lastAnchor || !endRect) return;
        Vector2 a = WorldToLocal(lastAnchor.position, evtCam);
        Vector2 b = WorldToLocal(endRect.position, evtCam);
        SetLine(dynRT, a, b, thickness);
    }

    public void CommitToEnd(RectTransform endRect)
    {
        Log($"CommitToEnd({(endRect ? endRect.name : "null")})");
        if (!lastAnchor || !endRect) { CancelStroke(); return; }

        // son parça + bitiş knot (bir tık büyük)
        AddSegmentToCell(endRect);
        AddKnotAt(endRect, knotScale * endKnotScale, knotPopAnim, linkIndex);

        Log($"Storing group for pair {currentPairId}: group={(currentGroup ? currentGroup.name : "null")}");
        if (currentPairId >= 0 && currentGroup)
        {
            if (groupsByPair.ContainsKey(currentPairId))
            {
                Log($"Overwriting old group for pair {currentPairId}");
                Destroy(groupsByPair[currentPairId]);
                groupsByPair[currentPairId] = currentGroup;
            }
            else
            {
                groupsByPair.Add(currentPairId, currentGroup);
            }
        }
        // geçiciyi kapat, state sıfırla
        CancelDynamic();
        lastAnchor = null;

        // referans listelerini boşalt (objeler grupta duruyor)
        anchors.Clear();
        segs.Clear();
        knots.Clear();

        // grup işaretlerini sıfırla
        currentPairId = -1;
        currentGroup = null;
    }

    public void CancelStroke()
    {
        Log("CancelStroke()");
        // yarım çizimde yaratılan parçaları ve grubu temizle
        foreach (var go in segs)  if (go) Destroy(go);
        foreach (var go in knots) if (go) Destroy(go);
        segs.Clear(); knots.Clear();

        if (currentGroup) { 
            Log($"Destroying currentGroup {currentGroup.name} (children={currentGroup.transform.childCount})");
            
            KillParticlesUnder(currentGroup.transform);
            Destroy(currentGroup); 
            currentGroup = null; 
        }
        currentPairId = -1;

        CancelDynamic();
        lastAnchor = null;
        anchors.Clear();
    }

    // ========= Helpers =========
    GameObject CreateBarBetween(RectTransform aRT, RectTransform bRT, int colorIndex)
    {
        var go = new GameObject("LinkSeg", typeof(RectTransform), typeof(Image));

        // >>> önemli: kalıcı parent = currentGroup (yoksa fallback)
        var parent = currentGroup ? currentGroup.transform : (permanentParent ? permanentParent : layer);
        go.transform.SetParent(parent, false);

        var rt  = go.GetComponent<RectTransform>();
        var img = go.GetComponent<Image>();
        img.sprite = barSprite;
        img.color  = (palette ? palette.GetLineColor(colorIndex) : Color.white);
        img.material = (palette ? palette.GetMaterial(colorIndex) : null);
        img.raycastTarget = false;
        img.type = useSliced ? Image.Type.Sliced : Image.Type.Simple;

        Vector2 a = WorldToLocal(aRT.position, evtCam);
        Vector2 b = WorldToLocal(bRT.position, evtCam);
        

        if (animateSegments) StartCoroutine(SmoothTweens.LineGrow(rt, a, b, thickness, segmentGrowDuration));
        else                 SetLine(rt, a, b, thickness);

        return go;
    }

    void AddKnotAt(RectTransform center, float scale, bool pop, int colorIndex)
    {
        if (!knotSprite || !center) return;

        var go = new GameObject("Knot", typeof(RectTransform), typeof(Image));
        // >>> önemli: kalıcı parent = currentGroup (yoksa fallback)
        var parent = currentGroup ? currentGroup.transform : (permanentParent ? permanentParent : layer);
        go.transform.SetParent(parent, false);

        var rt  = go.GetComponent<RectTransform>();
        var img = go.GetComponent<Image>();
        img.sprite = knotSprite;
        img.color  = (palette ? palette.GetLineColor(colorIndex) : Color.white);
        img.raycastTarget = false;
        img.type = Image.Type.Simple;
        img.material = (palette ? palette.GetMaterial(colorIndex) : null);

        float size = thickness * scale;
        rt.pivot = new Vector2(0.5f, 0.5f);
        rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.sizeDelta = new Vector2(size, size);

        Vector2 local = WorldToLocal(center.position, evtCam);
        rt.anchoredPosition = local;
        rt.localRotation = Quaternion.identity;

        knots.Add(go);

        if (pop) StartCoroutine(SmoothTweens.ScalePunch(rt, knotPopOvershoot, knotPopDuration));
        
        // Sparkle ParticleSystem
        // Sparkle ParticleSystem — KNOT altına parent et ki backtrack’te birlikte silinsin
        if (sparklePrefab)
        {
            var fx = Instantiate(sparklePrefab, go.transform); // go = Knot objesi
            var fxRT = fx.transform as RectTransform;
            if (fxRT)
            {
                fxRT.anchorMin = fxRT.anchorMax = new Vector2(0.5f, 0.5f);
                fxRT.anchoredPosition = Vector2.zero;
                fxRT.localRotation = Quaternion.identity;
                fxRT.localScale = Vector3.one;
            }
            else
            {
                fx.transform.localPosition = Vector3.zero;
                fx.transform.localRotation = Quaternion.identity;
                fx.transform.localScale = Vector3.one;
            }

            var ps = fx.GetComponent<ParticleSystem>();
            if (ps)
            {
                var main = ps.main;
                var emission = ps.emission;
                var pr = ps.GetComponent<ParticleSystemRenderer>();

                if (sparklePersistent)
                {
                    main.loop = true;
                    main.startLifetime = sparkleStartLifetime;
                    emission.enabled = true;
                    emission.rateOverTime = sparkleRateOverTime;
                    main.stopAction = ParticleSystemStopAction.None;
                }
                else
                {
                    main.loop = false;
                    main.startLifetime = sparkleStartLifetime;
                    emission.enabled = false; // tek burst için prefab burst ayarı kullanılacak
                    main.stopAction = ParticleSystemStopAction.Destroy;
                }

                if (palette)
                {
                    main.startColor = palette.GetLineColor(colorIndex);
                    if (pr) pr.material = palette.GetMaterial(colorIndex);
                }

                ps.Play(true);
            }
        }
    }

    void CancelDynamic(){ if (dynImg) dynImg.enabled = false; }
    
    void KillParticlesUnder(Transform root)
    {
        if (!root) return;
        var list = root.GetComponentsInChildren<ParticleSystem>(true);
        for (int i = 0; i < list.Length; i++)
        {
            var ps = list[i];
            if (!ps) continue;
            ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            Destroy(ps.gameObject);
        }
    }

    Vector2 WorldToLocal(Vector3 worldPos, Camera cam)
    {
        Vector2 sp = RectTransformUtility.WorldToScreenPoint(cam, worldPos);
        RectTransformUtility.ScreenPointToLocalPointInRectangle(layer, sp, cam, out var lp);
        return lp;
    }

    static void SetLine(RectTransform rt, Vector2 a, Vector2 b, float thick)
    {
        Vector2 dir = b - a;
        float len = dir.magnitude;
        float ang = Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg;

        rt.pivot = new Vector2(0, 0.5f);
        rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.anchoredPosition = a;
        rt.sizeDelta = new Vector2(len, thick);
        rt.localRotation = Quaternion.Euler(0, 0, ang);
    }

    // PathDrawer başlatırken çağırır
    public void BeginGroup(int pairId)
    {
        Log($"BeginGroup({pairId})");
        if (currentGroup) Log($"Warning: currentGroup already exists: {currentGroup.name}");
        currentPairId = pairId;
        // eski grup varsa üzerine yazılacak; Undo en son grubu siler
        currentGroup = new GameObject($"Stroke_{pairId}_{Time.frameCount}");
        Log($"Created group {currentGroup.name} under {(permanentParent ? permanentParent.name : (layer ? layer.name : "null"))}");
        currentGroup.transform.SetParent(permanentParent ? permanentParent : layer, false);
    }

    // Undo için
    public void DestroyGroupForPair(int pairId)
    {
        Log($"DestroyGroupForPair({pairId}) called. groupsByPair.Count={groupsByPair.Count}");
        if (groupsByPair.Count > 0)
        {
            string keys = "";
            foreach (var k in groupsByPair.Keys) keys += (keys.Length > 0 ? "," : "") + k;
            Log("groupsByPair keys=" + keys);
        }

        if (groupsByPair.TryGetValue(pairId, out var go))
        {
            if (go)
            {
                Log($"Found group in dictionary: name={go.name}, children={go.transform.childCount}");
                AnimateAndDestroyGroup(go.transform, undoClearDuration);
                groupsByPair.Remove(pairId);
                Log("Destroyed by dictionary entry.");
                return;
            }
            else
            {
                Log("Dictionary entry found but GameObject is null. Removing stale key.");
                groupsByPair.Remove(pairId);
            }
        }
        else
        {
            Log("No dictionary entry for this pair; scanning parent by name...");
        }

        var parent = (permanentParent ? permanentParent : layer);
        if (!parent)
        {
            Log("Parent is null, cannot scan children.");
            return;
        }

        int destroyed = 0;
        string prefix = $"Stroke_{pairId}_";
        for (int i = parent.childCount - 1; i >= 0; i--)
        {
            var t = parent.GetChild(i);
            if (!t) continue;
            Log($"scan child[{i}] name={t.name}");
            if (t.name.StartsWith(prefix))
            {
                Log($"Match → destroying {t.name} (children={t.childCount})");
                AnimateAndDestroyGroup(t, undoClearDuration);
                destroyed++;
            }
        }

        if (destroyed == 0)
        {
            Log("No group instances found by scan.");
        }
        else Log($"Destroyed {destroyed} instance(s) by name scan.");
    }
}