using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

[DisallowMultipleComponent]
public class TVSkin : MonoBehaviour
{
    [Header("Targets")]
    [Tooltip("TV ekranı yapmak istediğin alan (oyun gridinin bulunduğu panel)")]
    public RectTransform screenRoot;
    [Tooltip("TV’nin altındaki butonlar (sol=power/undo, sağ=refresh/reset vb.)")]
    public List<Button> tvButtons = new List<Button>();

    [Header("Colors")]
    public Color bezelColor   = new Color(0.06f, 0.06f, 0.08f, 1f);
    public Color frameEdge    = new Color(1f, 1f, 1f, 0.14f); // cam üst kenar parıltısı
    public Color screenTint   = new Color(0.0f, 0.07f, 0.06f, 0.35f);
    public Color powerOnTint  = new Color(0.1f, 0.9f, 0.2f, 0.45f);

    [Header("Scanlines")]
    public bool scanlines = true;
    [Range(0f,1f)] public float scanlineAlpha = 0.18f;
    [Range(1,8)] public int scanlineDensity = 2;
    [Range(0f,2f)] public float scanlineScroll = 0.25f;

    [Header("Corners & Bezel")] 
    [Tooltip("Ekranın yuvarlak köşe yarıçapı (px karşılığı, boyuta göre ölçeklenir)")]
    [Range(0f, 64f)] public float cornerRadius = 18f;
    [Tooltip("Bezel kalınlığı (iç kenar ile dış kenar arası)")]
    [Range(0f, 48f)] public float bezelThickness = 16f;
    [Tooltip("Bezel arka gölgesi yoğunluğu")] 
    [Range(0f,1f)] public float bezelShadowAlpha = 0.28f;
    [Tooltip("Bezel gölge genişliği (px)")]
    [Range(0f, 64f)] public float bezelShadowSpread = 22f;

    [Header("Vignette (inner corners)")]
    [Range(0f,1f)] public float cornerVignette = 0.35f;

    [Header("Glass glint")]
    [Range(0f,1f)] public float glassHighlight = 0.35f;

    [Header("CRT barrel (sadece görsel overlay)")]
    [Range(-0.5f,0.5f)] public float barrelAmount = -0.12f;

    [Header("Channel FX")]
    [Tooltip("Kanal değiştirirken ekranı static’e al (TV hissi)")]
    public bool enableChannelFx = true;
    [Range(0.05f,1.0f)] public float channelFxTime = 0.25f;

    [Header("Buttons FX")]
    [Tooltip("Power button indeksini seç (tvButtons listesi)")]
    public int powerButtonIndex = 0;
    [Tooltip("Refresh button indeksini seç (tvButtons listesi)")]
    public int refreshButtonIndex = 1;
    public float buttonPunch = 1.08f;
    public float buttonPunchTime = 0.12f;

    // runtime generated
    RectTransform _bezelRT, _glassRT, _scanRT, _vignetteRT, _glowRT, _curveRT, _staticRT;
    RectTransform _maskRT, _bezelShadowRT, _frameRT;
    Image _bezelImg, _glassImg, _vignetteImg, _glowImg, _curveImg;
    Image _maskImg, _bezelShadowImg, _frameImg;
    RawImage _scanImg, _staticImg;

    Texture2D _scanTex, _staticTex;
    float _scanUvY;

    // cached procedural sprites
    static Sprite _roundedSprite256;   // soft rounded rect
    static Sprite _roundedShadow256;   // blurred-ish shadow

    bool _poweredOn = true;
    Coroutine _chCo;

    // button animation state
    readonly Dictionary<RectTransform, Vector3> _btnBaseScale = new();
    readonly Dictionary<RectTransform, Coroutine> _btnPunchCo = new();

