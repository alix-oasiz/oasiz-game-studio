using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// Level başladıktan kısa süre sonra sahnedeki pair'lere göre
/// minimum taş kullanılarak kazanılabilecek çözümü arar.
/// LevelComplete anında oyuncu ile optimum farkını puanlar.
/// + Tek haklı HINT: rastgele bağlanmamış 1 pair için optimal yolu çizer.
/// + IsSolvable() fonksiyonu: dışarıdan çağırıldığında seviyenin çözülüp çözülmediğini döndürür.
public class LevelOptimalSolver : MonoBehaviour
{
    [Header("Refs")]
    public GridManager grid;
    [Tooltip("İsteğe bağlı; optimumu ve skoru UI'da göstermek için")]
    public Text hudText;
    [Tooltip("Çözümü gri renkte ince bir StrokeLink ile göstermek istersen")]
    public StrokeLink debugStrokeLink; // opsiyonel (Canvas altına ayrı bir LinkLayer kurup atayabilirsin)

    [Header("Timing")]
    public int startDelayFrames = 2;

    [Header("Search Options")]
    [Tooltip("Her çift için önce en kısa yollar denenir; alternatif eşit uzunluktaki yolların üst limiti")]
    public int maxEqualShortestPathsPerPair = 32;
    [Tooltip("Kısa yol yoksa uzunluğa +N kadar genişlet")]
    public int maxLengthRelaxation = 3;

    [Header("Debug")]
    public bool verbose = false;
    public bool visualizeSolution = true;
    public int lineColorIndex = 1;
    public float debugThickness = 10f;

    // ==== HINT ====
    [Header("Hint")]
    [Tooltip("Hint çizimi için ayrı bir StrokeLink atayın (ince/yarı saydam).")]
    public StrokeLink hintStrokeLink;
    [Tooltip("Sadece tek kez hint verilsin.")]
    public bool hintOneShot = true;
    [Tooltip("Hint çizimi için renk; palet rengiyle %25 karışır.")]
    public Color hintTint = new Color(1f, 1f, 0f, 0.85f);
    bool hintUsed = false;

    // Çözüm çıktısı
    public int bestCost = int.MaxValue; // toplam boyanan taş (non-spool hücre)
    Dictionary<int, List<Cell>> bestPaths; // pairId -> path (spool..spool arası sırayla)
    public System.Collections.Generic.IReadOnlyDictionary<int, List<Cell>> BestPaths => bestPaths;

    public System.Collections.Generic.HashSet<Cell> GetSolutionCells(bool excludeSpools = true)
    {
        var set = new System.Collections.Generic.HashSet<Cell>();
        if (bestPaths == null) return set;
        foreach (var kv in bestPaths)
        {
            var path = kv.Value;
            if (path == null || path.Count == 0) continue;
            int start = excludeSpools ? 1 : 0;
            int end = excludeSpools ? path.Count - 1 : path.Count;
            for (int i = start; i < end; i++)
            {
                var c = path[i];
                if (c != null) set.Add(c);
            }
        }
        return set;
    }

    void OnEnable()
    {
        PathDrawer.OnLevelComplete += OnLevelComplete;
    }
    void OnDisable()
    {
        PathDrawer.OnLevelComplete -= OnLevelComplete;
    }

    IEnumerator Start()
    {
        // grid spawn’ı bekle
        for (int i=0; i<Mathf.Max(0, startDelayFrames); i++) yield return null;

        EnsureHintLink();   // Hint sistemi için bind

        ComputeOptimal();
        if (bestCost < int.MaxValue)
        {
            Debug.Log($"[OptimalSolver] Optimum taş: {bestCost}");
            if (hudText) hudText.text = $"Best: {bestCost}";
            if (visualizeSolution) DrawDebugSolution();
        }
        else
        {
            Debug.LogWarning("[OptimalSolver] Çözüm bulunamadı.");
            if (hudText) hudText.text = "Best: -";
        }
    }

