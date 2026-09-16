# RT Enerji – SharePoint Arşiv Yapısı ve Dosya İsimlendirme Standardı

### Süreç sonunda kesinleşen her belgenin SharePoint arşivine nasıl, hangi isimle ve hangi klasöre kaydedildiğini açıklar

> **Revizyon (Eylül 2026):** BT / İş Analizi'nin 22.08.2026 tarihli **Geliştirme Talebi AS0001**
> ve "BYS Arşiv Modülü — Klasör Yapısı Teknik Gereksinim" dokümanı doğrultusunda arşiv,
> **organizasyon şemasını** yansıtacak şekilde yeniden düzenlendi. 20.08.2026'dan bu
> revizyonun devreye alınmasına kadar canlıda olan `Yıl/Ay/Belgeler/Tür/Sonuç` düzenindeki
> belgeler `sharepoint-migrate` endpoint'iyle yeni düzene taşınır (bkz. §5). Daha eski
> `Talepler/…` arşivi yerinde bırakılmıştır; o belgeler taşınmaz.

---

## Neden bir standart?

Süreç sonunda kesin sonuca ulaşan (tamamlanan, reddedilen veya iptal edilen) her PDF,
SharePoint arşivine **otomatik** yüklenir. İsimlendirme ve klasörleme elle değil, sistemin
uyguladığı **tek bir kurala** göre yapılır:

- 📁 **Organizasyona uyum** — her birim kendi belgelerini kendi klasöründe bulur; klasör
  ağacı organizasyon şemasıyla aynı dili konuşur.
- 🔐 **Yetkilendirilebilirlik** — birim klasörleri sabit olduğu için SharePoint izinleri
  bir kez, klasör bazında verilir (bkz. [sharepoint-arsiv-izin-rehberi.md](sharepoint-arsiv-izin-rehberi.md)).
- 🔎 **Aranabilirlik** — dosya adından çalışan, tarih, departman, talep no ve sonuç tek
  bakışta okunur; sonuç klasörü altındaki yıl/ay katmanı dönem bazlı bakışı korur.
- 💻 **Uyumluluk** — Türkçe karakter ve boşluk dosya adında yoktur (klasör adlarında serbesttir).
- 🤝 **Tutarlılık** — kural sistemde kodludur; kişiden kişiye değişmez.

---

## 1) Arşiv klasör yapısı

```
{KÖK} / Departman / Birim / Form Tipi / Sonuç / Yıl / Ay
```

**Örnek:**

```
RTProd / İşletme / Bakım-Onarım / İzin / Tamamlanan / 2026 / 08-Ağustos
```

Tam ağaç (statik kısım; yıl/ay klasörleri ilk belgeyle kendiliğinden açılır):

```
{KÖK}/
  Taş Havacılık ve Yatçılık/                     [7 form] / Sonuç / Yıl / Ay
  İzin, Lisans ve Harita İşleri/
      Harita İşleri | İzin İşleri | Orman İşleri/ [7 form] / Sonuç / Yıl / Ay
  İşletme/
      Üretim | Enerji Satış | Bakım-Onarım/      [7 form] / Sonuç / Yıl / Ay
  Mali ve İdari İşler/
      Mali İşler/Finans/
          Birim Süreçleri/Onay Kapağı Finans/    Sonuç / Yıl / Ay
          Bireysel Süreçler/                     [7 form] / Sonuç / Yıl / Ay
      Mali İşler/Muhasebe/
          Birim Süreçleri/Onay Kapağı Muhasebe/  Sonuç / Yıl / Ay
          Bireysel Süreçler/                     [7 form] / Sonuç / Yıl / Ay
      İdari İşler/                               [7 form] / Sonuç / Yıl / Ay
  Elektrik, İnşaat ve Proje İşleri/
      Elektrik İşleri | GES İşleri/              [7 form] / Sonuç / Yıl / Ay
      İnşaat İşleri/Merkez | Saha/               [7 form] / Sonuç / Yıl / Ay
  Hukuk Müşavirliği/                             [7 form] / Sonuç / Yıl / Ay
  İnsan Kaynakları/
      Birim Süreçleri/
          Fazla Mesai Formu | İşe Giriş Takip Formu | İşten Çıkış Takip Formu | Maaş Avans Talebi/
                                                 Sonuç / Yıl / Ay
      Bireysel Süreçler/                         [7 form] / Sonuç / Yıl / Ay
  Genel Müdürlük/                                [7 form] / Sonuç / Yıl / Ay
  Diğer/                                         [7 form] / Sonuç / Yıl / Ay   (eşlenmemiş birim)
```

