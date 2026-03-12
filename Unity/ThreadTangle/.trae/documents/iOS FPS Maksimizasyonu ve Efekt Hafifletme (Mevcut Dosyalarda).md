## Hedefler
- iOS’ta FPS’i maksimize etmek ve tüm limit/kısıtlamaları kaldırmak.
- Görsel/işitsel efektleri mobilde hafifletip, Update maliyetlerini azaltmak.

## Yapılacaklar (Mevcut Dosyalar)
- RetroFXOrchestrator.cs
  - Awake’te iOS tespiti ile mobil perf preset uygula.
  - Yeni private metot: `ApplyPerfPresetMobile()`
    - `QualitySettings.vSyncCount = 0` (vSync kapalı)
    - `Application.targetFrameRate = 120` (ProMotion destekliyse 120, aksi halde 60’a düşer)
    - PostFX hafiflet: `enableChromaticAberration=false`, `enableFilmGrain=false`, `enableLensDistortion=false`, `enablePaniniProjection=false`, `enableBloom=true` fakat intensity düşük (baseBloom küçük tutulur)
    - Scanlines kapat: `scanlines=false` (overlay ve kaydırma maliyeti kalkar)
    - Shake azalt: `allowCameraShake=false`, `allowUIShake=false` (veya parametreleri ciddi düşür)
    - Idle sway daha hafif: `swayPosAmp`, `swayRotAmp` ve `swayFreq` bir miktar düşür.
    - Update’de scanline scroll ve perlin tabanlı shake sadece ilgili `allow*` açıkken çalışır (mevcutta kontrol var; preset bunları kapatır).
- PathDrawer.cs
  - `TriggerScreenShake()` zaten `allowCameraShake`/`allowUIShake` üzerinden çalışıyor; mobilde preset ile kapatılacağı için ekstra kod değişimi gerekmez.
- LevelCountdown.cs / GoldCellManager.cs / TimeCellManager.cs / RandomLevelGenerator.cs
  - Ekstra FPS limiti yok; değişime gerek yok. (Mevcut FX’ler korunur; Render maliyeti düşürmek için RetroFX preset yeterli.)

## Ek Ayarlar (Koddan)
- (Opsiyonel) `QualitySettings.anisotropicFiltering = AnisotropicFiltering.Disable` ve `QualitySettings.masterTextureLimit = 0` mobilde yükü azaltır.
- (Opsiyonel) `Application.targetFrameRate = -1` yerine explicit 120 kullanıyoruz; iOS’ta üst limit kaldırma hedefli.

## Doğrulama
- iOS cihazda FPS ölçümü: ProMotion cihazlarda 120 FPS, diğerlerinde 60 FPS’e yakın.
- Görsel efektler mobilde daha hafif; Update ve per-frame iş yükü düşer.
- Oynanış hissi korunur; stutter azalır, pil tüketimi dengelenir.

## Notlar
- Tüm değişiklikler mevcut dosyalarda yapılır; yeni dosya eklemeye gerek yok.
- İstenirse preset bir `bool` ile kapanıp açılabilir (örn. `applyMobilePerfPreset=true`).