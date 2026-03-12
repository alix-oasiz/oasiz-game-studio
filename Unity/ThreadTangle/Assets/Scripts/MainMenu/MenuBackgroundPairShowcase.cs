using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

public class MenuBackgroundPairShowcase : MonoBehaviour
{
    [System.Serializable]
    public struct PairStyle
    {
        public Sprite sprite;
        public Material material;
        public Color tint;
    }

    [Header("Stiller (sprite+material+renk)")]
    public List<PairStyle> styles = new();

    public enum ColorOrderMode { Random, Sequential, PingPong }

    [Header("Renk Sırası Modu")]
    [Tooltip("Renklerin sıralama biçimi: Random, Sequential veya PingPong")]
    public ColorOrderMode colorOrder = ColorOrderMode.Sequential;

    [Header("Prefab")]
    [Tooltip("SpriteRenderer veya Image içeren küçük görsel prefab")]
    public GameObject pointPrefab;

    [Header("Yerleşim")]
    [Tooltip("Merkez etrafında spawn yarıçapı")]
    public float centerRadius = 0.75f;
    [Tooltip("İki nokta arası mesafe")]
    public float pairDistance = 2.0f;
    [Tooltip("Z derinliği")]
    public float zDepth = 0f;

    [Header("Alan (Dikdörtgen Opsiyonu)")]
    [Tooltip("Merkez yerine dikdörtgen alandan seçim yap")] public bool useRectArea = true;
    [Tooltip("Dikdörtgen alan genişlik(x)/yükseklik(y)")] public Vector2 rectSize = new Vector2(10f, 6f);

    [Header("UI Çakışma Dışı Alanlar")]
    [Tooltip("Bu UI objelerinin üzerindeki bölgelere spawn ETME")] public List<RectTransform> uiNoSpawnZones = new();
    [Tooltip("UI kamerayı belirt (boşsa Canvas.worldCamera, o da yoksa Camera.main kullanılır)")] public Camera uiCamera;
    [Tooltip("UI Canvas referansı (Screen Space - Overlay/Camera durumları için)")] public Canvas targetCanvas;

    [Header("Yığılma Önleme")]
    [Tooltip("Yeni eşin orta noktası ile diğer aktif eşlerin orta noktaları arasındaki minimum mesafe")] public float minCenterSeparation = 1.2f;

    [Header("Zamanlama")]
    public float appearTime = 0.25f;
    public float connectTime = 0.6f;
    public float holdTime = 0.8f;
    public float fadeTime = 0.6f;

    [Header("Görsel Ayarlar")]
    public float lineWidth = 0.08f;
    public AnimationCurve ease = AnimationCurve.EaseInOut(0, 0, 1, 1);

    [Header("Otomatik Döngü")]
    public bool autoLoop = true;
    public Vector2 loopDelay = new Vector2(0.8f, 1.5f);

    [Header("Eşzamanlı Aktif Çift Kontrolü")]
    [Tooltip("Sahnede aynı anda en az kaç çift aktif olsun")] public int minActivePairs = 2;
    [Tooltip("Sahnede aynı anda en fazla kaç çift aktif olsun")] public int maxActivePairs = 4;

    // Runtime state
    int _activePairs = 0;
    float _nextSpawnTime = 0f;

    static int _styleIndex = 0;
    static bool _pingForward = true;

    [Header("Çakışma Önleme")]
    [Tooltip("Yeni eşin uç noktalarının diğer uçlara minimum uzaklığı")] public float endpointPadding = 0.6f;
    [Tooltip("Uygun yerleşim bulmak için maksimum deneme sayısı")] public int maxPlacementTries = 24;
    [Tooltip("Çizgiler arası minimum koridor mesafesi (kesişmeseler bile yakınlaşmasın)")] public float corridorPadding = 0.2f;

    struct ActiveSeg { public Vector2 A; public Vector2 B; }
    readonly List<ActiveSeg> _activeSegs = new();
    readonly List<ActiveSeg> _reservedSegs = new();
    readonly List<Vector2> _activeCenters = new();

