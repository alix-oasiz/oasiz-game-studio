using UnityEngine;
using UnityEngine.UI;
using System.Collections;

/// <summary>
/// Basıldığında yumuşak pop efekti yapan UI butonu.
/// </summary>
[RequireComponent(typeof(Button))]
public class UIButtonPop : MonoBehaviour
{
    [Header("Efekt Ayarları")]
    [Tooltip("Butonun büyüyeceği oran (1.1 = %10 büyüme)")]
    [Range(1f, 1.5f)] public float popScale = 1.1f;

    [Tooltip("Animasyon süresi (sn)")]
    [Range(0.05f, 0.5f)] public float popDuration = 0.15f;

    [Tooltip("Sönme süresi (sn)")]
    [Range(0.05f, 0.5f)] public float returnDuration = 0.15f;

    [Tooltip("Time.unscaledDeltaTime kullan")]
    public bool useUnscaledTime = true;

    private Button _button;
    private RectTransform _rect;
    private Vector3 _baseScale;
    private Coroutine _popCo;

    void Awake()
    {
        _button = GetComponent<Button>();
        _rect = GetComponent<RectTransform>();
        _baseScale = _rect.localScale;

        _button.onClick.AddListener(PlayPop);
    }

    public void PlayPop()
    {
        if (_popCo != null) StopCoroutine(_popCo);
        _popCo = StartCoroutine(CoPop());
    }

    IEnumerator CoPop()
    {
        float t = 0f;
        float dt() => useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;

        // büyüme
        while (t < popDuration)
        {
            t += dt();
            float n = Mathf.Clamp01(t / popDuration);
            float ease = 1f - Mathf.Pow(1f - n, 2f); // easeOutQuad
            float s = Mathf.Lerp(1f, popScale, ease);
            _rect.localScale = _baseScale * s;
            yield return null;
        }

        // geri küçülme
        t = 0f;
        while (t < returnDuration)
        {
            t += dt();
            float n = Mathf.Clamp01(t / returnDuration);
            float ease = 1f - Mathf.Cos(n * Mathf.PI * 0.5f); // easeInSine
            float s = Mathf.Lerp(popScale, 1f, ease);
            _rect.localScale = _baseScale * s;
            yield return null;
        }

        _rect.localScale = _baseScale;
        _popCo = null;
    }
}