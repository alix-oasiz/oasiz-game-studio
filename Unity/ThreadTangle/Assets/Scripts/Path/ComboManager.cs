using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// Hızlı ardışık pair commit'lerinde "KOMBO!" tetikler.
/// - PathDrawer.OnPairCommitted(pairId, path) event'ini dinler.
/// - İki commit arası süre comboWindow'dan kısaysa combo olur.
/// - Senin verdiğin Text prefabını spawnlayıp pop+fade yapar ve bonusu skora ekler.
[DisallowMultipleComponent]
public class ComboManager : MonoBehaviour
{
    [Header("Timing")]
    [Tooltip("İki pair commit'i arasındaki en fazla süre (sn). Bu süreden kısa ise KOMBO sayılır.")]
    public float comboWindow = 2.0f;

    [Tooltip("Combo için Time.unscaledTime kullanılsın mı? (önerilir)")]
    public bool useUnscaledTime = true;

    [Header("Scoring")]
    [Tooltip("İlk KOMBO için verilecek temel bonus.")]
    public int baseComboBonus = 30;

    [Tooltip("Streak büyüdükçe her ekstra KOMBO başına eklenecek ilave puan. (Örn: 10 => 1. KOMBO 30, 2. KOMBO 40, 3. KOMBO 50...)")]
    public int bonusPerExtraCombo = 10;

    [Tooltip("Bonuslar LevelScoreManager'a direkt eklenir.")]
    public bool addDirectlyToTotalScore = true;

    [Header("Visual")]
    [Tooltip("KOMBO yazısı için Text (Unity UI) prefab'ini ver.")]
    public GameObject comboTextPrefab;

    [Tooltip("Text'i hangi parent altında spawn'layalım? (genelde Canvas)")]
    public RectTransform spawnParent;

    [Tooltip("Spawn pozisyonu (anchored). Boşsa ortalanır.")]
    public Vector2 spawnAnchoredPos = new Vector2(0f, 0f);

    [Tooltip("Spawn pozisyonuna küçük rastgele sapma (px).")]
    public float randomJitter = 16f;

    [Tooltip("Pop+fade toplam süresi (sn).")]
    public float popupLifetime = 0.9f;

    [Tooltip("Pop tepe ölçeği çarpanı (startScale * bu).")]
    public float popupPeakScale = 1.15f;

    [Tooltip("Yukarı doğru kayma (px).")]
    public float popupRise = 48f;

    // runtime
    float _lastCommitTime = -9999f;
    int   _streak = 0;

    void Awake()
    {
        if (!spawnParent)
        {
            var canvas = FindFirstObjectByType<Canvas>();
            if (canvas) spawnParent = canvas.transform as RectTransform;
        }
    }

    void OnEnable()
    {
        PathDrawer.OnPairCommitted += HandlePairCommitted;
        PathDrawer.OnLevelComplete += HandleLevelEnded; // reset combo on level end
    }

    void OnDisable()
    {
        PathDrawer.OnPairCommitted -= HandlePairCommitted;
        PathDrawer.OnLevelComplete  -= HandleLevelEnded;
    }

    void HandlePairCommitted(int pairId, List<Cell> path)
    {
        float now = useUnscaledTime ? Time.unscaledTime : Time.time;
        float dt  = now - _lastCommitTime;

        if (dt >= 0f && dt <= Mathf.Max(0.01f, comboWindow))
        {
            // KOMBO!
            _streak = Mathf.Max(1, _streak) + 1; // ilk yakalamada 2, sonra 3,4...
            int comboIndex = _streak - 1;        // 1 => ilk kombo, 2 => ikinci kombo...

            int bonus = CalcBonus(comboIndex);
            ApplyBonus(bonus, comboIndex);
            SpawnComboText(comboIndex, bonus);
        }
        else
        {
            // yeni seri
            _streak = 1;
        }

        _lastCommitTime = now;
    }

    int CalcBonus(int comboIndex)
    {
        // comboIndex: 1 (ilk kombo), 2 (ikinci kombo) ...
        // Örn: base 30, perExtra 10 => 1. kombo 30, 2. kombo 40, 3. kombo 50...
        if (comboIndex <= 0) return 0;
        return baseComboBonus + (comboIndex - 1) * Mathf.Max(0, bonusPerExtraCombo);
    }