- **Kök klasör** `SHAREPOINT_ROOT_FOLDER` env değişkeninden gelir (prod hedefi: `RTProd`).
- **[7 form]** = `Görev Formu, Talep Formu, Kaşeli Onay, Olur Yazısı, Mukayese Formu,
  Harcama Formu, İzin` — teknik dokümanın "standart 7 form tipi"; her birim altında aynı.
- **Sonuç** klasörleri: `Tamamlanan / Reddedilen / İptal Edilen`.
- **Yıl ve ay**, talebin açıldığı tarihe göre DEĞİL, belgenin **kesin sonuca ulaştığı** tarihe
  göre belirlenir (`requests.completed_at`, Europe/Istanbul). Ay klasörleri:
  `01-Ocak, 02-Şubat, 03-Mart, 04-Nisan, 05-Mayıs, 06-Haziran, 07-Temmuz, 08-Ağustos,
  09-Eylül, 10-Ekim, 11-Kasım, 12-Aralık`.
- **İnsan Kaynakları** organizasyon şemasında İdari İşler altında olsa da arşivde
  **bağımsız departman** olarak yer alır (teknik doküman 5.3): İK birim süreçleri tüm
  şirketten belge aldığı için izin sınırı kökte çizilir.

### Yönlendirme kuralı — hangi süreç nereye?

| Süreç | Klasör | Kural |
|---|---|---|
| FINANCE_APPROVAL_COVER | `Mali ve İdari İşler/Mali İşler/Finans/Birim Süreçleri/Onay Kapağı Finans` | **Sabit** |
| ACCOUNTING_APPROVAL_COVER | `Mali ve İdari İşler/Mali İşler/Muhasebe/Birim Süreçleri/Onay Kapağı Muhasebe` | **Sabit** |
| OVERTIME | `İnsan Kaynakları/Birim Süreçleri/Fazla Mesai Formu` | **Sabit** |
| EMPLOYEE_ONBOARDING | `İnsan Kaynakları/Birim Süreçleri/İşe Giriş Takip Formu` | **Sabit** |
| EMPLOYEE_SEPARATION | `İnsan Kaynakları/Birim Süreçleri/İşten Çıkış Takip Formu` | **Sabit** |
| SALARY_ADVANCE | `İnsan Kaynakları/Birim Süreçleri/Maaş Avans Talebi` | **Sabit** |
| TRAVEL_ASSIGNMENT | `{birim}/Görev Formu` | Birim bazlı |
| REQUEST_FORM | `{birim}/Talep Formu` | Birim bazlı |
| STAMP_APPROVAL | `{birim}/Kaşeli Onay` | Birim bazlı |
| APPROVAL_LETTER | `{birim}/Olur Yazısı` | Birim bazlı |
| COMPARISON_FORM | `{birim}/Mukayese Formu` | Birim bazlı |
| EXPENSE_FORM | `{birim}/Harcama Formu` | Birim bazlı |
| ANNUAL_LEAVE, SHORT_LEAVE | `{birim}/İzin` | Birim bazlı (tür ayrımı dosya adında) |

- **Sabit** rotalı süreçlerde talep edenin birimi yok sayılır — bir Bakım-Onarım
  çalışanının maaş avansı da `İnsan Kaynakları/Birim Süreçleri/Maaş Avans Talebi`'ne gider
  (teknik doküman 5.4: Maaş Avans yalnız İK birim sürecinde tutulur, birim alt klasörü açılmaz).
- **Birim bazlı** süreçlerde `{birim}`, talep edenin **sonuçlanma anındaki** aktif primary
  pozisyonunun bağlı olduğu birimden (`organizational_units.code`) aşağıdaki tabloyla çözülür.
- Tanımlı olmayan bir süreç kodu gelirse belge kaybolmaması için `{birim}/Diğer` klasörüne düşer.

### Birim eşleme tablosu (`organizational_units.code` → arşiv tabanı)

