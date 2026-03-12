using System;
using UnityEngine;
using UnityEngine.UI;
public class Cell : MonoBehaviour
{
    public int x, y;
    public int ownerId = -1;
    public bool isSpool;
    public bool isBlocked;
    public int spoolId = -1;
    [HideInInspector] public Image img;
    void Awake() { img = GetComponent<Image>(); }
    
    private void Start()
    {
        var grid = Instantiate(FindFirstObjectByType<GridManager>().cellGridPrefab, transform.parent);
        grid.GetComponent<RectTransform>().transform.position = GetComponent<RectTransform>().transform.position;
        transform.SetParent(grid.transform);
        transform.localScale *= 1.3f;
    }
}