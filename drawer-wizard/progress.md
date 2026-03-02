Original prompt: oyuna tarza uygun güzel siyah beyaz player.png ile karakteri içeren minimalist bir main menu tasarla

## 2026-02-26
- İncelendi: Oyun şu an Boot -> Preload -> Level akışıyla direkt başlıyor.
- Plan: Siyah-beyaz, player.png içeren yeni bir Phaser MainMenu sahnesi eklenecek.
- Entegrasyon: Preload sonrası MainMenu açılacak; START ile Level sahnesine geçilecek.
- Eklendi: `src/scenes/MainMenu.ts` (siyah-beyaz minimalist panel, `player.png` karakter, START butonu, Enter/Space ile başlatma).
- Güncellendi: `src/main.ts` sahne listesi (`MainMenu` dahil edildi).
- Güncellendi: `src/scenes/Preload.ts` artık `MainMenu` başlatıyor.
- Doğrulama: `npm run build` başarılı.
- Doğrulama: `npx playwright screenshot` ile menü görünümü doğrulandı (`output/web-game/playwright-menu-full.png`).
- Doğrulama: `?start=Level` ile oyun sahnesi ekran görüntüsü alındı (`output/web-game/playwright-level-full.png`).
- Not: Skill içindeki canvas-capture scripti bu ortamda siyah PNG üretiyor; tam sayfa Playwright screenshot ile görsel doğrulama yapıldı.

## TODO / Next Agent
- İstenirse menüdeki sağ üst ayar butonu menü sahnesinde gizlenip yalnızca Level sahnesinde gösterilebilir.
- İstenirse START butonuna küçük bir scale tween/intro animasyonu eklenebilir.
- İyileştirme: Mobilde taşan alt açıklama metni için `wordWrap` + küçük ekran font/letterSpacing uyarlamaları eklendi.
- Doğrulama: Menü masaüstü görüntüsü (`output/web-game/playwright-menu-full.png`) ve mobil viewport görüntüsü (`output/web-game/playwright-menu-mobile.png`) alındı.
- Doğrulama: Güncel değişiklik sonrası skill Playwright client tekrar çalıştırıldı (`main-menu-after-fix`, `start-flow-after-fix`), yeni console error dosyası oluşmadı.
- İstek üzerine MainMenu üst başlığının altındaki "Minimal black & white spell duel" metni kaldırıldı.
- Doğrulama: `npm run build` başarılı.
- Main menu statik yapıdan çıkarıldı: giriş animasyonu + sürekli idle hareketler (scanline akışı, karakter bob/tilt, gölge ve START pulse/hover animasyonu) eklendi.
- Kullanıcı isteğiyle test komutu çalıştırılmadı.
- MainMenu kullanıcı isteğine göre çok daha sade hale getirildi: üstte sadece DRAWER WIZARD, ortada karakter, altta PLAY butonu.
- MainMenu içinde ek açıklama/ek görsel katmanlar kaldırıldı; settings butonu menüde gizlenip Level'e geçince tekrar gösterilecek şekilde ayarlandı.
- Sade menü güncellemesinden sonra `npm run build` tekrar başarılı geçti.
- MainMenu başlığı ve PLAY butonu görsel olarak iyileştirildi: serif başlık katmanı + dekoratif divider, butonda gölge/çerçeve/ok detayları ve hover-press etkileşimi eklendi.
- Doğrulama: `npm run build` başarılı.
- Kullanıcı geri bildirimi doğrultusunda MainMenu yeniden güncellendi:
  - Büyücüye hafif idle hareket (yumuşak bob + küçük tilt + gölge nefes efekti) eklendi.
  - Başlık fontu modernleştirildi ve daha temiz/şık görünüm için yeniden tasarlandı.
  - PLAY butonu tamamen yeniden çizildi (rounded yapı, kontrast hover, daha premium görünüm).
- Render kalitesi artırıldı: `main.ts` içinde `resolution` cihaz pixel ratio'ya göre (max 3) ayarlanıp antialias/pixelArt seçenekleri güncellendi.
- Doğrulama: `npm run build` başarılı.
