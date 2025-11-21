# RT Enerji Organizasyon Sistemi – Yönetici Özeti (MVP)

Bu doküman, geliştirilecek **organizasyon ve kadro yönetim sistemi**nin iş tarafı için ne yaptığını, hangi sorunları çözdüğünü ve ilk fazda (MVP) neler sağlayacağını
kısaca anlatmak için hazırlanmıştır.

---

## 1. Projenin amacı

RT Enerji’deki mevcut durum:

- Organizasyon şemaları farklı Excel / diyagram dosyalarında tutuluyor.
- Birim, pozisyon ve çalışan bilgilerinin güncel ve tek kaynaktan takibi zor.
- Terfiler, departman değişiklikleri ve saha kadroları için **tarihçe** tutulması
  ve geriye dönük kimin nerede çalıştığının görülmesi güç.

Bu sistemin amacı:

- RT Enerji ve bağlı sahaların **organizasyon yapısını tek bir merkezi sistemde**
  toplamak,
- Birimler, pozisyonlar ve çalışanlar için **düzenli ve kontrollü kayıt** sağlamak,
- Çalışanların hangi tarihlerde hangi görevlerde bulunduğunu **tarihçeli** olarak
  kayıt altına almak,
- İleride kurulacak onay ve süreç (workflow) mekanizmaları için sağlam bir
  **altyapı** oluşturmaktır.

---

## 2. Kapsam (MVP – ilk faz)

İlk fazda sistem şunları yapacaktır:

1. **Organizasyon birimlerinin yönetimi**
   - Şirket, kurul, genel müdürlük, direktörlük, departman, ekip ve sahaların
     tanımlanması.
   - Birimler arasında **hiyerarşik ilişki** kurulması (üst/alt birimler).

2. **Pozisyonların (kadro ve görevlerin) yönetimi**
   - Her bir koltuğun tanımlanması: unvan, görev kodu, seviyesini gösteren band,
     hangi birime bağlı olduğu ve kime rapor ettiği.
   - Aynı unvanda birden fazla kadro (ör. birden çok uzman) açılabilmesi.

3. **Çalışan kayıtlarının yönetimi**
   - Çalışanların temel bilgilerinin (ad, sicil, iletişim, işe giriş/çıkış
     tarihleri) tutulması.
   - Çalışan kaydının pozisyondan **bağımsız** olması; kişi değişse de pozisyon
     yapısının korunması.

4. **Çalışan–pozisyon atamalarının yönetimi**
   - "Bu kişi, şu pozisyonda, şu tarihten şu tarihe kadar çalıştı" bilgisinin
     kayıt altına alınması.
   - Terfi, departman değişikliği ve aynı anda birden fazla görev alma gibi
     durumların desteklenmesi.

5. **Güncel organizasyon şemasının görüntülenmesi**
   - Belirli bir tarih (varsayılan: bugün) için hangi pozisyonda hangi
     çalışanların olduğu şema üzerinde görülebilir.

Kapsam dışında (ileriki fazlara bırakılan konular):

- Onay akışları, görev/süreç yönetimi,
- Üretim, lisans, bakım vb. saha teknik verileri,
- İnsan kaynakları bordro, izin vb. modüller.

---

## 3. Sistemin temel kavramları

Sistem aşağıdaki dört temel yapı üzerine kuruludur:

1. **Organizasyon Birimi**  
   
   Şirket, direktörlük, departman, saha işletmesi vb. yapılar. Örneğin:
   - "Mali ve İdari İşler Direktörlüğü",
   - "Elektrik, İnşaat ve Proje İşler Direktörlüğü",
   - "Çekim Enerji Yatırım Üretim ve Tic. A.Ş.",
   - "Çekim Enerji – İşletme".

2. **Pozisyon (Kadro)**  
   
   Organizasyon şemasındaki her bir "kutu". Örneğin:
   - "Genel Müdür / CEO",
   - "Genel Müdür Yardımcısı (GMY100)",
   - "Elektrik İşleri Müdürü (Eİ100)",
   - "Elektrik İşleri Uzmanı (Eİ300)",
   - "Yönetici Asistanı (Ankara)",
   - "Kumanda Operatörü (Çekim Enerji)".

