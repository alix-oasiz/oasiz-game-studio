using UnityEngine;
using UnityEngine.UI;

public class HighScoreUI : MonoBehaviour
{
    [Header("UI Referansları")]
    [SerializeField] private Text bestScoreText;
    [SerializeField] private string labelPrefix = "Highscore: ";

    void Awake()
    {
        if (!bestScoreText)
        {
            var go = GameObject.Find("BestScoreText");
            if (go) bestScoreText = go.GetComponent<Text>();
        }
    }

    void Start()
    {
        HighScoreService.Load();
        if (!bestScoreText)
            TryCreateUI();
        Refresh();
    }

    public void Refresh()
    {
        if (!bestScoreText) return;
        bestScoreText.text = labelPrefix + HighScoreService.GetBest().ToString();
    }

    void TryCreateUI()
    {
        var canvas = FindObjectOfType<Canvas>();
        if (!canvas) { Debug.LogWarning("[HighScoreUI] Canvas bulunamadı; UI oluşturmuyorum."); return; }

        var go = new GameObject("BestScoreText", typeof(RectTransform), typeof(Text));
        go.transform.SetParent(canvas.transform, false);

        var rt = go.GetComponent<RectTransform>();
        rt.anchorMin = new Vector2(1f, 1f);
        rt.anchorMax = new Vector2(1f, 1f);
        rt.pivot     = new Vector2(1f, 1f);
        rt.anchoredPosition = new Vector2(-20f, -20f);
        rt.sizeDelta = new Vector2(300f, 60f);

        var txt = go.GetComponent<Text>();
        txt.text = labelPrefix + "0";
        txt.alignment = TextAnchor.MiddleRight;
        txt.font = Resources.GetBuiltinResource<Font>("Arial.ttf");
        txt.fontSize = 36;
        txt.color = Color.white;

        bestScoreText = txt;
    }
}
