using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

/// Drop-in tek script retro/juice görselleştirme orkestrası.
/// - URP Global Volume'ı otomatik kurar, Bloom/CA/Vignette/LensDistortion/FilmGrain/ColorAdjustments ekler.
/// - Perlin tabanlı kamera+UI shake (drift yapmadan, unscaled time).
/// - Hafif idle sway (kamera/overlay hafif salınır).
/// - CRT hissi: Lens Distortion (barrel) + scanline overlay (runtime üretilen doku, RawImage ile).
/// - Bağlanma/undo/win gibi anlarda kısa "pulse" animasyonları (Bloom/CA/Vignette).
/// - PathDrawer event'lerine (OnPairCommitted/OnLevelComplete) otomatik bağlanır.
/// - İsterseniz herhangi bir yerden RetroFX.HitBlock(), RetroFX.PulseBig() vb. çağırabilirsiniz.
[DefaultExecutionOrder(-1000)]
public class RetroFXOrchestrator : MonoBehaviour
{
    // ===== Singleton (kolay erişim) =====
    public static RetroFXOrchestrator I;
    public static RetroFXOrchestrator Instance => I;

    [Header("Targets")]
    public Camera targetCamera;                       // boşsa Camera.main
    public RectTransform uiShakeTarget;               // boşsa sahnedeki en üst Canvas aranır

    [Header("PostFX – Global Volume")]
    public bool autoCreateGlobalVolume = true;
    public Volume globalVolume;                       // boşsa otomatik yarat
    public bool enableBloom = true;
    public bool enableChromaticAberration = true;
    public bool enableVignette = true;
    public bool enableLensDistortion = true;
    public bool enableFilmGrain = true;
    public bool enableColorAdjustments = true;
    [Header("Panini Projection")]
    [Tooltip("Panini Projection efektini aç/kapat")]
    public bool enablePaniniProjection = false;   // default false
    [Range(0f, 1f)] public float paniniDistance = 0.2f;
    [Range(0f, 1f)] public float paniniCropToFit = 0.8f;

    [Header("CRT / Retro Look")]
    [Tooltip("CRT kıvrımı: negatif değer barrel, pozitif pincushion")]
    [Range(-1f, 1f)] public float crtBarrel = -0.28f;
    [Range(0f, 1f)] public float crtBarrelXMultiplier = 1.0f;
    [Range(0f, 1f)] public float crtBarrelYMultiplier = 1.0f;

    [Tooltip("Üstte yarı şeffaf scanline overlay oluşturur")]
    public bool scanlines = true;
    [Range(0f, 1f)] public float scanlineAlpha = 0.18f;
    [Range(1, 8)] public int   scanlineDensity = 2;   // çizgi sıklığı
    [Range(0f, 2f)] public float scanlineScrollSpeed = 0.25f;

    [Header("Idle Sway")]
    [Tooltip("Kamera/overlay'e çok küçük sürekli salınım ver")]
    public bool idleSway = true;
    public float swayPosAmp = 0.015f;
    public float swayRotAmp = 0.65f;   // derece
    public float swayFreq   = 0.25f;   // Hz

    [Header("Shake (Perlin, drift yok)")]
    public bool allowCameraShake = true;
    public bool allowUIShake = true;
    public float shakeMaxAmplitude = 0.2f;      // world units
    public float uiShakeMaxPixels = 18f;        // px
    public float shakeFrequency = 24f;          // Hz
    public AnimationCurve shakeFalloff = AnimationCurve.EaseInOut(0,1,1,0);

    [Header("Pulse Presets (seconds)")]
    public float pulseSmall = 0.18f;
    public float pulseMedium = 0.28f;
    public float pulseBig = 0.45f;

    [Header("PostFX Defaults")]
    public float baseBloom = 1.0f;              // Base Bloom intensity
    public float baseCA = 0.02f;                // Chromatic Aberration intensity
    public float baseVignette = 0.18f;
    public float baseGrain = 0.25f;
    public float baseSaturation = 0f;           // ColorAdjustments.saturation
    public float baseContrast = 5f;             // ColorAdjustments.contrast

