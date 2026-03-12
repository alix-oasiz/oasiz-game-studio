using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

public class GridManager : MonoBehaviour
{
    public RectTransform gridRoot;
    public GridLayoutGroup grid;
    public GameObject cellPrefab, cellGridPrefab;
    public int width = 6, height = 6;
    public Vector2 spacing = new Vector2(12,12);
    public Vector2 padding = new Vector2(40,40);
    public Cell[,] cells;

    [Header("Lifecycle")]
    public bool autoBuildOnStart = false;   // <<< yeni
    public bool rebuildOnResize  = false;   // <<< yeni

    // resize/batch kontrol
    bool suppressRebuild = false;           // <<< yeni
    bool pendingResize   = false;           // <<< yeni

    void Start()
    {
        if (gridRoot == null && grid != null)
            gridRoot = grid.GetComponent<RectTransform>();

        if (autoBuildOnStart && gridRoot && grid && cellPrefab)
            Build(width, height);
    }

    public void ResetGridInstant()
    {
        for (int i = 0; i < grid.transform.childCount; i++)
        {
            Destroy(grid.transform.GetChild(i).gameObject);
        }
    }

    public IEnumerator ResetGrid()
    {
        float duration = 0.060f;
        Debug.Log(grid.transform.childCount);
        for (int i = 0; i < grid.transform.childCount; i++)
        {
            StartCoroutine(GridPartReset(grid.transform.GetChild(i).GetComponentInChildren<CellVisual>(), duration));
            yield return new WaitForSeconds(duration / 2);
        }
    }

    IEnumerator GridPartReset(CellVisual cell, float duration)
    {
        if (!cell)
        {
            Debug.LogError("[GridManager] GridPartReset: cell is null!");
            yield break;
        }
        StartCoroutine(SimplePop.PopOut(cell.gameObject, duration));
        yield return new WaitForSeconds(duration / 3);
        cell.SetVisual(false);
        Destroy(cell.gameObject);
    }
    
    IEnumerator PopInBlocks()
    {
        float duration = 0.060f;
        foreach (var cell in grid.GetComponentsInChildren<CellVisual>())
        {
            if (!cell)
            {
                continue;
            }
            StartCoroutine(SimplePop.PopOut(cell.gameObject, duration));
            yield return new WaitForSeconds(duration / 3);
            cell.SetVisual(false);
        }
    }

    public void BeginBatch()  { suppressRebuild = true;  pendingResize = false; }
    public void EndBatch()    { suppressRebuild = false; if (pendingResize && rebuildOnResize) Build(width, height); pendingResize = false; }

    public void Build(int w, int h)
    {
        if (gridRoot == null && grid != null)
            gridRoot = grid.GetComponent<RectTransform>();

        // sadece Cell component'li çocukları temizle
        for (int i = gridRoot.childCount - 1; i >= 0; i--)
        {
            var ch = gridRoot.GetChild(i);
            if (ch.GetComponent<Cell>() != null)
                GameObject.Destroy(ch.gameObject);
        }

        width = w; height = h;
        cells = new Cell[w,h];

        grid.spacing = spacing;
        grid.constraint = GridLayoutGroup.Constraint.FixedColumnCount;
        grid.constraintCount = width;

        var rect = gridRoot.rect;
        float totalH = spacing.x*(width-1);
        float totalV = spacing.y*(height-1);
        float availW = rect.width - padding.x*2f - totalH;
        float availH = rect.height - padding.y*2f - totalV;
        float cell = Mathf.Floor(Mathf.Min(availW/width, availH/height));
        grid.cellSize = new Vector2(cell, cell);
        grid.padding = new RectOffset((int)padding.x,(int)padding.x,(int)padding.y,(int)padding.y);

        for (int yy=0; yy<height; yy++)
        for (int xx=0; xx<width; xx++)
        {
            var go = GameObject.Instantiate(cellPrefab, grid.transform);
            var rt = go.GetComponent<RectTransform>();
            rt.localScale = Vector3.one;
            go.name = $"Cell_{xx}_{yy}";

            var c = go.GetComponent<Cell>(); if (c==null) c = go.AddComponent<Cell>();
            c.x = xx; c.y = yy;
            if (c.img==null) c.img = go.GetComponent<Image>();
            if (c.img) c.img.color = new Color(1f,1f,1f,0.08f);
            cells[xx,yy] = c;
        }
    }

    void OnRectTransformDimensionsChange()
    {
        if (!rebuildOnResize) return;
        if (suppressRebuild) { pendingResize = true; return; }
        if (gridRoot && grid && cellPrefab && width>0 && height>0)
            Build(width,height);
    }
    
    public void ChangeVisualOfGrids(bool visible)
    {
        if (grid == null) return;
        foreach (var gridVisual in grid.GetComponentsInChildren<CellVisual>())
        {
            gridVisual.SetVisual(visible);
        }
    }
}