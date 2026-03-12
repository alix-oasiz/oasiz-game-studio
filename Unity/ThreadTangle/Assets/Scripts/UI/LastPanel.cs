using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;

public class LastPanel : MonoBehaviour
{
    [Header("UI Referansları")]
    [SerializeField] private UnityEngine.UI.Slider progressSlider;
    [SerializeField] private UnityEngine.UI.Text scoreText;
    [SerializeField] private UnityEngine.UI.Text highScoreText;
    [SerializeField] private GameObject buttons;
    [SerializeField, Tooltip("Slider'ın 0'dan 100'e ulaşması için gereken süre (saniye)")]
    private float duration = 3f;

    public FullscreenChannelFX tvSkin;

    private void Start()
    {
        FindFirstObjectByType<LevelCountdown>().StopCountdown();
        buttons.SetActive(false);
        HighScoreService.TryRecord(FindFirstObjectByType<LevelScoreManager>().TotalScore);
        if (progressSlider)
            progressSlider.value = 0f;
        if (scoreText)
            scoreText.text = FindFirstObjectByType<LevelScoreManager>().TotalScore.ToString();
        HighScoreService.Load();
        if (highScoreText)
            highScoreText.text = HighScoreService.GetBest().ToString();
        FindFirstObjectByType<LevelCountdown>().enabled = false;
        FindFirstObjectByType<AudioManager>().Play("lose");
        StartCoroutine(FillSlider());
    }

    private System.Collections.IEnumerator FillSlider()
    {
        float elapsed = 0f;
        while (elapsed < duration)
        {
            elapsed += Time.deltaTime;
            float progress = Mathf.Clamp01(elapsed / duration);
            float sliderValue = Mathf.Lerp(0f, 100f, progress);
            if (progressSlider)
                progressSlider.value = sliderValue;

            yield return null;
        }

        // Slider 100'e ulaştı
        if (progressSlider)
            progressSlider.value = 100f;

        StartCoroutine(OnScoreFull());
    }

    public void GoMenu()
    {
        StartCoroutine(OnScoreFull());
    }

    private IEnumerator OnScoreFull()
    {
        var lsm = FindFirstObjectByType<LevelScoreManager>();
        if (lsm)
        {
            HighScoreService.Load();
            int total = lsm.TotalScore;
            HighScoreService.TryRecord(total);
            if (highScoreText)
                highScoreText.text = HighScoreService.GetBest().ToString();
            var simples = Object.FindObjectsByType<SimpleHighScoreText>(FindObjectsSortMode.None);
            foreach (var s in simples) s.Refresh();
        }

        tvSkin.Pulse();
        RetroFXOrchestrator.PulseMedium();
        yield return new WaitForSeconds(0.9f);
        SceneManager.LoadScene("MainMenu");
    }
}
