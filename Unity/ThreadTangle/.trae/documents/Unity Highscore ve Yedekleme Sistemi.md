## Amaç
- Oyuna kalıcı bir highscore sistemi eklemek; puanı saklamak ve yerel yedek oluşturmak.
- Ana menüde en yüksek puanı göstermek ve yeni rekor olduğunda görsel bildirim vermek.

## Mevcut Durum
- Puan toplama `LevelScoreManager` ve `ComboManager` ile çalışıyor; `TotalScore` sahne içinde tutuluyor.
- Kalıcı kayıt sadece kullanıcı ayarlarında (`Settings.cs` → `PlayerPrefs`), skor için yok.
- Kaybetme akışı `LastPanel` puanı gösterip `MainMenu` sahnesine dönüyor.

## Tasarım
- Birincil kalıcı kayıt: `PlayerPrefs`
  - `HS_BEST` (int): en yüksek puan
  - `HS_HISTORY` (string JSON): son N koşu puanları
- İkincil yedek: JSON dosya
  - Yol: `Application.persistentDataPath/highscores.json`
  - İçerik: `{ best: int, history: int[] }`
  - Ek yedek: `highscores.bak` (son sağlam dosya kopyası)
- Yükleme stratejisi: Önce `PlayerPrefs`, yoksa JSON; senkron tut.
- Kayıt tetikleyici: Koşu bittiğinde (kaybetme paneli kapanırken) `TotalScore` kayıt; yeni rekor ise popup.

## Uygulama Adımları
1. Yeni servis: `HighScoreService` (statik API)
   - `Load()`: `PlayerPrefs` ve/veya JSON’dan veriyi al
   - `GetBest()`, `GetHistory(int n)`
   - `TryRecord(int score)`: skoru ekle, en iyiyi güncelle, hem `PlayerPrefs` hem JSON’a yaz; `.bak` güncelle
   - `Reset()` (isteğe bağlı)
2. Entegrasyon (kaydetme):
   - `LastPanel`: `scoreText` hesaplandıktan sonra `HighScoreService.TryRecord(totalScore)` çağır
   - Yeni rekor ise `LevelScoreManager.PopText("NEW HIGHSCORE")`
3. Entegrasyon (yükleme/gösterme):
   - `MainMenu` sahnesinde bir `HighScoreUI` bileşeni
   - `Start()` içinde `HighScoreService.Load()` ve `bestScoreText.text = GetBest().ToString()`
4. UI eklemeleri:
   - Ana menü Canvas’ına "Highscore" metni (`UnityEngine.UI.Text`) ve değer alanı
   - İsteğe bağlı: Son 5 puanı listeleyen basit panel

## Dosya/Dizin Değişiklikleri
- `Assets/Scripts/Score/HighScoreService.cs` (yeni)
- `Assets/Scripts/UI/HighScoreUI.cs` (yeni)
- `Assets/Scripts/UI/LastPanel.cs` içinde kayıt çağrısı ekleme
- `Assets/Scenes/MainMenu.unity` içine Highscore metni ekleme

## Yedekleme ve Kurtarma
- Her kayıt işleminde `highscores.json` yazılır, ardından atomik `.bak` kopyası oluşturulur.
- Yükleme sırasında JSON bozuksa `.bak` denenir; ikisi de bozuksa `PlayerPrefs` veya sıfırdan başlatılır.
- Yazım hatalarında sessiz geri dönüş ve log ile uyarı (editor konsolu).

## Doğrulama
- Editor’de yeni koşu oynanır; `LastPanel` dönüşünden sonra ana menüde best skor güncellenir.
- Uygulama yeniden başlatıldığında best skor ve tarihçe yüklenir.
- JSON dosyasının `Application.persistentDataPath`’te oluştuğu doğrulanır.
- Yeni rekor kazanımlarında "NEW HIGHSCORE" popup gösterimi görülür.

## Genişletme (Opsiyonel)
- Platforma özel bulut yedekleme (iOS iCloud, Android Google Play Games) için arayüz eklenebilir.
- Çoklu kullanıcı/profil desteği için `playerId` alanı ve ayrık kayıtlar.