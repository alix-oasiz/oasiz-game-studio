using UnityEngine;
using UnityEngine.UI;

public class SimpleHighScoreText : MonoBehaviour
{
    [SerializeField] private Text target;

    void Awake()
    {
        if (!target) target = GetComponent<Text>();
    }

    void Start()
    {
        HighScoreService.Load();
        Refresh();
    }

    public void Refresh()
    {
        if (!target) return;
        int best = HighScoreService.GetBest();
        target.text = best.ToString();
    }
}