    // ==== Event: Level Complete ====
    void OnLevelComplete(int playerUsedTiles)
    {
        if (bestCost == int.MaxValue) { Debug.Log("[OptimalSolver] Best bilinmiyor."); return; }

        int diff = playerUsedTiles - bestCost; // pozitif: oyuncu fazla taş kullanmış
        int points = ScoreFromDiff(diff);
        Debug.Log($"[Score] Player={playerUsedTiles}, Best={bestCost}, Diff={diff}, Points={points}");

        if (hudText) hudText.text = $"Best: {bestCost}  You: {playerUsedTiles}  Δ:{diff}  P:{points}";
    }

    int ScoreFromDiff(int diff)
    {
        // Basit örnek puanlama:
        // optimal: +100, +1/+2 fazla: +70/+40, sonrası düşer (negatif fark = bonus!)
        if (diff <= 0) return 120;     // optimal veya daha iyi (teorik olarak zor) → 120
        if (diff == 1) return 100;
        if (diff == 2) return 80;
        if (diff == 3) return 60;
        if (diff == 4) return 40;
        return Mathf.Max(10, 50 - 5 * (diff - 4)); // en az 10
    }

    // ==== ÇÖZÜM ====
    class Pair { public int id; public Cell a, b; public int manhattan; }

    /// <summary>
    /// Dışarıdan çağrılabilen fonksiyon: Seviye çözülüyorsa true döner (bestCost güncellenir).
    /// Bu fonksiyon, LevelOptimalSolver içerisindeki ComputeOptimal()'ı çağırır ve bestCost'i hesaplar.
    /// </summary>
    public bool IsSolvable()
    {
        ComputeOptimal();
        return bestCost < int.MaxValue;
    }

    public void ComputeOptimal()
    {
        var pairs = CollectPairs();
        // küçükten büyüğe sıralamak aramayı hızlandırır (yakınlar önce)
        pairs.Sort((p,q)=>p.manhattan.CompareTo(q.manhattan));

        bool[,] occ = new bool[grid.width, grid.height];
        // mevcut boyalı hücreleri engel sayma (oyun başında genelde boş)
        for (int y=0; y<grid.height; y++)
        for (int x=0; x<grid.width; x++)
        {
            var c = grid.cells[x,y];
            // Spool değil ve boyalıysa (ownerId >= 0) veya blok ise işgal say
            if (!c.isSpool && (c.ownerId >= 0 || c.isBlocked))
                occ[x,y] = true;
        }

        bestCost = int.MaxValue;
        bestPaths = null;

        var current = new Dictionary<int, List<Cell>>();
        SearchRec(0, pairs, occ, 0, current);
    }

    List<Pair> CollectPairs()
    {
        var dict = new Dictionary<int, List<Cell>>();
        for (int y=0; y<grid.height; y++)
        for (int x=0; x<grid.width; x++)
        {
            var c = grid.cells[x,y];
            if (c.isSpool)
            {
                if (!dict.ContainsKey(c.ownerId)) dict[c.ownerId] = new List<Cell>();
                dict[c.ownerId].Add(c);
            }
        }
        var list = new List<Pair>();
        foreach (var kv in dict)
        {
            if (kv.Value.Count < 2) continue;
            var a = kv.Value[0];
            var b = kv.Value[1];
            var p = new Pair{ id=kv.Key, a=a, b=b, manhattan=Mathf.Abs(a.x-b.x)+Mathf.Abs(a.y-b.y) };
            list.Add(p);
        }
        return list;
    }