    void Start()
    {
        Time.timeScale = 1;
        if (autoLoop)
            StartCoroutine(MaintainActiveLoop());
        else
            TriggerOnce();
    }

    public void TriggerOnce()
    {
        if (styles.Count == 0 || !pointPrefab) return;
        StartCoroutine(PlayOnce());
    }

    IEnumerator MaintainActiveLoop()
    {
        // Güvenli sınırlar
        maxActivePairs = Mathf.Max(1, maxActivePairs);
        minActivePairs = Mathf.Clamp(minActivePairs, 0, maxActivePairs);

        // İlk doldurma: minActivePairs kadar hızlı başlat
        while (_activePairs < minActivePairs)
        {
            StartPair();
            yield return null; // bir frame ara
        }

        // Sürekli bakım döngüsü
        while (true)
        {
            // Minimumun altına düştüysek hemen tamamla
            while (_activePairs < minActivePairs)
            {
                StartPair();
                yield return null;
            }

            // Maksimumdan küçüksek ve zaman geldiyse yeni bir çift ekleyebiliriz
            if (_activePairs < maxActivePairs && Time.time >= _nextSpawnTime)
            {
                StartPair();
                // Bir sonrakine kadar rastgele bekleme penceresi
                _nextSpawnTime = Time.time + Random.Range(loopDelay.x, loopDelay.y);
            }

            yield return null;
        }
    }

    void StartPair()
    {
        if (styles.Count == 0 || !pointPrefab) return;
        _activePairs++;
        StartCoroutine(PlayOnceManaged());
    }

    IEnumerator PlayOnceManaged()
    {
        yield return PlayOnce();
        _activePairs = Mathf.Max(0, _activePairs - 1);
    }

