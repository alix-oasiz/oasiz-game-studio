using UnityEngine;
using UnityEngine.UI;

[DefaultExecutionOrder(-1000)]
public class FixedPortraitAspect : MonoBehaviour
{
    public Vector2 targetAspect = new Vector2(9f, 16f);
    public bool enforceCameraViewport = true;
    public bool configureCanvasScaler = true;
    public bool fitCanvasToAspect = true;
    public Vector2 referenceResolution = new Vector2(1080f, 1920f);
    [Range(0f, 1f)] public float matchWidthOrHeight = 1f;

    int _w, _h;

    void OnEnable()
    {
        Apply();
    }

    void Update()
    {
        if (Screen.width != _w || Screen.height != _h)
        {
            Apply();
        }
    }

    void Apply()
    {
        _w = Screen.width;
        _h = Screen.height;

        if (enforceCameraViewport)
            ApplyCameraViewport();

        if (configureCanvasScaler)
            ConfigureCanvasScalers();

        if (fitCanvasToAspect)
            FitCanvasesToAspect();
    }

    void ApplyCameraViewport()
    {
        var cam = Camera.main;
        if (!cam) return;
        float target = targetAspect.x / targetAspect.y;
        float current = (float)Screen.width / Screen.height;
        if (current < target)
        {
            float w = current / target;
            float x = (1f - w) * 0.5f;
            cam.rect = new Rect(x, 0f, w, 1f);
        }
        else
        {
            float h = target / current;
            float y = (1f - h) * 0.5f;
            cam.rect = new Rect(0f, y, 1f, h);
        }
    }

    void ConfigureCanvasScalers()
    {
        var scalers = FindObjectsOfType<CanvasScaler>(true);
        foreach (var cs in scalers)
        {
            cs.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            cs.referenceResolution = referenceResolution;
            cs.screenMatchMode = CanvasScaler.ScreenMatchMode.MatchWidthOrHeight;
            cs.matchWidthOrHeight = matchWidthOrHeight;
        }
    }

    void FitCanvasesToAspect()
    {
        var canvases = FindObjectsOfType<Canvas>(true);
        float ratio = targetAspect.x / targetAspect.y;
        foreach (var c in canvases)
        {
            if (c.renderMode == RenderMode.WorldSpace) continue;
            var rt = c.GetComponent<RectTransform>();
            if (!rt) continue;
            var fitter = c.GetComponent<AspectRatioFitter>();
            if (!fitter) fitter = c.gameObject.AddComponent<AspectRatioFitter>();
            fitter.aspectMode = AspectRatioFitter.AspectMode.FitInParent;
            fitter.aspectRatio = ratio;
        }
    }
}