    // ========= Rounded helpers =========
    static Sprite BuildRoundedSprite256(float radiusPx)
    {
        if (_roundedSprite256 != null) return _roundedSprite256;
        const int S = 256;
        var tex = new Texture2D(S, S, TextureFormat.RGBA32, false, true);
        tex.wrapMode = TextureWrapMode.Clamp; tex.filterMode = FilterMode.Bilinear;
        var px = new Color32[S*S];
        float r = Mathf.Clamp(radiusPx, 0f, 64f);
        float rs = r*r;
        // Soft edge thickness for anti-aliased corner
        float edge = Mathf.Max(1f, r * 0.6f);
        float inner = Mathf.Max(0f, r - edge);
        float innerS = inner*inner;
        for (int y=0; y<S; y++)
        {
            for (int x=0; x<S; x++)
            {
                int idx = y*S + x;
                // distance to nearest corner circle
                int cx = (x < S/2) ? 0 : (S-1);
                int cy = (y < S/2) ? 0 : (S-1);
                float dx = x - cx; if (dx < 0) dx = -dx; dx = Mathf.Max(0, dx - (S/2 - r));
                float dy = y - cy; if (dy < 0) dy = -dy; dy = Mathf.Max(0, dy - (S/2 - r));
                float d2 = dx*dx + dy*dy;
                byte a;
                if (d2 <= innerS) a = 255;
                else if (d2 >= rs) a = 0;
                else { float k = Mathf.InverseLerp(rs, innerS, d2); a = (byte)Mathf.RoundToInt(Mathf.SmoothStep(0,1,k)*255f); }
                px[idx] = new Color32(255,255,255,a);
            }
        }
        tex.SetPixels32(px); tex.Apply();
        _roundedSprite256 = Sprite.Create(tex, new Rect(0,0,S,S), new Vector2(0.5f,0.5f), 100f, 0, SpriteMeshType.FullRect);
        _roundedSprite256.name = "TVRounded256";
        return _roundedSprite256;
    }

    static Sprite BuildShadowSprite256(float spread)
    {
        if (_roundedShadow256 != null) return _roundedShadow256;
        const int S = 256;
        var tex = new Texture2D(S, S, TextureFormat.RGBA32, false, true);
        tex.wrapMode = TextureWrapMode.Clamp; tex.filterMode = FilterMode.Bilinear;
        var px = new Color32[S*S];
        float r = Mathf.Clamp(spread, 4f, 64f);
        // radial falloff from edges
        for (int y=0; y<S; y++)
        {
            for (int x=0; x<S; x++)
            {
                float nx = (x/(float)(S-1))*2f-1f;
                float ny = (y/(float)(S-1))*2f-1f;
                float d = Mathf.Max(Mathf.Abs(nx), Mathf.Abs(ny)); // square falloff
                float a = Mathf.Clamp01(1f - Mathf.InverseLerp(1f - (r/128f), 1f, d));
                px[y*S+x] = new Color32(0,0,0,(byte)Mathf.RoundToInt(a*255f));
            }
        }
        tex.SetPixels32(px); tex.Apply();
        _roundedShadow256 = Sprite.Create(tex, new Rect(0,0,S,S), new Vector2(0.5f,0.5f), 100f, 0, SpriteMeshType.FullRect);
        _roundedShadow256.name = "TVRoundedShadow256";
        return _roundedShadow256;
    }

    void Reset()
    {
        // otomatik bulma denemesi
        var rt = transform as RectTransform;
        if (!screenRoot) screenRoot = rt;
    }

    void OnDestroy()
    {
        if (_scanTex) Destroy(_scanTex);
        if (_staticTex) Destroy(_staticTex);
    }

    void Awake()
    {
        if (!screenRoot) screenRoot = transform as RectTransform;

        BuildHierarchy();
        BuildScanlines();
        BuildStaticNoise();
        WireButtons();
        SetPower(true, instant:true);
    }

