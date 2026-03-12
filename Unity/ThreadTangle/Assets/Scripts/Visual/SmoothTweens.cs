using System.Collections;
using UnityEngine;
using UnityEngine.UI;

public static class SmoothTweens
{
    public static IEnumerator ScalePunch(RectTransform rt, float overshoot = 1.15f, float dur = 0.18f, AnimationCurve curve = null)
    {
        if (!rt) yield break;
        var start = rt.localScale;
        var peak  = Vector3.one * overshoot;
        var half  = dur * 0.5f;
        float t=0f;

        // up
        while (t < half){ t += Time.unscaledDeltaTime; float k = (curve!=null)? curve.Evaluate(t/half) : (t/half);
            if(rt)rt.localScale = Vector3.Lerp(start, peak, k); yield return null; }

        // down
        t=0f;
        while (t < half){ t += Time.unscaledDeltaTime; float k = (curve!=null)? curve.Evaluate(t/half) : (t/half);
            if(rt)rt.localScale = Vector3.Lerp(peak, Vector3.one, k); yield return null; }

        if(rt)rt.localScale = Vector3.one;
    }

    public static IEnumerator Fade(Image img, float from, float to, float dur = 0.18f, AnimationCurve curve = null)
    {
        if (!img) yield break;
        float t=0f; var c = img.color;
        while (t < dur){ t += Time.unscaledDeltaTime; float k = (curve!=null)? curve.Evaluate(t/dur) : (t/dur);
            img.color = new Color(c.r, c.g, c.b, Mathf.Lerp(from, to, k)); yield return null; }
        img.color = new Color(c.r, c.g, c.b, to);
    }

    public static IEnumerator RotateWiggle(RectTransform rt, float angle=10f, float dur=0.25f)
    {
        if (!rt) yield break;
        Quaternion a = Quaternion.Euler(0,0,-angle), b = Quaternion.Euler(0,0,angle);
        float half = dur * 0.5f; float t=0f;
        while (t < half){ t += Time.unscaledDeltaTime; float k = t/half; rt.localRotation = Quaternion.Slerp(Quaternion.identity, a, k); yield return null; }
        t=0f;
        while (t < half){ t += Time.unscaledDeltaTime; float k = t/half; rt.localRotation = Quaternion.Slerp(a, b, k); yield return null; }
        rt.localRotation = Quaternion.identity;
    }

    public static IEnumerator LineGrow(RectTransform rt, Vector2 fromLocal, Vector2 toLocal, float thickness, float dur = 0.08f)
    {
        if (!rt) yield break;
        // Set rotation once, grow length
        Vector2 dir = toLocal - fromLocal;
        float len   = dir.magnitude;
        float ang   = Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg;

        rt.pivot = new Vector2(0, 0.5f);
        rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
        rt.anchoredPosition = fromLocal;
        rt.localRotation = Quaternion.Euler(0,0,ang);

        float t=0f;
        while (t < dur){ t += Time.unscaledDeltaTime; float k = t/dur;
            if(rt)rt.sizeDelta = new Vector2(Mathf.Lerp(0f, len, k), thickness); yield return null; }
        if(rt)rt.sizeDelta = new Vector2(len, thickness);
    }
}