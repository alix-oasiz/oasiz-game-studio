using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// Grid'deki objeleri sırayla "pop" efektiyle yok edip (opsiyonel destroy),
/// ardından yeni objeleri "pop-in" ile sahneye getiren yardımcı.
/// - Girdi: GameObject listesi
/// - Çıkış: İş bitince callback(Action<bool>) çağrılır (true = başarı)
/// Not: Coroutineler kullanılır; dışarıdan StartCoroutine ile de çağırabilirsin.
public class GridPopTransition : MonoBehaviour
{
    [Header("Genel")]
    [Tooltip("Yok etme aşamasında objeleri tamamen Destroy edilsin mi?")]
    public bool destroyOnHide = true;
    [Tooltip("Sırayı karıştır (random) uygula")]
    public bool randomOrder = false;
    [Tooltip("İşlem arası bekleme (her obje arası)")]
    public float perItemDelay = 0.025f;

    [Header("Pop-Out (Yok Etme)")]
    [Tooltip("Pop-out süresi (tek obje)")]
    public float popOutDuration = 0.14f;
    [Tooltip("Pop-out sırasında önce küçükçe büyüt, sonra 0'a düşür")]
    public float popOutOvershoot = 1.07f;
    [Tooltip("Alfa'yı 0'a indirilsin mi? (Image/Graphic)")]
    public bool fadeOut = true;

    [Header("Pop-In (Giriş)")]
    [Tooltip("Pop-in süresi (tek obje)")]
    public float popInDuration = 0.16f;
    [Tooltip("Pop-in overshoot (biraz zıplat)")]
    public float popInOvershoot = 1.12f;
    [Tooltip("Girişte alfa 0 -> 1 yapılsın mı?")]
    public bool fadeIn = true;

    bool _busy;

    // ============== KAMU API ==============

    /// Verilen objeleri tek tek pop-out ile kaldırır. Bittiğinde onDone(true) çağrılır.
    public void PlayPopOut(List<GameObject> objects, Action<bool> onDone = null)
    {
        if (_busy) { onDone?.Invoke(false); return; }
        StartCoroutine(CoPopOut(objects, onDone));
    }

    /// Verilen objeleri tek tek pop-in ile sahneye getirir (aktif eder, scale 0 -> 1).
    /// Bittiğinde onDone(true) çağrılır.
    public void PlayPopIn(List<GameObject> objects, Action<bool> onDone = null)
    {
        if (_busy) { onDone?.Invoke(false); return; }
        StartCoroutine(CoPopIn(objects, onDone));
    }

    /// Kolay kullanım: önce eskileri kaldır, bitince callback ile haber ver (true).
    public void PlayTransition(List<GameObject> oldOnes, List<GameObject> newOnes, Action<bool> onAllDone = null)
    {
        if (_busy) { onAllDone?.Invoke(false); return; }
        StartCoroutine(CoPopOutThenIn(oldOnes, newOnes, onAllDone));
    }

    // ============== COROUTINES ==============

    IEnumerator CoPopOut(List<GameObject> objects, Action<bool> onDone)
    {
        _busy = true;

        var list = MakeWorkList(objects);
        foreach (var go in list)
        {
            if (!go) { yield return new WaitForSeconds(perItemDelay); continue; }

            // hedef bileşenler
            var rt = go.transform as RectTransform;
            var graphics = go.GetComponentsInChildren<Graphic>(includeInactive: true);

            // başlangıç state
            Vector3 startScale = rt ? rt.localScale : Vector3.one;

            // küçük bounce + sıfıra düş
            yield return StartCoroutine(ScaleBounceThenZero(rt, popOutOvershoot, popOutDuration));

            // alfa 0'a çek (isteğe bağlı)
            if (fadeOut && graphics != null)
                yield return StartCoroutine(FadeGraphics(graphics, 1f, 0f, popOutDuration * 0.75f));

            // destroy ya da inaktif yap
            if (destroyOnHide) Destroy(go);
            else
            {
                if (rt) rt.localScale = Vector3.zero;
                go.SetActive(false);
            }

            // ufak aralık
            if (perItemDelay > 0f) yield return new WaitForSeconds(perItemDelay);
        }

        _busy = false;
        onDone?.Invoke(true);
    }