    void Update()
    {
        // scanline akışı
        if (scanlines && _scanImg && _scanTex)
        {
            _scanUvY = (_scanUvY + scanlineScroll * Time.unscaledDeltaTime) % 1f;
            var r = _scanImg.uvRect;
            _scanImg.uvRect = new Rect(r.x, _scanUvY, r.width, r.height);
        }

        // hafif canlılık: cam tint’i very subtle pulsate
        if (_glassImg)
        {
            float s = Mathf.Sin(Time.unscaledTime * 0.8f) * 0.5f + 0.5f;
            var c = Color.Lerp(screenTint, powerOnTint, _poweredOn ? 0.15f*s : 0f);
            c.a = Mathf.Lerp(screenTint.a, screenTint.a + 0.08f, s*0.25f);
            _glassImg.color = c;
        }
        if (_bezelImg && _bezelImg.sprite == null) _bezelImg.sprite = BuildRoundedSprite256(cornerRadius + bezelThickness);
        if (_maskImg  && _maskImg.sprite  == null) _maskImg.sprite  = BuildRoundedSprite256(cornerRadius);
        if (_bezelShadowImg && _bezelShadowImg.sprite == null) _bezelShadowImg.sprite = BuildShadowSprite256(bezelShadowSpread);
    }

    // ========= UI inşa =========
    void BuildHierarchy()
    {
        // FRAME holder (so bezel + mask move together)
        _frameRT = MakeChild("TV_Frame", out _frameImg, Image.Type.Sliced, Color.clear, screenRoot);
        _frameRT.anchorMin = Vector2.zero; _frameRT.anchorMax = Vector2.one;
        _frameRT.offsetMin = new Vector2(-24, -24);
        _frameRT.offsetMax = new Vector2( 24,  24);

        // Bezel shadow (outer drop)
        _bezelShadowRT = MakeChild("TV_BezelShadow", out _bezelShadowImg, Image.Type.Simple, new Color(0,0,0,bezelShadowAlpha), _frameRT);
        FillParent(_bezelShadowRT, 0);
        _bezelShadowImg.sprite = BuildShadowSprite256(bezelShadowSpread);
        _bezelShadowImg.raycastTarget = false;

        // Bezel (rounded)
        _bezelRT = MakeChild("TV_Bezel", out _bezelImg, Image.Type.Simple, bezelColor, _frameRT);
        FillParent(_bezelRT, 0);
        _bezelImg.sprite = BuildRoundedSprite256(cornerRadius + bezelThickness);
        _bezelImg.raycastTarget = false;

        // Rounded mask area for the screen (inner rect)
        _maskRT = MakeChild("TV_RoundedMask", out _maskImg, Image.Type.Simple, Color.white, _frameRT);
        FillParent(_maskRT, Mathf.Max(2f, bezelThickness));
        _maskImg.sprite = BuildRoundedSprite256(cornerRadius);
        _maskImg.raycastTarget = false;
        // Add Mask to clip children content with rounded corners
        var mask = _maskRT.gameObject.GetComponent<Mask>();
        if (!mask) mask = _maskRT.gameObject.AddComponent<Mask>();
        mask.showMaskGraphic = false;

        // Glass (tint) under mask
        _glassRT = MakeChild("TV_Glass", out _glassImg, Image.Type.Simple, screenTint, _maskRT);
        FillParent(_glassRT, 0);

        // Top highlight
        _glowRT = MakeChild("TV_TopGlow", out _glowImg, Image.Type.Simple,
            new Color(1f,1f,1f,glassHighlight), _glassRT);
        _glowRT.anchorMin = new Vector2(0,1); _glowRT.anchorMax = new Vector2(1,1);
        _glowRT.pivot = new Vector2(0.5f,1f);
        _glowRT.sizeDelta = new Vector2(0, 18);

        // Inner vignette (fits rounded)
        _vignetteRT = MakeChild("TV_Vignette", out _vignetteImg, Image.Type.Sliced,
            new Color(0,0,0,cornerVignette), _glassRT);
        FillParent(_vignetteRT, 0);

        // Barrel curve overlay (visual only)
        _curveRT = MakeChild("TV_Curve", out _curveImg, Image.Type.Simple,
            new Color(1,1,1, Mathf.Abs(barrelAmount)*0.35f), _glassRT);
        FillParent(_curveRT, 0);

        // Scanline (RawImage)
        var scanGO = new GameObject("TV_Scanlines", typeof(RectTransform), typeof(RawImage));
        scanGO.transform.SetParent(_glassRT, false);
        _scanRT  = scanGO.GetComponent<RectTransform>();
        _scanImg = scanGO.GetComponent<RawImage>();
        FillParent(_scanRT, 0);
        _scanImg.raycastTarget = false;
        _scanImg.color = new Color(1,1,1, scanlineAlpha);

        // Static (kanal geçişi)
        var noiseGO = new GameObject("TV_Static", typeof(RectTransform), typeof(RawImage));
        noiseGO.transform.SetParent(_glassRT, false);
        _staticRT  = noiseGO.GetComponent<RectTransform>();
        _staticImg = noiseGO.GetComponent<RawImage>();
        FillParent(_staticRT, 0);
        _staticImg.raycastTarget = false;
        _staticImg.color = new Color(1,1,1, 0f); // default kapalı
    }

