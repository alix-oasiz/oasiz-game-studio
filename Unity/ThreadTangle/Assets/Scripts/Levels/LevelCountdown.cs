using System;
using System.Collections;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;

public class LevelCountdown : MonoBehaviour
{
    [Header("🎮 Gameplay")]
    [SerializeField] private int startSeconds = 10;
    [SerializeField] private bool tutorialMode = false;
    [SerializeField] private float tutorialBlinkSpeed = 5f;

    [Header("⚙️ Settings")]
    [SerializeField] private bool autoStartOnEnable = true;
    [SerializeField] private bool useUnscaledTime = true;

    [Header("🎨 UI")]
    [SerializeField] private Text secondsText;
    [SerializeField] private RectTransform secondsTextRT;
    [SerializeField] private string displayFormat = "{0}";

    [Header("✨ Last 3 Seconds Effects")]
    [SerializeField] private Material lastThreeMaterial;
    [SerializeField] private float last3PopScale = 1.25f;
    [SerializeField] private float last3PopDuration = 0.15f;

    [Header("📦 Lose Panel (Animated)")]
    [SerializeField] private GameObject losePanelRoot;
    [SerializeField] private RectTransform losePanel;
    [SerializeField] private CanvasGroup loseCg;
    [SerializeField] private Image dimBackground;
    [SerializeField] private float panelAnimDuration = 0.25f;
    [SerializeField] private float panelStartScale = 0.7f;
    [SerializeField] private float panelPeakScale = 1.08f;
    [SerializeField] private float panelEndScale = 1f;

    [Header("🔊 Audio")]
    [SerializeField] private AudioClip tickSound;
    [SerializeField] private AudioClip last3Sound;
    [SerializeField] private AudioSource audioSource;

    [Header("⏸️ Pause System")]
    [SerializeField] private bool isPaused = false;

    [Header("🔧 Debug")]
    [SerializeField] private bool debugMode = false;

    [Header("📢 Events")]
    public UnityEvent OnTimerStart;
    public UnityEvent OnTimerTick;
    public UnityEvent OnLose;
    public UnityEvent<int> OnLast3SecondsTick;
    public UnityEvent OnPause;
    public UnityEvent OnResume;

    // Runtime
    private int remaining;
    private bool running;
    private Material _originalTextMaterial;
    private Material _lastThreeMaterialInstance;
    private Coroutine countdownCo, panelCo, blinkCo;

    void Reset()
    {
        if (!secondsText) secondsText = GetComponentInChildren<Text>();
        if (!secondsTextRT && secondsText) secondsTextRT = secondsText.rectTransform;
        if (!losePanel && losePanelRoot) losePanel = losePanelRoot.GetComponent<RectTransform>();
        if (!loseCg && losePanelRoot) loseCg = losePanelRoot.GetComponent<CanvasGroup>();
        if (!audioSource) audioSource = GetComponent<AudioSource>();
    }

    void Awake()
    {
        // Material setup
        if (secondsText && secondsText.material)
            _originalTextMaterial = secondsText.material;

        if (lastThreeMaterial)
            _lastThreeMaterialInstance = new Material(lastThreeMaterial);

        // UI setup
        if (!loseCg && losePanelRoot)
            loseCg = losePanelRoot.AddComponent<CanvasGroup>();

        if (losePanelRoot)
            losePanelRoot.SetActive(false);

        // AudioSource setup
        if (!audioSource)
            audioSource = gameObject.AddComponent<AudioSource>();

        // Event subscription
        PathDrawer.OnLevelCompleteFunctions += ResetCountdownOnly;

        if (debugMode)
            Debug.Log("[Countdown] Awake - Initialized");
    }

    void OnEnable()
    {
        if (autoStartOnEnable)
            StartCountdown();
    }

    void OnDisable()
    {
        PathDrawer.OnLevelCompleteFunctions -= ResetCountdownOnly;
    }

    void OnDestroy()
    {
        PathDrawer.OnLevelCompleteFunctions -= ResetCountdownOnly;
    }

    #region Public Methods

    /// <summary>
    /// Level tamamlandığında sadece countdown'u resetle, başlatma
    /// </summary>
    private void ResetCountdownOnly()
    {
        ResetCountdown(-1, startNow: false);
    }

    /// <summary>
    /// Countdown'u başlat
    /// </summary>
    public void StartCountdown()
    {
        ResetCountdown(-1, startNow: true);
    }

