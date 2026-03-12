using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using Random = UnityEngine.Random;

/// Rastgele seviye üretir, üretir üretmez çözülebilirliğini LevelOptimalSolver ile
/// kontrol eder; çözümsüzse yeniden dener. Zorluk adımlarını inspector’dan
/// (grid, pair, blok sayısı) belirliyorsun.
/// NOT: LevelOptimalSolver.ComputeOptimal() public olmalı.
[System.Serializable]
public class DifficultyConfig
{
    [Header("Grid")]
    public int width = 6;
    public int height = 6;

    [Header("İçerik")]
    public int pairCount = 3;     // kaç renk çifti (toplam 2*pair hücresi)
    public int blockCount = 4;    // kaç blok (geçilmez hücre)

    [Header("Yerleşim Kuralları")]
    [Tooltip("Aynı rengin iki spools’u en az bu Manhattan mesafesinde olmalı (1: bitişik yasak).")]
    public int sameColorMinDistance = 2;
    
    public bool spawnGold;
    public int goldBonus;

    [Header("Timed Pair")]
    [Tooltip("Bu levelde zamanlı pair özelliği aktif olsun mu?")]
    public bool enableTimedPair = false;
    [Tooltip("Kaç adet pair zamanlı olacak (1..pairCount)")]
    public int timedPairCount = 1;
    [Tooltip("Geri sayım süresi (3-2-1 için saniye)")]
    public int timedSeconds = 3;
    
    public bool spawnTime;
    public int addSeconds = 3;

    [Header("Seviye Haritalama")]
    [Tooltip("Tek bir seviyeye mi uygulanacak? (true) Yoksa bir aralığa mı? (false)")]
    public bool isSingleLevel = true;

    [Tooltip("isSingleLevel = true ise bu tek seviyeye uygulanır")] public int singleLevel = 1;
    [Tooltip("isSingleLevel = false ise [rangeStart, rangeEnd] kapsayıcı aralığına uygulanır")] public int rangeStart = 1;
    [Tooltip("isSingleLevel = false ise [rangeStart, rangeEnd] kapsayıcı aralığına uygulanır")] public int rangeEnd = 1;
}

public class RandomLevelGenerator : MonoBehaviour
{

    public static System.Action OnLevelEnd;

    [Header("Bağlantılar")]
    public GridManager grid;                 // zorunlu
    public LevelOptimalSolver optimalSolver; // zorunlu (grid’i aynı olmalı)
    public PathDrawer pathDrawer;
    public StrokeLink strokeLink;
    public LevelCountdown countdown;
    public GoldCellManager goldManager;
    public TimeCellManager timeManager;
    public TimedPairManager timedPairManager;

    [Header("Zorluklar")]
    [Tooltip("Seviye zorluk ayarlarını taşıyan ScriptableObject asset")]
    public RandomLevelSet levelSet;

    [Header("Üretim")]
    public int startLevelIndex = 0;
    public int maxAttemptsPerLevel = 300;
    [Tooltip("Boş hücre opaklığı (CellVisual.Init için)")]
    [Range(0f, 1f)] public float emptyAlpha = 0.08f;

    [Header("Oto Geçiş")]
    public bool autoNextOnWin = false;
    public float autoNextDelay = 0.65f;

    [Header("Gold")]
    [Tooltip("Bu levelde altın tile spawn edilsin mi?")]
    public bool spawnGold = true;

    [Tooltip("Altın toplandığında verilecek bonus puan")]
    public int goldBonus = 50;
    
    public int currentLevelIndex = 0;
    Coroutine running;
    public static int displayedLevel = 0; // Sonsuz sayaç: UI'da gözükecek seviye numarası

    DifficultyConfig[] runtimeFallbackLevels;

    DifficultyConfig[] ActiveLevels
    {
        get
        {
            if (levelSet && levelSet.levels != null && levelSet.levels.Length > 0)
                return levelSet.levels;

            if (runtimeFallbackLevels == null || runtimeFallbackLevels.Length == 0)
                runtimeFallbackLevels = new[] { new DifficultyConfig() };

            return runtimeFallbackLevels;
        }
    }

    void OnEnable()
    {
        if (autoNextOnWin)
            PathDrawer.OnLevelCompleteFunctions += HandleWin;
    }
    void OnDisable()
    {
        if (autoNextOnWin)
            PathDrawer.OnLevelCompleteFunctions -= HandleWin;
    }

    void Start()
    {
        if (!grid) grid = FindFirstObjectByType<GridManager>();
        if (!optimalSolver) optimalSolver = FindFirstObjectByType<LevelOptimalSolver>();
        if (!countdown) countdown = FindFirstObjectByType<LevelCountdown>();
        if (!goldManager) goldManager = FindFirstObjectByType<GoldCellManager>();
        if (!timeManager) timeManager = FindFirstObjectByType<TimeCellManager>();
        if (!timedPairManager) timedPairManager = FindFirstObjectByType<TimedPairManager>();
        currentLevelIndex = Mathf.Clamp(startLevelIndex, 0, Mathf.Max(0, (ActiveLevels?.Length ?? 1) - 1));
        displayedLevel = Mathf.Max(1, currentLevelIndex + 1);
        FindFirstObjectByType<PopText>().Shot(displayedLevel.ToString());
        GenerateCurrent();
    }