    RectTransform MakeChild(string name, out Image img, Image.Type type, Color col, RectTransform parent)
    {
        var go = new GameObject(name, typeof(RectTransform), typeof(Image));
        go.transform.SetParent(parent ? parent : screenRoot, false);
        var rt = go.GetComponent<RectTransform>();
        img = go.GetComponent<Image>();
        img.color = col;
        img.raycastTarget = false;
        img.type = type;
        return rt;
    }

    void FillParent(RectTransform rt, float pad)
    {
        rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
        rt.offsetMin = new Vector2(pad, pad);
        rt.offsetMax = new Vector2(-pad, -pad);
    }

    // ========= Dokular =========
    void BuildScanlines()
    {
        if (_scanImg) _scanImg.enabled = scanlines;
        if (!scanlines) { return; }
        if (!_scanImg) return;

        int h = 256;
        _scanTex = new Texture2D(2, h, TextureFormat.RGBA32, false, true);
        _scanTex.wrapMode = TextureWrapMode.Repeat;
        _scanTex.filterMode = FilterMode.Bilinear;

        int density = Mathf.Clamp(scanlineDensity, 1, 8);
        var px = new Color32[2*h];
        for (int y=0; y<h; y++)
        {
            byte a = (byte)((y % (2*density) < density) ? 45 : 0);
            px[y*2 + 0] = new Color32(0,0,0,a);
            px[y*2 + 1] = new Color32(0,0,0,a);
        }
        _scanTex.SetPixels32(px); _scanTex.Apply();
        _scanImg.texture = _scanTex;
        _scanImg.uvRect = new Rect(0,0,1,1);
        _scanImg.enabled = true;
    }

    void BuildStaticNoise()
    {
        _staticTex = new Texture2D(256, 256, TextureFormat.RGBA32, false, true);
        _staticTex.wrapMode = TextureWrapMode.Repeat;
        _staticTex.filterMode = FilterMode.Point;

        FillStaticTexture();
        if (!_staticImg) return;
        _staticImg.texture = _staticTex;
        _staticImg.uvRect = new Rect(0,0,1,1);
    }

    void FillStaticTexture()
    {
        var cols = new Color32[_staticTex.width * _staticTex.height];
        for (int i = 0; i < cols.Length; i++)
        {
            byte v = (byte)Random.Range(70, 200);
            cols[i] = new Color32(v, v, v, 255);
        }
        _staticTex.SetPixels32(cols); _staticTex.Apply();
    }

    // ========= Kanal FX / Power =========
    public void PulseChannelFx()
    {
        if (!enableChannelFx) return;
        if (_chCo != null) StopCoroutine(_chCo);
        _chCo = StartCoroutine(CoChannel());
    }

