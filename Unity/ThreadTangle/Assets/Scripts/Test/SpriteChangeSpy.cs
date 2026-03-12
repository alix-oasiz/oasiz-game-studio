using UnityEngine;
using UnityEngine.UI;

public class SpriteChangeSpy : MonoBehaviour
{
    public Image img;
    public Cell cell;
    Sprite last;

    void Awake()
    {
        if (!img) img = GetComponent<Image>();
        if (!cell) cell = GetComponent<Cell>();
        last = img ? img.sprite : null;
    }

    void LateUpdate()
    {
        if (!img) return;
        if (img.sprite != last)
        {
            if (cell && cell.isBlocked)
            {
                Debug.LogWarning($"[Spy] BLOCK cell sprite changed on {name} from '{last?.name}' to '{img.sprite?.name}'\n" +
                                 UnityEngine.StackTraceUtility.ExtractStackTrace(), this);
            }
            last = img.sprite;
        }
    }
}