    DifficultyConfig ResolveConfigForLevel(int level)
    {
        var list = ActiveLevels;
        if (list == null || list.Length == 0)
            return new DifficultyConfig();

        DifficultyConfig fallback = list[Mathf.Clamp(list.Length - 1, 0, list.Length - 1)];
        foreach (var cfg in list)
        {
            if (cfg == null) continue;
            if (cfg.isSingleLevel)
            {
                if (level == cfg.singleLevel) return cfg;
            }
            else
            {
                int a = Mathf.Min(cfg.rangeStart, cfg.rangeEnd);
                int b = Mathf.Max(cfg.rangeStart, cfg.rangeEnd);
                if (level >= a && level <= b) return cfg;
            }
        }
        return fallback; // eşleşme yoksa son konfige düş
    }

    private void Update()
    {
        var cfg = ResolveConfigForLevel(displayedLevel);
        if (grid.grid.transform.childCount > (cfg.height * cfg.width))
        {
            RestartLevel();
        }
    }

    // ====== Public (UI butonlarına bağla) ======
    public void RestartLevel()
    {
        grid.ResetGridInstant();
        GenerateCurrent();
    } 

    IEnumerator NextLevel()
    {
        yield return StartCoroutine(grid.ResetGrid());
        // Sonsuz sayacı artır
        displayedLevel++;
        OnLevelEnd?.Invoke();
        // UI'ı güncelle
        FindFirstObjectByType<PopText>().Shot(displayedLevel.ToString());
        // Seviyeyi oluştur
        GenerateCurrent();
    }

    // ====== Core ======
    void GenerateCurrent()
    {
        if (!grid || !optimalSolver)
        {
            Debug.LogError("[RandomLevelGenerator] GridManager ve LevelOptimalSolver atanmalı.");
            return;
        }
        if (running != null) StopCoroutine(running);

        // Yeni level üretilmeden önce sayacı sıfırla, ama HENÜZ başlatma
        if (countdown != null)
            countdown.ResetCountdown(-1, false);

        var cfg = ResolveConfigForLevel(displayedLevel);
        running = StartCoroutine(CoGenerate(cfg));
    }

    IEnumerator CoGenerate(DifficultyConfig cfg)
    {
        int attempts = 0;
        while (attempts++ < Mathf.Max(1, maxAttemptsPerLevel))
        {
            pathDrawer.ResetForNewLevel();
            StartCoroutine(strokeLink.ClearAll());
            grid.ResetGridInstant();
            // 1) Grid’i kur
            grid.Build(cfg.width, cfg.height);
            
            // 2) Hücreleri tamamen sıfırla + görseli boş yap
            for (int y = 0; y < grid.height; y++)
            for (int x = 0; x < grid.width; x++)
            {
                var c = grid.cells[x, y];
                c.ownerId = -1;
                c.isSpool = false;
                c.isBlocked = false;

                var vis = c.img ? c.img.GetComponent<CellVisual>() : null;
                if (vis) vis.Init(false, -1, emptyAlpha);
            }

            // 3) Blokları yerleştir
            PlaceBlocks(cfg.blockCount);
            //
            grid.ChangeVisualOfGrids(false);

            // 4) Pair’leri yerleştir (aynı renk yan yana gelmesin → min mesafe)
            bool pairsOk = PlacePairs(cfg.pairCount, cfg.sameColorMinDistance);
            if (!pairsOk) { yield return null; continue; }
            optimalSolver.ComputeOptimal();
            bool solvable = optimalSolver.bestCost < int.MaxValue;
            if (!solvable) { yield return null; continue; }
            var solutionCells = optimalSolver.GetSolutionCells(true);
            if (goldManager) goldManager.PrepareForNewLevel(cfg.spawnGold, cfg.goldBonus, solutionCells);
            if (timeManager)
            {
                IEnumerable<Cell> allowedForTime = solutionCells;
                if (goldManager && goldManager.GoldCell != null)
                {
                    allowedForTime = allowedForTime.Where(c => c != goldManager.GoldCell);
                    if (!allowedForTime.Any())
                    {
                        var all = new List<Cell>();
                        for (int y = 0; y < grid.height; y++)
                        for (int x = 0; x < grid.width; x++)
                        {
                            var c = grid.cells[x, y];
                            if (c == null) continue;
                            if (c == goldManager.GoldCell) continue;
                            all.Add(c);
                        }
                        allowedForTime = all;
                    }
                }
                timeManager.PrepareForNewLevel(cfg.spawnTime, cfg.addSeconds, allowedForTime);
            }
            if (solvable)
            {
                if (timedPairManager)
                    timedPairManager.PrepareForNewLevel(cfg.enableTimedPair, cfg.timedPairCount, cfg.timedSeconds);

                // Önce tüm cell pop animasyonunu bitir
                yield return StartCoroutine(PopOutBlocks());

                // Animasyon bittikten SONRA countdown başlasın
                if (countdown != null)
                    countdown.StartCountdown(); // veya countdown.ResetCountdown(-1, true); ikisi de olur

                Debug.Log($"[RandomLevelGenerator] Seviye oluştu (deneme: {attempts}).");
                yield break;
            }

            // çözümsüz → yeniden dene
            yield return null;
        }
        Debug.LogWarning("[RandomLevelGenerator] Çözülebilir seviye üretilemedi (attempt limit).");
    }

