using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

[DisallowMultipleComponent]
public class LevelRuntimeLoader : MonoBehaviour
{
    [Header("Refs")]
    public GridManager grid;
    public SpritePalette palette;           // renk & sprite
    public Sprite blockSprite;              // blok görseli (yoksa palette.emptyDiamond)
    [Range(0,1)] public float emptyAlpha = 0.08f;

    [Header("Source")]
    public LevelSet levelSet;
    public int levelIndex = 0;

    [Header("Y Mapping")]
    public bool invertY = true;             // y=0 üst satır ise true (GridLayoutGroup üstten başlıyorsa genelde true)

    void Awake()
    {
        if (!grid) grid = GetComponent<GridManager>();
    }

    void Start()
    {
        if (!levelSet || levelSet.levels == null || levelSet.levels.Count == 0)
        { Debug.LogError("[LevelRuntimeLoader] LevelSet yok/boş."); return; }

        levelIndex = Mathf.Clamp(levelIndex, 0, levelSet.levels.Count - 1);
        Apply(levelSet.levels[levelIndex]);
    }

    public void Apply(LevelDefinition def)
    {
        if (!grid || !palette) { Debug.LogError("[LevelRuntimeLoader] Grid/Palette eksik."); return; }
        if (def.width <= 0 || def.height <= 0) { Debug.LogError("[LevelRuntimeLoader] Geçersiz boyut."); return; }

        // 1) Grid kur
        grid.Build(def.width, def.height);

        // 2) Tüm hücreleri boş görünüm yap
        for (int y = 0; y < grid.height; y++)
        for (int x = 0; x < grid.width; x++)
        {
            var c = grid.cells[x, y];
            c.isSpool = false; c.isBlocked = false; c.ownerId = -1;

            var img = EnsureImage(c);
            img.sprite = palette.emptyDiamond;
            img.color  = new Color(1,1,1, emptyAlpha);
        }

        // 3) pair kodlarından pairId map’i üret (0 ve 3 hariç)
        var pairCodes = def.DistinctPairCodes();             // örn: [1,2,4]
        var codeToPairId = new Dictionary<int, int>();       // 1->0, 2->1, 4->2
        for (int i = 0; i < pairCodes.Count; i++)
            codeToPairId[pairCodes[i]] = i;

        // 4) Hücreleri işle
        for (int jy = 0; jy < def.height; jy++)
        for (int jx = 0; jx < def.width; jx++)
        {
            int code = def.Get(jx, jy);
            int gx = jx;
            int gy = invertY ? (def.height - 1 - jy) : jy;

            var cell = grid.cells[gx, gy];
            var img = EnsureImage(cell);

            if (code == 0)
            {
                // empty (zaten boş)
                continue;
            }
            else if (code == 3)
            {
                // block
                cell.isBlocked = true; cell.ownerId = -1; cell.isSpool = false;
                img.sprite = blockSprite ? blockSprite : palette.emptyDiamond;
                img.color  = Color.white;
            }
            else
            {
                // spool
                if (!codeToPairId.TryGetValue(code, out int pairId)) continue;
                cell.isSpool = true; cell.ownerId = pairId;

                img.sprite = palette.GetColorSprite(pairId);
                img.color  = palette.GetLineColor(pairId);
            }
        }
    }

    Image EnsureImage(Cell c)
    {
        if (c.img) return c.img;
        var img = c.GetComponent<Image>();
        if (!img) img = c.gameObject.AddComponent<Image>();
        c.img = img;
        return img;
    }
}