using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

/// ThreadTangle – Üst bantta retro "çöp adam vs bot" dövüşü.
/// - İki fighter spawn + HP bar
/// - 4 farklı atak: Jab, Hook, Kick, Uppercut (random seçilir)
/// - Eşleştirme (PathDrawer.OnPairCommitted) => PlayerAttack()
/// - Undo çağrıldığında NotifyUndo() => Player 2 hit yer
/// - LevelComplete => küçük heal (yüzde ya da sabit)
/// - Procedural stickman (UI Image parçaları) + glow rengi (URP Bloom ile parıldar)
/// - RetroFXOrchestrator varsa pulse/shake tetikler
///
/// KURULUM
/// 1) Canvas altında boş GameObject → FightArena.cs ekle.
/// 2) "fightLayer" alanına üstte görünecek bir RectTransform ver (vermezsen kendisi oluşturur).
/// 3) Undo butonuna tıklandığında FightArena.NotifyUndo() çağır.
/// 4) Ayarları Inspector’dan kurcala.
///
[DefaultExecutionOrder(-50)]
public class FightArena : MonoBehaviour
{
    public static FightArena Instance;

    [Header("Layout")]
    public RectTransform fightLayer;       // Üst şerit; boşsa Canvas altında otomatik yapılır
    public Vector2 arenaSize = new Vector2(900, 220);
    [Range(0f,1f)] public float topAnchorY = 0.92f; // ekranın üst kısmı

    [Header("Fighters")]
    public Color playerGlow = Color.white;
    public Color enemyGlow  = new Color(1f, 0.25f, 0.25f, 1f);
    public int playerMaxHP = 100;
    public int enemyMaxHP  = 100;

    [Tooltip("Prosedürel çöp adam kur (asset gerekmez). Kaparsan kendi sprite'larını/animini atarsın.")]
    public bool proceduralStickman = true;

    [Header("Mode")]
    [Tooltip("Stickman yerine iki havalı kare ile dövüş")]
    public bool squareBrawlers = true;

    [Header("Damage / Heal")]
    public Vector2Int playerHitRange = new Vector2Int(10, 16); // eşleştirmede vurduğumuz hasar
    public Vector2Int enemyHitRange  = new Vector2Int(7, 12);  // bize gelen hasar (undo, vb.)
    [Tooltip("Undo başına kaç darbe yersin")]
    public int hitsOnUndo = 2;

    [Tooltip("Level bittiğinde can kazan (yüzde). Örn 0.12 = %12")]
    [Range(0f, 0.5f)] public float healPercentOnLevel = 0.12f;
    [Tooltip("Yüzde yerine sabit miktar ekle (0 ise yok).")]
    public int healFlatOnLevel = 0;

    [Header("FX")]
    public float attackTime = 0.28f;
    public float recoilTime = 0.18f;
    public float lungeDistance = 42f;
    [Tooltip("HP bar rengi parıldasın mı (URP Bloom için HDR tonlar)")]
    public bool emissiveHP = true;

    [Header("Glow Materials")]
    [Tooltip("Player glow Image'ına uygulanacak materyal (UI/URP compatible shader)")]
    public Material playerGlowMat;
    [Tooltip("Enemy glow Image'ına uygulanacak materyal (UI/URP compatible shader)")]
    public Material enemyGlowMat;

    [Header("Glow")]
    [Tooltip("Arka aura sürekli hafif nefes alıp versin mi?")]
    public bool glowPulse = true;
    [Range(0f,1f)] public float glowBaseAlpha = 0.35f;
    [Range(0f,1f)] public float glowPulseAlpha = 0.15f; // base'e eklenecek miktar
    [Range(0f,0.6f)] public float glowPulseScale = 0.12f; // ölçek salınımı oranı
    [Range(0.1f,3f)] public float glowPulseSpeed = 0.9f;

