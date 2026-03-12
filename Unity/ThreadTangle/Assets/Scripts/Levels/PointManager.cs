using System.Collections;
using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// Basit puan yöneticisi: UnityEngine.UI.Text ile skor gösterir.
/// AddPoints(amount) çağrısında metni sayarak günceller ve pop animasyonu oynatır.
/// TextMeshPro KULLANMAZ.
/// </summary>
[DisallowMultipleComponent]
public class PointManager : MonoBehaviour
{
    [Header("UI")]
    [Tooltip("Skorun yazılacağı UnityEngine.UI.Text")]
    public Text scoreText;

    [Header("Başlangıç")]
    public int startScore = 0;

    [Header("Format")]
    [Tooltip("Skor metin formatı, {0} skor değeridir. Boş bırakılırsa sadece sayı yazılır.")]
    public string scoreFormat;

    [Header("Animasyon (Pop)")]
    [Tooltip("Pop animasyonunun toplam süresi (sn)")]
    public float popDuration = 0.2f;
    [Tooltip("Pop tepe ölçeği (1 = normal)")]
    public float popScale = 1.2f;
    [Tooltip("Pop animasyonunda timescale etkilenmesin")]
    public bool useUnscaledTime = true;

    [Header("Animasyon (Renk Flash)")]
    public bool flashColor = true;
    public Color flashTo = new Color(1f, 0.9f, 0.4f, 1f);
    [Tooltip("Flash geri dönüş süresi (sn)")]
    public float flashDuration = 0.15f;

    [Header("Animasyon (Mini Shake)")]
    public bool doShake = true;
    [Tooltip("UI shake genliği (px)")]
    public float shakeAmplitude = 6f;
    [Tooltip("UI shake süresi (sn)")]
    public float shakeDuration = 0.12f;

    [Header("Sayıyı Akıcı Güncelle")]
    [Tooltip("Skor artışı sayarak gösterilsin mi? (örn. 120→130 arası hızlı sayım)")]
    public bool tweenCount = true;
    [Tooltip("Sayı tween süresi (sn)")]
    public float countTweenTime = 0.2f;

    [Header("Opsiyonel Singleton")]
    public bool makeSingleton = true;
    public static PointManager Instance { get; private set; }

    public int CurrentScore { get; private set; }

    // runtime
    Vector3 _baseScale;
    Color _baseColor;
    Coroutine _countCo, _popCo, _shakeCo, _flashCo;

    void Awake()
    {
        if (makeSingleton)
        {
            if (Instance != null && Instance != this) { Destroy(gameObject); return; }
            Instance = this;
        }

        if (!scoreText)
        {
            scoreText = GetComponentInChildren<Text>();
            if (!scoreText)
            {
                Debug.LogError("[PointManager] Text referansı yok!");
                enabled = false;
                return;
            }
        }

        _baseScale = scoreText.rectTransform.localScale;
        _baseColor = scoreText.color;

        SetScore(startScore, instant: true);
    }

    // ========== Public API ==========
    public void AddPoint() => AddPoints(1);

    public void AddPoints(int amount)
    {
        if (amount == 0) return;
        int from = CurrentScore;
        int to = Mathf.Max(0, from + amount);
        CurrentScore = to;

        // UI güncellemeleri (sayarak veya direkt)
        if (_countCo != null) StopCoroutine(_countCo);
        _countCo = StartCoroutine(CoUpdateText(from, to, tweenCount ? countTweenTime : 0f));

        // Pop
        if (_popCo != null) StopCoroutine(_popCo);
        _popCo = StartCoroutine(CoPop(scoreText.rectTransform, popScale, popDuration));

        // Flash
        if (flashColor)
        {
            if (_flashCo != null) StopCoroutine(_flashCo);
            _flashCo = StartCoroutine(CoFlash(scoreText, _baseColor, flashTo, flashDuration));
        }

        // Shake
        if (doShake)
        {
            if (_shakeCo != null) StopCoroutine(_shakeCo);
            _shakeCo = StartCoroutine(CoShake(scoreText.rectTransform, shakeAmplitude, shakeDuration));
        }
    }

    public void SetScore(int value, bool instant = false)
    {
        int v = Mathf.Max(0, value);
        int from = CurrentScore;
        CurrentScore = v;

        if (_countCo != null) StopCoroutine(_countCo);
        _countCo = StartCoroutine(CoUpdateText(instant ? v : from, v, instant ? 0f : countTweenTime));
    }

    public void ResetScore(bool animateToZero = false)
    {
        if (animateToZero)
            SetScore(0, instant: false);
        else
            SetScore(0, instant: true);
    }

    // ========== Internals ==========
    IEnumerator CoUpdateText(int from, int to, float duration)
    {
        if (duration <= 0f)
        {
            WriteScore(to);
            yield break;
        }

        float t = 0f;
        while (t < duration)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / duration);
            int val = (int)Mathf.Lerp(from, to, EaseOutQuad(k));
            WriteScore(val);
            yield return null;
        }
        WriteScore(to);
    }

    void WriteScore(int value)
    {
        if (!scoreText) return;
        scoreText.text = string.IsNullOrEmpty(scoreFormat) ? value.ToString() : string.Format(scoreFormat, value);
    }

    IEnumerator CoPop(RectTransform rt, float peak, float duration)
    {
        if (!rt) yield break;
        Vector3 baseS = _baseScale;
        Vector3 peakS = baseS * Mathf.Max(1f, peak);
        float half = duration * 0.5f;

        // out
        float t = 0f;
        while (t < half)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / half);
            rt.localScale = Vector3.LerpUnclamped(baseS, peakS, EaseOutQuad(k));
            yield return null;
        }
        // in
        t = 0f;
        while (t < half)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / half);
            rt.localScale = Vector3.LerpUnclamped(peakS, baseS, EaseInQuad(k));
            yield return null;
        }
        rt.localScale = baseS;
    }

    IEnumerator CoFlash(Text txt, Color baseCol, Color toCol, float duration)
    {
        if (!txt) yield break;
        // forward
        float half = duration * 0.5f;
        float t = 0f;
        while (t < half)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / half);
            txt.color = Color.LerpUnclamped(baseCol, toCol, EaseOutQuad(k));
            yield return null;
        }
        // back
        t = 0f;
        while (t < half)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / half);
            txt.color = Color.LerpUnclamped(toCol, baseCol, EaseInQuad(k));
            yield return null;
        }
        txt.color = baseCol;
    }

    IEnumerator CoShake(RectTransform rt, float amplitudePx, float duration)
    {
        if (!rt || amplitudePx <= 0f || duration <= 0f) yield break;

        Vector2 basePos = rt.anchoredPosition;
        float t = 0f;
        while (t < duration)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float damper = 1f - Mathf.SmoothStep(0f, 1f, t / duration);
            float nx = (Mathf.PerlinNoise(12.3f, Time.unscaledTime * 24f) - 0.5f) * 2f;
            float ny = (Mathf.PerlinNoise(34.5f, Time.unscaledTime * 24f) - 0.5f) * 2f;
            Vector2 off = new Vector2(nx, ny) * (amplitudePx * damper);
            rt.anchoredPosition = basePos + off;
            yield return null;
        }
        rt.anchoredPosition = basePos;
    }

    // Easing helpers
    float EaseOutQuad(float x) => 1f - (1f - x) * (1f - x);
    float EaseInQuad(float x)  => x * x;
}