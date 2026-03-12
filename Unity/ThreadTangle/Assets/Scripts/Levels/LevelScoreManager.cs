using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Events;

/// Her level sonunda PathDrawer.OnLevelComplete ile gelen "playerUsedTiles" değerini,
/// LevelOptimalSolver.bestCost ile karşılaştırır; puanlar ve UI'ı günceller.
/// Kusursuz (diff == 0) ise özel bir event/metot tetikler.
[DisallowMultipleComponent]
public class LevelScoreManager : MonoBehaviour
{
    [Header("Refs")]
    [Tooltip("Optimal değer (bestCost) için çözücü")]
    [SerializeField] private LevelOptimalSolver optimalSolver;

    [Tooltip("Toplam skoru gösterecek düz Unity UI Text")]
    [SerializeField] private Text totalScoreText;

    [Tooltip("Bu elde kazanılan puanı kısa süre gösterecek Text (opsiyonel)")]
    [SerializeField] private Text gainedPopupText;

    [Tooltip("Havalı pop efektleri için (opsiyonel)")]
    [SerializeField] private PopText popText;

    [Header("Scoring")]
    [Tooltip("Kusursuz (diff = 0)")]
    public int pointsPerfect = 150;
    [Tooltip("diff = 1")]
    public int pointsDiff1 = 110;
    [Tooltip("diff = 2")]
    public int pointsDiff2 = 85;
    [Tooltip("diff = 3")]
    public int pointsDiff3 = 60;
    [Tooltip("diff = 4")]
    public int pointsDiff4 = 40;
    [Tooltip("4 üzeri her fark için kaç puan azalsın")]
    public int decayPerExtra = 6;
    [Tooltip("Minimum kazanılacak puan")]
    public int minPoints = 10;

    [Header("Perfect Hand")]
    [Tooltip("Kusursuz olduğunda tetiklenecek Event (Inspector'dan bağla)")]
    public UnityEvent OnPerfectHand;

    [Header("Popup")]
    [Tooltip("Gained popup fade süresi (sn)")]
    public float popupFade = 0.6f;

    public int TotalScore { get; private set; }
    public int LastGained { get; private set; }

    void Awake()
    {
        if (!optimalSolver) optimalSolver = FindFirstObjectByType<LevelOptimalSolver>();
        UpdateTotalUI();
        HidePopupImmediate();
    }

    void OnEnable()
    {
        PathDrawer.OnLevelComplete += HandleLevelComplete;
    }

    void OnDisable()
    {
        PathDrawer.OnLevelComplete -= HandleLevelComplete;
    }

    // === Core ===
    void HandleLevelComplete(int playerUsedTiles)
    {
        if (!optimalSolver)
        {
            Debug.LogWarning("[LevelScoreManager] optimalSolver yok; best = player olarak varsayıyorum.");
        }

        int best = (optimalSolver && optimalSolver.bestCost != int.MaxValue)
            ? optimalSolver.bestCost
            : playerUsedTiles;

        int diff = Mathf.Max(0, playerUsedTiles - best);  // negatif beklemiyoruz
        int gained = ScoreFromDiff(diff);

        LastGained = gained;
        TotalScore += gained;

        // Kusursuz ise event/metot
        if (diff == 0)
        {
            try { OnPerfectHand?.Invoke(); } catch (System.Exception e) { Debug.LogException(e); }
            PerfectFX();
        }

        UpdateTotalUI();
        ShowGainedPopup($"+{gained}");

        Debug.Log($"[Score] Used={playerUsedTiles}, Best={best}, Diff={diff}, +{gained}, Total={TotalScore}");
    }

    int ScoreFromDiff(int diff)
    {
        if (diff <= 0) return pointsPerfect;
        if (diff == 1) return pointsDiff1;
        if (diff == 2) return pointsDiff2;
        if (diff == 3) return pointsDiff3;
        if (diff == 4) return pointsDiff4;
        int extra = diff - 4;
        return Mathf.Max(minPoints, pointsDiff4 - decayPerExtra * extra);
    }

    void PerfectFX()
    {
        // Basit bir görsel geri bildirim
        if (popText) popText.Shot("PERFECT!");
    }

    // === UI ===
    void UpdateTotalUI()
    {
        if (totalScoreText)
            totalScoreText.text = $"{TotalScore}";
    }

    void ShowGainedPopup(string msg)
    {
        if (!gainedPopupText) return;
        StopAllCoroutines();
        StartCoroutine(CoPopup(msg));
    }

    System.Collections.IEnumerator CoPopup(string msg)
    {
        var go = gainedPopupText.gameObject;
        var cg = gainedPopupText.GetComponent<CanvasGroup>();
        if (!cg) cg = go.AddComponent<CanvasGroup>();

        go.SetActive(true);
        gainedPopupText.text = msg;
        cg.alpha = 1f;

        float t = 0f;
        float d = Mathf.Max(0.05f, popupFade);
        while (t < d)
        {
            t += Time.unscaledDeltaTime;
            cg.alpha = Mathf.Lerp(1f, 0f, t / d);
            yield return null;
        }
        go.SetActive(false);
    }

    void HidePopupImmediate()
    {
        if (!gainedPopupText) return;
        var go = gainedPopupText.gameObject;
        var cg = gainedPopupText.GetComponent<CanvasGroup>();
        if (!cg) cg = go.AddComponent<CanvasGroup>();
        cg.alpha = 0f;
        go.SetActive(false);
    }

    // === Public API ===
    /// Yeni bir run başlatırken çağır (toplam skoru sıfırlar).
    public void ResetTotalScore()
    {
        TotalScore = 0;
        LastGained = 0;
        UpdateTotalUI();
        HidePopupImmediate();
    }
    
    // LevelScoreManager.cs içine ekle
    public void AwardBonus(int pts, bool alsoPopText = true, string label = "BONUS")
    {
        if (pts <= 0) return;

        TotalScore += pts;
        // LastGained'ı değiştirmiyorum ki level skorunu bozmayalım.
        if (totalScoreText)
            totalScoreText.text = $"{TotalScore}";

        // Küçük popup
        if (gainedPopupText)
            StartCoroutine(CoPopup($"+{pts}"));

        // Büyük pop (isteğe bağlı)
        if (alsoPopText && popText)
            popText.Shot($"{label} +{pts}");
    }
}