    [Tooltip("Vurulduğunda kısa süreli ekstra parıltı")]
    [Range(0f,1f)] public float hitGlowBoostAlpha = 0.35f;
    [Range(0f,0.8f)] public float hitGlowScale = 0.25f;
    [Range(0.04f,0.5f)] public float hitGlowTime = 0.12f;

    [Header("Square Anim")]
    [Tooltip("Kareler için daha estetik atak zamanlamaları (anticipate/strike/settle)")]
    public float squareAnticipate = 0.08f;
    public float squareStrike     = 0.16f;
    public float squareSettle     = 0.12f;

    [Tooltip("Saldırıya göre dönüş miktarları")] 
    public float spinJab   = 22f;
    public float spinHook  = 48f;
    public float spinKick  = -34f;
    public float spinUpper = 56f;

    [Tooltip("Saldırıya göre squash/stretch hedefleri (x,y)")]
    public Vector2 squashJab   = new Vector2(1.28f, 0.82f);
    public Vector2 squashHook  = new Vector2(1.34f, 0.78f);
    public Vector2 squashKick  = new Vector2(1.22f, 0.86f);
    public Vector2 squashUpper = new Vector2(0.86f, 1.24f);

    [Tooltip("Trail (ghost) ayarları – kare arkasında iz efekti")]
    [Range(0, 8)] public int   trailCount   = 3;
    [Range(0.001f, 0.08f)] public float trailSpacing = 0.015f;
    [Range(0f, 1f)] public float trailAlpha = 0.22f;

    [Tooltip("Vuruş anında kareye kısa renk flaşı")] 
    public Color squareHitFlash = new Color(1f, 1f, 1f, 0.65f);

    // glow coroutine takibi
    readonly Dictionary<Fighter, Coroutine> _idleGlowCo = new();

    // ==== Procedural head sprite cache ====
    static Sprite _cachedCircleSprite;
    static Sprite GetCircleSprite(int size = 64)
    {
        if (_cachedCircleSprite) return _cachedCircleSprite;
        size = Mathf.Max(8, size);
        var tex = new Texture2D(size, size, TextureFormat.RGBA32, false, true);
        tex.filterMode = FilterMode.Bilinear;
        tex.wrapMode = TextureWrapMode.Clamp;

        var cols = new Color32[size * size];
        float r  = (size - 1) * 0.5f;
        float rr = r * r;
        float edge = Mathf.Max(1f, size * 0.08f); // soft edge
        float innerR = r - edge;
        float innerRR = innerR * innerR;

        for (int y = 0; y < size; y++)
        for (int x = 0; x < size; x++)
        {
            float dx = x - r;
            float dy = y - r;
            float d2 = dx * dx + dy * dy;
            byte a;
            if (d2 <= innerRR) a = 255;
            else if (d2 >= rr) a = 0;
            else
            {
                float k = Mathf.InverseLerp(rr, innerRR, d2);
                a = (byte)Mathf.RoundToInt(Mathf.SmoothStep(0f, 1f, k) * 255f);
            }
            cols[y * size + x] = new Color32(255, 255, 255, a);
        }
        tex.SetPixels32(cols); tex.Apply();

        _cachedCircleSprite = Sprite.Create(tex, new Rect(0,0,size,size), new Vector2(0.5f,0.5f), 100f, 0, SpriteMeshType.FullRect);
        _cachedCircleSprite.name = "ProcCircle_Head";
        return _cachedCircleSprite;
    }

    // ===== State =====
    Fighter _player, _enemy;
    bool _busy;

    // ===== Static API (Undo için) =====
    public static void NotifyUndo()
    {
        if (Instance) Instance.OnUndoReceived();
    }

    void Awake()
    {
        if (Instance && Instance != this) { Destroy(gameObject); return; }
        Instance = this;
        DontDestroyOnLoad(gameObject);
    }

    void OnEnable()
    {
        TryHookPathDrawerEvents(true);
        EnsureLayer();
        if (_player == null || _enemy == null) BuildArena();
    }

    void OnDisable()
    {
        TryHookPathDrawerEvents(false);
    }

