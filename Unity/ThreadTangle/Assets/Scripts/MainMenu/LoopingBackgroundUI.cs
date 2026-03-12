using UnityEngine;
using UnityEngine.UI;

[RequireComponent(typeof(RawImage))]
public class LoopingBackgroundUI : MonoBehaviour
{
    [Tooltip("Soldan sağa akış hızı (ekran bağımsız). +X = sağa, -X = sola.")]
    public Vector2 speed = new Vector2(+0.05f, 0f);  // + ile sağa akış

    [Tooltip("Kaç kez yan yana tekrar görünsün (UV tiling).")]
    public Vector2 tiling = new Vector2(2f, 1f);

    RawImage img;
    Rect uv;

    void Awake()
    {
        img = GetComponent<RawImage>();
        uv = img.uvRect;
        uv.width  = Mathf.Max(1f, tiling.x);
        uv.height = Mathf.Max(1f, tiling.y);
        img.uvRect = uv;
    }

    void Update()
    {
        // unscaledTime kullan: pause menüsünde de akmaya devam eder
        uv.x = Mathf.Repeat(uv.x + speed.x * Time.unscaledDeltaTime, 1f);
        uv.y = Mathf.Repeat(uv.y + speed.y * Time.unscaledDeltaTime, 1f);
        img.uvRect = uv;
    }
}