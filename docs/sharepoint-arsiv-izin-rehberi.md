# SharePoint Arşiv Klasör İzinleri — BT Rehberi

### Arşiv ağacında hangi klasöre kimin erişeceği; izinler SharePoint'te BT tarafından elle verilir

> Bu rehber, Geliştirme Talebi AS0001 / Teknik Gereksinim §6'daki erişim kurallarının
> SharePoint klasör izinlerine çevrilmiş halidir. Uygulama (BYS) tarafında yetki otomasyonu
> **yoktur** — bilinçli karar (Eylül 2026): önce yapı, izinler elle; ihtiyaç doğarsa
> otomasyon ayrı çalışma. Ağaç ve isimlendirme: [dosya-isimlendirme-standardi.md](dosya-isimlendirme-standardi.md).

---

## 1) Ön koşullar

1. **Ağaç açılmış olmalı.** İzin ancak var olan klasöre verilir. Deploy sonrası ORG_ADMIN bir
   hesapla `POST /api/admin/sharepoint-provision` çalıştırılır (önce `GET` ile dry-run listesine
   bakılabilir). Yanıtta `completed: true` ve `failed: []` görülmeli; değilse aynı istek tekrarlanır.
2. **Miras mantığı.** SharePoint'te alt klasörler izinleri üstten devralır. İzinler yalnız
   aşağıdaki **sabit** klasörlere verilir; sonradan sistemin açtığı `Yıl/Ay` klasörleri ve
   yüklenen dosyalar bulundukları klasörün iznini otomatik alır — tek tek ayar gerekmez.
3. **Uygulamanın kimliği etkilenmez.** BYS, SharePoint'e Graph app-only kimliğiyle
   (`Sites.Selected`, site düzeyinde yazma) yükler; klasör izinleri bu kimliği kısıtlamaz.
   Kullanıcı izinleri yalnız SharePoint'te gezinen kişileri etkiler.
4. Eski `Talepler/…` arşivi yerinde kalır; yeni belge gitmez. Erişimi BT'nin takdirinde.
5. **Geçiş dönemi klasörü `{KÖK}/2026/…`:** 20.08.2026 ile bu yapının devreye girdiği tarih
   arasında arşivlenen belgeler (~460) Ağustos düzeninde (`Yıl/Ay/Belgeler/Tür/Sonuç`) bu
   klasörde durur; birim bazlı izin verilemez. Öneri: yalnız BT + asistanlara açık bırakın.
   İstenirse `POST /api/admin/sharepoint-migrate` ile herhangi bir zamanda yeni düzene taşınır.

---

## 2) İzin matrisi

Roller teknik doküman §6'dan; kişi/grup atamasını BT yapar (önerilen: birim başına bir
Microsoft 365 / SharePoint grubu, kişiler gruba eklenir).

