using System.Collections;
using UnityEngine;
using UnityEngine.UI;

namespace UI
{
public class RetroFlashEffect : MonoBehaviour
{
    private static RetroFlashEffect _instance;
    public static void Trigger()
    {
        if (_instance == null)
        {
            var go = new GameObject("RetroFlashEffectOverlay");
            DontDestroyOnLoad(go);
            _instance = go.AddComponent<RetroFlashEffect>();
            _instance.BuildOverlay();
        }
        _instance.Play();
    }

    [Header("Durations")]
    [SerializeField] private float flashIn = 0.05f;
    [SerializeField] private float flashHold = 0.05f;
    [SerializeField] private float flashOut = 0.15f;
    [SerializeField] private float neonDuration = 0.35f;
    [SerializeField] private float scanlineDuration = 0.3f;
    [SerializeField] private float vignetteDuration = 0.3f;
    [SerializeField] private float bloomDuration = 0.3f;

    [Header("Colors")]
    [SerializeField] private Color flashColor = Color.white;
    [SerializeField] private Color[] neonColors = new[] { new Color(1f, 0.2f, 0.8f), new Color(0.2f, 1f, 1f), new Color(0.7f, 0.2f, 1f) };
    [SerializeField] private Color bloomColor = new Color(1f, 0.9f, 1f, 1f);

    private Canvas canvas;
    private RectTransform container;
    private Image flashLayer;
    private Image scanlineLayer;
    private Image vignetteLayer;
    private Image bloomLayer;
    private Image neonTop, neonBottom, neonLeft, neonRight;

    private void BuildOverlay()
    {
        canvas = gameObject.AddComponent<Canvas>();
        canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        canvas.sortingOrder = short.MaxValue;
        gameObject.AddComponent<CanvasGroup>();
        container = new GameObject("Container", typeof(RectTransform)).GetComponent<RectTransform>();
        container.SetParent(transform, false);
        container.anchorMin = Vector2.zero; container.anchorMax = Vector2.one; container.offsetMin = Vector2.zero; container.offsetMax = Vector2.zero;

        flashLayer = CreateImage("Flash", flashColor, 0f);
        scanlineLayer = CreateImage("Scanlines", new Color(1f,1f,1f,0f), 0f);
        vignetteLayer = CreateImage("Vignette", new Color(0f,0f,0f,0f), 0f);
        bloomLayer = CreateImage("Bloom", bloomColor, 0f);

        neonTop = CreateNeonBar("NeonTop");
        neonBottom = CreateNeonBar("NeonBottom");
        neonLeft = CreateNeonBar("NeonLeft");
        neonRight = CreateNeonBar("NeonRight");

        PositionBars();
        GenerateScanlinesTexture();
        GenerateVignetteTexture();
        GenerateBloomTexture();
    }

    private Image CreateImage(string name, Color color, float alpha)
    {
        var go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        var rt = go.GetComponent<RectTransform>();
        rt.SetParent(container, false);
        rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one; rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
        var img = go.GetComponent<Image>();
        img.color = new Color(color.r, color.g, color.b, alpha);
        return img;
    }

    private Image CreateNeonBar(string name)
    {
        var go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
        var rt = go.GetComponent<RectTransform>();
        rt.SetParent(container, false);
        var img = go.GetComponent<Image>();
        img.color = new Color(1f, 1f, 1f, 0f);
        return img;
    }

    private void PositionBars()
    {
        float thickness = 8f;
        SetBar(neonTop.rectTransform, new Vector2(0,1), new Vector2(1,1), new Vector2(0, -thickness), new Vector2(0,0));
        SetBar(neonBottom.rectTransform, new Vector2(0,0), new Vector2(1,0), new Vector2(0,0), new Vector2(0, thickness));
        SetBar(neonLeft.rectTransform, new Vector2(0,0), new Vector2(0,1), new Vector2(0,0), new Vector2(thickness,0));
        SetBar(neonRight.rectTransform, new Vector2(1,0), new Vector2(1,1), new Vector2(-thickness,0), new Vector2(0,0));
    }