    void SearchRec(int idx, List<Pair> pairs, bool[,] occ, int costSoFar, Dictionary<int,List<Cell>> cur)
    {
        if (idx >= pairs.Count)
        {
            if (costSoFar < bestCost)
            {
                bestCost = costSoFar;
                bestPaths = ClonePaths(cur);
                if (verbose) Debug.Log($"[OptimalSolver] NEW BEST {bestCost}");
            }
            return;
        }

        // alt sınır (prune): kalan min adımlar toplamı
        int lowerBound = costSoFar;
        for (int i=idx; i<pairs.Count; i++)
        {
            var p = pairs[i];
            // En az boyanacak hücre sayısı = manhattan - 1 (spoollar hariç)
            lowerBound += Mathf.Max(0, p.manhattan - 1);
        }
        if (lowerBound >= bestCost) return;

        var pair = pairs[idx];

        // Kısa yollardan başlayarak alternatif yolları dolaş
        int baseLen = ShortestPathLength(pair, occ);
        if (baseLen < 0) return; // geçici olarak kilitlenmiş: üst dal başarısız

        int maxLen = baseLen + Mathf.Max(0, maxLengthRelaxation);

        // Uzunluğa göre sıralı dene
        for (int L = baseLen; L <= maxLen; L++)
        {
            var paths = EnumeratePathsWithMax(pair, occ, L, maxEqualShortestPathsPerPair);
            if (paths == null || paths.Count == 0) continue;

            foreach (var path in paths)
            {
                // path: spool->...->spool hücre listesi; boyanacak taş sayısı = path.Count - 2
                int paintTiles = Mathf.Max(0, path.Count - 2);

                // yerleştir (spool hariç ara hücreler işgal)
                Mark(path, occ, true);

                cur[pair.id] = path;
                SearchRec(idx+1, pairs, occ, costSoFar + paintTiles, cur);
                cur.Remove(pair.id);

                // kaldır
                Mark(path, occ, false);
            }

            // Eğer bu uzunlukta çözüm bulup zaten bestCost'a ulaştıysak, daha uzun denemeye gerek yok
            if (bestPaths != null && bestCost == lowerBound) break;
        }
    }

    Dictionary<int,List<Cell>> ClonePaths(Dictionary<int,List<Cell>> src)
    {
        var d = new Dictionary<int, List<Cell>>();
        foreach (var kv in src) d[kv.Key] = new List<Cell>(kv.Value);
        return d;
    }

    void Mark(List<Cell> path, bool[,] occ, bool add)
    {
        // Ara hücreler (spool ve blok hariç) işaretlenir/temizlenir
        for (int i=1; i<path.Count-1; i++)
        {
            var c = path[i];
            if (!c.isBlocked)
                occ[c.x, c.y] = add;
        }
    }

    int ShortestPathLength(Pair p, bool[,] occ)
    {
        // BFS ile mevcut engellere göre en kısa yol uzunluğu (hücre sayısı)
        var len = BFS_Path(p, occ, out var _);
        return len;
    }

    List<List<Cell>> EnumeratePathsWithMax(Pair p, bool[,] occ, int maxLen, int maxCount)
    {
        // BFS-parents ile tüm EN KISA (<=maxLen) yolları listele; maxCount ile sınırla
        var res = new List<List<Cell>>();
        BFS_Path(p, occ, out var parents, maxLen);
        if (parents == null) return res;

        // Ağaçtan tüm kısa yolları geri üret
        var endKey = Key(p.b.x, p.b.y);
        if (!parents.ContainsKey(endKey)) return res;

        var tmp = new List<Cell>();
        void Backtrack(int kx, int ky)
        {
            if (res.Count >= maxCount) return;
            var key = Key(kx, ky);
            if (!parents.ContainsKey(key)) return;

            foreach (var parent in parents[key])
            {
                if (parent.x == -1 && parent.y == -1)
                {
                    // başlangıç
                    tmp.Add(grid.cells[kx, ky]);
                    // ters sırada: start->...->end yapmak için çevir
                    tmp.Reverse();
                    res.Add(new List<Cell>(tmp));
                    tmp.Reverse();
                    tmp.RemoveAt(tmp.Count-1);
                    if (res.Count >= maxCount) return;
                }
                else
                {
                    tmp.Add(grid.cells[kx, ky]);
                    Backtrack(parent.x, parent.y);
                    tmp.RemoveAt(tmp.Count-1);
                }
            }
        }

        Backtrack(p.b.x, p.b.y);
        return res;
    }

    struct P { public int x,y; public P(int X,int Y){x=X;y=Y;} }
    string Key(int x,int y)=> x+"#"+y;