    void OnDestroy()
    {
        TryHookPathDrawerEvents(false);
        if (Instance == this) Instance = null;
    }

    // ===== Event köprüleri =====
    void TryHookPathDrawerEvents(bool sub)
    {
        try
        {
            if (sub)
            {
                PathDrawer.OnPairCommitted += OnPairCommitted;           // eşleştirme -> bizim saldırı
                PathDrawer.OnLevelComplete += OnLevelCompleteHeal;       // level bitince heal
            }
            else
            {
                PathDrawer.OnPairCommitted -= OnPairCommitted;
                PathDrawer.OnLevelComplete -= OnLevelCompleteHeal;
            }
        }
        catch { /* projede yoksa sorun değil */ }
    }

    void OnPairCommitted(int pairId, List<Cell> path)
    {
        if (!_busy) StartCoroutine(CoPlayerAttack());
    }

    void OnLevelCompleteHeal(int usedTiles)
    {
        int heal = Mathf.RoundToInt(playerMaxHP * healPercentOnLevel) + healFlatOnLevel;
        Heal(_player, heal);
    }

    void OnUndoReceived()
    {
        if (_busy) return;
        StartCoroutine(CoEnemyCombo(hitsOnUndo));
    }

    // ===== Build =====
    void EnsureLayer()
    {
        if (fightLayer) return;
        // Canvas bul
        var canvas = FindObjectOfType<Canvas>();
        if (!canvas)
        {
            var cgo = new GameObject("Canvas", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvas = cgo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        }
        // üst şerit panel
        var go = new GameObject("FightLayer", typeof(RectTransform), typeof(CanvasRenderer));
        fightLayer = go.GetComponent<RectTransform>();
        go.transform.SetParent(canvas.transform, false);
        fightLayer.anchorMin = new Vector2(0.5f, topAnchorY);
        fightLayer.anchorMax = new Vector2(0.5f, topAnchorY);
        fightLayer.pivot = new Vector2(0.5f, 0.5f);
        fightLayer.sizeDelta = arenaSize;
        fightLayer.anchoredPosition = Vector2.zero;
    }

    void BuildArena()
    {
        // Player
        _player = new Fighter("Player", fightLayer, true,  squareBrawlers, playerGlow, emissiveHP ? playerGlow * 6f : playerGlow, playerMaxHP);
        // Enemy (sağda)
        _enemy  = new Fighter("Enemy",  fightLayer, false, squareBrawlers, enemyGlow,  emissiveHP ? enemyGlow * 6f  : enemyGlow,  enemyMaxHP);

        // Pozisyonlar
        _player.root.anchoredPosition = new Vector2(-arenaSize.x * 0.28f, 0);
        _enemy.root.anchoredPosition  = new Vector2( arenaSize.x * 0.28f,  0);
        FaceEachOther();

        // Glow materyallerini uygula (Inspector'dan seçilecek)
        if (playerGlowMat && _player.glow) _player.glow.material = playerGlowMat;
        if (enemyGlowMat  && _enemy.glow)  _enemy.glow .material = enemyGlowMat;

        // Glow ayarla
        SetupGlow(_player, playerGlow);
        SetupGlow(_enemy,  enemyGlow);
    }

    void FaceEachOther()
    {
        // sola bakan = +X scale; sağa bakan = -X scale (UI için yansıma)
        _player.model.localScale = new Vector3( 1,1,1);
        _enemy .model.localScale = new Vector3(-1,1,1);
    }

    void SetupGlow(Fighter f, Color glowTint)
    {
        if (f == null || f.glow == null) return;
        // temel alpha
        var c = glowTint; c.a = glowBaseAlpha;
        f.glow.color = c;
        // varsa eski coroutine'i durdur
        if (_idleGlowCo.TryGetValue(f, out var co) && co != null) StopCoroutine(co);
        if (glowPulse)
            _idleGlowCo[f] = StartCoroutine(CoIdleGlow(f, glowTint));
    }

    IEnumerator CoIdleGlow(Fighter f, Color tint)
    {
        if (f == null || f.glow == null) yield break;
        var rt = f.glow.rectTransform;
        var baseScale = rt.localScale;
        float t = 0f;
        while (isActiveAndEnabled && f.root && f.root.gameObject.activeInHierarchy)
        {
            t += Time.unscaledDeltaTime * glowPulseSpeed;
            float s = 1f + glowPulseScale * (Mathf.Sin(t) * 0.5f + 0.5f);
            rt.localScale = baseScale * s;

            float a = glowBaseAlpha + glowPulseAlpha * (Mathf.Sin(t * 1.2f) * 0.5f + 0.5f);
            var c = tint; c.a = a;
            f.glow.color = c;
            yield return null;
        }
        // çıkarken temel değerlere geri al
        rt.localScale = baseScale;
        var back = tint; back.a = glowBaseAlpha;
        f.glow.color = back;
    }

    IEnumerator CoGlowBurst(Fighter f)
    {
        if (f == null || f.glow == null) yield break;
        var rt = f.glow.rectTransform;
        var s0 = rt.localScale;
        var c0 = f.glow.color;
        var boost = c0; boost.a = Mathf.Clamp01(c0.a + hitGlowBoostAlpha);

        float t = 0f; float dur = Mathf.Max(0.0001f, hitGlowTime);
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.SmoothStep(0,1,t/dur);
            rt.localScale = Vector3.Lerp(s0, s0 * (1f + hitGlowScale), k);
            f.glow.color = Color.Lerp(c0, boost, k);
            yield return null;
        }
        // geri dön
        t = 0f;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.SmoothStep(0,1,t/dur);
            rt.localScale = Vector3.Lerp(s0 * (1f + hitGlowScale), s0, k);
            f.glow.color = Color.Lerp(boost, c0, k);
            yield return null;
        }
        rt.localScale = s0;
        f.glow.color = c0;
    }

    // Kare modunda ghost trail efekti
    IEnumerator CoSquareTrails(Fighter f, float totalTime)
    {
        if (f == null || f.core == null || trailCount <= 0 || trailAlpha <= 0f) yield break;
        float elapsed = 0f;
        int made = 0;
        while (elapsed < totalTime && made < trailCount)
        {
            elapsed += trailSpacing;
            yield return new WaitForSecondsRealtime(trailSpacing);
            made++;
            // create ghost
            var ghost = new GameObject("Trail", typeof(RectTransform), typeof(Image));
            ghost.transform.SetParent(f.model, false);
            var grt = ghost.GetComponent<RectTransform>();
            var gimg = ghost.GetComponent<Image>();
            grt.sizeDelta = f.core.rectTransform.sizeDelta;
            grt.anchoredPosition = f.core.rectTransform.anchoredPosition;
            grt.localRotation = f.core.rectTransform.localRotation;
            grt.localScale = f.core.rectTransform.localScale;
            gimg.raycastTarget = false;
            gimg.material = f.core.material; // aynı materyal
            var baseCol = f.core.color; baseCol.a = trailAlpha;
            gimg.color = baseCol;
            // fade out
            StartCoroutine(CoFadeAndKill(gimg, 0.18f));
        }
    }

    IEnumerator CoFadeAndKill(Image img, float dur)
    {
        if (!img) yield break;
        float t = 0f; var c0 = img.color;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.Clamp01(t/dur);
            var c = c0; c.a = Mathf.Lerp(c0.a, 0f, k);
            img.color = c;
            yield return null;
        }
        if (img) Destroy(img.gameObject);
    }

    // ===== Combat =====
    IEnumerator CoPlayerAttack()
    {
        _busy = true;
        var atk = RandomAttack();
        yield return StartCoroutine(DoAttack(_player, _enemy, atk));
        if (IsDead(_enemy)) { OnEnemyDead(); yield break; }
        _busy = false;
    }

    IEnumerator CoEnemyCombo(int hits)
    {
        _busy = true;
        for (int i = 0; i < hits; i++)
        {
            var atk = RandomAttack();
            yield return StartCoroutine(DoAttack(_enemy, _player, atk, true));
            if (IsDead(_player)) { OnPlayerDead(); yield break; }
            yield return new WaitForSecondsRealtime(0.05f);
        }
        _busy = false;
    }

    enum AttackType { Jab, Hook, Kick, Uppercut }

    AttackType RandomAttack()
    {
        int r = Random.Range(0, 4);
        return (AttackType)r;
    }

    IEnumerator DoAttack(Fighter attacker, Fighter victim, AttackType type, bool enemyColorHit = false)
    {
        // hafif lunge
        var start = attacker.root.anchoredPosition;
        var target = start + new Vector2(attacker.isPlayer ? lungeDistance : -lungeDistance, 0);
        yield return LerpPos(attacker.root, start, target, attackTime * 0.5f);

        // anim parça (kol/bacak açıları)
        yield return PlayMove(attacker, type, attackTime * 0.5f);

        // hasar uygula
        int dmg = (attacker.isPlayer)
            ? Random.Range(playerHitRange.x, playerHitRange.y + 1)
            : Random.Range(enemyHitRange.x,  enemyHitRange.y  + 1);

        Damage(victim, dmg);

        // FX + victim reaction
        RetroFXOrchestrator.PulseSmall();
        yield return StartCoroutine(CoVictimHit(victim));

        // geri çekil
        yield return LerpPos(attacker.root, attacker.root.anchoredPosition, start, recoilTime);
    }

    IEnumerator LerpPos(RectTransform rt, Vector2 from, Vector2 to, float dur)
    {
        float t = 0f; dur = Mathf.Max(0.0001f, dur);
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.SmoothStep(0, 1, t / dur);
            rt.anchoredPosition = Vector2.LerpUnclamped(from, to, k);
            yield return null;
        }
        rt.anchoredPosition = to;
    }

    IEnumerator CoVictimHit(Fighter victim, float knock = 18f, float flash = 0.06f)
    {
        if (victim == null) yield break;
        var startPos = victim.root.anchoredPosition;
        var to = startPos + new Vector2(victim.isPlayer ? -knock : knock, 0);
        float t = 0f; float dur = 0.08f;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.SmoothStep(0,1,t/dur);
            victim.root.anchoredPosition = Vector2.LerpUnclamped(startPos, to, k);
            yield return null;
        }
        t = 0f; dur = 0.10f;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.SmoothStep(0,1,t/dur);
            victim.root.anchoredPosition = Vector2.LerpUnclamped(to, startPos, k);
            yield return null;
        }
        victim.root.anchoredPosition = startPos;

        // vurulma parıltısı
        StartCoroutine(CoGlowBurst(victim));

        if (victim.glow)
        {
            var c0 = victim.glow.color;
            victim.glow.color = new Color(1f, 1f, 1f, Mathf.Clamp01(c0.a + 0.5f));
            yield return new WaitForSecondsRealtime(flash);
            victim.glow.color = c0;
        }
    }

    IEnumerator PlayMove(Fighter f, AttackType type, float dur)
    {
        // Kare animasyonu: gelişmiş anticipate/strike/settle + trail + hit flash
        if (f.square)
        {
            // parametreleri saldırı tipine göre seç
            float rotTgt = 0f; Vector2 sqTgt = Vector2.one;
            switch (type)
            {
                case AttackType.Jab:      rotTgt = spinJab;   sqTgt = squashJab;   break;
                case AttackType.Hook:     rotTgt = spinHook;  sqTgt = squashHook;  break;
                case AttackType.Kick:     rotTgt = spinKick;  sqTgt = squashKick;  break;
                case AttackType.Uppercut: rotTgt = spinUpper; sqTgt = squashUpper; break;
            }

            var startS = f.model.localScale;
            var startR = f.model.localRotation;

            // 1) Anticipation (tersine küçük hazırlık)
            float aDur = Mathf.Max(0.0001f, squareAnticipate);
            float tA = 0f;
            while (tA < aDur)
            {
                tA += Time.unscaledDeltaTime;
                float k = Mathf.SmoothStep(0,1,tA/aDur);
                float y = Mathf.Sin(k * Mathf.PI * 0.5f); // yumuşak yaklaşım
                var s = Vector3.Lerp(startS, new Vector3(startS.x * (2f - sqTgt.x), startS.y * (2f - sqTgt.y), 1f), y * 0.35f);
                f.model.localScale = s;
                f.model.localRotation = Quaternion.Euler(0,0, Mathf.Lerp(0, -rotTgt * 0.35f, y)) * startR;
                yield return null;
            }

            // 2) Strike (esas darbe)
            float sDur = Mathf.Max(0.0001f, squareStrike);
            // iz efektini eşzamanlı başlat
            StartCoroutine(CoSquareTrails(f, sDur));
            float tS = 0f;
            while (tS < sDur)
            {
                tS += Time.unscaledDeltaTime;
                float k = Mathf.SmoothStep(0,1,tS/sDur);
                float y = Mathf.Sin(k * Mathf.PI); // hızlı çıkış–hızlı dönüş
                var s = Vector3.Lerp(startS, new Vector3(startS.x * sqTgt.x, startS.y * sqTgt.y, 1f), y);
                f.model.localScale = s;
                f.model.localRotation = Quaternion.Euler(0,0, Mathf.Lerp(0, rotTgt, y)) * startR;
                yield return null;
            }
            // vuruş anında kareye kısa flaş (renk)
            if (f.core)
            {
                var c0 = f.core.color;
                f.core.color = squareHitFlash;
                yield return new WaitForSecondsRealtime(0.035f);
                f.core.color = c0;
            }

            // 3) Settle (Eski haline dön)
            float zDur = Mathf.Max(0.0001f, squareSettle);
            float tZ = 0f;
            while (tZ < zDur)
            {
                tZ += Time.unscaledDeltaTime;
                float k = Mathf.SmoothStep(0,1,tZ/zDur);
                f.model.localScale = Vector3.Lerp(f.model.localScale, startS, k);
                f.model.localRotation = Quaternion.Slerp(f.model.localRotation, startR, k);
                yield return null;
            }
            f.model.localScale = startS;
            f.model.localRotation = startR;
            yield break;
        }
        // basit açı animleri – procedural kemikler
        // soldan sağa bakıyormuş gibi düşünülerek yazıldı; enemy scale -1 olduğu için yansıyacaktır.
        float t = 0f;
        float armJab = 65f, armHook = 110f, armUpper = 130f;
        float guardR = -20f, guardL = -10f;
        float kickHi = 70f, kickLow = -6f;
        Quaternion a0 = f.armL.localRotation, a1 = f.armR.localRotation, l0 = f.legL.localRotation, l1 = f.legR.localRotation, b0 = f.body.localRotation;

        Quaternion TA(float deg) => Quaternion.Euler(0,0,deg);

        // hedef açıları
        Quaternion armL_t= a0, armR_t= a1, legL_t= l0, legR_t= l1, body_t = b0;

        switch (type)
        {
            case AttackType.Jab:
                armL_t = TA(armJab);   armR_t = TA(guardR); body_t = TA(6f);
                break;
            case AttackType.Hook:
                armL_t = TA(armHook);  armR_t = TA(guardR); body_t = TA(16f);
                break;
            case AttackType.Kick:
                legL_t = TA(kickHi);   legR_t = TA(kickLow); body_t = TA(-6f);
                break;
            case AttackType.Uppercut:
                armL_t = TA(armUpper); armR_t = TA(guardL); body_t = TA(22f);
                break;
        }

        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = Mathf.SmoothStep(0,1,t/dur);
            f.armL.localRotation = Quaternion.Slerp(a0, armL_t, k);
            f.armR.localRotation = Quaternion.Slerp(a1, armR_t, k);
            f.legL.localRotation = Quaternion.Slerp(l0, legL_t, k);
            f.legR.localRotation = Quaternion.Slerp(l1, legR_t, k);
            f.body .localRotation = Quaternion.Slerp(b0, body_t, k);
            yield return null;
        }
        // eski poza hızla dön
        f.armL.localRotation = a0; f.armR.localRotation = a1;
        f.legL.localRotation = l0; f.legR.localRotation = l1; f.body.localRotation = b0;
    }

    bool IsDead(Fighter f) => f.hp <= 0;

    void Damage(Fighter f, int amount)
    {
        f.hp = Mathf.Max(0, f.hp - amount);
        f.SetHP(f.hp, f.maxHP);
        if (f.hp <= 0)
        {
            StartCoroutine(CoDeath(f));
        }
    }

    void Heal(Fighter f, int amount)
    {
        if (amount <= 0) return;
        f.hp = Mathf.Min(f.maxHP, f.hp + amount);
        f.SetHP(f.hp, f.maxHP);
        RetroFXOrchestrator.PulseSmall();
    }

    IEnumerator CoDeath(Fighter f)
    {
        // basit dağılım/fade
        float t = 0f; float dur = 0.35f;
        var start = f.model.localScale;
        while (t < dur)
        {
            t += Time.unscaledDeltaTime;
            float k = t / dur;
            f.model.localScale = Vector3.Lerp(start, Vector3.zero, Mathf.SmoothStep(0,1,k));
            f.glow.color = new Color(f.glow.color.r, f.glow.color.g, f.glow.color.b, 1f - k);
            yield return null;
        }
        f.root.gameObject.SetActive(false);

        // Sonuç
        if (f.isPlayer) OnPlayerDead();
        else            OnEnemyDead();
    }

    void OnPlayerDead()
    {
        // Şimdilik: oyun biter (kaybettin)
        Debug.LogWarning("[FightArena] Player died. Level failed.");
        RetroFXOrchestrator.PulseBig();
    }

    void OnEnemyDead()
    {
        Debug.Log("[FightArena] Enemy defeated! Level complete.");
        RetroFXOrchestrator.PulseBig();
        // Şimdilik: düşman ölünce dövüş biter
    }

    // ===== Fighter model (procedural) =====
    class Fighter
    {
        public bool isPlayer;
        public RectTransform root;   // tümünün kökü
        public RectTransform model;  // görsel kök
        public Image glow;
        public RectTransform head, body, armL, armR, legL, legR;
        public RectTransform hpRoot; public Image hpFill;
        public int hp, maxHP;

        public bool square;          // kare modu mu?
        public Image core;           // kare görseli (square mode)

        public Fighter(string name, RectTransform parent, bool player, bool squareMode, Color glowColor, Color hpEmissive, int max)
        {
            this.square = squareMode;
            isPlayer = player; maxHP = max; hp = max;

            // kök
            root = CreateRT($"{name}_Root", parent);
            root.sizeDelta = new Vector2(180, 160);

            // model
            model = CreateRT($"{name}_Model", root);
            model.sizeDelta = root.sizeDelta;

            // aura glow arka planı (parlak disk)
            var glowGO = new GameObject($"{name}_Glow", typeof(RectTransform), typeof(Image));
            glowGO.transform.SetParent(model, false);
            glow = glowGO.GetComponent<Image>();
            var glowRT = glowGO.GetComponent<RectTransform>();
            glowRT.anchorMin = glowRT.anchorMax = new Vector2(0.5f, 0.5f);
            glowRT.sizeDelta = new Vector2(140, 140);
            glow.color = new Color(glowColor.r, glowColor.g, glowColor.b, 1f); // gerçek alpha dışarıdan ayarlanır
            glow.raycastTarget = false;

            if (square)
            {
                // tek bir kare: parıldayan çekirdek
                core = NewImg(model, "Core", Color.white);
                var rt = core.rectTransform;
                rt.sizeDelta = new Vector2(56, 56);
                rt.pivot = new Vector2(0.5f, 0.5f);
                rt.anchoredPosition = Vector2.zero;
                core.raycastTarget = false;
                // kareyi daha “premium” göstermek için hafif yuvarlaklık efekti (scale animlerle vereceğiz)

                // HP bar aynı kalır (aşağıda)
            }
            else
            {
                // çöp adam parçaları
                head = MakeCircle(model, "Head", 26);
                body = MakeBar(model, "Body", 18, 60);
                armL = MakeBar(model, "ArmL", 14, 44);
                armR = MakeBar(model, "ArmR", 14, 44);
                legL = MakeBar(model, "LegL", 14, 48);
                legR = MakeBar(model, "LegR", 14, 48);

                head.anchoredPosition = new Vector2(0, 36);
                body.anchoredPosition = new Vector2(0, 6);
                armL.anchoredPosition = new Vector2(-18, 18);
                armR.anchoredPosition = new Vector2( 18, 18);
                legL.anchoredPosition = new Vector2(-10, -26);
                legR.anchoredPosition = new Vector2( 10, -26);
            }

            // HP bar
            hpRoot = CreateRT($"{name}_HP", root);
            hpRoot.pivot = new Vector2(0.5f, 0.5f);
            hpRoot.anchorMin = new Vector2(0.5f, 0); hpRoot.anchorMax = new Vector2(0.5f, 0);
            hpRoot.anchoredPosition = new Vector2(0, -70);
            hpRoot.sizeDelta = new Vector2(160, 10);

            var bg = NewImg(hpRoot, "BG", new Color(0,0,0,0.35f));
            bg.rectTransform.sizeDelta = hpRoot.sizeDelta;

            var fill = NewImg(hpRoot, "Fill", new Color(1,1,1,1));
            fill.rectTransform.pivot = new Vector2(0, 0.5f);
            fill.rectTransform.anchorMin = new Vector2(0, 0.5f);
            fill.rectTransform.anchorMax = new Vector2(0, 0.5f);
            fill.rectTransform.anchoredPosition = new Vector2(-hpRoot.sizeDelta.x*0.5f, 0);
            fill.rectTransform.sizeDelta = new Vector2(hpRoot.sizeDelta.x, hpRoot.sizeDelta.y);
            fill.raycastTarget = false;
            hpFill = fill;

            // HP rengi (emissive ton)
            var c = hpEmissive;
            hpFill.color = new Color(c.r, c.g, c.b, 1f);
        }

        public void SetHP(int current, int max)
        {
            hp = Mathf.Clamp(current, 0, max);
            float w = (hpRoot.sizeDelta.x) * (hp / (float)max);
            hpFill.rectTransform.sizeDelta = new Vector2(Mathf.Max(1, w), hpRoot.sizeDelta.y);
        }

        static RectTransform CreateRT(string name, RectTransform parent)
        {
            var go = new GameObject(name, typeof(RectTransform));
            var rt = go.GetComponent<RectTransform>();
            rt.SetParent(parent, false);
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            return rt;
        }

        static RectTransform MakeCircle(RectTransform parent, string name, float size)
        {
            var img = NewImg(parent, name, Color.white);
            var rt = img.rectTransform;
            rt.sizeDelta = new Vector2(size, size);
            img.type = Image.Type.Simple;
            img.raycastTarget = false;
            // use procedural soft circle sprite for a clean stickman head
            img.sprite = FightArena.GetCircleSprite(Mathf.RoundToInt(size));
            return rt;
        }

        static RectTransform MakeBar(RectTransform parent, string name, float thick, float len)
        {
            var img = NewImg(parent, name, Color.white);
            var rt = img.rectTransform;
            rt.sizeDelta = new Vector2(len, thick);
            rt.pivot = new Vector2(0f, 0.5f); // soldan döndürmek için
            img.type = Image.Type.Simple;
            img.raycastTarget = false;
            return rt;
        }

        static Image NewImg(RectTransform parent, string name, Color col)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.color = col;
            return img;
        }
    }
}