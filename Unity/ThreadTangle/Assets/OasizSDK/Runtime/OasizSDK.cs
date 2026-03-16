using System;
using System.Collections.Generic;
using UnityEngine;

#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace Oasiz
{
  /// <summary>
  /// Oasiz platform SDK for Unity WebGL games.
  ///
  /// Add one instance of this component to a persistent GameObject early in your
  /// game's lifecycle (e.g. a Bootstrap scene). It will survive scene loads.
  ///
  /// Usage:
  ///   OasizSDK.SubmitScore(1500);
  ///   OasizSDK.TriggerHaptic(HapticType.Medium);
  ///   OasizSDK.OnPause += HandlePause;
  /// </summary>
  public class OasizSDK : MonoBehaviour
  {
    private static OasizSDK _instance;

    public static OasizSDK Instance
    {
      get
      {
        if (_instance == null)
        {
          var go = new GameObject("OasizSDK");
          _instance = go.AddComponent<OasizSDK>();
          DontDestroyOnLoad(go);
        }
        return _instance;
      }
    }

    public static event Action OnPause;
    public static event Action OnResume;
    public static event Action OnBackButton;
    public static event Action OnLeaveGame;

    private static int _backListenerCount;

    public static Action SubscribeBackButton(Action handler)
    {
      OnBackButton += handler;
      _backListenerCount++;

      if (_backListenerCount == 1)
      {
        SetBackOverride(true);
      }

      return () =>
      {
        OnBackButton -= handler;
        _backListenerCount = Math.Max(0, _backListenerCount - 1);
        if (_backListenerCount == 0)
        {
          SetBackOverride(false);
        }
      };
    }

    private void Awake()
    {
      if (_instance != null && _instance != this)
      {
        Destroy(gameObject);
        return;
      }

      _instance = this;
      DontDestroyOnLoad(gameObject);

#if UNITY_WEBGL && !UNITY_EDITOR
      OasizRegisterEventListeners(gameObject.name);
#endif
    }

    private void _OnPauseFromJS() => OnPause?.Invoke();
    private void _OnResumeFromJS() => OnResume?.Invoke();
    private void _OnBackButtonFromJS() => OnBackButton?.Invoke();
    private void _OnLeaveGameFromJS() => OnLeaveGame?.Invoke();

    public static void SubmitScore(int score)
    {
      if (score < 0)
      {
        Debug.LogWarning("[OasizSDK] SubmitScore called with negative value. Clamping to 0.");
        score = 0;
      }

#if UNITY_WEBGL && !UNITY_EDITOR
      OasizSubmitScore(score);
#else
      Debug.Log("[OasizSDK] SubmitScore(" + score + ") - bridge unavailable in Editor.");
#endif
    }

    public static void EmitScoreConfig(ScoreConfig config)
    {
      if (config.anchors == null || config.anchors.Length != 4)
      {
        Debug.LogError("[OasizSDK] EmitScoreConfig requires exactly 4 anchors.");
        return;
      }

      string json = ScoreConfigToJson(config);

#if UNITY_WEBGL && !UNITY_EDITOR
      OasizEmitScoreConfig(json);
#else
      Debug.Log("[OasizSDK] EmitScoreConfig(" + json + ") - bridge unavailable in Editor.");
#endif
    }

    public static void TriggerHaptic(HapticType type)
    {
      string typeStr = HapticTypeToString(type);

#if UNITY_WEBGL && !UNITY_EDITOR
      OasizTriggerHaptic(typeStr);
#else
      Debug.Log("[OasizSDK] TriggerHaptic(" + typeStr + ") - bridge unavailable in Editor.");
#endif
    }

    public static Dictionary<string, object> LoadGameState()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      string json = OasizLoadGameState();
      return ParseJsonObject(json);
#else
      Debug.Log("[OasizSDK] LoadGameState() - bridge unavailable in Editor. Returning empty state.");
      return new Dictionary<string, object>();
#endif
    }

    public static void SaveGameState(Dictionary<string, object> state)
    {
      string json = DictionaryToJson(state);

#if UNITY_WEBGL && !UNITY_EDITOR
      OasizSaveGameState(json);
#else
      Debug.Log("[OasizSDK] SaveGameState(" + json + ") - bridge unavailable in Editor.");
#endif
    }

    public static void FlushGameState()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      OasizFlushGameState();
#else
      Debug.Log("[OasizSDK] FlushGameState() - bridge unavailable in Editor.");
#endif
    }

    public static void LeaveGame()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      OasizLeaveGame();
#else
      Debug.Log("[OasizSDK] LeaveGame() - bridge unavailable in Editor.");
#endif
    }

    private static void SetBackOverride(bool active)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      OasizSetBackOverride(active ? 1 : 0);
#else
      Debug.Log("[OasizSDK] SetBackOverride(" + active + ") - bridge unavailable in Editor.");
#endif
    }

    public static void ShareRoomCode(string roomCode)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
      OasizShareRoomCode(string.IsNullOrEmpty(roomCode) ? null : roomCode);
#else
      Debug.Log("[OasizSDK] ShareRoomCode(" + roomCode + ") - bridge unavailable in Editor.");
