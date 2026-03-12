using System.Collections;
using UnityEngine;
using UnityEngine.UI;

public static class UIFx
{
    // Glow halkası: hedef RT altında geçici bir Image yarat, ölçek+alfa animasyonu, sonra yok et
    public static void BurstGlow(MonoBehaviour host, RectTransform target, Sprite glowSprite, Color color, 
                                 float startScale = 0.6f, float endScale = 1.35f, float dur = 0.22f)
    {
        if (!host || !target || !glowSprite) return;

        var go = new GameObject("FX_Glow", typeof(RectTransform), typeof(Image));
        var rt = go.GetComponent<RectTransform>();
        var img = go.GetComponent<Image>();

        // Parent aynı Canvas hiyerarşisine girsin
        rt.SetParent(target, false);
        rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.pivot = new Vector2(0.5f, 0.5f);
        rt.anchoredPosition = Vector2.zero;
        rt.localRotation = Quaternion.identity;

        img.sprite = glowSprite;
        img.raycastTarget = false;
        img.color = new Color(color.r, color.g, color.b, 0f); // 0 alfa ile başla

        host.StartCoroutine(CoBurstGlow(rt, img, startScale, endScale, dur));
    }

    static IEnumerator CoBurstGlow(RectTransform rt, Image img, float s0, float s1, float dur)
    {
        float t = 0f;
        // hızlı açılma
        while (t < dur * 0.4f)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / (dur * 0.4f));
            if (rt) rt.localScale = Vector3.one * Mathf.Lerp(s0, s1, k);
            if (img) img.color = new Color(img.color.r, img.color.g, img.color.b, Mathf.Lerp(0f, 1f, k));
            yield return null;
        }
        // fade-out
        t = 0f;
        while (t < dur * 0.6f)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / (dur * 0.6f));
            if (img) img.color = new Color(img.color.r, img.color.g, img.color.b, Mathf.Lerp(1f, 0f, k));
            yield return null;
        }
        if (rt) Object.Destroy(rt.gameObject);
    }

    // Çok kısa beyaz flash (bazı sprite’larda “parlıyor” etkisi)
    public static void HitFlash(MonoBehaviour host, Image img, Color flashColor, float dur = 0.06f)
    {
        if (!host || !img) return;
        host.StartCoroutine(CoHitFlash(img, flashColor, dur));
    }
    static IEnumerator CoHitFlash(Image img, Color flashColor, float dur)
    {
        var orig = img.color;
        img.color = flashColor;
        float t = 0f;
        while (t < dur) { t += Time.unscaledDeltaTime; yield return null; }
        if (img) img.color = orig;
    }

    // Mikro sarsma (UI için)
    public static void Shake(MonoBehaviour host, RectTransform rt, float amp = 6f, float dur = 0.12f)
    {
        if (!host || !rt) return;
        host.StartCoroutine(CoShake(rt, amp, dur));
    }
    static IEnumerator CoShake(RectTransform rt, float amp, float dur)
    {
        var basePos = rt.anchoredPosition;
        float t = 0f;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = 1f - Mathf.Clamp01(t / dur);
            var off = new Vector2(
                (Mathf.PerlinNoise(t * 60f, 1f) - 0.5f) * 2f,
                (Mathf.PerlinNoise(1f, t * 60f) - 0.5f) * 2f
            ) * (amp * k);
            rt.anchoredPosition = basePos + off;
            yield return null;
        }
        rt.anchoredPosition = basePos;
    }
}