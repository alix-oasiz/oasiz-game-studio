using System.Collections;
using UnityEngine;

/// Level başında tüm hücrelerin görselini kurar:
/// - Spool hücreleri: kendi renkli sprite
/// - ownerId >= 0 boyalı hücreler: ilgili renk sprite
/// - boş hücreler: empty (beyaz elmas + düşük alpha)
/// Not: CellVisual.palette'ı Inspector'dan ver.
public class GridVisualInitializer : MonoBehaviour
{
    [Header("Refs")]
    public GridManager gridManager;       // width, height, cells[,]
    [Tooltip("Hücre Image'larında bulunacak olan CellVisual'ların kullanacağı palet")]
    public SpritePalette spritePalette;

    [Header("Görsel")]
    [Range(0,1)] public float emptyAlpha = 0.08f;

    [Header("Zamanlama")]
    [Tooltip("Grid spawn'ı bir frame geciktirerek bekle (dinamik kurulumlarda güvenli).")]
    public bool waitOneFrame = true;

    void Start()
    {
        if (waitOneFrame) StartCoroutine(InitNextFrame());
        else InitNow();
    }

    IEnumerator InitNextFrame()
    {
        yield return null; // grid spawn'ı bekle
        InitNow();
    }

    void InitNow()
    {
        if (gridManager == null || gridManager.cells == null)
        {
            Debug.LogWarning("[GridVisualInitializer] gridManager/cells yok.");
            return;
        }

        for (int y = 0; y < gridManager.height; y++)
        for (int x = 0; x < gridManager.width; x++)
        {
            var cell = gridManager.cells[x, y];
            if (cell == null || cell.img == null) continue;

            var vis = cell.img.GetComponent<CellVisual>();
            if (vis == null) vis = cell.img.gameObject.AddComponent<CellVisual>();

            vis.palette    = spritePalette;
            vis.emptyAlpha = emptyAlpha;
            vis.isSpool    = cell.isSpool;
            vis.ownerId    = cell.ownerId;

            // Başlangıç durumunu uygula
            if (cell.isSpool)
            {
                // spool daima kendi renkli sprite'ı ile başlar
                vis.SetSpoolIdle(cell.ownerId);
            }
            else if (cell.ownerId >= 0)
            {
                // level data'da önceden boyalı hücre varsa
                vis.SetPaintSprite(cell.ownerId);
            }
            else
            {
                // boş
                if (!vis.GetComponent<Cell>().isBlocked)
                {
                    vis.SetEmpty();
                }
            }
        }

        Debug.Log("[GridVisualInitializer] Initial visuals applied.");
    }
}