    void ApplyBonus(int bonus, int comboIndex)
    {
        if (bonus <= 0) return;

        var scorer = FindFirstObjectByType<LevelScoreManager>();
        if (!scorer)
        {
            Debug.LogWarning("[ComboManager] LevelScoreManager bulunamadı, bonus eklenemedi.");
            return;
        }

        if (addDirectlyToTotalScore)
        {
            // Toplama anında ekle (LevelScoreManager'daki basit API'yi kullanıyoruz)
            scorer.AwardBonus(bonus, alsoPopText: false, label: $"COMBO x{comboIndex}");
        }
        else
        {
            // Eğer bonusu 'o elin gained'ine katmak istiyorsan:
            // - Biriktirip LevelComplete'te ekleyecek mini bir cache de yapabilirsin.
            // Bu dal elde tutuldu.
            scorer.AwardBonus(bonus, alsoPopText: false, label: $"COMBO x{comboIndex}");
        }
    }

    void SpawnComboText(int comboIndex, int bonus)
    {
        if (!comboTextPrefab || !spawnParent) return;

        var go = Instantiate(comboTextPrefab, spawnParent);
        var rt = go.GetComponent<RectTransform>();
        if (!rt) rt = go.AddComponent<RectTransform>();

        // pozisyon
        Vector2 jitter = (randomJitter > 0f)
            ? new Vector2(Random.Range(-randomJitter, randomJitter), Random.Range(-randomJitter, randomJitter))
            : Vector2.zero;
        rt.anchoredPosition = spawnAnchoredPos + jitter;

        // yazı
        var uiText = go.GetComponent<Text>();
        if (uiText)
        {
            uiText.text = (comboIndex > 1)
                ? $"COMBO x{comboIndex}  +{bonus}"
                : $"COMBO!  +{bonus}";
        }
        // (TextMeshPro kullanıyorsan prefab'in TMP bileşeni içeriyorsa oradan metni set edersin.)

        // animasyon
        StartCoroutine(CoPopFadeDestroy(go, popupLifetime, popupPeakScale, popupRise));
    }

    IEnumerator CoPopFadeDestroy(GameObject go, float duration, float peakScale, float risePx)
    {
        if (!go) yield break;
        var rt = go.GetComponent<RectTransform>();
        var cg = go.GetComponent<CanvasGroup>();
        if (!cg) cg = go.AddComponent<CanvasGroup>();

        Vector3 startScale = rt.localScale;

        float t = 0f;
        float half = Mathf.Clamp(duration * 0.4f, 0.05f, duration - 0.05f);
        Vector2 startPos = rt.anchoredPosition;
        Vector2 endPos   = startPos + new Vector2(0f, Mathf.Max(0f, risePx));

        // Pop-in (1 -> peakScale)
        while (t < half)
        {
            t += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t / half);
            rt.localScale = startScale * Mathf.Lerp(1f, peakScale, k);
            cg.alpha = Mathf.Lerp(0f, 1f, k);
            rt.anchoredPosition = Vector2.LerpUnclamped(startPos, endPos, k * 0.5f);
            yield return null;
        }

        // Fade-out ve yukarı kayışın kalan kısmı
        float t2 = 0f;
        float d2 = Mathf.Max(0.01f, duration - half);
        while (t2 < d2)
        {
            t2 += useUnscaledTime ? Time.unscaledDeltaTime : Time.deltaTime;
            float k = Mathf.Clamp01(t2 / d2);
            rt.localScale = startScale * Mathf.Lerp(peakScale, 1f, k);
            cg.alpha = Mathf.Lerp(1f, 0f, k);
            rt.anchoredPosition = Vector2.LerpUnclamped(startPos + new Vector2(0, risePx*0.5f), endPos, k);
            yield return null;
        }

        Destroy(go);
    }
    void HandleLevelEnded(int _)
    {
        ResetCombo();
    }

    public void ResetCombo()
    {
        _streak = 0;
        _lastCommitTime = -9999f;
    }
}