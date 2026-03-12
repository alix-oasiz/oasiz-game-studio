using System.Collections;
using UnityEngine;
using UnityEngine.UI;

public class ResetLevelButton : MonoBehaviour
{
    public Button resetLevelButton;
    //
    [SerializeField] private float _buttonCooldown = 1f;
    [SerializeField] private RandomLevelGenerator _randomLevelGenerator;
    [SerializeField] private Text remainingTriesText;
    [SerializeField] private int maxTries = 3;
    private int remainingTries;
    
    void Start()
    {
        remainingTries = maxTries;
        UpdateTriesText();
    }

    public void ResetLevel()
    {
        if (remainingTries <= 0) return;
        if (!_randomLevelGenerator) return;
        FindFirstObjectByType<AudioManager>().Play("pulse");
        _randomLevelGenerator.RestartLevel();
        remainingTries--;
        UpdateTriesText();

        StartCoroutine(ButtonCoolDown());
    }

    void UpdateTriesText()
    {
        if (remainingTriesText)
            remainingTriesText.text = remainingTries.ToString();
    }

    IEnumerator ButtonCoolDown()
    {
        resetLevelButton.enabled = false;
        yield return new WaitForSeconds(_buttonCooldown);
        resetLevelButton.enabled = true;
    }
}