| Klasör | Kim görür | Not |
|---|---|---|
| `{KÖK}` (örn. `RTProd`) — tamamı | **Yönetici asistanları** (Antalya, Ankara): okuma; **BT / sistem yöneticisi**: tam | Kökte verilir, her şeye miras kalır. Diğer herkes için kök izni **kaldırılır** (miras kesilir). |
| `Taş Havacılık ve Yatçılık`, `Hukuk Müşavirliği` | Bu departmanın üyeleri | Birimsiz departman — formlar doğrudan altında. |
| `İzin, Lisans ve Harita İşleri/{Harita İşleri, İzin İşleri, Orman İşleri}` | İlgili birimin üyeleri | Departman klasörüne değil, **birim** klasörüne verilir; üst klasör yalnız gezinme için görünür kalır. |
| `İşletme/{Üretim, Enerji Satış, Bakım-Onarım}` | İlgili birimin üyeleri | |
| `Elektrik, İnşaat ve Proje İşleri/{Elektrik İşleri, GES İşleri}` | İlgili birimin üyeleri | |
| `Elektrik, İnşaat ve Proje İşleri/İnşaat İşleri/{Merkez, Saha}` | İlgili alt birimin üyeleri | Merkez ve Saha ayrı verilir. |
| `Mali ve İdari İşler/İdari İşler` | İdari İşler + Destek Hizmetleri üyeleri | Destek Hizmetleri arşivde İdari İşler'e katlanır. |
| `Mali ve İdari İşler/Mali İşler/Finans/Bireysel Süreçler` | Finans üyeleri | |
| `Mali ve İdari İşler/Mali İşler/Finans/Birim Süreçleri` | **Yalnız** finans onay kapağı sürecinin yetkilileri | Kısıtlı — birimin diğer üyeleri görmez (§6). |
| `Mali ve İdari İşler/Mali İşler/Muhasebe/Bireysel Süreçler` | Muhasebe üyeleri | |
| `Mali ve İdari İşler/Mali İşler/Muhasebe/Birim Süreçleri` | **Yalnız** muhasebe onay kapağı sürecinin yetkilileri | Kısıtlı. |
| `İnsan Kaynakları/Bireysel Süreçler` | İK üyeleri | |
| `İnsan Kaynakları/Birim Süreçleri` | **Yalnız** İK ekibi (fazla mesai, işe giriş/çıkış, maaş avansı) | Kısıtlı — tüm şirketin belgeleri burada; talep eden kendi belgesini SharePoint'ten değil BYS'den görür. |
| `Genel Müdürlük` | Genel Müdür, Yönetim Kurulu, asistanlar | Dokümanda yoktu; GM/YK/asistan taleplerinin klasörü. |
| `Diğer` | Yalnız BT + asistanlar | Eşlenmemiş birim uyarısı; burada belge birikiyorsa `UNIT_ARCHIVE_BASES` tablosuna satır eklenmeli. Klasör ilk belgeyle kendiliğinden açılır, önceden yoktur. |

**Uygulama sırası (öneri):** kökte miras kesilip yalnız asistan + BT bırakılır → her birim
klasöründe miras kesilip o birimin grubu eklenir → `Birim Süreçleri` klasörlerinde miras
kesilip yalnız yetkili kişiler bırakılır. Bu sırayla gidilince "birim üyesi komşu birimi
görmez, yetkili olmayan kapak/İK klasörünü görmez, asistanlar her şeyi görür" sağlanır.

---

## 3) Açık karar — izin ve harcama belgelerinin görünürlüğü

Teknik doküman "birim üyeleri kendi biriminde arşivlenen belgeleri görür" der. Bu, aynı
birimdeki herkesin birbirinin **izin, harcama, görev** belgesini görebilmesi demektir. Maaş
avansı için ayrıca kısıt konmuş (İK Birim Süreçleri) ama izin/harcama için konmamıştır.

Karar BT / yönetimindir; iki seçenek de **kod değişikliği gerektirmez**:

- **Tüm birim görsün** — yukarıdaki matris olduğu gibi uygulanır.
- **Yalnız birim amiri görsün** — ilgili birimin `İzin` (ve istenirse `Harcama Formu`)
  klasöründe miras kesilip yalnız amir bırakılır; diğer form klasörleri birim grubuna açık kalır.

---

## 4) Bakım

- **Yeni birim açıldı:** `lib/sharepoint/folder-mapper.ts` → `UNIT_ARCHIVE_BASES`'e satır
  (anahtar: birim kodunun Türkçe karaktersiz büyük harf hali) → deploy →
  `POST /api/admin/sharepoint-provision { "scope": "<departman>" }` → BT yeni klasöre izin verir.
  Satır eklenene kadar o birimin belgeleri `Diğer`'de birikir ve logda uyarı düşer.
- **Birim adı değişti:** Klasör adları koddaki tablodan gelir, DB'deki ad değişikliği
  arşivi etkilemez (bilinçli — geçmiş belgeler yerinden oynamaz). Klasör adının da değişmesi
  isteniyorsa tabloda ad güncellenir; eski klasördeki belgeler yerinde kalır.
- **Yeni süreç eklendi:** `STANDARD_FORM_FOLDERS` (birim bazlı) ya da `FIXED_ROUTE_FOLDERS`
  (sabit) tablosuna satır; eklenmezse belgeler `{birim}/Diğer`'e düşer.
- **Kim nereye erişiyor, denetim:** SharePoint → klasör → *Erişimi yönet* ekranı tek kaynaktır;
  BYS tarafında kayıt tutulmaz.
