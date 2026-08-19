# RT Enerji – SharePoint Dosya İsimlendirme Standardı

### Süreç sonunda kesinleşen her belgenin SharePoint arşivine nasıl, hangi isimle ve hangi klasöre kaydedildiğini açıklar

> **Revizyon (Ağustos 2026):** BT biriminin 04.08.2026 tarihli bilgi notu doğrultusunda
> arşiv yapısı yeniden tasarlandı. Eski `Talepler/Kategori/Süreç/Yıl/Ay/Gün` yapısı ve
> eski arşiv dosya adı bu tarihten itibaren YENİ kayıtlar için kullanılmaz; geçmiş arşiv
> yerinde bırakılmıştır (taşıma ayrı bir çalışma).

---

## Neden bir standart?

Süreç sonunda kesin sonuca ulaşan (tamamlanan, reddedilen veya iptal edilen) her PDF,
SharePoint arşivine **otomatik** yüklenir. İsimlendirme ve klasörleme elle değil, sistemin
uyguladığı **tek bir kurala** göre yapılır:

- 🔎 **Aranabilirlik** — belirli bir ayda tamamlanan/reddedilen/iptal edilen belgeler doğrudan bulunur; dosya adından çalışan, tarih, departman, talep no ve sonuç tek bakışta okunur.
- 📁 **Düzenli arşiv** — yıl → ay → belge türü → sonuç hiyerarşisi; gün klasörü yok, daha az tıklama.
- 📅 **Kronolojik sıralama** — tarih `YYYY-AA-GG` formatında; alfabetik sıralama = tarih sırası.
- 💻 **Uyumluluk** — Türkçe karakter ve boşluk dosya adında yoktur (klasör adlarında serbesttir).
- 🤝 **Tutarlılık** — kural sistemde kodludur; kişiden kişiye değişmez.

---

## 1) Arşiv klasör yapısı

```
{KÖK} / Yıl / Ay / Belgeler / Belge Türü / Sonuç
```

**Örnek:**

```
RTProd / 2026 / 07-Temmuz / Belgeler / Yıllık İzin / Tamamlanan
```

- **Kök klasör** `SHAREPOINT_ROOT_FOLDER` env değişkeninden gelir (prod hedefi: `RTProd`).
- **Yıl ve ay**, talebin açıldığı tarihe göre DEĞİL, belgenin **kesin sonuca ulaştığı** tarihe
  göre belirlenir (`requests.completed_at`, Europe/Istanbul saat diliminde).
- **Ay klasörleri:** `01-Ocak, 02-Şubat, 03-Mart, 04-Nisan, 05-Mayıs, 06-Haziran, 07-Temmuz,
  08-Ağustos, 09-Eylül, 10-Ekim, 11-Kasım, 12-Aralık`.

**Belge Türü klasörleri** (süreç başına bir klasör):

| Süreç kodu | Klasör |
|---|---|
| ANNUAL_LEAVE | Yıllık İzin |
| SHORT_LEAVE | Kısa Süreli İzin |
| SALARY_ADVANCE | Maaş Avansı |
| OVERTIME | Fazla Mesai |
| EMPLOYEE_ONBOARDING | İşe Giriş |
| EMPLOYEE_SEPARATION | İşten Çıkış |
| REQUEST_FORM | Talep Formu |
| TRAVEL_ASSIGNMENT | Görev Formu |
| APPROVAL_LETTER | Olur Yazısı |
| STAMP_APPROVAL | Kaşeli Belge |
| FINANCE_APPROVAL_COVER | Onay Kapağı Finans |
| ACCOUNTING_APPROVAL_COVER | Onay Kapağı Muhasebe |
| COMPARISON_FORM | Mukayese Formu |
| EXPENSE_FORM | Harcama Formu |

> Tanımlı olmayan bir süreç tipi gelirse belge kaybolmaması için **`Diğer`** klasörüne düşer.

**Sonuç klasörleri:**

| Talep statüsü | Klasör |
|---|---|
| APPROVED, COMPLETED | Tamamlanan |
| REJECTED | Reddedilen |
| CANCELLED | İptal Edilen |

> Yalnız bu **terminal** statüler arşivlenir. Beklemedeki, taslak veya ara aşamadaki
> (örn. görev dönüşü bekleyen) belgeler SharePoint'e **gitmez**; kesin sonuç çıkınca
> nihai belge yüklenir. Islak imzalı tarama yüklenen süreçlerde de taslak değil,
> **imzalı son belge** arşivlenir.

---

## 2) Arşiv dosya adı formatı

