using System;
using UnityEngine;
using UnityEngine.Events;

public class TutorialSequence : MonoBehaviour
{
    [Serializable]
    public struct LevelTutorialEvents
    {
        public int beforeLevel;
        public UnityEvent @event;
    }
    
    public LevelTutorialEvents[] levelTutorials;
    [SerializeField] private TutorialManager _tutorialManager;
    private int _lastTriggeredLevel = -1; // Yeni: Aynı level için tekrar tetiklemeyi engelle

    private void Start()
    {
        RandomLevelGenerator.OnLevelEnd += CheckForTutorialEvent;
    }

    private void CheckForTutorialEvent()
    {
        int currentLevel = RandomLevelGenerator.displayedLevel;
        
        // Aynı level için tekrar tetiklemeyi engelle
        if (_lastTriggeredLevel == currentLevel)
        {
            Debug.LogWarning("Tutorial already triggered for level " + currentLevel);
            return;
        }
        
        for (int i = 0; i < levelTutorials.Length; i++)
        {
            if (levelTutorials[i].beforeLevel == currentLevel)
            {
                _lastTriggeredLevel = currentLevel;
                _tutorialManager.ShowStep();
                levelTutorials[i].@event.Invoke();
                return;
            }
        }
    }

    private void OnDestroy()
    {
        // Event'i temizle
        RandomLevelGenerator.OnLevelEnd -= CheckForTutorialEvent;
    }
}