    [Header("Pulse Amounts (additive on top of base)")]
    public float addBloomSmall = 0.4f, addBloomMed = 0.9f, addBloomBig = 1.6f;
    public float addCASmall = 0.08f, addCAMed = 0.16f, addCABig = 0.28f;
    public float addVignetteSmall = 0.05f, addVignetteMed = 0.08f, addVignetteBig = 0.12f;
    public float addSaturationSmall = 6f, addSaturationMed = 10f, addSaturationBig = 15f;

    // ===== private state =====
    Transform camT;
    Vector3 camBaseLocalPos;
    Quaternion camBaseLocalRot;
    bool camBaseSet;

    Vector2 uiBaseAnchoredPos;
    float uiBaseRotZ;
    bool uiBaseSet;

    // shake runtime
    float shakeTimer;           // kalan süre
    float shakeAmp;             // [0..1] normalize; gerçek amplitude = shakeAmp * shakeMaxAmplitude
    float shakeSeed;

    float uiShakeTimer;
    float uiShakeAmp;
    float uiShakeSeed;

    // scanlines
    RawImage scanImg;
    Texture2D scanTex;
    RectTransform scanRT;
    float scanUvY;

    // Volume components
    Bloom _bloom;
    ChromaticAberration _ca;
    Vignette _vig;
    LensDistortion _dist;
    FilmGrain _grain;
    ColorAdjustments _color;
    PaniniProjection _panini;

    void Awake()
    {
        if (I && I != this) { Destroy(gameObject); return; }
        I = this;

        if (!targetCamera) targetCamera = Camera.main;
        camT = targetCamera ? targetCamera.transform : null;
        if (camT)
        {
            camBaseLocalPos = camT.localPosition;
            camBaseLocalRot = camT.localRotation;
            camBaseSet = true;
        }

        if (autoCreateGlobalVolume) EnsureGlobalVolume();

        // default values
        SetupPostDefaults();

        // scanlines overlay
        if (scanlines) CreateOrUpdateScanlinesOverlay();

        // UI target yoksa al
        if (!uiShakeTarget)
        {
            var canvas = FindObjectOfType<Canvas>();
            if (canvas && canvas.renderMode != RenderMode.WorldSpace)
                uiShakeTarget = canvas.GetComponent<RectTransform>();
        }
        if (uiShakeTarget)
        {
            uiBaseAnchoredPos = uiShakeTarget.anchoredPosition;
            uiBaseRotZ = uiShakeTarget.localEulerAngles.z;
            uiBaseSet = true;
        }

#if UNITY_IOS && !UNITY_EDITOR
        ApplyPerfPresetMobile();
#endif
    }

    void OnEnable()
    {
        TryHookPathDrawerEvents(true);
    }

    void OnDisable()
    {
        TryHookPathDrawerEvents(false);
    }

    void OnDestroy()
    {
        // unsubscribe & singleton cleanup
        TryHookPathDrawerEvents(false);
        if (I == this) I = null;

        // scanTex cleanup
        if (scanTex) Destroy(scanTex);
    }

