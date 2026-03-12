using System;
using System.Collections.Generic;
using UnityEngine;

[CreateAssetMenu(fileName = "LevelSet", menuName = "ThreadTangle/Level Set", order = 0)]
public class LevelSet : ScriptableObject
{
    public List<LevelDefinition> levels = new List<LevelDefinition>();
    public int defaultLevelIndex = 0;
}

[Serializable]
public class LevelDefinition
{
    public string levelName = "New Level";
    public int width = 6;
    public int height = 6;
    public int timeSec = 0;
    public bool fillAll = false;

    // Grid hücre kodları: 0=empty, 3=block, diğer pozitif sayılar=renk kodu (spool)
    public int[] codes;

    public void EnsureSize(int w, int h, int fill = 0)
    {
        width = Mathf.Max(1, w);
        height = Mathf.Max(1, h);
        var need = width * height;
        if (codes == null || codes.Length != need)
        {
            var arr = new int[need];
            if (codes != null)
            {
                int copyW = Mathf.Min(width, width);
                int copyH = Mathf.Min(height, height);
                int oldW = width; // eski yok; yeni dizayn yapıyoruz
            }
            for (int i = 0; i < arr.Length; i++) arr[i] = fill;
            codes = arr;
        }
    }

    public int Get(int x, int y)
    {
        if (codes == null || x < 0 || y < 0 || x >= width || y >= height) return 0;
        return codes[y * width + x];
    }

    public void Set(int x, int y, int val)
    {
        if (codes == null || x < 0 || y < 0 || x >= width || y >= height) return;
        codes[y * width + x] = val;
    }

    /// 0 ve 3 hariç kullanılan tüm kodların küçükten büyüğe listesi
    public List<int> DistinctPairCodes()
    {
        var set = new SortedSet<int>();
        if (codes != null)
        {
            foreach (var v in codes)
                if (v != 0 && v != 3) set.Add(v);
        }
        return new List<int>(set);
    }

    /// Hızlı doğrulama: her renk kodu için tam 2 adet olması
    public bool ValidatePairs(out string message)
    {
        var counts = new Dictionary<int, int>();
        if (codes != null)
        {
            foreach (var v in codes)
            {
                if (v == 0 || v == 3) continue;
                counts.TryGetValue(v, out int c);
                counts[v] = c + 1;
            }
        }
        foreach (var kv in counts)
        {
            if (kv.Value != 2)
            {
                message = $"Kod {kv.Key} için {kv.Value} adet var (tam 2 olmalı).";
                return false;
            }
        }
        message = "OK";
        return true;
    }
}