    int BFS_Path(Pair p, bool[,] occ, out Dictionary<string,List<P>> parents, int maxLen = int.MaxValue)
    {
        parents = new Dictionary<string, List<P>>();

        var q = new Queue<P>();
        var dist = new int[grid.width, grid.height];
        for (int y=0; y<grid.height; y++)
        for (int x=0; x<grid.width; x++) dist[x,y] = int.MaxValue;

        P start = new P(p.a.x, p.a.y), goal = new P(p.b.x, p.b.y);
        q.Enqueue(start);
        dist[start.x,start.y] = 0;
        parents[Key(start.x,start.y)] = new List<P>{ new P(-1,-1) }; // sentinel

        int[] DX = {1,-1,0,0};
        int[] DY = {0,0,1,-1};

        while (q.Count > 0)
        {
            var cur = q.Dequeue();
            int d = dist[cur.x, cur.y];

            if (d > maxLen) continue; // çok uzadıysa kes

            if (cur.x == goal.x && cur.y == goal.y)
            {
                return d; // hücre adımı (spool dahil)
            }

            for (int k=0; k<4; k++)
            {
                int nx = cur.x + DX[k], ny = cur.y + DY[k];
                if (nx < 0 || ny < 0 || nx >= grid.width || ny >= grid.height) continue;
                var c = grid.cells[nx, ny];

                // geçiş kuralları:
                // - başka renge ait spool'a girme
                if (c.isSpool && c.ownerId != p.id) continue;
                // - dolu (boyanmış) hücrelere veya bloklara girme (spool hariç)
                if (!c.isSpool && occ[nx, ny]) continue;

                int nd = d + 1;
                if (nd > maxLen) continue;

                if (nd < dist[nx,ny])
                {
                    dist[nx,ny] = nd;
                    q.Enqueue(new P(nx,ny));
                    parents[Key(nx,ny)] = new List<P>{ new P(cur.x, cur.y) };
                }
                else if (nd == dist[nx,ny])
                {
                    // aynı uzunlukta alternatif yol → parent listesine ekle
                    if (!parents.ContainsKey(Key(nx,ny))) parents[Key(nx,ny)] = new List<P>();
                    parents[Key(nx,ny)].Add(new P(cur.x, cur.y));
                }
            }
        }

        return -1; // ulaşılamadı
    }

    // ==== HINT API ====

    /// Tek seferlik: rastgele bağlanmamış bir pair için optimal yolu gösterir.
    public bool ShowRandomHintOnce()
    {
        if (hintOneShot && hintUsed) { Debug.Log("[Hint] already used"); return false; }
        if (bestPaths == null || bestPaths.Count == 0) { Debug.Log("[Hint] no bestPaths"); return false; }
        if (!hintStrokeLink) { Debug.LogWarning("[Hint] hintStrokeLink is null"); return false; }

        // Bağlanmamış pair'leri topla
        var unconnected = new List<int>();
        foreach (var kv in bestPaths)
        {
            if (!IsPairConnectedCurrent(kv.Key)) unconnected.Add(kv.Key);
        }
        if (unconnected.Count == 0) { Debug.Log("[Hint] all pairs connected"); return false; }

        // Rastgele bir pair seç
        int idx = Random.Range(0, unconnected.Count);
        int pairId = unconnected[idx];

        // Çiz
        var ok = DrawHintForPair(pairId);
        if (ok)
        {
            hintUsed = true;
            Debug.Log($"[Hint] shown for pair {pairId}");
            return true;
        }
        return false;
    }

    /// Belirli pair için optimal hint yolunu çizer.
    public bool DrawHintForPair(int pairId)
    {
        if (!bestPaths.TryGetValue(pairId, out var path) || path == null || path.Count < 2) return false;
        if (!hintStrokeLink) return false;

        var start = path[0];
        if (start?.img == null) return false;

        // renk: palette varsa kendi rengi, üstüne hintTint ile karışım
        Color c = hintTint;
        var vis0 = start.img.GetComponent<CellVisual>();
        if (vis0 && vis0.palette) c = Color.Lerp(vis0.palette.GetLineColor(pairId), hintTint, 0.25f);

        hintStrokeLink.BeginStroke(start.img.rectTransform, lineColorIndex, null);
        hintStrokeLink.BeginGroup(-1000 - pairId); // benzersiz isimli grup

        for (int i = 1; i < path.Count; i++)
        {
            var rt = path[i]?.img ? path[i].img.rectTransform : null;
            if (rt) hintStrokeLink.AddSegmentToCell(rt);
        }
        hintStrokeLink.CommitToEnd(path[^1].img.rectTransform);
        return true;
    }

