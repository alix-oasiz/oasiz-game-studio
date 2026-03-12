using UnityEngine;
using UnityEngine.UI;

/// <summary>
/// UI objesinin Z rotasyonunu belirtilen aralıkta otomatik animasyonlar.
/// </summary>
[RequireComponent(typeof(RectTransform))]
public class UIRotateAnimator : MonoBehaviour
{
    [Header("Hedef UI Obj.")]
    [Tooltip("Rotasyonu animasyonlanacak RectTransform (boşsa bu objeyi alır)")]
    public RectTransform target;

    [Header("Rotasyon Aralığı (Z ekseni)")]
    [Tooltip("Minimum Z rotasyonu (derece)")]
    public float minZ = -10f;
    [Tooltip("Maksimum Z rotasyonu (derece)")]
    public float maxZ = 10f;

    [Header("Animasyon Ayarları")]
    [Tooltip("Tam bir ileri-geri tur süresi (sn)")]
    public float duration = 2.5f;
    [Tooltip("Ease eğrisi (0-1 arasında dönüş hareketini belirler)")]
    public AnimationCurve ease = AnimationCurve.EaseInOut(0, 0, 1, 1);
    [Tooltip("Animasyon tipi: PingPong = ileri-geri, Loop = sürekli döner")]
    public Mode animationMode = Mode.PingPong;

    [Tooltip("Time.unscaledDeltaTime kullan (UI menülerde önerilir)")]
    public bool useUnscaledTime = true;

    public enum Mode { PingPong, Loop }

    private float t;
    private bool forward = true;

    void Awake()
    {
        if (!target)
            target = GetComponent<RectTransform>();
    }

    void Update()
    {
        float dt = useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
        t += dt / Mathf.Max(0.0001f, duration);

        switch (animationMode)
        {
            case Mode.PingPong:
                float k = ease.Evaluate(Mathf.PingPong(t, 1f));
                float z = Mathf.Lerp(minZ, maxZ, k);
                target.localRotation = Quaternion.Euler(0f, 0f, z);
                break;

            case Mode.Loop:
                float angle = Mathf.Lerp(minZ, maxZ, Mathf.Repeat(t, 1f));
                target.localRotation = Quaternion.Euler(0f, 0f, angle);
                break;
        }
    }
}