    void Update()
    {
        float t = Time.unscaledTime;

        // idle sway
        if (idleSway)
        {
            float s = Mathf.Sin(t * Mathf.PI * 2f * swayFreq);
            if (camT && camBaseSet)
            {
                camT.localPosition = camBaseLocalPos + new Vector3(0, s * swayPosAmp, 0);
                camT.localRotation = camBaseLocalRot * Quaternion.Euler(0, 0, s * swayRotAmp);
            }
            if (uiShakeTarget && uiBaseSet)
            {
                uiShakeTarget.anchoredPosition = uiBaseAnchoredPos + new Vector2(0, s * (uiShakeMaxPixels * 0.1f));
                uiShakeTarget.localRotation = Quaternion.Euler(0, 0, uiBaseRotZ + s * (swayRotAmp * 0.25f));
            }
        }

        // camera shake (Perlin, continuous) – drift yok
        if (allowCameraShake && shakeTimer > 0f && camT && camBaseSet)
        {
            shakeTimer -= Time.unscaledDeltaTime;
            float k = 1f - Mathf.Clamp01(shakeTimer / Mathf.Max(0.0001f, _shakeTotal));
            float damper = shakeFalloff.Evaluate(k);

            float nx = (Mathf.PerlinNoise(shakeSeed, t * shakeFrequency) - 0.5f) * 2f;
            float ny = (Mathf.PerlinNoise(shakeSeed + 133.7f, t * shakeFrequency) - 0.5f) * 2f;
            Vector3 offset = new Vector3(nx, ny, 0f) * (shakeMaxAmplitude * shakeAmp * damper);

            camT.localPosition = camBaseLocalPos + offset;
            // hafif roll
            camT.localRotation = camBaseLocalRot * Quaternion.Euler(0f, 0f, offset.x * 12f);
            if (shakeTimer <= 0f)
            {
                camT.localPosition = camBaseLocalPos;
                camT.localRotation = camBaseLocalRot;
            }
        }

        // UI shake
        if (allowUIShake && uiShakeTimer > 0f && uiShakeTarget && uiBaseSet)
        {
            uiShakeTimer -= Time.unscaledDeltaTime;
            float k = 1f - Mathf.Clamp01(uiShakeTimer / Mathf.Max(0.0001f, _uiShakeTotal));
            float damper = shakeFalloff.Evaluate(k);

            float nx = (Mathf.PerlinNoise(uiShakeSeed, t * shakeFrequency) - 0.5f) * 2f;
            float ny = (Mathf.PerlinNoise(uiShakeSeed + 42.42f, t * shakeFrequency) - 0.5f) * 2f;
            Vector2 offset = new Vector2(nx, ny) * (uiShakeMaxPixels * uiShakeAmp * damper);

            uiShakeTarget.anchoredPosition = uiBaseAnchoredPos + offset;
            uiShakeTarget.localRotation = Quaternion.Euler(0f, 0f, uiBaseRotZ + offset.x * 0.4f);

            if (uiShakeTimer <= 0f)
            {
                uiShakeTarget.anchoredPosition = uiBaseAnchoredPos;
                uiShakeTarget.localRotation = Quaternion.Euler(0f, 0f, uiBaseRotZ);
            }
        }

        // scanline scroll
        if (scanImg && scanTex)
        {
            scanUvY = (scanUvY + scanlineScrollSpeed * Time.unscaledDeltaTime) % 1f;
            var r = scanImg.uvRect;
            scanImg.uvRect = new Rect(r.x, scanUvY, r.width, r.height);
        }
    }

    // ======= PUBLIC API =======
    static float _shakeTotal, _uiShakeTotal;
    public static void PulseSmall()  { if (I && I.enabled && I.gameObject) I.DoPulse(I.pulseSmall,  I.addBloomSmall, I.addCASmall, I.addVignetteSmall, I.addSaturationSmall, 0.35f, 0.25f); }
    public static void PulseMedium() { if (I && I.enabled && I.gameObject) I.DoPulse(I.pulseMedium, I.addBloomMed,   I.addCAMed,   I.addVignetteMed,   I.addSaturationMed,   0.65f, 0.55f); }
    public static void PulseBig()    { if (I && I.enabled && I.gameObject) I.DoPulse(I.pulseBig,    I.addBloomBig,  I.addCABig,   I.addVignetteBig,   I.addSaturationBig,   1.00f, 0.85f); }
    public static void HitBlock()    { if (I && I.enabled && I.gameObject) I.DoPulse(I.pulseSmall*0.9f, I.addBloomSmall*0.5f, I.addCASmall*1.2f, I.addVignetteSmall*0.8f, I.addSaturationSmall*0.5f, 0.55f, 0.45f); }