    /// <summary>
    /// Countdown'u resetle ve isteğe bağlı başlat
    /// </summary>
    public void ResetCountdown(int customSeconds = -1, bool startNow = true)
    {
        running = false;
        isPaused = false;

        if (countdownCo != null)
        {
            StopCoroutine(countdownCo);
            countdownCo = null;
        }

        StopBlinking();
        RestoreOriginalMaterial();
        HideLosePanelImmediate();

        int next = (customSeconds > 0) ? customSeconds : startSeconds;
        remaining = Mathf.Max(1, next);
        UpdateText(remaining);

        if (debugMode)
            Debug.Log($"[Countdown] Reset to {remaining} seconds. StartNow: {startNow}");

        if (startNow)
        {
            StartCoroutine(CoDelayedStart());
        }
    }

    /// <summary>
    /// Countdown'u durdur
    /// </summary>
    public void StopCountdown()
    {
        running = false;
        isPaused = false;

        if (countdownCo != null)
        {
            StopCoroutine(countdownCo);
            countdownCo = null;
        }

        StopBlinking();
        RestoreOriginalMaterial();

        if (debugMode)
            Debug.Log("[Countdown] Stopped");
    }

    /// <summary>
    /// Countdown'u duraklat
    /// </summary>
    public void PauseCountdown()
    {
        if (!running || isPaused) return;

        isPaused = true;
        OnPause?.Invoke();

        if (debugMode)
            Debug.Log("[Countdown] Paused");
    }

    /// <summary>
    /// Countdown'u devam ettir
    /// </summary>
    public void ResumeCountdown()
    {
        if (!running || !isPaused) return;

        isPaused = false;
        OnResume?.Invoke();

        if (debugMode)
            Debug.Log("[Countdown] Resumed");
    }

    /// <summary>
    /// Saniye ekle/çıkar
    /// </summary>
    public void AddSeconds(int delta, bool withPop = true)
    {
        remaining = Mathf.Max(0, remaining + delta);
        UpdateText(remaining);

        if (withPop && secondsTextRT)
            StartCoroutine(CoPop(secondsTextRT, last3PopScale, last3PopDuration));

        OnTimerTick?.Invoke();

        if (debugMode)
            Debug.Log($"[Countdown] AddSeconds: {delta}, New remaining: {remaining}");
    }

    /// <summary>
    /// Hemen lose durumuna geç
    /// </summary>
    public void ForceLose() => Lose();

    /// <summary>
    /// Countdown'u zorla durdur
    /// </summary>
    public void ForceStop() => StopCountdown();

    /// <summary>
    /// Lose panelini anında gizle
    /// </summary>
    public void HideLosePanelImmediate()
    {
        if (panelCo != null)
        {
            StopCoroutine(panelCo);
            panelCo = null;
        }

        if (!losePanelRoot) return;

        if (losePanel) losePanel.localScale = Vector3.one * panelEndScale;
        if (loseCg) loseCg.alpha = 0f;
        if (dimBackground) dimBackground.color = new Color(0, 0, 0, 0f);

        losePanelRoot.SetActive(false);
    }

    #endregion

    #region Coroutines

    private IEnumerator CoDelayedStart()
    {
        yield return null;

        running = true;
        isPaused = false;
        OnTimerStart?.Invoke();

        if (debugMode)
            Debug.Log("[Countdown] Started");

        countdownCo = StartCoroutine(CoCountdown());
    }

    IEnumerator CoCountdown()
    {
        OnTimerTick?.Invoke();

        float accum = 0f;

        while (running && remaining > 0)
        {
            // Pause kontrolü
            if (isPaused)
            {
                yield return null;
                continue;
            }

            float dt = useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            accum += dt;

            if (accum >= 1f)
            {
                accum -= 1f;
                remaining--;
                UpdateText(remaining);
                OnTimerTick?.Invoke();

                // Tick sesi
                if (audioSource && tickSound && remaining > 3)
                    audioSource.PlayOneShot(tickSound);

                // Son 3 saniye efektleri
                if (remaining <= 3 && remaining > 0)
                {
                    ApplyLast3Material();

                    if (secondsTextRT)
                        StartCoroutine(CoPop(secondsTextRT, last3PopScale, last3PopDuration));

                    if (audioSource && last3Sound)
                        audioSource.PlayOneShot(last3Sound);

                    OnLast3SecondsTick?.Invoke(remaining);
                }

                // Tutorial mode - son saniyede kal
                if (tutorialMode && remaining <= 1)
                {
                    remaining = 1;
                    UpdateText(remaining);
                    StartBlinking();
                    running = false; // ✅ Fix: running'i false yap
                    
                    if (debugMode)
                        Debug.Log("[Countdown] Tutorial mode - staying at 1");
                    
                    yield break;
                }
            }

            yield return null;
        }

        if (running && remaining <= 0 && !tutorialMode)
        {
            Lose();
        }
    }

