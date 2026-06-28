# RT Enerji – SharePoint Dosya İsimlendirme Standardı

### Onaylanan her belgenin SharePoint arşivine nasıl, hangi isimle ve hangi klasöre kaydedildiğini açıklar

---

## Neden bir standart?

Süreç sonunda üretilen her imzalı/kaşeli PDF, SharePoint arşivine **otomatik** olarak yüklenir. İsimlendirme ve klasörleme elle değil, sistemin uyguladığı **tek bir kurala** göre yapılır. Bunun faydaları:

- 🔎 **Aranabilirlik** — dosya adına bakarak süreç tipini, talep sahibini, tarihi ve onay durumunu tek bakışta görürsünüz; dosyayı açmaya gerek kalmaz.
- 📁 **Düzenli arşiv** — belgeler kategori → tip → yıl → ay → gün hiyerarşisinde dağılır; binlerce dosya birbirine karışmaz.
- 📅 **Kronolojik sıralama** — tarih formatı sayesinde dosyalar alfabetik sıralandığında otomatik olarak tarih sırasına girer.
- 💻 **Uyumluluk** — Türkçe karakter ve boşluk içermez; Windows, SharePoint ve diğer sistemlerde sorunsuz açılır.
- 🤝 **Tutarlılık** — kuralı sistem uygular; kişiden kişiye, günden güne değişmez.

---

## 1) Dosya adı formatı

Her dosya şu kalıba göre adlandırılır:

```
SÜREÇKODU_YYYYAYGÜN_TALEPNO_AD-SOYAD_DURUM.pdf
```

**Örnekler:**

```
IZIN_20260508_2026-000142_AHMET-YILMAZ_ONAYLI.pdf
MUKAYESE_20260315_2026-000098_AYSE-KAYA_REDDEDILDI.pdf
FAZLA-MESAI_20260512_2026-000201_ALI-SAHIN-OZ_TAMAMLANDI.pdf
```

Dosya adı beş parçadan oluşur:

| Sıra | Parça | Açıklama | Örnek |
|---|---|---|---|
| 1 | **Süreç kodu** | Belgenin hangi sürece ait olduğu | `IZIN` |
| 2 | **Tarih (YYYYAYGÜN)** | Talebin oluşturulduğu tarih | `20260508` (8 Mayıs 2026) |
| 3 | **Talep no** | Talebin sistemdeki benzersiz numarası | `2026-000142` |
| 4 | **Ad-Soyad** | Talep sahibinin adı (büyük harf, tireli) | `AHMET-YILMAZ` |
| 5 | **Durum** | Belgenin onay durumu | `ONAYLI` |

> Parçalar alt çizgi (`_`) ile ayrılır. Ad-soyad içindeki boşluklar tire (`-`) olur, Türkçe karakterler İngilizce karşılığına çevrilir (ör. *Şahin Öz → SAHIN-OZ*). Tüm dosya adı büyük harftir.

---

## 2) Süreç kodları

Her süreç tipinin kısa, sabit bir kodu vardır:

| Süreç | Dosya kodu |
|---|---|
| Yıllık İzin | `IZIN` |
| Kısa Süreli İzin | `KISA-IZIN` |
| Maaş Avansı | `MAAS-AVANS` |
| Fazla Mesai | `FAZLA-MESAI` |
| İşe Giriş | `ISE-GIRIS` |
| İşten Çıkış | `ISTEN-CIKIS` |
| Talep Formu | `TALEP-FORMU` |
| Görev / Seyahat Formu | `GOREV-FORMU` |
| Olur Yazısı | `OLUR-YAZISI` |
| Onay Kapağı (Finans) | `ONAY-KAPAGI-FIN` |
| Onay Kapağı (Muhasebe) | `ONAY-KAPAGI-MUH` |
| Mukayese Formu | `MUKAYESE` |
| Harcama Formu | `HARCAMA` |
| Kaşe Onayı | `KASE-ONAY` |

---

## 3) Durum etiketleri

Dosya adının son parçası, belgenin o anki onay durumunu gösterir:

| Durum | Dosya etiketi |
|---|---|
| Taslak | `TASLAK` |
| Beklemede | `BEKLEMEDE` |
| Onaylı | `ONAYLI` |
| Tamamlanma Bekliyor | `TAMAMLANMA-BEKLIYOR` |
| Tamamlandı | `TAMAMLANDI` |
| Reddedildi | `REDDEDILDI` |
| İptal | `IPTAL` |
| Revize İstendi | `REVIZE-ISTENDI` |

---

## 4) Klasör yapısı

Dosyalar SharePoint'te düz bir listede değil, anlamlı bir **klasör hiyerarşisinde** saklanır:

```
Talepler / Kategori / Süreç Tipi / Yıl / Ay / Gün
```

**Örnek:**

```
Talepler / 01_Insan_Kaynaklari / Yillik_Izin / 2026 / 05 / 17
```

Kategoriler:

| Kategori klasörü | İçerdiği süreçler |
|---|---|
| `01_Insan_Kaynaklari` | İzinler, maaş avansı, fazla mesai, işe giriş/çıkış, talep formu |
| `02_Finans` | Onay kapağı (finans), mukayese |
| `03_Muhasebe` | Onay kapağı (muhasebe), harcama |
| `04_Idari_Isler` | Görev formu, olur yazısı, kaşeli belge onayı |

> Tanımlı olmayan bir süreç tipi gelirse, belge kaybolmaması için `99_Diger` klasörüne yedeklenir.

---

## Özet

Birinci ve dördüncü bölümü birleştirince, örnek bir yıllık izin belgesinin SharePoint'teki tam yeri şöyle görünür:

```
Talepler / 01_Insan_Kaynaklari / Yillik_Izin / 2026 / 05 / 08 /
        └── IZIN_20260508_2026-000142_AHMET-YILMAZ_ONAYLI.pdf
```

Bu standart sayesinde, herhangi bir belge **açılmadan önce** dosya adından ve bulunduğu klasörden; süreç tipini, tarihini, talep sahibini, talep numarasını ve onay durumunu doğru ve eksiksiz okuyabilirsiniz.