    // ======= IMPLEMENTATION =======
    void DoPulse(float dur, float addBloom, float addCA, float addVig, float addSat, float camShake, float uiShake)
    {
        // post fx animleri
        if (enableBloom && _bloom != null)        StartCoroutine(CoLerpFloat(v => _bloom.intensity.value = v, baseBloom, baseBloom + addBloom, dur));
        if (enableChromaticAberration && _ca!=null) StartCoroutine(CoLerpFloat(v => _ca.intensity.value = v, baseCA, baseCA + addCA, dur));
        if (enableVignette && _vig != null)       StartCoroutine(CoLerpFloat(v => _vig.intensity.value = v, baseVignette, baseVignette + addVig, dur));
        if (enableColorAdjustments && _color!=null) StartCoroutine(CoLerpFloat(v => _color.saturation.value = v, baseSaturation, baseSaturation + addSat, dur));

        // shake
        if (allowCameraShake && camT)
        {
            shakeAmp = Mathf.Clamp01(Mathf.Max(shakeAmp, camShake));
            _shakeTotal = dur;
            shakeTimer = Mathf.Max(shakeTimer, dur);
            if (shakeTimer <= 0f) shakeSeed = UnityEngine.Random.value * 999f;
        }
        if (allowUIShake && uiShakeTarget)
        {
            uiShakeAmp = Mathf.Clamp01(Mathf.Max(uiShakeAmp, uiShake));
            _uiShakeTotal = dur;
            uiShakeTimer = Mathf.Max(uiShakeTimer, dur);
            if (uiShakeTimer <= 0f) uiShakeSeed = UnityEngine.Random.value * 999f;
        }
    }