    private void SetBar(RectTransform rt, Vector2 aMin, Vector2 aMax, Vector2 offMin, Vector2 offMax)
    {
        rt.anchorMin = aMin; rt.anchorMax = aMax; rt.offsetMin = offMin; rt.offsetMax = offMax;
    }

    private void GenerateScanlinesTexture()
    {
        int h = Mathf.RoundToInt(Screen.height);
        int w = Mathf.RoundToInt(Screen.width);
        var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
        tex.filterMode = FilterMode.Point;
        // Simple stripes via Image's material tiling
        var mat = new Material(Shader.Find("UI/Default"));
        scanlineLayer.material = mat;
        scanlineLayer.type = Image.Type.Tiled;
        scanlineLayer.sprite = Sprite.Create(tex, new Rect(0,0,2,2), new Vector2(0.5f,0.5f));
        // pixels: top row darker, bottom row transparent
        tex.SetPixel(0,0, new Color(0f,0f,0f,0.2f)); tex.SetPixel(1,0, new Color(0f,0f,0f,0.2f));
        tex.SetPixel(0,1, new Color(0f,0f,0f,0f)); tex.SetPixel(1,1, new Color(0f,0f,0f,0f));
        tex.Apply();
    }

    private void GenerateVignetteTexture()
    {
        int size = 256;
        var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
        tex.wrapMode = TextureWrapMode.Clamp;
        var center = new Vector2(size/2f, size/2f);
        for (int y=0; y<size; y++)
        for (int x=0; x<size; x++)
        {
            float d = Vector2.Distance(new Vector2(x,y), center) / (size*0.6f);
            float a = Mathf.Clamp01(d);
            tex.SetPixel(x,y, new Color(0f,0f,0f,a));
        }
        tex.Apply();
        vignetteLayer.sprite = Sprite.Create(tex, new Rect(0,0,size,size), new Vector2(0.5f,0.5f));
        vignetteLayer.type = Image.Type.Sliced;
        vignetteLayer.color = new Color(1f,1f,1f,0f);
    }

    private void GenerateBloomTexture()
    {
        int size = 256;
        var tex = new Texture2D(size, size, TextureFormat.RGBA32, false);
        tex.wrapMode = TextureWrapMode.Clamp;
        var center = new Vector2(size/2f, size/2f);
        for (int y=0; y<size; y++)
        for (int x=0; x<size; x++)
        {
            float d = Vector2.Distance(new Vector2(x,y), center) / (size*0.5f);
            float a = Mathf.Clamp01(1f - d);
            tex.SetPixel(x,y, new Color(bloomColor.r, bloomColor.g, bloomColor.b, a));
        }
        tex.Apply();
        bloomLayer.sprite = Sprite.Create(tex, new Rect(0,0,size,size), new Vector2(0.5f,0.5f));
        bloomLayer.type = Image.Type.Simple;
        bloomLayer.color = new Color(bloomColor.r, bloomColor.g, bloomColor.b, 0f);
    }

    public void Play()
    {
        StopAllCoroutines();
        StartCoroutine(PlayRoutine());
    }

    private IEnumerator PlayRoutine()
    {
        // Base flash
        flashLayer.color = new Color(flashColor.r, flashColor.g, flashColor.b, 0f);
        float t = 0f;
        while (t < flashIn)
        {
            t += Time.unscaledDeltaTime;
            float p = Mathf.Clamp01(t/flashIn);
            flashLayer.color = new Color(flashColor.r, flashColor.g, flashColor.b, p);
            yield return null;
        }
        yield return new WaitForSecondsRealtime(flashHold);
        t = 0f;
        while (t < flashOut)
        {
            t += Time.unscaledDeltaTime;
            float p = Mathf.Clamp01(t/flashOut);
            flashLayer.color = new Color(flashColor.r, flashColor.g, flashColor.b, 1f-p);
            yield return null;
        }

        // Neon bars color cycle
        StartCoroutine(NeonRoutine());
        // Scanlines pulse
        StartCoroutine(ScanlinesRoutine());
        // Vignette fade
        StartCoroutine(VignetteRoutine());
        // Bloom pulse
        StartCoroutine(BloomRoutine());
        // CRT jitter
        StartCoroutine(JitterRoutine());
    }