    IEnumerator PopOutBlocks()
    {
        float duration = 0.1f;
        foreach (var cell in grid.grid.GetComponentsInChildren<CellVisual>())
        {
            if (!cell)
            {
                continue;
            }
            cell.SetVisual(true);
            StartCoroutine(SimplePop.PopIn(cell.gameObject, duration));
            yield return new WaitForSeconds(duration / 5);
        }
    }

    void PlaceBlocks(int count)
    {
        // tüm hücreleri topla
        var pool = new List<(int x, int y)>(grid.width * grid.height);
        for (int y = 0; y < grid.height; y++)
        for (int x = 0; x < grid.width; x++)
            pool.Add((x, y));

        // karıştır
        Shuffle(pool);

        int placed = 0;
        foreach (var p in pool)
        {
            if (placed >= count) break;
            var c = grid.cells[p.x, p.y];
            if (c.isSpool || c.isBlocked) continue;

            c.isBlocked = true;
            var vis = c.img ? c.img.GetComponent<CellVisual>() : null;
            if (vis) vis.SetBlocked();

            placed++;
        }
    }

    bool PlacePairs(int pairCount, int sameColorMinDist)
    {
        // tüm uygun (block olmayan) hücreleri havuza al
        var free = new List<(int x, int y)>();
        for (int y = 0; y < grid.height; y++)
        for (int x = 0; x < grid.width; x++)
        {
            if (!grid.cells[x, y].isBlocked) free.Add((x, y));
        }
        if (free.Count < pairCount * 2) return false;

        // her renk için iki nokta bul: blok değil, boş, birbirine yeterince uzak
        for (int id = 0; id < pairCount; id++)
        {
            bool ok = TryPickTwoPositions(free, sameColorMinDist, out var a, out var b);
            if (!ok) return false;

            // yerleştir
            SetSpool(a.x, a.y, id);
            SetSpool(b.x, b.y, id);
        }

        return true;
    }

    bool TryPickTwoPositions(List<(int x, int y)> free, int minManhattan, out (int x, int y) A, out (int x, int y) B)
    {
        // birkaç deneme ile uygun iki nokta bul
        for (int t = 0; t < 200; t++)
        {
            if (free.Count < 2) break;
            int ia = Random.Range(0, free.Count);
            int ib = Random.Range(0, free.Count - 1);
            if (ib >= ia) ib++; // iki farklı index

            var a = free[ia];
            var b = free[ib];

            // ikisinden biri blok/spool olamaz (free list zaten filtreliyor),
            // ayrıca birbirine Manhattan >= minManhattan
            int dist = Mathf.Abs(a.x - b.x) + Mathf.Abs(a.y - b.y);
            if (dist >= Mathf.Max(1, minManhattan))
            {
                // seçilenleri listeden çıkar
                if (ia > ib) { var tmp = ia; ia = ib; ib = tmp; }
                free.RemoveAt(ib);
                free.RemoveAt(ia);

                A = a; B = b;
                return true;
            }
        }

        A = default; B = default;
        return false;
    }

    void SetSpool(int x, int y, int pairId)
    {
        var c = grid.cells[x, y];
        c.isSpool = true;
        c.ownerId = pairId;

        var vis = c.img ? c.img.GetComponent<CellVisual>() : null;
        if (vis) vis.Init(true, pairId, emptyAlpha);
    }

    // ====== Utils ======
    void Shuffle<T>(IList<T> list)
    {
        for (int i = list.Count - 1; i > 0; i--)
        {
            int j = Random.Range(0, i + 1);
            (list[i], list[j]) = (list[j], list[i]);
        }
    }

    void HandleWin()
    {
        if (!autoNextOnWin) return;
        StartCoroutine(CoNextAfterDelay());
    }
    
    IEnumerator CoNextAfterDelay()
    {
        yield return new WaitForSeconds(autoNextDelay);
        pathDrawer.ResetForNewLevel();
        StartCoroutine(strokeLink.ClearAll(false));
        // Artış ve UI güncellemesi NextLevel içinde yapılacak
        StartCoroutine(NextLevel());
    }
}