3. **Çalışan**  
   
   Gerçek kişiler. Örneğin "Ramazan Taş", "Bekir Korkmaz". Çalışan kaydı
   pozisyondan ayrıdır; böylece kişi şirket içinde yer değiştirirken tüm
   hareketleri tarihçeli takip edilir.

4. **Atama**  
   
   Çalışan ile pozisyon arasındaki zaman bağlı ilişki.
   Örneğin: "Serdar Kahvecioğlu, 01.03.2019–15.06.2024 tarihleri arasında GES
   İşleri Uzmanı pozisyonunda çalıştı".

---

## 4. Günlük kullanım senaryoları (iş tarafından bakış)

Aşağıdaki örnekler, sistemin günlük hayatta nasıl kullanılacağını gösterir:

1. **Yeni bir direktörlük veya departman açılması**
   - Yönetim kararıyla yeni bir direktörlük kurulduğunda, ilgili birim sistemde
     oluşturulur ve doğru yere bağlanır (ör. Genel Müdürlük altına).
   - Gerekirse altına departman ve ekipler eklenir.

2. **Yeni kadro açılması**
   - Örneğin "Bakım Planlama Uzmanı" kadrosu açılacaksa,
     - İlgili birim altında yeni pozisyon kaydı oluşturulur,
     - Görev kodu ve seviye bandı tanımlanır (ör. BAK300),
     - Kime rapor ettiği (üst pozisyon) belirtilir.

3. **Yeni çalışan işe alınması**
   - Aday işe başladığında çalışan kaydı açılır.
   - İlgili pozisyona ataması yapılır; sistem otomatik olarak bu kişinin
     organizasyon şemasında doğru yere yerleşmesini sağlar.

4. **Terfi veya yer değişikliği**
   - Bir çalışan terfi ettiğinde veya başka bir departmana geçtiğinde,
     - Eski görev dönemi kapanır (bitiş tarihi işlenir),
     - Yeni pozisyona yeni bir dönem açılır.
   - Böylece yıllar sonra bile hangi tarihte nerede çalıştığı görülebilir.

5. **Saha (ör. Çekim Enerji) kadrolarının yönetimi**
   - Çekim Enerji ve benzeri sahalar da sistemde organizasyon birimi olarak
     temsil edilir.
   - Sahanın kendi içindeki pozisyonlar (İşletme Müdürü, Kumanda Operatörleri
     vb.) merkezi modelle aynı şekilde tanımlanır.

6. **Güncel organizasyon şemasının alınması**
   - Belirli bir tarih için sistemden otomatik olarak şema üretilebilir:
     - Hangi birimlerin olduğu,
     - Her birimde hangi pozisyonların bulunduğu,
     - Her pozisyonda kimlerin oturduğu.

7. **Bir çalışanın kariyer yolunun incelenmesi**
   - Örneğin bir müdürün şirkette hangi pozisyonlardan geçtiği,
     - Hangi tarihlerde uzman, şef, müdür olduğu,
     - Hangi sahalarda görev yaptığının
     tamamı tek ekrandan görülebilir.

---

## 5. Gelecek fazlar için altyapı

Bu veri modeli, ileride aşağıdaki geliştirmelere temel olacak şekilde
hazırlanmıştır:

- **Onay ve süreç yönetimi:**
  - İzin, harcama, talep vb. iş akışlarında onaycıların pozisyonlara göre
    otomatik belirlenmesi.

- **Saha odaklı modüller:**
  - Üretim, bakım, arıza takibi gibi fonksiyonların her bir sahaya bağlanması.

- **Diğer sistemlerle entegrasyon:**
  - İnsan kaynakları, bordro, muhasebe gibi sistemlerle çift yönlü veri alışverişi.

İlk fazın teslimiyle birlikte RT Enerji, merkez ve sahalar dahil olmak üzere
organizasyon yapısını tek bir yerde, güncel ve tarihçeli olarak yönetebilen
bir altyapıya sahip olacaktır.

