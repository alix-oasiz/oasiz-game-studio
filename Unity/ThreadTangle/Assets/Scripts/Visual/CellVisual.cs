using System.Collections;
using UnityEngine;
using UnityEngine.UI;

[RequireComponent(typeof(Image))]
public class CellVisual : MonoBehaviour
{
    [Header("Bağlantılar")]
    public SpritePalette palette;
    public Image img;
    public CanvasGroup canvasGroup;

    [Header("Durum/Veri")]
    public bool isSpool;
    public int ownerId = -1;
    public bool isLockedPair;
    public bool isBlocked;
    public bool isConnectedSpool;

    [Header("Görsel")]
    [Range(0,1)] public float emptyAlpha = 0.08f;
    public float popOvershoot = 1.15f;
    public float popDur = 0.18f;

    RectTransform rt;

    void Reset(){ img = GetComponent<Image>(); }
    void Awake(){ if (!img) img = GetComponent<Image>(); rt = transform as RectTransform; }

    public void Init(bool isSpool, int ownerId, float emptyA)
    {
        this.isSpool = isSpool;
        this.ownerId = ownerId;
        emptyAlpha = emptyA;

        StopAllCoroutines();
        if (isSpool) SetSpoolIdleInstant(ownerId);
        else         SetEmptyInstant();
    }

    // ---------- INSTANT STATES (no anim) ----------
    void SetEmptyInstant()
    {
        isConnectedSpool = false; ownerId = -1;
        if (!img) return;
        if (palette) img.sprite = palette.emptyDiamond;
        var c = img.color; img.color = new Color(1f,1f,1f, emptyAlpha);
        img.material = null;
    }

    public void SetVisual(bool c)
    {
        if (!canvasGroup) return;
        canvasGroup.alpha = c ? 1f : 0f;
    }

    void SetSpoolIdleInstant(int pairId)
    {
        ownerId = pairId; isConnectedSpool = false;
        if (!img) return;
        if (palette) img.sprite = palette.GetColorSprite(pairId);
        img.color = Color.white;
        img.material = palette.GetMaterial(pairId);
    }

    // ---------- ANIMATED API ----------
    public void SetEmpty()
    {
        StopAllCoroutines();
        StartCoroutine(CoSetEmpty());
    }

    IEnumerator CoSetEmpty()
    {
        if (img && palette)
        {
            img.sprite = palette.emptyDiamond;
            img.material = null;
        }
        yield return StartCoroutine(SmoothTweens.ScalePunch(rt, popOvershoot, popDur));
        if (img) img.color = new Color(1f,1f,1f, emptyAlpha);
        ownerId = -1; isConnectedSpool = false;
    }

    public void SetPaintSprite(int pairId)
    {
        StopAllCoroutines();
        StartCoroutine(CoSetPaintSprite(pairId));
    }

    IEnumerator CoSetPaintSprite(int pairId)
    {
        ownerId = pairId;
        if (img && palette)
        {
            img.sprite = palette.GetColorSprite(pairId);
            img.material = palette.GetMaterial(pairId);
        }
        yield return StartCoroutine(SmoothTweens.ScalePunch(rt, popOvershoot, popDur));
        if (img) {img.color = Color.white; // opak
}
    }

    public void SetSpoolIdle(int pairId)
    {
        StopAllCoroutines();
        StartCoroutine(CoSetSpoolIdle(pairId));
    }

    IEnumerator CoSetSpoolIdle(int pairId)
    {
        ownerId = pairId; isConnectedSpool = false;
        if (img && palette) img.sprite = palette.GetColorSprite(pairId);
        if (img) img.color = Color.white;
        yield return StartCoroutine(SmoothTweens.RotateWiggle(rt, 8f, 0.20f)); // hafif wiggle
    }

    public void SetSpoolConnected(int pairId)
    {
        StopAllCoroutines();
        StartCoroutine(CoSetSpoolConnected(pairId));
    }

    IEnumerator CoSetSpoolConnected(int pairId)
    {
        ownerId = pairId; isConnectedSpool = true; isLockedPair = true;
        if (img && palette) img.sprite = palette.GetColorSprite(pairId);
        if (img) img.color = Color.white;
        // büyükçe bir punch
        yield return StartCoroutine(SmoothTweens.ScalePunch(rt, 1.25f, 0.22f));
    }

    public void SetLocked(bool locked) => isLockedPair = locked;

    // ufak yardımcı – bağ dalgasında çağırırız
    public void Pulse(float overshoot=1.12f, float dur=0.14f)
    {
        StopCoroutine("CoPulse");
        StartCoroutine(CoPulse(overshoot, dur));
    }
    
    public void SetBlocked()
    {
        isBlocked = true;
        if (img) img.sprite = palette.blockSprite;
        img.color += new Color(0, 0, 0, 999);
        img.material = null;
    }

    IEnumerator CoPulse(float overshoot, float dur)
    {
        yield return SmoothTweens.ScalePunch(rt, overshoot, dur);
    }
}