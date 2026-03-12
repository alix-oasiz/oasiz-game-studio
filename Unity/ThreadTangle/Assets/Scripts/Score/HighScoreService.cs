using System;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

[Serializable]
public class HighScoreData
{
    public int best = 0;
    public List<int> history = new List<int>();
}

/// Kalıcı highscore servisi: PlayerPrefs + JSON dosya yedeği
public static class HighScoreService
{
    const string K_BEST = "HS_BEST";
    const string K_HISTORY = "HS_HISTORY"; // JSON string (List<int>)

    static string JsonPath => Path.Combine(Application.persistentDataPath, "highscores.json");
    static string BakPath  => Path.Combine(Application.persistentDataPath, "highscores.bak");

    static HighScoreData data;
    static bool loaded;

    public static void Load()
    {
        if (loaded) return;

        // 1) PlayerPrefs dene
        try
        {
            int best = PlayerPrefs.GetInt(K_BEST, 0);
            string histStr = PlayerPrefs.GetString(K_HISTORY, string.Empty);
            List<int> history = string.IsNullOrEmpty(histStr)
                ? new List<int>()
                : JsonUtility.FromJson<IntListWrapper>(histStr)?.list ?? new List<int>();

            data = new HighScoreData { best = best, history = history };
            loaded = true;
        }
        catch (Exception e)
        {
            Debug.LogWarning($"[HighScoreService] PlayerPrefs yükleme hatası: {e.Message}");
        }

        // 2) JSON dosya ile doldur/senkron et (Prefs yoksa ya da boşsa)
        try
        {
            if (File.Exists(JsonPath))
            {
                var json = File.ReadAllText(JsonPath);
                var fileData = JsonUtility.FromJson<HighScoreData>(json);
                if (fileData != null)
                {
                    if (data == null) data = new HighScoreData();
                    data.best = Mathf.Max(data.best, fileData.best);
                    if (fileData.history != null && fileData.history.Count > 0)
                    {
                        if (data.history == null) data.history = new List<int>();
                        data.history.AddRange(fileData.history);
                        TrimHistory();
                    }
                    loaded = true;
                }
            }
            else if (File.Exists(BakPath))
            {
                var json = File.ReadAllText(BakPath);
                var fileData = JsonUtility.FromJson<HighScoreData>(json);
                if (fileData != null)
                {
                    if (data == null) data = new HighScoreData();
                    data.best = Mathf.Max(data.best, fileData.best);
                    if (fileData.history != null && fileData.history.Count > 0)
                    {
                        if (data.history == null) data.history = new List<int>();
                        data.history.AddRange(fileData.history);
                        TrimHistory();
                    }
                    loaded = true;
                }
            }
        }
        catch (Exception e)
        {
            Debug.LogWarning($"[HighScoreService] JSON yükleme hatası: {e.Message}");
        }

        if (data == null) data = new HighScoreData();
        SavePrefs(); // Prefs ile senkron tut
    }

    public static int GetBest()
    {
        EnsureLoaded();
        return data.best;
    }

    public static List<int> GetHistory(int lastN = 5)
    {
        EnsureLoaded();
        if (data.history == null) data.history = new List<int>();
        int count = Mathf.Clamp(lastN, 0, data.history.Count);
        int start = Mathf.Max(0, data.history.Count - count);
        return data.history.GetRange(start, count);
    }

    public static bool TryRecord(int score, int keepHistory = 10)
    {
        EnsureLoaded();
        if (score < 0) score = 0;

        bool isNewHigh = score > data.best;
        if (isNewHigh) data.best = score;

        if (data.history == null) data.history = new List<int>();
        data.history.Add(score);
        TrimHistory(keepHistory);

        SavePrefs();
        SaveJson();
        return isNewHigh;
    }

    public static void Reset()
    {
        data = new HighScoreData();
        SavePrefs();
        SaveJson();
    }

    // === Internal ===
    static void EnsureLoaded()
    {
        if (!loaded) Load();
    }

    static void TrimHistory(int keep = 10)
    {
        if (data.history == null) data.history = new List<int>();
        keep = Mathf.Max(1, keep);
        if (data.history.Count > keep)
        {
            int removeCount = data.history.Count - keep;
            data.history.RemoveRange(0, removeCount);
        }
    }

    static void SavePrefs()
    {
        try
        {
            PlayerPrefs.SetInt(K_BEST, data.best);
            var wrapper = new IntListWrapper { list = data.history ?? new List<int>() };
            PlayerPrefs.SetString(K_HISTORY, JsonUtility.ToJson(wrapper));
            PlayerPrefs.Save();
        }
        catch (Exception e)
        {
            Debug.LogWarning($"[HighScoreService] PlayerPrefs yazma hatası: {e.Message}");
        }
    }

    static void SaveJson()
    {
        try
        {
            var json = JsonUtility.ToJson(data);
            string dir = Path.GetDirectoryName(JsonPath);
            if (!Directory.Exists(dir)) Directory.CreateDirectory(dir);

            string tmp = JsonPath + ".tmp";
            File.WriteAllText(tmp, json);

            // Atomik değişim (mümkün olduğunca)
            if (File.Exists(JsonPath)) File.Delete(JsonPath);
            File.Move(tmp, JsonPath);

            // .bak kopyası
            File.Copy(JsonPath, BakPath, true);
        }
        catch (Exception e)
        {
            Debug.LogWarning($"[HighScoreService] JSON yazma hatası: {e.Message}");
        }
    }

    // JsonUtility List<int> için yardımcı sarmalayıcı
    [Serializable]
    class IntListWrapper { public List<int> list = new List<int>(); }
}