    IEnumerator CoChannel()
    {
        // static’e fade-in
        _staticImg.color = new Color(1,1,1, 0);
        _staticImg.gameObject.SetActive(true);

        float t = 0f;
        while (t < channelFxTime)
        {
            t += Time.unscaledDeltaTime;
            FillStaticTexture(); // canlı karıncalanma
            float k = t / channelFxTime;
            _staticImg.color = new Color(1,1,1, Mathf.SmoothStep(0, 0.55f, k));
            yield return null;
        }
        // fade-out
        t = 0f;
        while (t < channelFxTime*0.7f)
        {
            t += Time.unscaledDeltaTime;
            FillStaticTexture();
            float k = t / (channelFxTime*0.7f);
            _staticImg.color = new Color(1,1,1, 1f - Mathf.SmoothStep(0, 0.55f, k));
            yield return null;
        }
        _staticImg.color = new Color(1,1,1,0f);
        _staticImg.gameObject.SetActive(false);
    }

    public void SetPower(bool on, bool instant = false)
    {
        _poweredOn = on;
        StopCoroutineSafe(_powerCo);
        _powerCo = StartCoroutine(CoPower(on, instant));
    }

    Coroutine _powerCo;
    void StopCoroutineSafe(Coroutine co) { if (co != null) StopCoroutine(co); }

    IEnumerator CoPower(bool on, bool instant)
    {
        float t = 0f;
        float dur = instant ? 0f : 0.25f;
        var from = _glassImg.color;
        var target = on ? powerOnTint : screenTint;
        target.a = on ? Mathf.Max(screenTint.a, 0.4f) : screenTint.a;

        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = dur <= 0 ? 1f : Mathf.SmoothStep(0,1, t/dur);
            _glassImg.color = Color.Lerp(from, target, k);
            yield return null;
        }
        _glassImg.color = target;
    }

    // ========= Butonlar =========
    void WireButtons()
    {
        for (int i = 0; i < tvButtons.Count; i++)
        {
            int idx = i;
            if (!tvButtons[idx]) continue;
            tvButtons[idx].onClick.AddListener(() => OnTvButton(idx));
        }
    }

    void OnTvButton(int index)
    {
        // basınca punch + kanal efekti
        var rt = tvButtons[index].GetComponent<RectTransform>();
        if (rt)
        {
            // stop previous punch if any
            if (_btnPunchCo.TryGetValue(rt, out var running) && running != null)
                StopCoroutine(running);
            // cache base scale if first time
            if (!_btnBaseScale.ContainsKey(rt))
                _btnBaseScale[rt] = rt.localScale;
            _btnPunchCo[rt] = StartCoroutine(ButtonPunch(rt));
        }

        if (index == powerButtonIndex)
        {
            SetPower(!_poweredOn);
            // büyük bir pulse istiyorsan:
            RetroFXOrchestrator.PulseSmall();
        }
        else if (index == refreshButtonIndex)
        {
            PulseChannelFx();
            RetroFXOrchestrator.PulseMedium();
        }
        else
        {
            PulseChannelFx();
            RetroFXOrchestrator.PulseSmall();
        }
    }

    IEnumerator ButtonPunch(RectTransform rt)
    {
        // base scale for this button
        if (!_btnBaseScale.TryGetValue(rt, out var baseScale))
        {
            baseScale = rt.localScale;
            _btnBaseScale[rt] = baseScale;
        }

        float t = 0f;
        float dur = Mathf.Max(0.0001f, buttonPunchTime);
        float amp = Mathf.Max(0f, buttonPunch - 1f); // e.g., 1.08 -> 0.08

        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / dur);
            // yoyo curve: 0->1->0 using sine
            float yoyo = 1f + amp * Mathf.Sin(k * Mathf.PI);
            rt.localScale = new Vector3(baseScale.x * yoyo, baseScale.y * yoyo, baseScale.z);
            yield return null;
        }
        // restore exact base scale
        rt.localScale = baseScale;
        _btnPunchCo.Remove(rt);
    }
}