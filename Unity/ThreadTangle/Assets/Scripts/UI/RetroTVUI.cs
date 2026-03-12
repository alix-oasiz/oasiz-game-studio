using UnityEngine;
using UnityEngine.UI;
using System.Collections.Generic;

/// <summary>
/// Düz beyaz bir UI kareyi retro TV kasasına çevirir.
/// Şader/harici sprite gerektirmez; dokuları runtime üretir.
/// Hiyerarşi:
///  [Root (bu)] Image (arka renk, opsiyonel)
///   ├── Bezel        (Image) : Dış kasa + oval köşe
///   ├── ScreenMask   (RectMask2D)
///   │    ├── Screen      (Image) : temel ekran rengi
///   │    ├── Content     (RectTransform) : buton/metinlerini buraya koy
///   │    ├── Scanlines   (RawImage) : yatay çizgiler (scroll)
///   │    └── Noise       (RawImage) : hafif flicker
///   ├── GlassOverlay (Image) : cam parlaması/vinyet
///   └── Knobs       (isteğe bağlı dekor: sol/sağ küçük düğmeler)
/// </summary>
[DisallowMultipleComponent]
[RequireComponent(typeof(RectTransform))]
public class RetroTVUI : MonoBehaviour
{
    [Header("Genel Boyut & Köşe")]
    [SerializeField] float cornerRadius = 24f;           // px
    [SerializeField] float bezelThickness = 18f;         // px

    [Header("Renkler")]
    [SerializeField] Color bezelOuter = new Color(0.07f, 0.07f, 0.09f, 1f);
    [SerializeField] Color bezelInner = new Color(0.16f, 0.16f, 0.18f, 1f);
    [SerializeField] Color screenColor = new Color(0.02f, 0.09f, 0.06f, 1f); // koyu yeşilimsi
    [SerializeField] Color scanlineColor = new Color(0f, 0f, 0f, 0.18f);
    [SerializeField] Color glassTint = new Color(1f, 1f, 1f, 0.14f);
    [SerializeField] Color vignetteColor = new Color(0f, 0f, 0f, 0.25f);

    [Header("Scanline & Noise")]
    [SerializeField] float scanlineSpeed = 28f;          // px/sn (aşağı doğru)
    [SerializeField] float scanlineDensity = 2f;         // her 2 px’te bir çizgi
    [SerializeField] float noiseSpeed = 0.6f;
    [SerializeField] float noiseStrength = 0.06f;        // alfa

    [Header("İçerik")]
    [SerializeField] bool adoptExistingChildren = true;   // var olan çocukları Content’e taşı
    public RectTransform Content { get; private set; }

    [Header("Opsiyonel Süs")]
    [SerializeField] bool addKnobs = true;

    // Üretilen bileşen referansları
    RectTransform rt;
    Image bezelImg, screenImg, glassImg;
    RawImage scanImg, noiseImg;
    RectTransform maskRT;

    // Runtime dokular
    Texture2D bezelTex, glassTex, scanTex, noiseTex;

    // anim durum
    float scanV;

    void Awake()
    {
        rt = GetComponent<RectTransform>();
    }

    void Start()
    {
        Build();
    }

    void OnDestroy()
    {
        // Runtime oluşturulan dokuları temizleyelim
        if (bezelTex) Destroy(bezelTex);
        if (glassTex) Destroy(glassTex);
        if (scanTex) Destroy(scanTex);
        if (noiseTex) Destroy(noiseTex);
    }

    void Update()
    {
        // scanline kaydır
        if (scanImg && scanTex)
        {
            scanV += (scanlineSpeed * (Time.unscaledDeltaTime)) / Mathf.Max(1f, scanTex.height);
            var r = scanImg.uvRect;
            r.y = scanV;
            scanImg.uvRect = r;
        }

        // noise yavaş kaydır (çok hafif)
        if (noiseImg && noiseTex)
        {
            var r = noiseImg.uvRect;
            r.x += (noiseSpeed * 0.31f) * Time.unscaledDeltaTime;
            r.y += (noiseSpeed * 0.27f) * Time.unscaledDeltaTime;
            noiseImg.uvRect = r;
        }
    }

