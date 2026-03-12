## Amaç
- Tutorial adımları için giriş/çıkış animasyonları ve metin vurguları eklemek.

## Uygulama
- `TutorialManager` içine coroutine tabanlı açılış/kapanış efektleri (fade + scale pop + isteğe bağlı wiggle).
- `CanvasGroup` ile alfa kontrolü, `RectTransform` ile ölçek/rotasyon; unscaled zaman kullanımı.
- Adım içi metinler için `PopText` tespiti ve `Shot(...)` çağrısıyla vurgu.
- Mevcut `FullscreenChannelFX` pulsesi ile sahne vurgusu.

## Entegrasyon
- Mevcut API (`ShowStep`, `CloseStep`) korunur; akış içeride animasyonla zenginleşir.
- Harici paket yok; `SmoothTweens` ve `PopText` yeniden kullanılır.

## Doğrulama
- Editör testinde farklı tutorial adımlarında efekt akışının kontrolü; timeScale=0 altında unscaled animasyonların doğrulanması.

Onayınızla birlikte düzenlemeleri uygulayıp çalışır hale getireceğim.