    private IEnumerator NeonRoutine()
    {
        float t = 0f; int i = 0;
        while (t < neonDuration)
        {
            t += Time.unscaledDeltaTime;
            i = (i+1) % neonColors.Length;
            var c = neonColors[i]; c.a = Mathf.Lerp(0f, 0.8f, EaseOutQuad(Mathf.Clamp01(t / (neonDuration*0.5f))));
            neonTop.color = c; neonBottom.color = c; neonLeft.color = c; neonRight.color = c;
            yield return null;
        }
        var off = new Color(1f,1f,1f,0f);
        neonTop.color = off; neonBottom.color = off; neonLeft.color = off; neonRight.color = off;
    }

    private IEnumerator ScanlinesRoutine()
    {
        float t = 0f;
        while (t < scanlineDuration)
        {
            t += Time.unscaledDeltaTime;
            float a = Mathf.Lerp(0f, 0.25f, Mathf.Sin(t * 18f) * 0.5f + 0.5f);
            scanlineLayer.color = new Color(1f,1f,1f,a);
            yield return null;
        }
        scanlineLayer.color = new Color(1f,1f,1f,0f);
    }

    private IEnumerator VignetteRoutine()
    {
        float t = 0f;
        while (t < vignetteDuration)
        {
            t += Time.unscaledDeltaTime;
            float a = Mathf.Lerp(0f, 0.35f, EaseOutQuad(Mathf.Clamp01(t/vignetteDuration)));
            vignetteLayer.color = new Color(1f,1f,1f,a);
            yield return null;
        }
        t = 0f;
        while (t < 0.2f)
        {
            t += Time.unscaledDeltaTime;
            float a = Mathf.Lerp(0.35f, 0f, EaseInQuad(Mathf.Clamp01(t/0.2f)));
            vignetteLayer.color = new Color(1f,1f,1f,a);
            yield return null;
        }
        vignetteLayer.color = new Color(1f,1f,1f,0f);
    }

    private IEnumerator BloomRoutine()
    {
        float t = 0f; float dur = bloomDuration;
        var rt = bloomLayer.rectTransform; rt.localScale = Vector3.one * 0.8f;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float p = Mathf.Clamp01(t/dur);
            float a = Mathf.Lerp(0.25f, 0f, p);
            float s = Mathf.Lerp(0.8f, 1.1f, EaseOutQuad(p));
            bloomLayer.color = new Color(bloomColor.r, bloomColor.g, bloomColor.b, a);
            rt.localScale = new Vector3(s,s,1f);
            yield return null;
        }
        bloomLayer.color = new Color(bloomColor.r, bloomColor.g, bloomColor.b, 0f);
        rt.localScale = Vector3.one;
    }

    private IEnumerator JitterRoutine()
    {
        var rt = container;
        float t = 0f; float dur = 0.35f;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float s = 1f + Mathf.Sin(t*24f) * 0.01f;
            float r = Mathf.Sin(t*18f) * 0.5f;
            rt.localScale = new Vector3(s,s,1f);
            rt.localRotation = Quaternion.Euler(0f,0f,r);
            yield return null;
        }
        rt.localScale = Vector3.one;
        rt.localRotation = Quaternion.identity;
    }

    private float EaseOutQuad(float x) => 1f - (1f - x) * (1f - x);
    private float EaseInQuad(float x) => x * x;
}
}