    // === Kurulum ===
    public void Build()
    {
        ClearChildren(); // tertemiz başla

        var size = GetPixelSize(rt);
        int w = Mathf.Max(64, Mathf.RoundToInt(size.x));
        int h = Mathf.Max(64, Mathf.RoundToInt(size.y));

        // Bezel
        bezelTex = MakeRoundedBezel(w, h, cornerRadius, bezelThickness, bezelOuter, bezelInner);
        var bezelGO = MakeUI<Image>("Bezel", out bezelImg, transform);
        bezelImg.raycastTarget = false;
        bezelImg.sprite = Sprite.Create(bezelTex, new Rect(0,0,w,h), new Vector2(0.5f,0.5f), 100f);
        Stretch(bezelImg.rectTransform);

        // Screen Mask
        var maskGO = new GameObject("ScreenMask", typeof(RectTransform), typeof(RectMask2D));
        maskGO.transform.SetParent(transform, false);
        maskRT = maskGO.GetComponent<RectTransform>();
        // Bezel kalınlığı kadar içeri küçült
        Inset(maskRT, bezelThickness + 6f);

        // Screen (zemin)
        var screenGO = MakeUI<Image>("Screen", out screenImg, maskGO.transform);
        screenImg.color = screenColor;
        Stretch(screenImg.rectTransform);

        // İçerik Alanı
        Content = new GameObject("Content", typeof(RectTransform)).GetComponent<RectTransform>();
        Content.SetParent(maskGO.transform, false);
        Inset(Content, 8f); // ekran kenar boşluğu

        // Scanlines
        scanTex = MakeScanlineTexture(128, Mathf.Max(2, Mathf.RoundToInt(scanlineDensity)));
        var scanGO = new GameObject("Scanlines", typeof(RectTransform), typeof(RawImage));
        scanGO.transform.SetParent(maskGO.transform, false);
        scanImg = scanGO.GetComponent<RawImage>();
        scanImg.texture = scanTex;
        scanImg.color = Color.white; // alfa dokudan
        Stretch(scanImg.rectTransform);

        // Noise
        noiseTex = MakeNoiseTexture(128, 128, noiseStrength);
        var noiseGO = new GameObject("Noise", typeof(RectTransform), typeof(RawImage));
        noiseGO.transform.SetParent(maskGO.transform, false);
        noiseImg = noiseGO.GetComponent<RawImage>();
        noiseImg.texture = noiseTex;
        noiseImg.color = new Color(1,1,1, noiseStrength);
        Stretch(noiseImg.rectTransform);

        // Glass Overlay (parlama + vignette tek dokuda)
        glassTex = MakeGlassVignetteTexture(w, h, glassTint, vignetteColor, cornerRadius - 2f);
        var glassGO = MakeUI<Image>("GlassOverlay", out glassImg, transform);
        glassImg.raycastTarget = false;
        glassImg.sprite = Sprite.Create(glassTex, new Rect(0,0,w,h), new Vector2(0.5f,0.5f), 100f);
        Stretch(glassImg.rectTransform);

        // Knobs (opsiyonel dekor)
        if (addKnobs)
            AddKnobs();

        // Var olan çocukları Content'e taşı (kullanışlı!)
        if (adoptExistingChildren)
            AdoptChildrenToContent();
    }

    // === Yardımcı oluşturucular ===
    GameObject MakeUI<T>(string name, out T comp, Transform parent) where T : Component
    {
        var go = new GameObject(name, typeof(RectTransform), typeof(T));
        go.transform.SetParent(parent, false);
        comp = go.GetComponent<T>();
        return go;
    }

