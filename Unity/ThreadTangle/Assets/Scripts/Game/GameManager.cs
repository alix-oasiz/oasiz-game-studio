using UnityEngine;
using UnityEngine.UI;
using System.Collections;
public class GameManager : MonoBehaviour
{
    public string levelsFile = "levels.json";
    public int levelIndex = 0;
    public GridManager grid;
    public GameObject spoolPrefab;
    public RectTransform spoolsRoot;
    

    void PlaceSpool(int x, int y, int pairId, Color col)
    {
        var cell = grid.cells[x, y];
        cell.isSpool = true;
        cell.ownerId = pairId;
        var go = GameObject.Instantiate(spoolPrefab, spoolsRoot);
        go.name = $"Spool_{pairId}_{x}_{y}";
        var rt = go.GetComponent<RectTransform>();
        var img = go.GetComponent<Image>();
        var cellRT = cell.GetComponent<RectTransform>();
        rt.anchorMin = cellRT.anchorMin;
        rt.anchorMax = cellRT.anchorMax;
        rt.pivot = cellRT.pivot;
        rt.position = cellRT.position;
        rt.sizeDelta = cellRT.sizeDelta;
        if (img) img.color = col;
    }
}