    IEnumerator PlayOnce()
    {
        // --- 1) Stil seç ---
        PairStyle style;

        switch (colorOrder)
        {
            case ColorOrderMode.Sequential:
                style = styles[_styleIndex % styles.Count];
                _styleIndex++;
                break;

            case ColorOrderMode.PingPong:
                style = styles[_styleIndex];
                if (_pingForward) _styleIndex++;
                else _styleIndex--;
                if (_styleIndex >= styles.Count)
                {
                    _styleIndex = styles.Count - 2;
                    _pingForward = false;
                }
                else if (_styleIndex < 0)
                {
                    _styleIndex = 1;
                    _pingForward = true;
                }
                break;

            default: // Random
                style = styles[Random.Range(0, styles.Count)];
                break;
        }

        // --- 2) Çakışmasız yerleşim bul ---
        Vector3 posA, posB;
        if (!TryFindNonOverlappingPositions(out posA, out posB))
        {
            // yerleşim bulunamadı, bu turu atla
            yield break;
        }

        // Rezervasyon: animasyon boyunca bu koridoru diğerleri kullanmasın
        var reserved = new ActiveSeg { A = new Vector2(posA.x, posA.y), B = new Vector2(posB.x, posB.y) };
        _reservedSegs.Add(reserved);

        // --- 3) İki nokta oluştur ---
        var a = Instantiate(pointPrefab, posA, Quaternion.identity, transform);
        var b = Instantiate(pointPrefab, posB, Quaternion.identity, transform);

        var sa = a.GetComponentInChildren<SpriteRenderer>();
        var sb = b.GetComponentInChildren<SpriteRenderer>();
        var ia = a.GetComponentInChildren<Image>();
        var ib = b.GetComponentInChildren<Image>();

        ApplyStyle(sa, ia, style);
        ApplyStyle(sb, ib, style);

        a.transform.localScale = Vector3.zero;
        b.transform.localScale = Vector3.zero;

        // --- 4) Çizgi oluştur ---
        var lineGO = new GameObject("BGPairLine", typeof(LineRenderer));
        lineGO.transform.SetParent(transform, false);
        var lr = lineGO.GetComponent<LineRenderer>();
        lr.positionCount = 2;
        lr.numCapVertices = 8;
        lr.useWorldSpace = true;
        lr.startWidth = lr.endWidth = lineWidth;
        lr.material = style.material ? style.material : new Material(Shader.Find("Sprites/Default"));
        lr.startColor = lr.endColor = new Color(style.tint.r, style.tint.g, style.tint.b, 0f);
        lr.SetPosition(0, posA);
        lr.SetPosition(1, posA); // A’dan başlayacak

        // --- 5) Noktaları pop-in ---
        yield return ScalePop(a, b, style.tint, appearTime);

        // --- 6) Çizgiyi A’dan B’ye çiz ---
        float t = 0f;
        while (t < connectTime)
        {
            t += Time.deltaTime;
            float k = ease.Evaluate(Mathf.Clamp01(t / connectTime));
            Vector3 currentEnd = Vector3.Lerp(posA, posB, k);
            lr.SetPosition(0, posA);
            lr.SetPosition(1, currentEnd);
            lr.startColor = lr.endColor = new Color(style.tint.r, style.tint.g, style.tint.b, k);
            yield return null;
        }

        lr.startColor = lr.endColor = style.tint;
        lr.SetPosition(1, posB);

        _activeSegs.Add(new ActiveSeg { A = new Vector2(posA.x, posA.y), B = new Vector2(posB.x, posB.y) });
        _activeCenters.Add(new Vector2((posA.x + posB.x) * 0.5f, (posA.y + posB.y) * 0.5f));

        // --- 7) Biraz bekle ---
        yield return new WaitForSeconds(holdTime);

        // --- 8) Fade out (nokta + çizgi) ---
        yield return FadeOut(sa, ia, sb, ib, lr, style.tint, fadeTime);

        // aktif listeden çıkar
        for (int i = 0; i < _activeSegs.Count; i++)
        {
            var s = _activeSegs[i];
            if ((Vector2)s.A == new Vector2(posA.x, posA.y) && (Vector2)s.B == new Vector2(posB.x, posB.y))
            { 
                _activeSegs.RemoveAt(i); break; 
            }
        }

        // merkeze en yakın kaydı kaldır
        Vector2 midToRemove = new Vector2((posA.x + posB.x) * 0.5f, (posA.y + posB.y) * 0.5f);
        int idxCenter = -1; float best = float.MaxValue;
        for (int j = 0; j < _activeCenters.Count; j++)
        {
            float d = ( _activeCenters[j] - midToRemove ).sqrMagnitude;
            if (d < best) { best = d; idxCenter = j; }
        }
        if (idxCenter >= 0) _activeCenters.RemoveAt(idxCenter);

        // rezervi kaldır
        for (int r = 0; r < _reservedSegs.Count; r++)
        {
            var s = _reservedSegs[r];
            if ((Vector2)s.A == new Vector2(posA.x, posA.y) && (Vector2)s.B == new Vector2(posB.x, posB.y))
            { _reservedSegs.RemoveAt(r); break; }
        }

        Destroy(lineGO);
        Destroy(a);
        Destroy(b);
    }

    IEnumerator ScalePop(GameObject a, GameObject b, Color tint, float time)
    {
        var sa = a.GetComponentInChildren<SpriteRenderer>();
        var sb = b.GetComponentInChildren<SpriteRenderer>();
        var ia = a.GetComponentInChildren<Image>();
        var ib = b.GetComponentInChildren<Image>();

        float t = 0f;
        while (t < time)
        {
            t += Time.deltaTime;
            float k = ease.Evaluate(t / time);
            a.transform.localScale = Vector3.one * k;
            b.transform.localScale = Vector3.one * k;

            Color c = new Color(tint.r, tint.g, tint.b, k);
            if (sa) sa.color = c;
            if (sb) sb.color = c;
            if (ia) ia.color = c;
            if (ib) ib.color = c;
            yield return null;
        }
    }

