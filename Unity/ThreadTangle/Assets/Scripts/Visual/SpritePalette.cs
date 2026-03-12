using UnityEngine;

[CreateAssetMenu(fileName = "SpritePalette", menuName = "ThreadTangle/Sprite Palette", order = 0)]
public class SpritePalette : ScriptableObject
{
    [Header("Renkli elmas sprite'ları (index = pairId)")]
    public Sprite[] colorSprites = new Sprite[6];

    [Header("Bu sprite'ların ip renkleri")]
    public Color[] lineColors = new Color[6];
    
    [Header("Bu sprite'ların ip renkleri")]
    public Material[] materials = new Material[6];

    [Header("Boş (beyaz) elmas sprite'ı")]
    public Sprite emptyDiamond;
    
    [Header("Block sprite'ı")]
    public Sprite blockSprite;

    public Sprite GetColorSprite(int pairId)
    {
        if (colorSprites == null || colorSprites.Length == 0) return emptyDiamond;
        int idx = Mathf.Abs(pairId) % colorSprites.Length;
        return colorSprites[idx] ? colorSprites[idx] : emptyDiamond;
    }

    public Color GetLineColor(int pairId)
    {
        if (lineColors == null || lineColors.Length == 0) return Color.white;
        int idx = Mathf.Abs(pairId) % lineColors.Length;
        return lineColors[idx];
    }
    
    public Material GetMaterial(int pairId)
    {
        if (materials == null || materials.Length == 0) return null;
        int idx = Mathf.Abs(pairId) % materials.Length;
        return materials[idx];
    }
}