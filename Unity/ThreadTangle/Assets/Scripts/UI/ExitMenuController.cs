using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
using System.Collections;

public class ExitMenuController : MonoBehaviour
{
    [Header("UI Referansları")]
    [SerializeField] private GameObject confirmPanelRoot;   // Panelin en üst GameObject'i (aktif/pasif)
    [SerializeField] private RectTransform confirmPanel;    // Ölçeklenecek asıl kutu
    [SerializeField] private CanvasGroup confirmCg;         // Fade için
    [SerializeField] private Image dimBackground;           // Arkadaki karartma (isteğe bağlı)
    [SerializeField] private Button exitButton;             // "Çıkış" ana butonu
    [SerializeField] private Button yesButton;              // Onay
    [SerializeField] private Button noButton;               // Vazgeç

    [Header("Sahne")]
    [SerializeField] private string mainMenuSceneName = "MainMenu";

    [Header("Açılacak Son Menü (Sahnede Mevcut)")]
    [SerializeField, Tooltip("Sahnede hali hazırda bulunan menünün kök GameObject'i")] private GameObject nextMenuRoot;
    [SerializeField, Tooltip("Açılış animasyonu için ölçeklenecek panel (opsiyonel)")] private RectTransform nextMenuPanel;
    [SerializeField, Tooltip("Fade için CanvasGroup (opsiyonel, yoksa children'dan bulunur)")] private CanvasGroup nextMenuCg;

    [Header("Animasyon Ayarları")]
    [SerializeField, Tooltip("Açılış/kapanış animasyon süresi (sn)")]
    private float animDuration = 0.25f;
    [SerializeField, Tooltip("Pop başlangıç ölçeği")]
    private float startScale = 0.7f;
    [SerializeField, Tooltip("Pop tepe (overshoot) ölçeği")]
    private float peakScale = 1.08f;
    [SerializeField, Tooltip("Bitiş (normal) ölçek")]
    private float endScale = 1.0f;
    [SerializeField, Tooltip("Zamanı timeScale'den bağımsız oynat")]
    private bool useUnscaledTime = true;

    Coroutine animCo;
    bool isOpen;

    void Reset()
    {
        // Inspector'da otomatik doldurma kolaylığı
        if (!confirmPanelRoot && transform.childCount > 0)
            confirmPanelRoot = transform.GetChild(0).gameObject;
        if (!confirmPanel) confirmPanel = confirmPanelRoot ? confirmPanelRoot.GetComponent<RectTransform>() : null;
        if (!confirmCg && confirmPanelRoot) confirmCg = confirmPanelRoot.GetComponent<CanvasGroup>();
        if (!confirmCg && confirmPanelRoot) confirmCg = confirmPanelRoot.AddComponent<CanvasGroup>();
    }

    void Awake()
    {
        if (!confirmCg && confirmPanelRoot) confirmCg = confirmPanelRoot.AddComponent<CanvasGroup>();
    }

    void Start()
    {
        // Başlangıçta panel kapalı
        SetPanelActive(false, instant:true);

        // Olay bağlama
        if (exitButton) exitButton.onClick.AddListener(OnExitPressed);
        if (yesButton) yesButton.onClick.AddListener(OnConfirmExit);
        if (noButton) noButton.onClick.AddListener(OnCancelExit);
        if (dimBackground)
        {
            var dimBtn = dimBackground.GetComponent<Button>();
            if (dimBtn) dimBtn.onClick.AddListener(OnCancelExit); // dışa tıklayınca kapanma (opsiyonel)
        }

        // Otomatik bağlama (opsiyonel)
        if (nextMenuRoot)
        {
            if (!nextMenuPanel)
                nextMenuPanel = nextMenuRoot.GetComponentInChildren<RectTransform>(true);
            if (!nextMenuCg)
                nextMenuCg = nextMenuRoot.GetComponentInChildren<CanvasGroup>(true);
        }
    }

    // --- Public API ---
    public void OnExitPressed()
    {
        Open();
    }

    public void OnConfirmExit()
    {
        // Sahnede var olan menüyü aktif edip animasyonla aç
        if (nextMenuRoot)
        {
            nextMenuRoot.SetActive(true);

            // Hedef panel / canvas group yoksa children'dan bulmayı dene
            if (!nextMenuPanel)
                nextMenuPanel = nextMenuRoot.GetComponentInChildren<RectTransform>(true);
            if (!nextMenuCg)
                nextMenuCg = nextMenuRoot.GetComponentInChildren<CanvasGroup>(true);

            // Başlangıç değerleri
            if (nextMenuPanel)
                nextMenuPanel.localScale = Vector3.one * startScale;
            if (nextMenuCg)
            {
                nextMenuCg.alpha = 0f;
                nextMenuCg.blocksRaycasts = false;
            }

            StartCoroutine(CoOpenExternal(nextMenuPanel, nextMenuCg));

            // Bu menüyü animasyonla kapat
            Close();
        }
        else
        {
            // Yedek davranış: sahne yükle (eski davranış)
            SceneManager.LoadScene(mainMenuSceneName);
        }
    }