    IEnumerator CoLerpFloat(Action<float> setter, float baseVal, float peakVal, float dur)
    {
        float t = 0f;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = t / dur;
            // hızlı yüksel, yumuşak düş
            float e = k < 0.2f ? Mathf.SmoothStep(0, 1, k / 0.2f) : 1f - Mathf.SmoothStep(0, 1, (k - 0.2f) / 0.8f);
            setter(Mathf.Lerp(baseVal, peakVal, e));
            yield return null;
        }
        setter(baseVal);
    }

    void SetupPostDefaults()
    {
        if (!globalVolume) return;
        var profile = globalVolume.profile ?? (globalVolume.profile = ScriptableObject.CreateInstance<VolumeProfile>());

        if (enableBloom)  TryGetOrAdd(profile, out _bloom, true, b => { b.threshold.value = 1f; b.intensity.value = baseBloom; b.highQualityFiltering.value = true; });
        if (enableChromaticAberration) TryGetOrAdd(profile, out _ca, true, ca => { ca.intensity.value = baseCA; });
        if (enableVignette) TryGetOrAdd(profile, out _vig, true, v => { v.intensity.value = baseVignette; v.rounded.value = true; });
        if (enableLensDistortion) TryGetOrAdd(profile, out _dist, true, d =>
        {
            d.intensity.value = crtBarrel; d.xMultiplier.value = crtBarrelXMultiplier; d.yMultiplier.value = crtBarrelYMultiplier; d.center.value = new Vector2(0.5f, 0.5f);
        });
        if (enableFilmGrain) TryGetOrAdd(profile, out _grain, true, g => { g.type.value = FilmGrainLookup.Medium1; g.intensity.value = baseGrain; g.response.value = 0.8f; });
        if (enableColorAdjustments) TryGetOrAdd(profile, out _color, true, c => { c.saturation.value = baseSaturation; c.contrast.value = baseContrast; /* c.postExposure.value = 0f;*/ });
        if (enablePaniniProjection)
            TryGetOrAdd(profile, out _panini, true, p =>
            {
                p.distance.value   = paniniDistance;   // 0..1
                p.cropToFit.value  = paniniCropToFit;  // 0..1
            });
    }

    void EnsureGlobalVolume()
    {
        if (globalVolume && globalVolume.profile != null) return;

        if (!globalVolume)
        {
            // sahnede Global Volume yoksa yarat
            var go = new GameObject("Global Volume (Runtime)");
            globalVolume = go.AddComponent<Volume>();
            globalVolume.isGlobal = true;
            globalVolume.priority = 10f;
        }
        if (!globalVolume.profile) globalVolume.profile = ScriptableObject.CreateInstance<VolumeProfile>();
    }

    static void TryGetOrAdd<T>(VolumeProfile profile, out T comp, bool setActiveTrue, Action<T> init = null) where T : VolumeComponent
    {
        if (!profile.TryGet(out comp))
        {
            comp = profile.Add<T>(true);
        }
        if (setActiveTrue) comp.active = true;
        init?.Invoke(comp);
    }

    // ===== Scanlines =====
    void CreateOrUpdateScanlinesOverlay()
    {
        if (!scanlines) return;

        // Canvas üstünde full-screen RawImage
        Canvas overlayCanvas = null;
        if (uiShakeTarget) overlayCanvas = uiShakeTarget.GetComponentInParent<Canvas>();
        if (!overlayCanvas) overlayCanvas = FindObjectOfType<Canvas>();
        if (!overlayCanvas)
        {
            var cgo = new GameObject("FXOverlayCanvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            overlayCanvas = cgo.GetComponent<Canvas>();
            overlayCanvas.renderMode = RenderMode.ScreenSpaceOverlay;
            overlayCanvas.sortingOrder = Int16.MaxValue / 2;
        }

        var scanGO = new GameObject("Scanlines", typeof(RectTransform), typeof(RawImage));
        scanGO.transform.SetParent(overlayCanvas.transform, false);
        scanRT = (RectTransform)scanGO.transform;
        scanRT.anchorMin = Vector2.zero; scanRT.anchorMax = Vector2.one;
        scanRT.offsetMin = Vector2.zero; scanRT.offsetMax = Vector2.zero;

        scanImg = scanGO.GetComponent<RawImage>();
        scanImg.raycastTarget = false;
        scanImg.color = new Color(1f, 1f, 1f, scanlineAlpha);

        // doku üret
        int h = 256;
        int density = Mathf.Clamp(scanlineDensity, 1, 8);
        scanTex = new Texture2D(2, h, TextureFormat.RGBA32, false, true);
        scanTex.wrapMode = TextureWrapMode.Repeat; scanTex.filterMode = FilterMode.Bilinear;

        var px = new Color32[2 * h];
        for (int y = 0; y < h; y++)
        {
            byte a = (byte)((y % (2 * density) < density) ? 45 : 0); // bir koyu, bir şeffaf
            px[y * 2 + 0] = new Color32(0, 0, 0, a);
            px[y * 2 + 1] = new Color32(0, 0, 0, a);
        }
        scanTex.SetPixels32(px); scanTex.Apply();

        scanImg.texture = scanTex;
        scanImg.uvRect = new Rect(0, 0, 1, 1);
    }

    // ===== PathDrawer entegrasyonu (varsa) =====
    void TryHookPathDrawerEvents(bool subscribe)
    {
        try
        {
            if (subscribe)
            {
                PathDrawer.OnPairCommitted += OnPairCommitted;
                PathDrawer.OnLevelComplete += OnLevelCompleteUsed;
                PathDrawer.OnLevelCompleteFunctions += OnLevelCompleteFx;
            }
            else
            {
                PathDrawer.OnPairCommitted -= OnPairCommitted;
                PathDrawer.OnLevelComplete -= OnLevelCompleteUsed;
                PathDrawer.OnLevelCompleteFunctions -= OnLevelCompleteFx;
            }
        }
        catch { /* yoksa önemseme */ }
    }

    void OnPairCommitted(int pair, List<Cell> cells)
    {
        // Bağ tamamlanınca orta şiddette pulse
        PulseMedium();
    }

    void OnLevelCompleteUsed(int used)
    {
        // Seviye bitince büyük pulse
        PulseBig();
    }

    void OnLevelCompleteFx()
    {
        if (!this || !isActiveAndEnabled) return;
        StartCoroutine(CoDoubleTap());
    }

    IEnumerator CoDoubleTap()
    {
        PulseSmall();
        yield return new WaitForSecondsRealtime(0.1f);
        PulseSmall();
    }
    void ApplyPerfPresetMobile()
    {
        QualitySettings.vSyncCount = 0;
        Application.targetFrameRate = 120;
        enableChromaticAberration = false;
        enableFilmGrain = false;
        enableLensDistortion = false;
        enablePaniniProjection = false;
        scanlines = false;
        allowCameraShake = false;
        allowUIShake = false;
        swayPosAmp = Mathf.Min(swayPosAmp, 0.01f);
        swayRotAmp = Mathf.Min(swayRotAmp, 0.35f);
        swayFreq   = Mathf.Min(swayFreq,   0.18f);
        baseBloom = Mathf.Min(baseBloom, 0.9f);
    }
}
