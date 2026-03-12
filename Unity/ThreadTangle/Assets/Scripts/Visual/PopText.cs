using UnityEngine;
using UnityEngine.UI;
using System.Collections;

[DisallowMultipleComponent]
public class PopText : MonoBehaviour
{
    [Header("References")]
    [SerializeField] private Text targetText;          // UI.Text
    [SerializeField] private RectTransform targetRT;   // Ölçek/rotasyon burada yapılır
    [SerializeField] private CanvasGroup cg;           // Alpha kontrolü

    [Header("Timing")]
    [Tooltip("Toplam efekt süresi (sn)")]
    [SerializeField] private float duration = 0.65f;

    [Header("Scale Pop")]
    [Tooltip("Başlangıç ölçeği")]
    [SerializeField] private float startScale = 0.6f;
    [Tooltip("Aşım (overshoot) tepe ölçeği")]
    [SerializeField] private float peakScale = 1.15f;
    [Tooltip("Bitiş ölçeği")]
    [SerializeField] private float endScale = 1.0f;

    [Header("Rotation Shake")]
    [Tooltip("Derece cinsinden maksimum yalpalama")]
    [SerializeField] private float maxShakeDeg = 6f;

    [Header("Fade")]
    [Tooltip("Başta görünmez olsun mu?")]
    [SerializeField] private bool fadeIn = true;

    [Header("Curves")]
    [SerializeField] private AnimationCurve scaleCurve = AnimationCurve.EaseInOut(0, 0, 1, 1);
    [SerializeField] private AnimationCurve fadeCurve = AnimationCurve.EaseInOut(0, 0, 1, 1);
    [SerializeField] private AnimationCurve shakeCurve = AnimationCurve.EaseInOut(0, 1, 1, 0);

    Coroutine routine;
    Vector3 defaultScale;

    void Reset()
    {
        targetText = GetComponent<Text>();
        targetRT   = GetComponent<RectTransform>();
        cg         = GetComponent<CanvasGroup>();
    }

    void Awake()
    {
        if (!targetText) targetText = GetComponent<Text>();
        if (!targetRT)   targetRT   = GetComponent<RectTransform>();
        if (!cg)         cg         = gameObject.AddComponent<CanvasGroup>();

        defaultScale = Vector3.one;
    }

    /// <summary>
    /// Dışarıdan tek çağıracağın metod.
    /// </summary>
    public void Shot(string message)
    {
        if (routine != null) StopCoroutine(routine);
        routine = StartCoroutine(CoShot(message));
    }

    IEnumerator CoShot(string message)
    {
        // Yazıyı hemen güncelle
        targetText.text = message;

        // Başlangıç durumları
        float t = 0f;
        cg.alpha = fadeIn ? 0f : 1f;
        targetRT.localScale = Vector3.one * startScale;

        // Küçük bir "overshoot" zamanlama: 0 -> peak -> 1
        // scaleCurve ile birleştirip s-eğrisi veriyoruz
        while (t < duration)
        {
            t += Time.unscaledDeltaTime; // UI animi genelde timeScale'den etkilenmesin
            float n = Mathf.Clamp01(t / duration);

            // Ölçek: 0..0.5 arası start->peak, 0.5..1 arası peak->end
            float seg = n < 0.5f
                ? Mathf.Lerp(startScale, peakScale, scaleCurve.Evaluate(n * 2f))
                : Mathf.Lerp(peakScale, endScale,   scaleCurve.Evaluate((n - 0.5f) * 2f));

            targetRT.localScale = defaultScale * seg;

            // Fade (opsiyonel)
            if (fadeIn)
            {
                cg.alpha = Mathf.Lerp(0f, 1f, fadeCurve.Evaluate(n));
            }

            // Yalpalama (küçük bir açısal titreşim)
            float shakeAmt = shakeCurve.Evaluate(n) * maxShakeDeg;
            float angle = Mathf.PerlinNoise(Time.unscaledTime * 13.37f, 0.123f) * 2f - 1f;
            targetRT.localRotation = Quaternion.Euler(0f, 0f, angle * shakeAmt);

            yield return null;
        }

        // Son değerleri netleştir
        targetRT.localScale = defaultScale * endScale;
        targetRT.localRotation = Quaternion.identity;
        cg.alpha = 1f;

        routine = null;
    }
}