Kodlar Türkçe karakterlerden arındırılıp büyük harfe çevrilerek eşlenir
(`İŞL → ISL`, `TAŞ100 → TAS100`). Tablo koddadır: `lib/sharepoint/folder-mapper.ts` → `UNIT_ARCHIVE_BASES`.

| DB kodu | Arşiv tabanı |
|---|---|
| TAŞ100, TŞHY | `Taş Havacılık ve Yatçılık` |
| KH | `İzin, Lisans ve Harita İşleri/Harita İşleri` |
| İL | `İzin, Lisans ve Harita İşleri/İzin İşleri` |
| Oİ | `İzin, Lisans ve Harita İşleri/Orman İşleri` |
| İŞL | `İşletme/Üretim` |
| İS | `İşletme/Enerji Satış` |
| BO | `İşletme/Bakım-Onarım` |
| FD | `Mali ve İdari İşler/Mali İşler/Finans/Bireysel Süreçler` |
| MD | `Mali ve İdari İşler/Mali İşler/Muhasebe/Bireysel Süreçler` |
| IIDEP, DHD | `Mali ve İdari İşler/İdari İşler` (Destek Hizmetleri İdari İşler'e katlanır) |
| IKD | `İnsan Kaynakları/Bireysel Süreçler` |
| EID | `Elektrik, İnşaat ve Proje İşleri/Elektrik İşleri` |
| GESID | `Elektrik, İnşaat ve Proje İşleri/GES İşleri` |
| INSIDM, INSID | `Elektrik, İnşaat ve Proje İşleri/İnşaat İşleri/Merkez` |
| INSIDS | `Elektrik, İnşaat ve Proje İşleri/İnşaat İşleri/Saha` |
| HMB, HM | `Hukuk Müşavirliği` |
| GM, GMY100, YK | `Genel Müdürlük` |
| *(diğer / boş)* | `Diğer` — sunucu logunda `[sharepoint-archive] birim eşlenemedi` uyarısı |

> **Bakım notu:** Yeni bir birim açıldığında bu tabloya satır eklenmezse belgeler kaybolmaz,
> `Diğer` altında birikir ve log uyarısı düşer. Satır eklendikten sonra
> `POST /api/admin/sharepoint-provision` ile yeni birimin klasörleri açılır ve BT izin verir.
> Kapsayıcı üst birimler (`ILKHB, ISLB, MIIB, MIB, IIB, EIPIB, RT`) bilerek eşlenmemiştir —
> bunlara doğrudan bağlı pozisyon olmaması beklenir.

> Yalnız **terminal** statüler arşivlenir (APPROVED, COMPLETED → `Tamamlanan`; REJECTED →
> `Reddedilen`; CANCELLED → `İptal Edilen`). Beklemedeki, taslak veya ara aşamadaki
> (örn. görev dönüşü bekleyen) belgeler SharePoint'e **gitmez**; kesin sonuç çıkınca nihai
> belge yüklenir. Islak imzalı tarama yüklenen süreçlerde (olur yazısı, talep formu,
> mukayese, onay kapakları, maaş avansı) taslak değil, **imzalı son belge** arşivlenir.

---

## 2) Arşiv dosya adı formatı

```
AD-SOYAD_YYYY-AA-GG_DEPTKOD_DEPARTMAN_TALEPNO[_TÜR]_DURUM.pdf
```

**Örnekler:**

```
SINEM-ALDOGAN-DEMIRKAN_2026-07-31_IL_IZIN-ISLERI-DEPARTMANI_2026-000401_TAMAMLANDI.pdf
AHMET-YILMAZ_2026-08-18_BO_BAKIM-ONARIM-DEPARTMANI_2026-000512_YILLIK-IZIN_TAMAMLANDI.pdf
```

| Sıra | Parça | Açıklama | Örnek |
|---|---|---|---|
| 1 | **Ad-Soyad** | Talep sahibi (büyük harf, tireli) | `AHMET-YILMAZ` |
| 2 | **Sonuç tarihi** | Belgenin tamamlandığı/reddedildiği/iptal edildiği gün | `2026-08-18` |
| 3 | **Departman kodu** | Birimin kısa kodu (`organizational_units.code`) | `BO` |
| 4 | **Departman adı** | Kodu bilmeyen kullanıcı için birimin adı | `BAKIM-ONARIM-DEPARTMANI` |
| 5 | **Talep no** | Talebin sistemdeki benzersiz numarası | `2026-000512` |
| 6 | **Tür** *(yalnız izinlerde)* | `YILLIK-IZIN` / `KISA-IZIN` — iki izin süreci aynı `İzin` klasörünü paylaştığı için | `YILLIK-IZIN` |
| 7 | **Durum** | `TAMAMLANDI` / `REDDEDILDI` / `IPTAL` | `TAMAMLANDI` |

Kurallar:

- Parçalar alt çizgi (`_`) ile ayrılır; Türkçe karakterler İngilizce karşılığına çevrilir,
  boşluklar tire (`-`) olur, tümü büyük harftir.
- **Tür** parçası yalnız `ANNUAL_LEAVE` ve `SHORT_LEAVE` süreçlerinde bulunur; diğer 12
  sürecin dosya adı BT bilgi notundaki (04.08.2026) formatla birebir aynıdır.
- **Departman kodu** organizasyon yönetimindeki birim kodundan gelir. Kod tanımlı değilse
  birim adından türetilmiş en fazla 12 karakterlik kısaltma kullanılır; talep sahibinin
  aktif birimi hiç yoksa `GENEL` + `BILINMEYEN` yazılır.
- **Departman, talebin sonuçlandığı anda** çözülür ve kuyruğa dondurulur — çalışanın
  departmanı sonradan değişse bile geçmiş belgelerin adı ve yeri değişmez. Sabit rotalı
  süreçlerde de dosya adındaki departman talep edenin **kendi** birimidir (klasör sabit,
  ad kişinin birimini taşır — İK bu sayede tek klasörde departmana göre süzebilir).
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

## 5) Ağacın önceden açılması ve izinler

Sistem klasörleri ilk belgeyle açar; BT'nin izinleri belge gelmeden verebilmesi için
ağacın statik kısmı (sonuç klasörüne kadar, **375 yaprak / 530 klasör**) bir admin
endpoint'iyle önceden oluşturulur:

- `GET /api/admin/sharepoint-provision` — her zaman **dry-run**, açılacak yolları listeler.
- `POST /api/admin/sharepoint-provision` `{ "scope"?: "<departman>", "offset"?: n, "limit"?: n }` —
  planın bir partisini (varsayılan 80 klasör) açar ve `nextOffset` döner; `completed: true`
  olana kadar `offset: nextOffset` ile tekrar çağrılır (530 klasör ≈ 7 çağrı). Idempotent,
  var olanlar `existing` sayılır. Tek istekte tamamı Vercel 60 sn sınırına takılır (504).

- `GET | POST /api/admin/sharepoint-migrate` `{ "limit"?: n }` — geçiş dönemi (Ağustos düzeni,
  `{KÖK}/20xx/…`) belgelerini yeni düzene taşır: PDF yeniden üretilmez, Storage'daki nihai
  belge (imzalı tarama dahil) yeni yola yüklenir, eski SharePoint kopyası silinir. GET dry-run;
  POST partiler halinde, `remaining` 0 olana kadar tekrarlanır. Boşalan eski yıl klasörü elle silinir.

Hepsi `ORG_ADMIN` rolü ister. Klasör izinleri SharePoint'te BT tarafından elle
verilir; hangi klasöre kimin erişeceği [sharepoint-arsiv-izin-rehberi.md](sharepoint-arsiv-izin-rehberi.md)'de.

---

## Özet

Örnek bir yıllık izin belgesinin SharePoint'teki tam yeri:

```
RTProd / İşletme / Bakım-Onarım / İzin / Tamamlanan / 2026 / 08-Ağustos /
        └── AHMET-YILMAZ_2026-08-18_BO_BAKIM-ONARIM-DEPARTMANI_2026-000512_YILLIK-IZIN_TAMAMLANDI.pdf
```

Aynı kişinin maaş avansı ise biriminden bağımsız olarak:

```
RTProd / İnsan Kaynakları / Birim Süreçleri / Maaş Avans Talebi / Tamamlanan / 2026 / 08-Ağustos /
        └── AHMET-YILMAZ_2026-08-18_BO_BAKIM-ONARIM-DEPARTMANI_2026-000530_TAMAMLANDI.pdf
```

Belge **açılmadan önce**; kimin talebi olduğu, hangi departmandan geldiği, ne zaman ve
hangi sonuçla kapandığı, klasöründen ve adından eksiksiz okunur.