    IEnumerator FadeOut(SpriteRenderer sa, Image ia, SpriteRenderer sb, Image ib, LineRenderer lr, Color baseColor, float time)
    {
        float t = 0f;
        while (t < time)
        {
            t += Time.deltaTime;
            float k = ease.Evaluate(t / time);
            float a = Mathf.Lerp(1f, 0f, k);
            Color c = new Color(baseColor.r, baseColor.g, baseColor.b, a);

            if (sa) sa.color = c;
            if (sb) sb.color = c;
            if (ia) ia.color = c;
            if (ib) ib.color = c;
            lr.startColor = lr.endColor = c;
            yield return null;
        }
    }

    bool IsOverForbiddenUI(Vector2 worldPos)
    {
        if (uiNoSpawnZones == null || uiNoSpawnZones.Count == 0)
            return false;

        Camera cam = uiCamera;
        if (!cam)
        {
            if (targetCanvas && targetCanvas.worldCamera)
                cam = targetCanvas.worldCamera;
            else
                cam = Camera.main;
        }

        Vector2 screenPoint = cam ? (Vector2)cam.WorldToScreenPoint(new Vector3(worldPos.x, worldPos.y, zDepth))
                                  : (Vector2)Camera.main.WorldToScreenPoint(new Vector3(worldPos.x, worldPos.y, zDepth));

        foreach (var rt in uiNoSpawnZones)
        {
            if (!rt) continue;
            if (RectTransformUtility.RectangleContainsScreenPoint(rt, screenPoint, cam))
                return true;
        }
        return false;
    }

    bool TryFindNonOverlappingPositions(out Vector3 posA, out Vector3 posB)
    {
        for (int i = 0; i < maxPlacementTries; i++)
        {
            Vector2 center = useRectArea
                ? (Vector2)transform.position + new Vector2(Random.Range(-rectSize.x * 0.5f, rectSize.x * 0.5f),
                                                            Random.Range(-rectSize.y * 0.5f, rectSize.y * 0.5f))
                : (Vector2)transform.position + Random.insideUnitCircle * centerRadius;
            float angle = Random.Range(0f, 360f) * Mathf.Deg2Rad;
            Vector2 dir = new Vector2(Mathf.Cos(angle), Mathf.Sin(angle));

            Vector2 a2 = center + dir * (pairDistance * 0.5f);
            Vector2 b2 = center - dir * (pairDistance * 0.5f);

            Vector2 mid = (a2 + b2) * 0.5f;

            // UI no-spawn bölgeleri: uçlar veya orta nokta yasak alandaysa atla
            if (IsOverForbiddenUI(a2) || IsOverForbiddenUI(b2) || IsOverForbiddenUI(mid))
                continue;

            bool centerTooClose = false;
            foreach (var c in _activeCenters)
            {
                if ((c - mid).sqrMagnitude < minCenterSeparation * minCenterSeparation)
                { centerTooClose = true; break; }
            }
            if (centerTooClose) continue;

            // Uçların mevcut uçlara yeterince uzak olduğundan emin ol
            bool tooClose = false;
            foreach (var s in _activeSegs)
            {
                if ((s.A - a2).sqrMagnitude < endpointPadding * endpointPadding ||
                    (s.B - a2).sqrMagnitude < endpointPadding * endpointPadding ||
                    (s.A - b2).sqrMagnitude < endpointPadding * endpointPadding ||
                    (s.B - b2).sqrMagnitude < endpointPadding * endpointPadding)
                { tooClose = true; break; }
            }
            if (!tooClose)
            {
                foreach (var s in _reservedSegs)
                {
                    if ((s.A - a2).sqrMagnitude < endpointPadding * endpointPadding ||
                        (s.B - a2).sqrMagnitude < endpointPadding * endpointPadding ||
                        (s.A - b2).sqrMagnitude < endpointPadding * endpointPadding ||
                        (s.B - b2).sqrMagnitude < endpointPadding * endpointPadding)
                    { tooClose = true; break; }
                }
            }
            if (tooClose) continue;

            // Koridor mesafesi ve kesişme (aktif + rezerv)
            if (ViolatesCorridor(a2, b2))
                continue;

            // Mevcut çizgilerle kesişme kontrolü
            if (IntersectsExisting(a2, b2))
                continue;

            posA = new Vector3(a2.x, a2.y, zDepth);
            posB = new Vector3(b2.x, b2.y, zDepth);
            return true;
        }
        posA = default; posB = default; return false;
    }