    void Stretch(RectTransform r)
    {
        r.anchorMin = Vector2.zero;
        r.anchorMax = Vector2.one;
        r.offsetMin = Vector2.zero;
        r.offsetMax = Vector2.zero;
    }

    void Inset(RectTransform r, float inset)
    {
        r.anchorMin = Vector2.zero;
        r.anchorMax = Vector2.one;
        r.offsetMin = new Vector2(inset, inset);
        r.offsetMax = new Vector2(-inset, -inset);
    }

    Vector2 GetPixelSize(RectTransform r)
    {
        var rect = r.rect;
        return new Vector2(Mathf.Max(2, rect.width), Mathf.Max(2, rect.height));
    }

    void ClearChildren()
    {
        var todel = new List<Transform>();
        foreach (Transform c in transform) todel.Add(c);
        foreach (var t in todel) DestroyImmediate(t.gameObject);
    }

    void AdoptChildrenToContent()
    {
        // Build öncesi mevcut çocukları Content'e taşıyalım (Content’in kendisini atla)
        var list = new List<Transform>();
        foreach (Transform c in transform) list.Add(c);
        foreach (var c in list)
        {
            if (c.name == "Bezel" || c.name == "ScreenMask" || c.name == "GlassOverlay" || c.name == "Knobs")
                continue;
            c.SetParent(Content, true);
        }
    }

    void AddKnobs()
    {
        var knobs = new GameObject("Knobs", typeof(RectTransform)).GetComponent<RectTransform>();
        knobs.SetParent(transform, false);
        Stretch(knobs);

        MakeKnob("KnobLeft", knobs, new Vector2(0.08f, 0.82f));
        MakeKnob("KnobRight", knobs, new Vector2(0.92f, 0.72f));
    }

    void MakeKnob(string name, RectTransform parent, Vector2 anchorPos)
    {
        Image img;
        var go = MakeUI<Image>(name, out img, parent);
        var r = img.rectTransform;
        r.anchorMin = r.anchorMax = anchorPos;
        r.sizeDelta = new Vector2(22f, 22f);
        img.sprite = Sprite.Create(MakeCircleTex(32, new Color(0.25f,0.25f,0.27f,1f), new Color(0.05f,0.05f,0.06f,1f)),
                                   new Rect(0,0,32,32), new Vector2(0.5f,0.5f), 100f);
    }

    // === Doku üreten yardımcılar ===
    Texture2D MakeRoundedBezel(int w, int h, float radius, float border, Color outer, Color inner)
    {
        var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
        tex.wrapMode = TextureWrapMode.Clamp;
        var px = new Color[w * h];

        float cx0 = radius; float cy0 = radius;
        float cx1 = w - radius - 1; float cy1 = h - radius - 1;

        for (int y = 0; y < h; y++)
        for (int x = 0; x < w; x++)
        {
            bool insideRound =
                InRoundRect(x, y, w, h, radius);

            if (!insideRound) { px[y*w + x] = new Color(0,0,0,0); continue; }

            // içeri doğru gradient: outer -> inner
            float dEdge = DistanceToRoundRectEdge(x, y, w, h, radius);
            float t = Mathf.InverseLerp(0f, border, dEdge);
            px[y*w + x] = Color.Lerp(inner, outer, t);
        }

        tex.SetPixels(px);
        tex.Apply(false, false);
        return tex;
    }

