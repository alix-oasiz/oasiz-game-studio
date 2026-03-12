using UnityEngine;
using UnityEngine.UI;

[DisallowMultipleComponent]
public class LinkSegHighlightFollower : MonoBehaviour
{
    public RectTransform target;   // Takip edeceği segment (LinkSeg'in RT'si)
    public float thickness = 16f;  // StrokeLink.thickness ile aynı
    public float yOffsetScale = 0.15f;  // şeridin üstte durması için +Y ofset (thickness * bu değer)
    public float widthScale  = 0.55f;   // şerit kalınlığı = thickness * bu değer

    RectTransform rt;

    void Awake() { rt = (RectTransform)transform; }

    void LateUpdate()
    {
        if (!target || !rt) return;

        // Pivot/anchor rotasyon ve genişlik segmentle aynı
        rt.pivot      = new Vector2(0f, 0.5f);
        rt.anchorMin  = rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.localRotation = target.localRotation;

        // Genişlik: segmentin anlık genişliği
        float w = target.sizeDelta.x;
        // Yükseklik: stroke kalınlığının oranı
        float h = thickness * Mathf.Max(0f, widthScale);
        rt.sizeDelta = new Vector2(w, h);

        // Üste doğru hafif kaydır
        rt.anchoredPosition = new Vector2(0f, thickness * yOffsetScale);
    }
}