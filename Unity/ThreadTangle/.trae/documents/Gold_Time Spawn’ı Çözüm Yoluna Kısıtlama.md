## Sorunun Özeti
- Gold ve Time şu anda sadece “boş, blok değil, spool değil” hücrelere rastgele konuyor: `Assets/Scripts/Levels/GoldCellManager.cs:109–126` ve `Assets/Scripts/Levels/TimeCellManager.cs:99–114`.
- Çözülebilirlik kontrolü ise sonradan yapılıyor: `Assets/Scripts/Levels/RandomLevelGenerator.cs:233–239`.
- Bu nedenle koleksiyonlar, oyuncunun erişemeyeceği veya erişse bile leveli bitirmeyi engelleyebilecek pozisyonlara düşebiliyor.

## Çözüm Stratejisi
- Koleksiyonları yalnızca optimal çözüm yollarının üzerindeki hücrelere yerleştir.
- Solver çalıştıktan sonra `bestPaths` birleşiminden “çözüm hücreleri” kümesini çıkar.
- Gold/Time adaylarını bu kümeden seç; ek filtreler:
  - `!cell.isSpool`, `!cell.isBlocked`.
  - Köşelerden kaçın.
  - En az 2 serbest komşu.
- Aday yoksa filtreyi gevşet, yine yoksa spawn’ı atla.

## Teknik Değişiklikler
- LevelOptimalSolver: `BestPaths` için public getter ve `GetSolutionCells()` ekle.
- RandomLevelGenerator: `ComputeOptimal()`’ı spawn’dan önce çalıştır; `GetSolutionCells()` ile adayları yöneticilere geçir.
- GoldCellManager/TimeCellManager: `PrepareForNewLevel(..., IEnumerable<Cell> allowed)` overload’ları; allowed varsa oradan seçim ve güvenlik filtreleri.

## Doğrulama
- `bestCost < int.MaxValue` doğrulaması.
- Debug çözüm çizimi ile görsel teyit.
- Farklı konfiglerle çoklu denemelerle manuel test.

Onaylarsanız uygulamaya ve testlere geçiyorum.