    Texture2D MakeGlassVignetteTexture(int w, int h, Color tint, Color vignette, float innerRadius)
    {
        var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
        tex.wrapMode = TextureWrapMode.Clamp;
        var px = new Color[w * h];
        Vector2 c = new Vector2(w/2f, h/2f);
        float maxR = Mathf.Min(w, h) * 0.5f;

        for (int y=0; y<h; y++)
        for (int x=0; x<w; x++)
        {
            float dist = (new Vector2(x,y) - c).magnitude;
            float v = Mathf.SmoothStep(0f, 1f, Mathf.InverseLerp(maxR*0.6f, maxR*0.98f, dist));
            // üstte hafif parlama çizgisi
            float highlight = Mathf.Clamp01(1f - Mathf.Abs((y - h*0.22f) / (h*0.09f)));
            Color col = Color.clear;
            col += new Color(tint.r, tint.g, tint.b, tint.a * 0.6f * highlight);
            col += new Color(vignette.r, vignette.g, vignette.b, vignette.a * v);
            px[y*w + x] = col;
        }
        tex.SetPixels(px);
        tex.Apply(false, false);
        return tex;
    }

    Texture2D MakeScanlineTexture(int w, int stepPx)
    {
        var tex = new Texture2D(w, stepPx * 2, TextureFormat.RGBA32, false);
        tex.wrapMode = TextureWrapMode.Repeat;

        for (int y=0; y<tex.height; y++)
        for (int x=0; x<tex.width; x++)
        {
            // üst şerit yarı saydam, alt şerit boş
            bool line = y < stepPx;
            var c = line ? scanlineColor : new Color(0,0,0,0);
            tex.SetPixel(x, y, c);
        }

        tex.Apply(false, false);
        return tex;
    }

    Texture2D MakeNoiseTexture(int w, int h, float a)
    {
        var tex = new Texture2D(w, h, TextureFormat.RGBA32, false);
        tex.wrapMode = TextureWrapMode.Repeat;
        var rand = new System.Random(1337);

        for (int y=0; y<h; y++)
        for (int x=0; x<w; x++)
        {
            float v = (float)rand.NextDouble();
            float g = Mathf.Lerp(0.2f, 0.8f, v);
            tex.SetPixel(x, y, new Color(g, g, g, a));
        }

        tex.Apply(false, false);
        return tex;
    }

    bool InRoundRect(int x, int y, int w, int h, float r)
    {
        // merkezden köşelere göre basit kontrol
        if (x >= r && x < w - r) return true;
        if (y >= r && y < h - r) return true;

        // köşeler
        Vector2 tl = new Vector2(r, h - r - 1);
        Vector2 tr = new Vector2(w - r - 1, h - r - 1);
        Vector2 bl = new Vector2(r, r);
        Vector2 br = new Vector2(w - r - 1, r);
        Vector2 p = new Vector2(x, y);

        if (x < r && y < r)        return (p - bl).sqrMagnitude <= r*r;
        if (x >= w - r && y < r)   return (p - br).sqrMagnitude <= r*r;
        if (x < r && y >= h - r)   return (p - tl).sqrMagnitude <= r*r;
        if (x >= w - r && y >= h - r) return (p - tr).sqrMagnitude <= r*r;
        return false;
    }

    float DistanceToRoundRectEdge(int x, int y, int w, int h, float r)
    {
        // kenara olan yaklaşık mesafe (bezel gradient için)
        float dx = Mathf.Min(x, w - 1 - x);
        float dy = Mathf.Min(y, h - 1 - y);
        float d = Mathf.Min(dx, dy);

        // köşelerde hafifçe artır
        if (!InRoundRect(x, y, w, h, r))
            d = 0f;
        return d;
    }

    Texture2D MakeCircleTex(int size, Color center, Color edge)
    {
        var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
        tex.wrapMode = TextureWrapMode.Clamp;
        Vector2 c = new Vector2(size/2f, size/2f);
        float r = size/2f - 1;

        for (int y=0; y<size; y++)
        for (int x=0; x<size; x++)
        {
            float t = Vector2.Distance(new Vector2(x,y), c) / r;
            var col = Color.Lerp(center, edge, Mathf.SmoothStep(0f,1f,t));
            if (t > 1f) col.a = 0f;
            tex.SetPixel(x,y,col);
        }
        tex.Apply(false,false);
        return tex;
    }
}