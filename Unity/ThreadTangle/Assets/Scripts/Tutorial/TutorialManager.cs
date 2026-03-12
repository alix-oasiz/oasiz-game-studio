using System;
using System.Collections;
using UnityEngine;
using UnityEngine.SceneManagement;

public class TutorialManager : MonoBehaviour
{
    public GameObject[] tutorialSteps;
    [SerializeField] private bool _showFirstStepOnStart;
    [SerializeField] private FullscreenChannelFX _tutorialFx;
    private int _currentIndex = 0;
    private bool _isShowingTutorial = false; // Yeni: Aynı anda birden fazla çağrıyı engelle
    
    private void Start()
    {
        if (_showFirstStepOnStart) ShowStep();
    }

    public void ShowStep()
    {
        // Eğer zaten tutorial gösteriliyorsa, tekrar gösterme
        if (_isShowingTutorial)
        {
            Debug.LogWarning("Tutorial already showing, ignoring duplicate call");
            return;
        }

        // Index kontrolü ekle
        if (_currentIndex >= tutorialSteps.Length)
        {
            Debug.LogWarning("No more tutorial steps to show");
            return;
        }
        _tutorialFx.Pulse(false);
        tutorialSteps[_currentIndex].SetActive(true);
        _isShowingTutorial = true;
        Time.timeScale = 0;
    }
    
    public void CloseStep()
    {
        if (_currentIndex < tutorialSteps.Length)
        {
            tutorialSteps[_currentIndex].SetActive(false);
        }
        
        _currentIndex++;
        _isShowingTutorial = false;
        Time.timeScale = 1;
        _tutorialFx.Pulse(false);
    }
    
    public void GoMenu()
    {
        StartCoroutine(OnScoreFull());
    }

    private IEnumerator OnScoreFull()
    {
        _tutorialFx.channelFxTime = 0.86f;
        _tutorialFx.Pulse();
        RetroFXOrchestrator.PulseMedium();
        yield return new WaitForSecondsRealtime(0.9f);
        SceneManager.LoadScene("MainMenu");
    }
}