    IEnumerator CoPopIn(List<GameObject> objects, Action<bool> onDone)
    {
        _busy = true;

        var list = MakeWorkList(objects);
        foreach (var go in list)
        {
            if (!go) { yield return new WaitForSeconds(perItemDelay); continue; }

            var rt = go.transform as RectTransform;
            var graphics = go.GetComponentsInChildren<Graphic>(includeInactive: true);

            // aktif et + scale 0'dan başlat
            go.SetActive(true);
            if (rt) rt.localScale = Vector3.zero;

            // alfa 0'a çek (fade-in için)
            if (fadeIn && graphics != null)
            {
                foreach (var g in graphics)
                {
                    var c = g.color;
                    g.color = new Color(c.r, c.g, c.b, 0f);
                }
            }

            // scale 0 -> overshoot -> 1
            yield return StartCoroutine(ScaleZeroToOneWithOvershoot(rt, popInOvershoot, popInDuration));

            // alfa 0 -> 1
            if (fadeIn && graphics != null)
                yield return StartCoroutine(FadeGraphics(graphics, 0f, 1f, popInDuration * 0.75f));

            if (perItemDelay > 0f) yield return new WaitForSeconds(perItemDelay);
        }

        _busy = false;
        onDone?.Invoke(true);
    }

    IEnumerator CoPopOutThenIn(List<GameObject> oldOnes, List<GameObject> newOnes, Action<bool> onAllDone)
    {
        bool ok = false;
        yield return StartCoroutine(CoPopOut(oldOnes, (r) => ok = r));
        if (!ok) { onAllDone?.Invoke(false); yield break; }

        ok = false;
        yield return StartCoroutine(CoPopIn(newOnes, (r) => ok = r));
        onAllDone?.Invoke(ok);
    }

    // ============== HELPERS ==============

    List<GameObject> MakeWorkList(List<GameObject> src)
    {
        var list = new List<GameObject>();
        if (src != null) list.AddRange(src);
        list.RemoveAll(item => item == null);
        if (randomOrder && list.Count > 1)
        {
            for (int i = 0; i < list.Count; i++)
            {
                int j = UnityEngine.Random.Range(i, list.Count);
                (list[i], list[j]) = (list[j], list[i]);
            }
        }
        return list;
    }

    IEnumerator FadeGraphics(Graphic[] graphics, float from, float to, float dur)
    {
        if (graphics == null || graphics.Length == 0) yield break;
        float t = 0f;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / dur);
            float a = Mathf.Lerp(from, to, k);
            for (int i = 0; i < graphics.Length; i++)
            {
                var g = graphics[i];
                if (!g) continue;
                var c = g.color;
                g.color = new Color(c.r, c.g, c.b, a);
            }
            yield return null;
        }
        // final değer
        for (int i = 0; i < graphics.Length; i++)
        {
            var g = graphics[i];
            if (!g) continue;
            var c = g.color;
            g.color = new Color(c.r, c.g, c.b, to);
        }
    }

    IEnumerator ScaleBounceThenZero(RectTransform rt, float overshoot, float dur)
    {
        if (!rt) yield break;

        // 0 -> overshoot -> 0 animi daha "pat" gibi hissettirir.
        float half = dur * 0.5f;

        // 0 -> overshoot
        Vector3 peak = Vector3.one * overshoot;
        float t = 0f;
        while (t < half)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / half);
            rt.localScale = Vector3.Lerp(Vector3.one, peak, k);
            yield return null;
        }

        // overshoot -> 0
        t = 0f;
        while (t < half)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / half);
            rt.localScale = Vector3.Lerp(peak, Vector3.zero, k);
            yield return null;
        }
        rt.localScale = Vector3.zero;
    }

    IEnumerator ScaleZeroToOneWithOvershoot(RectTransform rt, float overshoot, float dur)
    {
        if (!rt) yield break;

        float up = dur * 0.65f;
        float down = dur - up;

        Vector3 peak = Vector3.one * overshoot;

        // 0 -> overshoot
        float t = 0f;
        while (t < up)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / up);
            rt.localScale = Vector3.Lerp(Vector3.zero, peak, k);
            yield return null;
        }

        // overshoot -> 1
        t = 0f;
        while (t < down)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t / down);
            rt.localScale = Vector3.Lerp(peak, Vector3.one, k);
            yield return null;
        }
        rt.localScale = Vector3.one;
    }
}