    public void OnCancelExit()
    {
        Close();
    }

    public void TransitionToNextMenu()
    {
        OnConfirmExit();
    }

    // --- Panel kontrol ---
    public void Open()
    {
        if (isOpen) return;
        if (animCo != null) StopCoroutine(animCo);
        animCo = StartCoroutine(CoOpen());
    }

    public void Close()
    {
        if (!isOpen) return;
        if (animCo != null) StopCoroutine(animCo);
        animCo = StartCoroutine(CoClose());
    }

    void SetPanelActive(bool active, bool instant = false)
    {
        isOpen = active;

        if (confirmPanelRoot) confirmPanelRoot.SetActive(true); // anim için açık tut
        if (instant)
        {
            float a = active ? 1f : 0f;
            if (confirmCg) confirmCg.alpha = a;
            if (dimBackground) dimBackground.color = new Color(0,0,0, active ? 0.5f : 0f);
            if (confirmPanel) confirmPanel.localScale = Vector3.one * (active ? endScale : startScale);
            if (!active && confirmPanelRoot) confirmPanelRoot.SetActive(false);
        }
    }

    IEnumerator CoOpen()
    {
        SetPanelActive(true, instant:false);

        // Başlangıç durumları
        float t = 0f;
        float duration = Mathf.Max(0.01f, animDuration);

        if (confirmPanel) confirmPanel.localScale = Vector3.one * startScale;
        if (confirmCg) confirmCg.alpha = 0f;
        if (dimBackground) dimBackground.color = new Color(0,0,0, 0f);

        // Pop-in: start -> peak -> end  + fade-in + arka plan karartma
        while (t < duration)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float n = Mathf.Clamp01(t / duration);

            // EaseOutQuad
            float ease = 1f - (1f - n) * (1f - n);

            // Ölçek segment (overshoot)
            float scale = n < 0.6f
                ? Mathf.Lerp(startScale, peakScale, ease / 0.6f)
                : Mathf.Lerp(peakScale, endScale, (ease - 0.6f) / 0.4f);

            if (confirmPanel) confirmPanel.localScale = Vector3.one * scale;
            if (confirmCg) confirmCg.alpha = Mathf.Lerp(0f, 1f, ease);
            if (dimBackground) dimBackground.color = new Color(0,0,0, Mathf.Lerp(0f, 0.5f, ease));

            yield return null;
        }

        // Son değerleri sabitle
        if (confirmPanel) confirmPanel.localScale = Vector3.one * endScale;
        if (confirmCg) confirmCg.alpha = 1f;
        if (dimBackground) dimBackground.color = new Color(0,0,0, 0.5f);
        animCo = null;
    }

    IEnumerator CoOpenExternal(RectTransform target, CanvasGroup cg)
    {
        float t = 0f;
        float duration = Mathf.Max(0.01f, animDuration);

        // Dış hedef yoksa güvenli çık
        if (!target && !cg)
            yield break;

        // Pop-in + fade-in (yalnızca dış hedef üzerinde, arka plan karartmasını burada kontrol etmiyoruz)
        while (t < duration)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float n = Mathf.Clamp01(t / duration);
            float ease = 1f - (1f - n) * (1f - n); // EaseOutQuad

            float scale = n < 0.6f
                ? Mathf.Lerp(startScale, peakScale, ease / 0.6f)
                : Mathf.Lerp(peakScale, endScale, (ease - 0.6f) / 0.4f);

            if (target) target.localScale = Vector3.one * scale;
            if (cg) cg.alpha = Mathf.Lerp(0f, 1f, ease);

            yield return null;
        }

        if (target) target.localScale = Vector3.one * endScale;
        if (cg)
        {
            cg.alpha = 1f;
            cg.blocksRaycasts = true;
        }
    }

    IEnumerator CoClose()
    {
        float t = 0f;
        float duration = Mathf.Max(0.01f, animDuration);

        // Kapanışta hafif küçülterek ve fade-out
        float currentAlpha = confirmCg ? confirmCg.alpha : 1f;
        float currentDim = dimBackground ? dimBackground.color.a : 0.5f;
        float currentScale = confirmPanel ? confirmPanel.localScale.x : endScale;

        while (t < duration)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float n = Mathf.Clamp01(t / duration);

            // EaseInQuad
            float ease = n * n;

            if (confirmPanel) confirmPanel.localScale = Vector3.one * Mathf.Lerp(currentScale, startScale, ease);
            if (confirmCg) confirmCg.alpha = Mathf.Lerp(currentAlpha, 0f, ease);
            if (dimBackground) dimBackground.color = new Color(0,0,0, Mathf.Lerp(currentDim, 0f, ease));

            yield return null;
        }

        if (confirmPanel) confirmPanel.localScale = Vector3.one * startScale;
        if (confirmCg) confirmCg.alpha = 0f;
        if (dimBackground) dimBackground.color = new Color(0,0,0, 0f);

        // Tam kapat
        if (confirmPanelRoot) confirmPanelRoot.SetActive(false);
        isOpen = false;
        animCo = null;
    }
}