#endif
    }

    public static string GameId
    {
      get
      {
#if UNITY_WEBGL && !UNITY_EDITOR
        string val = OasizGetGameId();
        return string.IsNullOrEmpty(val) ? null : val;
#else
        return null;
#endif
      }
    }

    public static string RoomCode
    {
      get
      {
#if UNITY_WEBGL && !UNITY_EDITOR
        string val = OasizGetRoomCode();
        return string.IsNullOrEmpty(val) ? null : val;
#else
        return null;
#endif
      }
    }

    public static string PlayerName
    {
      get
      {
#if UNITY_WEBGL && !UNITY_EDITOR
        string val = OasizGetPlayerName();
        return string.IsNullOrEmpty(val) ? null : val;
#else
        return null;
#endif
      }
    }

    public static string PlayerAvatar
    {
      get
      {
#if UNITY_WEBGL && !UNITY_EDITOR
        string val = OasizGetPlayerAvatar();
        return string.IsNullOrEmpty(val) ? null : val;
#else
        return null;
#endif
      }
    }

    private static string HapticTypeToString(HapticType type)
    {
      switch (type)
      {
        case HapticType.Light:
          return "light";
        case HapticType.Medium:
          return "medium";
        case HapticType.Heavy:
          return "heavy";
        case HapticType.Success:
          return "success";
        case HapticType.Error:
          return "error";
        default:
          return "medium";
      }
    }

    private static string ScoreConfigToJson(ScoreConfig config)
    {
      var anchors = new System.Text.StringBuilder();
      anchors.Append("[");
      for (int i = 0; i < config.anchors.Length; i++)
      {
        if (i > 0) anchors.Append(",");
        anchors.Append("{\"raw\":");
        anchors.Append(config.anchors[i].raw);
        anchors.Append(",\"normalized\":");
        anchors.Append(config.anchors[i].normalized);
        anchors.Append("}");
      }
      anchors.Append("]");
      return "{\"anchors\":" + anchors + "}";
    }

    private static string DictionaryToJson(Dictionary<string, object> dict)
    {
      if (dict == null || dict.Count == 0) return "{}";

      var sb = new System.Text.StringBuilder();
      sb.Append("{");
      bool first = true;
      foreach (var kvp in dict)
      {
        if (!first) sb.Append(",");
        first = false;
        sb.Append("\"");
        sb.Append(EscapeJson(kvp.Key));
        sb.Append("\":");
        sb.Append(ValueToJson(kvp.Value));
      }
      sb.Append("}");
      return sb.ToString();
    }

    private static string ValueToJson(object value)
    {
      if (value == null) return "null";
      if (value is bool) return (bool)value ? "true" : "false";
      if (value is int) return ((int)value).ToString();
      if (value is long) return ((long)value).ToString();
      if (value is float) return ((float)value).ToString(System.Globalization.CultureInfo.InvariantCulture);
      if (value is double) return ((double)value).ToString(System.Globalization.CultureInfo.InvariantCulture);
      if (value is string) return "\"" + EscapeJson((string)value) + "\"";
      if (value is Dictionary<string, object>) return DictionaryToJson((Dictionary<string, object>)value);
      return "\"" + EscapeJson(value.ToString()) + "\"";
    }

    private static string EscapeJson(string s)
    {
      return s.Replace("\\", "\\\\").Replace("\"", "\\\"").Replace("\n", "\\n").Replace("\r", "\\r").Replace("\t", "\\t");
    }

    private static Dictionary<string, object> ParseJsonObject(string json)
    {
      var result = new Dictionary<string, object>();
      if (string.IsNullOrWhiteSpace(json) || json.Trim() == "{}") return result;

      try
      {
        json = json.Trim();
        if (json.StartsWith("{")) json = json.Substring(1);
        if (json.EndsWith("}")) json = json.Substring(0, json.Length - 1);
        result["__json"] = "{" + json + "}";
      }
      catch (Exception e)
      {
        Debug.LogWarning("[OasizSDK] Failed to parse game state JSON: " + e.Message);
      }

      return result;
    }

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] private static extern void OasizSubmitScore(int score);
    [DllImport("__Internal")] private static extern void OasizEmitScoreConfig(string configJson);
    [DllImport("__Internal")] private static extern void OasizTriggerHaptic(string type);
    [DllImport("__Internal")] private static extern string OasizLoadGameState();
    [DllImport("__Internal")] private static extern void OasizSaveGameState(string stateJson);
    [DllImport("__Internal")] private static extern void OasizFlushGameState();
    [DllImport("__Internal")] private static extern void OasizLeaveGame();
    [DllImport("__Internal")] private static extern void OasizSetBackOverride(int active);
    [DllImport("__Internal")] private static extern void OasizShareRoomCode(string roomCode);
    [DllImport("__Internal")] private static extern string OasizGetGameId();
    [DllImport("__Internal")] private static extern string OasizGetRoomCode();
    [DllImport("__Internal")] private static extern string OasizGetPlayerName();
    [DllImport("__Internal")] private static extern string OasizGetPlayerAvatar();
    [DllImport("__Internal")] private static extern void OasizRegisterEventListeners(string gameObjectName);
#endif
  }
}
