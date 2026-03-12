using System.Collections;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// TV kanal değişimi static/karıncalanma efektini TAM EKRAN uygular.
/// reversePulse = false  -> fade-in (0→max) sonra fade-out (max→0)
/// reversePulse = true   -> anında max’ta başlar ve sadece fade-out (max→0)
/// </summary>
[DisallowMultipleComponent]
public class FullscreenChannelFX : MonoBehaviour
{
    [Header("Overlay")]
    [Tooltip("Efektin uygulanacağı tam ekran RawImage (boşsa otomatik oluşturulur)")]
    public RawImage overlay;

    [Header("Ayarlar")]
    [Tooltip("Efekt aktif olsun mu?")]
    public bool enableChannelFx = true;

    [Tooltip("Fade süresi (saniye). Normal modda IN süresi; OUT süresi = IN*0.7. Reverse modda tek OUT süresi.")]
    [Range(0.05f, 2f)] public float channelFxTime = 0.25f;

    [Tooltip("Maksimum opaklık (0-1)")]
    [Range(0f, 1f)] public float maxAlpha = 0.55f;

    [Tooltip("Time.unscaledDeltaTime kullan")]
    public bool useUnscaledTime = true;

    [Header("Reverse Mod")]
    [Tooltip("Açılışı tersine çevirir: max opaklıktan başlayıp sönerek biter")]
    public bool reversePulse = false;

    [Header("Noise Doku")]
    [Tooltip("Noise genişlik")]
    public int noiseWidth = 256;
    [Tooltip("Noise yükseklik")]
    public int noiseHeight = 256;
    [Tooltip("Noise filtreleme")]
    public FilterMode noiseFilter = FilterMode.Point;

    [Header("Otomatik")]
    [Tooltip("Enable olduğunda bir kez otomatik pulse yapsın mı?")]
    public bool autoPulseOnEnable = false;

    Texture2D _noiseTex;
    Coroutine _co;

    void Awake()
    {
        EnsureOverlay();
        EnsureNoiseTexture();
        SetOverlayAlpha(0f);
        overlay.raycastTarget = false; // UI tıklamasını engellemesin
        overlay.gameObject.SetActive(false);
    }

    void OnEnable()
    {
        if (autoPulseOnEnable) Pulse(); // mevcut reversePulse değerine göre çalışır
    }

    void OnDestroy()
    {
        if (_noiseTex) Destroy(_noiseTex);
    }

    /// <summary>Varsayılan davranış: public bool reversePulse değerine göre pulse.</summary>
    public void Pulse(bool withAudio = true)
    {
        Pulse(reversePulse, withAudio);
    }

    /// <summary>İstediğin anda yön seçerek pulse başlat.</summary>
    public void Pulse(bool reverse, bool withAudio = true)
    {
        if (!enableChannelFx || !overlay) return;
        if (_co != null) StopCoroutine(_co);
        _co = StartCoroutine(reverse ? CoPulseReverse() : CoPulseNormal(withAudio));
    }

    // ==== Normal: 0→max (IN), ardından max→0 (OUT kısa) ====
    IEnumerator CoPulseNormal(bool withAudio)
    {
        overlay.gameObject.SetActive(true);
        SetOverlayAlpha(0f);

        float t = 0f;
        float dt() => useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
        if(withAudio) FindFirstObjectByType<AudioManager>().Play("pulse");
        // Fade-in
        while (t < channelFxTime)
        {
            t += dt();
            FillNoiseTexture();
            float k = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(t / channelFxTime));
            SetOverlayAlpha(Mathf.Lerp(0f, maxAlpha, k));
            yield return null;
        }

        // Fade-out (daha kısa)
        t = 0f;
        float outTime = channelFxTime * 0.7f;
        while (t < outTime)
        {
            t += dt();
            FillNoiseTexture();
            float k = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(t / outTime));
            SetOverlayAlpha(Mathf.Lerp(maxAlpha, 0f, k));
            yield return null;
        }

        SetOverlayAlpha(0f);
        overlay.gameObject.SetActive(false);
        _co = null;
    }

    // ==== Reverse: anında max, sonra max→0 (tek aşama OUT) ====
    IEnumerator CoPulseReverse()
    {
        overlay.gameObject.SetActive(true);
        SetOverlayAlpha(maxAlpha);

        float t = 0f;
        float dt() => useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;

        // Tek fade-out
        while (t < channelFxTime)
        {
            t += dt();
            FillNoiseTexture();
            float k = Mathf.SmoothStep(0f, 1f, Mathf.Clamp01(t / channelFxTime));
            SetOverlayAlpha(Mathf.Lerp(maxAlpha, 0f, k));
            yield return null;
        }

        SetOverlayAlpha(0f);
        overlay.gameObject.SetActive(false);
        _co = null;
    }

    // ================= helpers =================

    void EnsureOverlay()
    {
        if (overlay) return;

        // Bu GameObject altında bir RawImage yoksa oluştur
        var go = new GameObject("FullscreenChannelFX_Overlay", typeof(RectTransform), typeof(RawImage));
        var rt = go.GetComponent<RectTransform>();
        go.transform.SetParent(transform, false);

        // Tam ekran yerleştir
        rt.anchorMin = Vector2.zero;
        rt.anchorMax = Vector2.one;
        rt.offsetMin = Vector2.zero;
        rt.offsetMax = Vector2.zero;

        overlay = go.GetComponent<RawImage>();
        overlay.color = new Color(1f, 1f, 1f, 0f);
    }

    void EnsureNoiseTexture()
    {
        if (_noiseTex && (_noiseTex.width != noiseWidth || _noiseTex.height != noiseHeight))
        {
            Destroy(_noiseTex);
            _noiseTex = null;
        }

        if (_noiseTex == null)
        {
            _noiseTex = new Texture2D(
                Mathf.Max(2, noiseWidth),
                Mathf.Max(2, noiseHeight),
                TextureFormat.RGBA32,
                false, true
            );
            _noiseTex.wrapMode = TextureWrapMode.Repeat;
            _noiseTex.filterMode = noiseFilter;
            overlay.texture = _noiseTex;
            overlay.uvRect = new Rect(0, 0, 1, 1);
        }
    }

    void FillNoiseTexture()
    {
        if (_noiseTex == null) EnsureNoiseTexture();
        int len = _noiseTex.width * _noiseTex.height;
        var cols = new Color32[len];
        for (int i = 0; i < len; i++)
        {
            byte v = (byte)Random.Range(70, 200);
            cols[i] = new Color32(v, v, v, 255);
        }
        _noiseTex.SetPixels32(cols);
        _noiseTex.Apply(false);
    }

    void SetOverlayAlpha(float a)
    {
        var c = overlay.color;
        c.a = a;
        overlay.color = c;
    }
}