```
AD-SOYAD_YYYY-AA-GG_DEPTKOD_DEPARTMAN_TALEPNO_DURUM.pdf
```

**Örnek:**

```
SINEM-ALDOGAN-DEMIRKAN_2026-07-31_IL-01_IZIN-ISLERI_2026-000401_TAMAMLANDI.pdf
```

| Sıra | Parça | Açıklama | Örnek |
|---|---|---|---|
| 1 | **Ad-Soyad** | Talep sahibi (büyük harf, tireli) | `SINEM-ALDOGAN-DEMIRKAN` |
| 2 | **Sonuç tarihi** | Belgenin tamamlandığı/reddedildiği/iptal edildiği gün | `2026-07-31` |
| 3 | **Departman kodu** | Birimin kısa kodu (`organizational_units.code`) | `IL-01` |
| 4 | **Departman adı** | Kodu bilmeyen kullanıcı için birimin adı | `IZIN-ISLERI` |
| 5 | **Talep no** | Talebin sistemdeki benzersiz numarası | `2026-000401` |
| 6 | **Durum** | `TAMAMLANDI` / `REDDEDILDI` / `IPTAL` | `TAMAMLANDI` |

Kurallar:

- Parçalar alt çizgi (`_`) ile ayrılır; Türkçe karakterler İngilizce karşılığına çevrilir,
  boşluklar tire (`-`) olur, tümü büyük harftir.
- **Departman kodu** organizasyon yönetimindeki birim kodundan gelir. Kod tanımlı değilse
  birim adından türetilmiş en fazla 12 karakterlik kısaltma kullanılır; talep sahibinin
  aktif birimi hiç yoksa `GENEL` + `BILINMEYEN` yazılır.
- **Departman, talebin sonuçlandığı anda** çözülür ve kuyruğa dondurulur — çalışanın
  departmanı sonradan değişse bile geçmiş belgelerin adı ve yeri değişmez.
- `APPROVED` ve `COMPLETED` ikisi de başarılı sonuçtur (tamamlama fazı olmayan süreçler
  `APPROVED`'da biter) → ikisi de `TAMAMLANDI` etiketi alır.

---

## 3) Tekrar arşivleme kuralı (çift kayıt önleme)

Aynı talep yeniden işlendiğinde ikinci bir kopya **açılmaz**:

- Hedef yol (klasör + dosya adı) kuyruğa alındığı anda dondurulur; tekrar denemeler
  (retry) hep aynı yola yazar ve SharePoint aynı dosyanın üzerine yeni sürüm koyar.
- Talebin sonucu değişirse (örn. reddedilen talep revizyon sonrası tamamlanırsa) **önce
  yeni dosya başarıyla yüklenir, sonra** eski SharePoint kaydı otomatik temizlenir.
  İşlem yarıda kalırsa eski dosya korunur — belge asla kaybolmaz.

---

## 4) Uygulama içi indirme adları (değişmedi)

Uygulama içinden yapılan PDF indirme ve önizlemeleri arşivden bağımsızdır ve eski
formatı kullanmaya devam eder:

```
SÜREÇKODU_YYYYAAGG_TALEPNO_AD-SOYAD_DURUM.pdf
IZIN_20260508_2026-000142_AHMET-YILMAZ_ONAYLI.pdf
```

Süreç kodları: `IZIN, KISA-IZIN, MAAS-AVANS, FAZLA-MESAI, ISE-GIRIS, ISTEN-CIKIS,
TALEP-FORMU, GOREV-FORMU, OLUR-YAZISI, ONAY-KAPAGI-FIN, ONAY-KAPAGI-MUH, MUKAYESE,
HARCAMA, KASE-ONAY`. Durum etiketleri statü tablosunun tamamını kapsar
(`TASLAK, BEKLEMEDE, ONAYLI, TAMAMLANMA-BEKLIYOR, TAMAMLANDI, REDDEDILDI, IPTAL,
REVIZE-ISTENDI`).

---

## Özet

Örnek bir yıllık izin belgesinin SharePoint'teki tam yeri:

```
RTProd / 2026 / 07-Temmuz / Belgeler / Yıllık İzin / Tamamlanan /
        └── SINEM-ALDOGAN-DEMIRKAN_2026-07-31_IL-01_IZIN-ISLERI_2026-000401_TAMAMLANDI.pdf
```

Belge **açılmadan önce**; kimin talebi olduğu, hangi departmandan geldiği, ne zaman ve
hangi sonuçla kapandığı, klasöründen ve adından eksiksiz okunur.
