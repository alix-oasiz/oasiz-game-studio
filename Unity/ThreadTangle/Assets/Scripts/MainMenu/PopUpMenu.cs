using System;
using System.Collections;
using UnityEngine;

public class PopUpMenu : MonoBehaviour
{
    [Header("Target (Only)")]
    public GameObject target;                 // Tek referans: popup kök objesi (başlangıçta inactive olabilir)

    [Header("Open/Close Durations")]
    public float openDuration  = 0.25f;
    public float closeDuration = 0.20f;

    [Header("Scale Factors (relative to target's current localScale)")]
    [Tooltip("Açılışta başlayacağı ölçek: baseScale * openFromFactor")]
    public float openFromFactor = 0.90f;
    [Tooltip("Açılış sonunda ulaşılacak ölçek: baseScale * openToFactor")]
    public float openToFactor   = 1.00f;
    [Tooltip("Kapanış animasyonu sonunda gideceği ölçek: baseScale * closeToFactor")]
    public float closeToFactor  = 0.95f;

    [Header("Easing")]
    [Tooltip("0->1 easing eğrisi (open). Boşsa SmoothStep kullanılır.")]
    public AnimationCurve easeOpen;
    [Tooltip("0->1 easing eğrisi (close). Boşsa SmoothStep kullanılır.")]
    public AnimationCurve easeClose;

    [Header("Input")]
    public bool closeOnBack = true;  // Android back / Escape ile kapat

    public event Action OnOpened;
    public event Action OnClosed;

    CanvasGroup cg;
    Coroutine anim;
    bool isVisible;
    Transform t;

    void Awake()
    {
        if (target == null)
        {
            Debug.LogError("[PopUpMenu] target atanmadı.");
            enabled = false; return;
        }

        t = target.transform;

        // CanvasGroup gerekli; yoksa ekle
        cg = target.GetComponent<CanvasGroup>();
        if (cg == null) cg = target.AddComponent<CanvasGroup>();

        // Başlangıç: gizli tut
        cg.alpha = 0f;
        cg.interactable = false;
        cg.blocksRaycasts = false;
        target.SetActive(false);
        isVisible = false;
    }

    void Update()
    {
        if (!closeOnBack) return;
        if (isVisible && Input.GetKeyDown(KeyCode.Escape))
            Hide();
    }

    public void Toggle()
    {
        if (isVisible) Hide();
        else Show();
    }

    public void Show()
    {
        if (anim != null) StopCoroutine(anim);
        anim = StartCoroutine(CoShow());
    }

    public void Hide()
    {
        if (!target.activeSelf && !isVisible) return;
        if (anim != null) StopCoroutine(anim);
        anim = StartCoroutine(CoHide());
    }

    IEnumerator CoShow()
    {
        // Şu anki ölçek (ör: 20,20,20 ise ona göre ayarlayacağız)
        Vector3 baseScale = t.localScale;
        Vector3 fromS = baseScale * openFromFactor;
        Vector3 toS   = baseScale * openToFactor;

        // aktif et
        if (!target.activeSelf) target.SetActive(true);

        // başlangıç durumu
        t.localScale = fromS;
        cg.alpha = 0f;
        cg.interactable = false;
        cg.blocksRaycasts = false;

        float tmr = 0f, dur = Mathf.Max(0.01f, openDuration);
        while (tmr < dur)
        {
            tmr += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(tmr / dur);
            float e = easeOpen != null && easeOpen.keys.Length > 0 ? easeOpen.Evaluate(k) : Mathf.SmoothStep(0f, 1f, k);

            t.localScale = Vector3.LerpUnclamped(fromS, toS, e);
            cg.alpha = e;
            yield return null;
        }

        // finalize
        t.localScale = toS;
        cg.alpha = 1f;
        cg.interactable = true;
        cg.blocksRaycasts = true;
        isVisible = true;
        OnOpened?.Invoke();
        anim = null;
    }

    IEnumerator CoHide()
    {
        // Kapanış için baz ölçek: Şu anki hedef baz alınır (açıkken toS'teydik)
        Vector3 baseScale = t.localScale / Mathf.Max(0.0001f, openToFactor); // toFactor'a göre normalize eder
        Vector3 startS = t.localScale;
        Vector3 endS   = baseScale * closeToFactor;

        // input kapat
        cg.interactable = false;
        cg.blocksRaycasts = false;

        float tmr = 0f, dur = Mathf.Max(0.01f, closeDuration);
        while (tmr < dur)
        {
            tmr += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(tmr / dur);
            float e = easeClose != null && easeClose.keys.Length > 0 ? easeClose.Evaluate(k) : Mathf.SmoothStep(0f, 1f, k);

            t.localScale = Vector3.LerpUnclamped(startS, endS, e);
            cg.alpha = 1f - e;
            yield return null;
        }

        // finalize
        cg.alpha = 0f;
        target.SetActive(false);   // kapanış animinden SONRA kapat
        isVisible = false;
        OnClosed?.Invoke();
        anim = null;

        // Bir dahaki açılışta referans net olsun diye base ölçeğe döndür (opsiyonel)
        t.localScale = baseScale; 
    }
}