    /// Şu anda sahnede bu pair bağlı mı? (oyun state'ine göre BFS)
    bool IsPairConnectedCurrent(int pairId)
    {
        Cell a=null, b=null;
        for (int y=0; y<grid.height; y++)
        for (int x=0; x<grid.width; x++)
        {
            var c = grid.cells[x, y];
            if (c.isSpool && c.ownerId == pairId)
            {
                if (a == null) a = c;
                else if (b == null) { b = c; break; }
            }
        }
        if (a == null || b == null) return false;

        var q = new Queue<Cell>();
        var seen = new bool[grid.width, grid.height];
        q.Enqueue(a); seen[a.x, a.y] = true;

        while (q.Count > 0)
        {
            var cur = q.Dequeue();
            if (cur == b) return true;

            foreach (var n in Neigh(cur))
            {
                if (seen[n.x, n.y]) continue;
                if ((n.isSpool && n.ownerId == pairId) || (!n.isSpool && !n.isBlocked && n.ownerId == pairId))
                {
                    seen[n.x, n.y] = true;
                    q.Enqueue(n);
                }
            }
        }
        return false;
    }

    IEnumerable<Cell> Neigh(Cell c)
    {
        int x = c.x, y = c.y;
        if (x > 0) yield return grid.cells[x - 1, y];
        if (x < grid.width - 1) yield return grid.cells[x + 1, y];
        if (y > 0) yield return grid.cells[x, y - 1];
        if (y < grid.height - 1) yield return grid.cells[x, y + 1];
    }

    // ==== Debug çizimi (opsiyonel) ====
    void DrawDebugSolution()
    {
        if (debugStrokeLink == null || bestPaths == null) return;

        // İnce gri bir link ile her pair için göster
        foreach (var kv in bestPaths)
        {
            var path = kv.Value;
            if (path == null || path.Count < 2) continue;

            // begin
            var startRT = path[0]?.img ? path[0].img.rectTransform : null;
            if (!startRT) continue;

            debugStrokeLink.thickness = debugThickness;
            debugStrokeLink.BeginStroke(startRT, lineColorIndex, null);

            for (int i=1; i<path.Count; i++)
            {
                var rt = path[i]?.img ? path[i].img.rectTransform : null;
                if (rt) debugStrokeLink.AddSegmentToCell(rt);
            }
            debugStrokeLink.CommitToEnd(path[^1].img.rectTransform);
        }

        Debug.Log("[OptimalSolver] Debug çözüm çizildi.");
    }

    // ==== HINT LINK AUTO-BIND / AUTO-CREATE ====
    void EnsureHintLink()
    {
        if (hintStrokeLink) return;

        // 1) Sahnede adı "Hint" geçen bir StrokeLink var mı?
        var links = FindObjectsOfType<StrokeLink>(true);
        foreach (var l in links)
        {
            if (l && (l.name.Contains("Hint") || l.gameObject.name.Contains("Hint")))
            {
                hintStrokeLink = l;
                Debug.Log("[Hint] Auto-bound existing StrokeLink: " + l.name);
                return;
            }
        }

        // 2) Yoksa Canvas altında bir tane oluştur
        var canvas = FindObjectOfType<Canvas>();
        if (!canvas)
        {
            Debug.LogWarning("[Hint] No Canvas found; cannot auto-create StrokeLink. Please assign in Inspector.");
            return;
        }

        var go = new GameObject("HintLink", typeof(RectTransform), typeof(StrokeLink));
        go.transform.SetParent(canvas.transform, false);

        var rt = go.GetComponent<RectTransform>();
        rt.anchorMin = Vector2.zero; 
        rt.anchorMax = Vector2.one; 
        rt.offsetMin = Vector2.zero; 
        rt.offsetMax = Vector2.zero;

        var sl = go.GetComponent<StrokeLink>();
        // temel görünüm
        sl.thickness = 10f;
        sl.animateSegments = true;
        sl.useSliced = true;

        hintStrokeLink = sl;
        Debug.Log("[Hint] Created & bound new StrokeLink: " + go.name);
    }
}