    bool IntersectsExisting(Vector2 a, Vector2 b)
    {
        foreach (var s in _activeSegs)
        {
            if (SegmentsIntersect(a, b, s.A, s.B))
                return true;
        }
        return false;
    }

    static int Orient(Vector2 a, Vector2 b, Vector2 c)
    {
        float v = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);
        if (Mathf.Approximately(v, 0f)) return 0; // colinear
        return v > 0 ? 1 : 2; // clock or counterclock
    }

    static bool OnSegment(Vector2 a, Vector2 b, Vector2 c)
    {
        return Mathf.Min(a.x, b.x) <= c.x && c.x <= Mathf.Max(a.x, b.x) &&
               Mathf.Min(a.y, b.y) <= c.y && c.y <= Mathf.Max(a.y, b.y);
    }

    static bool SegmentsIntersect(Vector2 p1, Vector2 q1, Vector2 p2, Vector2 q2)
    {
        int o1 = Orient(p1, q1, p2);
        int o2 = Orient(p1, q1, q2);
        int o3 = Orient(p2, q2, p1);
        int o4 = Orient(p2, q2, q1);

        if (o1 != o2 && o3 != o4) return true; // genel durum

        // Özel durumlar (kolinear ve üstünde)
        if (o1 == 0 && OnSegment(p1, q1, p2)) return true;
        if (o2 == 0 && OnSegment(p1, q1, q2)) return true;
        if (o3 == 0 && OnSegment(p2, q2, p1)) return true;
        if (o4 == 0 && OnSegment(p2, q2, q1)) return true;
        return false;
    }

    static float DistancePointSegment(Vector2 p, Vector2 a, Vector2 b)
    {
        Vector2 ab = b - a;
        float t = Vector2.Dot(p - a, ab) / Mathf.Max(1e-6f, ab.sqrMagnitude);
        t = Mathf.Clamp01(t);
        Vector2 proj = a + t * ab;
        return (p - proj).magnitude;
    }

    static float SegmentSegmentMinDistance(Vector2 a1, Vector2 b1, Vector2 a2, Vector2 b2)
    {
        if (SegmentsIntersect(a1, b1, a2, b2)) return 0f;
        float d = Mathf.Min(
            DistancePointSegment(a1, a2, b2),
            Mathf.Min(DistancePointSegment(b1, a2, b2),
                      Mathf.Min(DistancePointSegment(a2, a1, b1), DistancePointSegment(b2, a1, b1)))
        );
        return d;
    }

    bool ViolatesCorridor(Vector2 a, Vector2 b)
    {
        // Mevcut aktif çizgiler
        foreach (var s in _activeSegs)
        {
            if (SegmentsIntersect(a, b, s.A, s.B)) return true;
            if (SegmentSegmentMinDistance(a, b, s.A, s.B) < corridorPadding) return true;
        }
        // Rezerv edilmiş (animasyon halinde) çizgiler
        foreach (var s in _reservedSegs)
        {
            if (SegmentsIntersect(a, b, s.A, s.B)) return true;
            if (SegmentSegmentMinDistance(a, b, s.A, s.B) < corridorPadding) return true;
        }
        return false;
    }

    void ApplyStyle(SpriteRenderer sr, Image im, PairStyle st)
    {
        if (sr)
        {
            sr.sprite = st.sprite;
            if (st.material) sr.material = st.material;
            sr.color = new Color(st.tint.r, st.tint.g, st.tint.b, 0f);
        }
        if (im)
        {
            im.sprite = st.sprite;
            if (st.material) im.material = st.material;
            im.color = new Color(st.tint.r, st.tint.g, st.tint.b, 0f);
        }
    }
}