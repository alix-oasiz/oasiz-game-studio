## Hedefler
- Yalnızca mevcut dosyaları düzenleyerek oyunu belirgin şekilde daha eğlenceli ve rahatlatıcı hale getirmek.
- Şaşırtıcı ama abartısız mikro geri bildirimler, akıcı geçişler ve tatmin edici FX.

## Yapılacak Düzenlemeler (Mevcut Dosyalar)
- RandomLevelGenerator.cs
  - `CoGenerate` başarı bloğunda (countdown başlamadan hemen önce/sonra) `RetroFXOrchestrator.PulseSmall()` ve 1–2 farklı `PopText` mesajı ekleyerek seviye oluşumuna tatmin edici bir mini kutlama eklemek.
  - `emptyAlpha` varsayılanını biraz artırarak (örn. 0.08→0.12) grid görünümünü daha net ve hoş kılmak.
- PathDrawer.cs
  - Pair kilitlendiği anda (mevcut `fullscreenChannelFX?.Pulse()` satırının yakını) `RetroFXOrchestrator.PulseSmall()` çağrısı eklemek; varsa ilgili hücre `CellVisual.Pulse()` tetiklerini biraz güçlendirmek (overshoot 1.08→1.12, duration 0.12→0.14).
  - Kilitlenen her tile için minik bir ödül pop metni (`PopText.Shot("+1")` gibi) eklemek (spam engellemek için örnekleme).
- GoldCellManager.cs
  - `CoGoldCollectFX` içinde glow alfa ve scale tepe değerini hafif artırıp (örn. alpha 0.55→0.62, scalePeak 1.25→1.32) animasyon eğrisini daha yumuşak hale getirmek; animasyonun ilk yarısında renk geçişini daha sıcak tonda ayarlamak.
  - Toplanma anında `RetroFXOrchestrator.PulseSmall()` eklemek, AudioManager varsa hafif bir "chime" sesi (`Play("chime")`).
- TimeCellManager.cs
  - Gold ile benzer FX yumuşatması (alpha/scalePeak küçük artış), sıcak renk geçişi; toplanınca `RetroFXOrchestrator.PulseSmall()`.
- LevelCountdown.cs
  - Son 3 saniye uyarısı geldiğinde metin materyalinde daha belirgin ama yumuşak bir parıltı (mevcut `lastThreeMaterial` kullanımı) ve kısa bir `RetroFXOrchestrator.PulseSmall()`; kaygı azaltıcı hissiyat.
- RetroFXOrchestrator.cs
  - Varsayılan `idleSway=true` ve genlikleri hafifçe optimize (swayPosAmp 0.015→0.012, swayRotAmp 0.65→0.5) ve `PulseSmall()` çağrıları için kamera/UI shake parametreleri düşük tutulur.

## Doğrulama
- Oynanış sırasında: Pair kilitlemede tatmin edici minik pulse ve pop; Gold/Time toplamada sıcak parıltı; seviye oluşumunda küçük kutlama.
- Geçiş akışı aynı; hissiyat daha akıcı, rahat ve eğlenceli.
- Console hata yok; FPS stabil.

## Notlar
- Tüm değişiklikler mevcut dosyalara yapılacak; yeni dosya eklenmeyecek.
- Parametreleri Inspector’da da ince ayarlayabilir hale bırakacağız (kod defaultlarını tatlı bir başlangıç olarak set edeceğiz).