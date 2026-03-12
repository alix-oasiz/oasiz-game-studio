using UnityEngine;
using UnityEngine.UI;

public class HintController : MonoBehaviour
{
    [Header("Refs")]
    public LevelOptimalSolver solver;  // sahnedeki LevelOptimalSolver
    public Button hintButton;          // opsiyonel: UI butonu

    [Header("Input")]
    public KeyCode hintKey = KeyCode.H;   // klavye kısayolu (opsiyonel)

    void Awake()
    {
        PathDrawer.OnLevelCompleteFunctions += DisableHint;
        if (hintButton) hintButton.onClick.AddListener(TryShowHint);
    }

    void Update()
    {
        if (hintKey != KeyCode.None && Input.GetKeyDown(hintKey))
            TryShowHint();
    }

    void DisableHint()
    {
        if(hintButton) hintButton.enabled = false;
    }

    void TryShowHint()
    {
        if (!solver)
        {
            Debug.LogWarning("[HintController] solver missing");
            return;
        }
        bool ok = solver.ShowRandomHintOnce();
        if (hintButton && ok) hintButton.interactable = false; // tek hak
    }
}