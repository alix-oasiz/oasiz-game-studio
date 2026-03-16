using System.Collections.Generic;
using Oasiz;
using UnityEngine;
using UnityEngine.SceneManagement;

public sealed class OasizThreadTangleBridge : MonoBehaviour
{
    private static bool bootstrapped;
    private bool scoreSubmitted;
    private string currentSceneName = string.Empty;

    [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.BeforeSceneLoad)]
    private static void Bootstrap()
    {
        if (bootstrapped) return;

        var go = new GameObject("OasizThreadTangleBridge");
        DontDestroyOnLoad(go);
        go.AddComponent<OasizThreadTangleBridge>();
        _ = OasizSDK.Instance;
        bootstrapped = true;
    }

    private void Awake()
    {
        if (FindObjectsByType<OasizThreadTangleBridge>(FindObjectsSortMode.None).Length > 1)
        {
            Destroy(gameObject);
            return;
        }

        SceneManager.sceneLoaded += HandleSceneLoaded;

        OasizSDK.OnPause += HandlePause;
        OasizSDK.OnResume += HandleResume;
        OasizSDK.OnLeaveGame += HandleLeaveGame;
        OasizSDK.OnBackButton += HandleBackButton;

        EmitScoreConfig();
        LogInjectedContext();
        LoadSavedState();
    }

    private void OnDestroy()
    {
        SceneManager.sceneLoaded -= HandleSceneLoaded;

        OasizSDK.OnPause -= HandlePause;
        OasizSDK.OnResume -= HandleResume;
        OasizSDK.OnLeaveGame -= HandleLeaveGame;
        OasizSDK.OnBackButton -= HandleBackButton;
    }

    private void Update()
    {
        if (scoreSubmitted) return;

        var lastPanel = FindFirstObjectByType<LastPanel>();
        var levelScoreManager = FindFirstObjectByType<LevelScoreManager>();
        if (!lastPanel || !levelScoreManager) return;

        int totalScore = Mathf.Max(0, levelScoreManager.TotalScore);
        SubmitRun(totalScore);
    }

    private void HandleSceneLoaded(Scene scene, LoadSceneMode mode)
    {
        currentSceneName = scene.name;
        scoreSubmitted = false;
        Debug.Log("[OasizThreadTangleBridge] Scene loaded: " + currentSceneName);
    }

    private void EmitScoreConfig()
    {
        OasizSDK.EmitScoreConfig(new ScoreConfig(
            new ScoreAnchor(150, 100),
            new ScoreAnchor(500, 300),
            new ScoreAnchor(1200, 600),
            new ScoreAnchor(2500, 950)
        ));
    }

    private void LogInjectedContext()
    {
        Debug.Log(
            "[OasizThreadTangleBridge] Context gameId=" + SafeValue(OasizSDK.GameId) +
            " roomCode=" + SafeValue(OasizSDK.RoomCode) +
            " playerName=" + SafeValue(OasizSDK.PlayerName)
        );
    }

    private void LoadSavedState()
    {
        Dictionary<string, object> state = OasizSDK.LoadGameState();
        if (state.TryGetValue("__json", out object rawJson) && rawJson is string json)
        {
            Debug.Log("[OasizThreadTangleBridge] Loaded state: " + json);
        }
        else
        {
            Debug.Log("[OasizThreadTangleBridge] No saved Oasiz state found.");
        }
    }

    private void SubmitRun(int totalScore)
    {
        scoreSubmitted = true;

        Debug.Log("[OasizThreadTangleBridge] Submitting score: " + totalScore);
        OasizSDK.SaveGameState(new Dictionary<string, object>
        {
            ["lastScore"] = totalScore,
            ["lastScene"] = currentSceneName,
        });
        OasizSDK.FlushGameState();
        OasizSDK.SubmitScore(totalScore);
        OasizSDK.TriggerHaptic(HapticType.Error);
    }

    private void HandlePause()
    {
        Debug.Log("[OasizThreadTangleBridge] Received oasiz:pause.");
    }

    private void HandleResume()
    {
        Debug.Log("[OasizThreadTangleBridge] Received oasiz:resume.");
    }

    private void HandleLeaveGame()
    {
        Debug.Log("[OasizThreadTangleBridge] Received oasiz:leave.");
        OasizSDK.FlushGameState();
    }

    private void HandleBackButton()
    {
        Debug.Log("[OasizThreadTangleBridge] Received oasiz:back.");
    }

    private static string SafeValue(string value)
    {
        return string.IsNullOrEmpty(value) ? "(none)" : value;
    }
}