    IEnumerator CoPop(RectTransform rt, float peak, float dur)
    {
        float t = 0f;
        Vector3 start = Vector3.one;
        Vector3 over = Vector3.one * peak;

        // Scale up
        while (t < dur * 0.5f)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float n = Mathf.Clamp01(t / (dur * 0.5f));
            float ease = 1f - (1f - n) * (1f - n);
            rt.localScale = Vector3.Lerp(start, over, ease);
            yield return null;
        }

        // Scale down
        t = 0f;
        while (t < dur * 0.5f)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float n = Mathf.Clamp01(t / (dur * 0.5f));
            float ease = n * n;
            rt.localScale = Vector3.Lerp(over, Vector3.one, ease);
            yield return null;
        }

        rt.localScale = Vector3.one;
    }

    IEnumerator CoBlinkText()
    {
        float t = 0f;
        Vector3 baseScale = secondsTextRT ? secondsTextRT.localScale : Vector3.one;

        while (true)
        {
            if (!secondsTextRT)
            {
                blinkCo = null;
                yield break;
            }

            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float s = Mathf.Sin(t * tutorialBlinkSpeed);
            float n = (s + 1f) * 0.5f;
            float scale = Mathf.Lerp(0.9f, 1.15f, n);

            secondsTextRT.localScale = baseScale * scale;

            yield return null;
        }
    }

    IEnumerator CoOpenLosePanel()
    {
        losePanelRoot.SetActive(true);

        if (losePanel) losePanel.localScale = Vector3.one * panelStartScale;
        if (loseCg) loseCg.alpha = 0f;
        if (dimBackground) dimBackground.color = new Color(0, 0, 0, 0f);

        float t = 0f;
        float d = Mathf.Max(0.01f, panelAnimDuration);

        while (t < d)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float n = Mathf.Clamp01(t / d);
            float ease = 1f - (1f - n) * (1f - n);

            float scale = n < 0.6f
                ? Mathf.Lerp(panelStartScale, panelPeakScale, ease / 0.6f)
                : Mathf.Lerp(panelPeakScale, panelEndScale, (ease - 0.6f) / 0.4f);

            if (losePanel) losePanel.localScale = Vector3.one * scale;
            if (loseCg) loseCg.alpha = Mathf.Lerp(0f, 1f, ease);
            if (dimBackground) dimBackground.color = new Color(0, 0, 0, Mathf.Lerp(0f, 0.5f, ease));

            yield return null;
        }

        if (losePanel) losePanel.localScale = Vector3.one * panelEndScale;
        if (loseCg) loseCg.alpha = 1f;
        if (dimBackground) dimBackground.color = new Color(0, 0, 0, 0.5f);

        panelCo = null;
    }

    #endregion

    #region Helper Methods

    void UpdateText(int value)
    {
        if (secondsText)
            secondsText.text = string.Format(displayFormat, Mathf.Max(0, value));

        if (debugMode)
            Debug.Log($"[Countdown] Updated text: {value}");
    }

    void ApplyLast3Material()
    {
        if (!_lastThreeMaterialInstance || !secondsText) return;
        secondsText.material = _lastThreeMaterialInstance;
    }

    void RestoreOriginalMaterial()
    {
        if (secondsText && _originalTextMaterial)
            secondsText.material = _originalTextMaterial;
    }

    void StartBlinking()
    {
        if (!secondsText) return;
        if (blinkCo != null) return;
        blinkCo = StartCoroutine(CoBlinkText());
    }

    void StopBlinking()
    {
        if (blinkCo != null)
        {
            StopCoroutine(blinkCo);
            blinkCo = null;
        }

        if (secondsTextRT)
            secondsTextRT.localScale = Vector3.one;
    }

    public void Lose()
    {
        running = false;
        isPaused = false;

        if (countdownCo != null)
        {
            StopCoroutine(countdownCo);
            countdownCo = null;
        }

        StopBlinking();
        RestoreOriginalMaterial();

        if (debugMode)
            Debug.Log("[Countdown] LOSE!");

        OnLose?.Invoke();
        OpenLosePanel();
    }

    public void OpenLosePanel()
    {
        if (!losePanelRoot) return;
        if (panelCo != null) StopCoroutine(panelCo);
        panelCo = StartCoroutine(CoOpenLosePanel());
    }

    #endregion
}