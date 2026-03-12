using System.Collections;
using UnityEngine;

public class SimplePop : MonoBehaviour
{
    public static IEnumerator PopIn(GameObject obj, float duration = 0.3f)
    {
        if (obj == null) yield break;
        Vector3 start = Vector3.zero;
        Vector3 end = Vector3.one;
        obj.transform.localScale = start;

        float t = 0f;
        while (t < 1f)
        {
            t += Time.deltaTime / duration;
            if(obj) obj.transform.localScale = Vector3.LerpUnclamped(start, end, Mathf.SmoothStep(0,1f,t));
            else yield break;
            yield return null;
        }
        if(obj) obj.transform.localScale = end;
    }

    public static IEnumerator PopOut(GameObject obj, float duration = 0.3f)
    {
        if (obj == null) yield break;
        Vector3 start = obj.transform.localScale;
        Vector3 end = Vector3.zero;

        float t = 0f;
        while (t < 1f)
        {
            t += Time.deltaTime / duration;
            if (obj) obj.transform.localScale = Vector3.LerpUnclamped(start, end, Mathf.SmoothStep(0,1,t));
            else yield break;
            yield return null;
        }
        if(obj) obj.transform.localScale = end;
    }
}