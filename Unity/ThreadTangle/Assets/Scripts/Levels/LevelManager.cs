using System;
using System.Collections;
using UnityEngine;

public class LevelManager : MonoBehaviour
{
    public SpoolTestSetup spoolSetup;
    private void Awake()
    {
        PathDrawer.OnLevelCompleteFunctions += NextLevel;
    }

    private void NextLevel()
    {
        spoolSetup.NextLevel();
    }
    
    
}