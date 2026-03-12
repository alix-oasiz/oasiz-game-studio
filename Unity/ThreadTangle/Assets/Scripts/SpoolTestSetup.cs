using System.Collections;
using System.Collections.Generic;
using UnityEngine;

/// Rastgele seviye oluşturucu. GridManager ile grid kurulumu yapar, spool çiftleri ve blokları yerleştirir.
/// Spool uçları aynı renkte yan yana konumlandırılmaz. Oluşturulan seviye LevelOptimalSolver ile test edilir.
/// Çözümsüzse tekrar üretilir. Zorluk parametreleri (grid size, pair count, block count) inspector’dan ayarlanabilir.
public class SpoolTestSetup : MonoBehaviour
{
    [Header("Refs")]
    public GridManager grid;
    public LevelOptimalSolver optimalSolver;
    public SpritePalette palette; // spool/renk paleti; spool görselleri için

    [Header("Difficulty Settings")]
    public int[] gridSizes = {6, 7, 8};    // zorluk derecesine göre kullanılacak grid boyutları
    public int[] pairCounts = {3, 4, 5};   // zorluk derecesine göre renk çiftleri
    public int[] blockCounts = {2, 4, 6};  // zorluk derecesine göre blok sayısı

    public int levelIndex = 0; // hangi zorluk seviyesinde olduğumuz (0 = en kolay)

    [Header("Random Placement")]
    public int maxGenerateAttempts = 50; // çözümsüz çıkarsa kaç kez yeniden denensin

    void Start()
    {
        StartCoroutine(GenerateLevel());
    }

    public void NextLevel()
    {
        grid.ResetGridInstant();
        levelIndex++;
        StartCoroutine(GenerateLevel());
    }

    IEnumerator GenerateLevel()
    {
        // Geçerli seviye parametreleri
        int w = gridSizes[Mathf.Clamp(levelIndex, 0, gridSizes.Length - 1)];
        int h = w;
        int pairs = pairCounts[Mathf.Clamp(levelIndex, 0, pairCounts.Length - 1)];
        int blocks = blockCounts[Mathf.Clamp(levelIndex, 0, blockCounts.Length - 1)];

        bool success = false;
        int attempts = 0;

        while (!success && attempts < maxGenerateAttempts)
        {
            attempts++;

            // Grid’i kur ve tüm hücreleri boş olarak başlat
            grid.Build(w, h);
            // İlk başta tüm hücreler boş (ownerId = -1, isSpool = false, isBlocked = false) olmalı.
            for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++)
            {
                var c = grid.cells[x, y];
                var vis = c.img ? c.img.GetComponent<CellVisual>() : null;
                c.isSpool = false;
                c.ownerId = -1;
                c.isBlocked = false;
                c.img.color = new Color(1f, 1f, 1f, 0.08f);
                if (vis) vis.Init(false, -1, 0.08f);
            }

            // Rastgele blok yerleştir
            PlaceBlocks(blocks, w, h);

            // Rastgele spool çiftleri yerleştir
            bool spoolsOk = PlaceSpoolPairs(pairs, w, h);
            if (!spoolsOk) continue; // yerleştirme başarısızsa tekrar dene

            // Çözülebilir mi?
            yield return null; // bir frame bekle (render/solver hazır olabilsin)
            bool solvable = optimalSolver.IsSolvable();
            if (solvable)
            {
                success = true;
            }
            else
            {
                foreach (var gridItem in grid.grid.gameObject.transform.GetComponentsInChildren<GameObject>())
                {
                    DestroyImmediate(gridItem);
                }
            }
        }

        if (!success)
            Debug.LogWarning("[SpoolTestSetup] Rastgele seviye oluşturma denemeleri başarısız oldu.");
    }

    void PlaceBlocks(int count, int width, int height)
    {
        int placed = 0;
        int attempts = 0;
        while (placed < count && attempts < 1000)
        {
            attempts++;
            int x = Random.Range(0, width);
            int y = Random.Range(0, height);
            var cell = grid.cells[x, y];
            if (cell.isSpool || cell.isBlocked) continue;
            // blok yerleştir
            cell.isBlocked = true;
            var vis = cell.img ? cell.img.GetComponent<CellVisual>() : null;
            if (vis) vis.SetBlocked();
            placed++;
        }
    }

    bool PlaceSpoolPairs(int pairCount, int width, int height)
    {
        // Kullanılan pozisyonları tut
        var occupied = new bool[width, height];
        // bloklar occupy olsun
        for (int y=0; y<height; y++)
        for (int x=0; x<width; x++)
            if (grid.cells[x,y].isBlocked)
                occupied[x,y] = true;

        for (int pairId = 0; pairId < pairCount; pairId++)
        {
            bool placedPair = false;
            int tryCount = 0;

            while (!placedPair && tryCount < 500)
            {
                tryCount++;

                // Birinci spool için rastgele bir yer bul
                int x1 = Random.Range(0, width);
                int y1 = Random.Range(0, height);
                if (occupied[x1,y1]) continue;

                // İkinci spool için rastgele bir yer bul
                int x2 = Random.Range(0, width);
                int y2 = Random.Range(0, height);
                if (occupied[x2,y2]) continue;
                if (x1 == x2 && y1 == y2) continue;

                // Aynı renkte spool uçları yan yana (komşu) olamaz
                if (Mathf.Abs(x1 - x2) + Mathf.Abs(y1 - y2) == 1)
                    continue;

                // Pozisyonlar uygun – yerleştir
                PlaceSpoolAt(pairId, x1, y1);
                PlaceSpoolAt(pairId, x2, y2);
                occupied[x1,y1] = occupied[x2,y2] = true;
                placedPair = true;
            }

            if (!placedPair)
            {
                Debug.LogWarning($"[SpoolTestSetup] Pair {pairId} yerleştirilemedi.");
                return false; // başarısız
            }
        }
        return true;
    }

    void PlaceSpoolAt(int pairId, int x, int y)
    {
        var cell = grid.cells[x, y];
        cell.isSpool = true;
        cell.ownerId = pairId;
        cell.isBlocked = false;
        var vis = cell.img ? cell.img.GetComponent<CellVisual>() : null;
        if (vis)
        {
            // spool idle görünümünü uygula (animasyon istemiyorsanız SetSpoolIdleInstant)
            vis.SetSpoolIdle(pairId);
        }
    }
}