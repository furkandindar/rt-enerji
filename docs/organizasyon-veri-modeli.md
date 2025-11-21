# RT Enerji Organizasyon Veri Modeli (MVP)

Bu doküman, RT Enerji için geliştirilecek süreç/organizasyon yönetimi uygulamasında kullanılacak **çekirdek organizasyon veri modelini** tanımlar.

## 1. Amaç ve kapsam

Bu modelin amacı:

- RT Enerji ve bağlı sahaların organizasyon yapısını tutmak,
- Birimler, pozisyonlar ve çalışanlar için **tam CRUD** imkânı sağlamak,
- Çalışanların zaman içindeki **görev/pozisyon tarihçesini** izlemek,
- İleride kurulacak onay/süreç mekanizmalarına altyapı hazırlamaktır.

MVP kapsamında **onay akışları** ve **saha teknik verileri** (üretim, lisans, SCADA vb.) tasarlanmamıştır; sadece organizasyon modeli ele alınmıştır.

## 2. Temel kavramlar

- **Organizasyon Birimi (organizational_unit)**
  Şirket, kurul, genel müdürlük, direktörlük, departman, ekip, saha işletmesi gibi yapısal birimler.

- **Pozisyon (position)**
  Organizasyon şemasındaki "koltuk"; job_code ile tanımlanan görev (ör. GMY100, Eİ300, ASİST200).

- **Çalışan (employee)**
  Gerçek kişi; pozisyonlardan bağımsız kimlik kaydı.

- **Görev Kodu (job_code)**
  2–3 harf + 3 haneli sayı formatında, organizasyon genelinde benzersiz kod (ör. Eİ300).

- **Seviye Bandı (level_band)**
  Job code’un son 3 hanesini temsil eden seviye: 100, 200, 300, 400, 500 (yönetici → uzman → personel hiyerarşisi).

- **Atama (employee_position)**
  "X çalışanı, Y pozisyonunda Z–T tarihleri arasında çalıştı" bilgisini tutan kayıt.

## 3. Genel tablo listesi

**Sözlük / referans tablolar**

1. `unit_types` – Organizasyon birimi tipleri.
2. `position_types` – Pozisyon tipleri.
3. `grade_levels` – Seviye bantları (100/200/300/400/500).

**Ana tablolar**

4. `organizational_units` – Organizasyon birimleri (merkez, direktörlükler, sahalar vb.).
5. `positions` – Pozisyonlar / görevler (GMY100, Eİ300, asistanlar, stajyerler…).
6. `employees` – Çalışanlar (kişiler).
7. `employee_positions` – Çalışan–pozisyon atamaları (kim, nerede, hangi tarihler arasında).

Ek olarak, kimlik doğrulama ve yetkilendirme için uygulama katmanında kullanılan bir tablo daha vardır:

- `app_users` – Uygulama kullanıcıları ve roller (Supabase `auth.users` ile 1–1 ilişkili; bkz. Bölüm 8).

Tüm ilişkiler Postgres FK’ları ile tanımlanacaktır; silme işlemlerinde **soft delete** (is_active alanı veya end_date kullanımı) tercih edilir.

## 4. Sözlük tabloları

### 4.1. `unit_types` – Organizasyon birimi tipleri

Organizasyon birimlerinin kategorilerini tanımlar.

Örnek alanlar:

- `id` – PK.
- `code` – Teknik kod (örn. `COMPANY`, `BOARD`, `GENERAL_MANAGEMENT`, `DIRECTORATE`, `DEPARTMENT`, `TEAM`, `SUBSIDIARY`, `PLANT_OPERATION`).
- `name` – Görünen ad ("Direktörlük", "Departman", "Saha İşletmesi" vb.).
- `description` – Açıklama (opsiyonel).
- `is_active` – Kullanımda mı.
- `display_order` – Listeleme sırası.

Kullanım: `organizational_units.unit_type_id` → `unit_types.id`.

### 4.2. `position_types` – Pozisyon tipleri

Pozisyonları kategori bazında sınıflandırır.

Örnek alanlar:

- `id` – PK.
- `code` – `EXECUTIVE`, `MANAGER`, `SPECIALIST`, `ASSISTANT`, `INTERN`, `STAFF`…
- `name` – "Üst Yönetim", "Müdür", "Uzman", "Asistan", "Stajyer" vb.
- `color` – Org chart görselleştirmesi için renk kodu (örn. asistanlar sarı).
- `description` – Açıklama.
- `is_active`.
- `display_order`.

Kullanım: `positions.position_type_id` → `position_types.id`.

### 4.3. `grade_levels` – Seviye bantları

Seviye bandı sistemini standartlaştırır.

Örnek alanlar:

- `id` – PK.
- `band` – 100, 200, 300, 400, 500 (UNIQUE).
- `name` – "Müdür Seviyesi", "Şef Seviyesi", "Uzman Seviyesi" vb.
- `description` – Departmanlar arası notlar.
- `is_active`.
- `display_order`.

Kullanım: `positions.level_band` alanı `grade_levels.band` alanına FK ile bağlanır.

## 5. Ana tablolar

### 5.1. `organizational_units` – Organizasyon birimleri

RT Enerji ve bağlı sahaların tüm yapısal birimlerini tutar.

Örnek kayıtlar:

- RT Enerji (type: `COMPANY`, parent: null).
- Yönetim Kurulu (type: `BOARD`, parent: RT Enerji).
- Genel Müdürlük (type: `GENERAL_MANAGEMENT`, parent: RT Enerji).
- Mali ve İdari İşler Direktörlüğü (type: `DIRECTORATE`).
- Elektrik, İnşaat ve Proje İşler Direktörlüğü (type: `DIRECTORATE`).
- Elektrik İşleri Departmanı (type: `DEPARTMENT`).
- Çekim Enerji Yatırım Üretim ve Tic. A.Ş. (type: `SUBSIDIARY`).
- Çekim Enerji – İşletme (type: `PLANT_OPERATION`).

Örnek alanlar:

- `id` – PK.
- `name` – Birim adı.
- `code` – Kısa kod (MAI, EIP, GESD…).
- `unit_type_id` – FK → `unit_types.id`.
- `parent_id` – FK → `organizational_units.id` (üst birim).
- `is_active` – Birim açık mı.
- `order_index` – Aynı seviyedeki birimler için sıralama.
- `description` – Açıklama.
- `created_at`, `updated_at`.

### 5.2. `positions` – Pozisyonlar / görevler

Organizasyon şemasındaki tüm koltukları tutar.

Örnek alanlar:

- `id` – PK.
- `title` – Pozisyon adı ("Genel Müdür", "Elektrik İşleri Uzmanı"…).
- `job_code` – Tam görev kodu (örn. `GMY100`, `Eİ300`, `ASİST200`).
- `level_band` – 100/200/300/400/500 → FK → `grade_levels.band`.
- `unit_id` – FK → `organizational_units.id` (hangi birime bağlı).
- `reports_to_position_id` – FK → `positions.id` (üst pozisyon, null = en tepe).
- `position_type_id` – FK → `position_types.id`.
- `location` – Opsiyonel lokasyon ("Ankara", "Antalya", "Merkez").
- `is_unit_head` – Bu birimin baş pozisyonu mu (bool).
- `is_active` – Kadro açık mı.
- `order_index` – Aynı üst pozisyona rapor edenler için sıralama.
- `created_at`, `updated_at`.

Notlar:

- Aynı unvanda çoklu kadro (2 Elektrik Uzmanı) ayrı satırlar olarak tutulur (ör. `Eİ300`, `Eİ301`).
- Hiyerarşi pozisyonlar üzerinden kurulur; çalışan değişse bile yapı bozulmaz.

### 5.3. `employees` – Çalışanlar

Gerçek kişileri tutar; pozisyon bilgisi içermez.

Örnek alanlar:

- `id` – PK.
- `first_name`, `last_name`.
- `employee_no` – Sicil / personel numarası (UNIQUE, opsiyonel).
- `email`, `phone` – İletişim bilgileri (opsiyonel).
- `status` – `ACTIVE`, `INACTIVE` (ve gerekirse diğer durumlar).
- `hire_date` – İlk işe giriş tarihi.
- `termination_date` – Ayrılış tarihi (devam ediyorsa null).
- `created_at`, `updated_at`.

Silme yerine `status = INACTIVE` yaklaşımı tercih edilir; geçmiş atamalar korunur.

### 5.4. `employee_positions` – Çalışan–pozisyon atamaları

"Kim, hangi pozisyonda, hangi tarihler arasında çalıştı" bilgisini tutar.

Örnek alanlar:

- `id` – PK.
- `employee_id` – FK → `employees.id`.
- `position_id` – FK → `positions.id`.
- `start_date` – Pozisyonda başlangıç tarihi.
- `end_date` – Bitiş tarihi (aktif ise null).
- `is_primary` – Çalışanın aynı anda birden fazla pozisyonu varsa ana görevi (bool).
- `created_at`, `updated_at`.

Kullanım örnekleri:

- İşe giriş: yeni `employees` kaydı + ilgili pozisyon için `employee_positions` kaydı (`end_date null`).
- Terfi: eski atamanın `end_date` alanı doldurulur, yeni pozisyon için yeni kayıt açılır.
- Aynı anda iki görev: aynı `employee_id` için iki aktif kayıt; biri `is_primary = true`.

### 5.5. `app_users` – Uygulama kullanıcıları (özet)

Bu tablo, organizasyon verisinin bir parçası olmaktan çok **uygulama tarafı yetki**
katmanı için kullanılır.

Örnek alanlar:

- `id` – PK. Supabase `auth.users.id` ile bire bir aynıdır.
- `email` – Kullanıcının kurumsal e‑postası (`@rtenerji.com`).
- `employee_id` – Opsiyonel FK → `employees.id` (bu kullanıcı hangi çalışana karşılık geliyor?).
- `role` – Uygulama içi rol/ yetki (`ORG_ADMIN`, `ORG_VIEWER` vb.).
- `created_at` – Oluşturulma zamanı.

Not: `app_users`, login ve rol yönetimi için teknik bir tablodur; iş/organizasyon modeli
açısından zorunlu değildir ancak yetki kontrolü ve RLS politikaları için temel alınır.

## 6. Sahalar (sites) ile ilgili not

MVP kapsamında **ayrı bir `sites` tablosu yoktur**. Sahalar ve bağlı şirketler, `organizational_units` tablosunda uygun `unit_type` değerleri ile temsil edilir (`SUBSIDIARY`, `PLANT_OPERATION` vb.).

Gelecekte saha bazlı teknik/operasyonel modüller (üretim, bakım, lisans vb.) geliştirilmeye karar verilirse, fiziksel sahaları temsil eden ayrı bir `sites` tablosu açılması bir **geliştirme adımı** olarak planlanabilir.

## 7. Örnek kullanım senaryoları (kavramsal)

### 7.1. Yeni birimlerin oluşturulması

**Amaç:** RT Enerji merkezinde yeni bir direktörlük ve altında departman oluşturmak; ayrıca yeni bir saha işletmesi eklemek.

1. `unit_types` sözlüğünde gerekli tiplerin tanımlı olduğundan emin olunur:
   - `DIRECTORATE`, `DEPARTMENT`, `SUBSIDIARY`, `PLANT_OPERATION` vb.
2. `organizational_units` tablosunda yeni direktörlük kaydı oluşturulur:
   - `name = "Bakım Yönetimi Direktörlüğü"`
   - `code = "BAKIM"`
   - `unit_type_id = (DIRECTORATE)`
   - `parent_id = (Genel Müdürlük biriminin id'si)`
   - `is_active = true`.
3. Aynı tabloda bu direktörlüğe bağlı departman oluşturulur:
   - `name = "Bakım Planlama Departmanı"`
   - `unit_type_id = (DEPARTMENT)`
   - `parent_id = (Bakım Yönetimi Direktörlüğü id'si)`.
4. Yeni bir saha (ör. "X Enerji") RT Enerji'ye bağlı ayrı bir şirket olarak eklenecekse:
   - `organizational_units` içine `unit_type_id = SUBSIDIARY` olacak şekilde "X Enerji ... A.Ş." kaydı açılır.
   - Aynı saha için işletme birimi eklenir: `unit_type_id = PLANT_OPERATION`, `parent_id = (X Enerji ... A.Ş.)`.
5. İlgili birimlere ait pozisyonlar `positions` tablosunda tanımlanır (müdür, şef, uzman vb.), `unit_id` alanları bu yeni birimleri gösterecek şekilde ayarlanır.

### 7.2. Yeni çalışan kaydı ve ilk ataması

**Amaç:** Şirkete yeni başlayan bir uzmanının kaydını oluşturmak ve ilgili pozisyona atamak.

1. `employees` tablosuna çalışan kaydı eklenir:
   - `first_name`, `last_name`, `employee_no`, `email`, `phone` doldurulur.
   - `status = ACTIVE`, `hire_date = işe başlama tarihi` olarak ayarlanır.
2. Çalışanın yerleştirileceği pozisyon `positions` tablosunda bulunur veya gerekiyorsa yeni pozisyon oluşturulur (ör. "Elektrik İşleri Uzmanı", `job_code = Eİ300`).
3. `employee_positions` tablosuna atama kaydı oluşturulur:
   - `employee_id = (yeni çalışanın id'si)`
   - `position_id = (ilgili pozisyonun id'si)`
   - `start_date = işe/atamaya başlama tarihi`
   - `end_date = null`
   - `is_primary = true`.

### 7.3. Terfi veya departman değişimi

**Amaç:** Mevcut bir çalışanın başka bir pozisyona geçişini tarihçeli şekilde kaydetmek.

1. Çalışanın aktif ataması bulunur:
   - `employee_positions` içinde `employee_id = X` ve `end_date IS NULL` kaydı alınır.
2. Bu kayıt güncellenir:
   - `end_date = yeni pozisyona geçiş tarihi - 1 gün` (veya aynı tarih mantığına göre).
3. Çalışanın yeni pozisyonu `positions` tablosunda belirlenir (ör. Eİ300 → Eİ100 terfisi veya başka bir departman pozisyonu).
4. Yeni pozisyon için `employee_positions` tablosunda yeni atama kaydı açılır:
   - `employee_id = X`
   - `position_id = (yeni pozisyon id'si)`
   - `start_date = terfi/değişim tarihi`
   - `end_date = null`
   - `is_primary = true`.

### 7.4. Bugün itibarıyla org şemasının görüntülenmesi

**Amaç:** Bugün itibarıyla her pozisyonda kimlerin oturduğunu görmek.

1. `positions` tablosundan `is_active = true` olan pozisyonlar alınır.
2. Her pozisyon için `employee_positions` tablosunda `end_date IS NULL` olan atamalar bulunur.
3. Bu atamalardaki `employee_id` değerleri ile `employees` tablosu birleştirilerek çalışan isimleri gösterilir.
4. Görselleştirme için:
   - Pozisyonlar, `reports_to_position_id` alanına göre ağaç yapısında çizilir.
   - İlgili pozisyona bağlı çalışan(lar) kutu içinde gösterilir.

### 7.5. Bir çalışanın kariyer tarihçesinin izlenmesi

**Amaç:** Bir çalışanın şirkette zaman içinde hangi pozisyonlarda çalıştığını görmek.

1. `employee_positions` tablosu `employee_id = X` ile filtrelenir.
2. Kayıtlar `start_date` alanına göre kronolojik olarak sıralanır.
3. Her kayıt için ilgili `position` ve `organizational_unit` bilgisi join ile alınır.
4. Ekranda, her satır şu bilgilerle gösterilebilir:
   - Birim adı (organizational_unit)
   - Pozisyon adı ve job_code
   - Başlangıç ve bitiş tarihleri
   - `is_primary` bilgisi (aynı anda birden çok görev varsa ana görev hangisi).

Bu model, yukarıdaki senaryolar ve benzeri organizasyonel ihtiyaçlar için esnek ve tarihçeli bir altyapı sunar.

## 8. Kullanıcılar, roller ve auth ile ilişkisi (özet)

Bu dokümanda anlatılan 7 tablo **organizasyon verisini** tutar; uygulamaya kimlerin
nasıl giriş yaptığı ve hangi CRUD yetkisine sahip olduğu ise **ayrı bir katmanda**
çözülür.

- Kimlik doğrulama Supabase Auth üzerinden yapılır ve RT Enerji’nin
  **Microsoft/Azure (Outlook)** hesapları ile SSO kullanılır.
- Auth katmanındaki her kullanıcı için uygulama tarafında ayrı bir tablo
  tanımlanır (örneğin `app_users`):
  - `id` → `auth.users.id` ile bire bir aynıdır.
  - `email` → kullanıcının kurumsal e‑postası (`@rtenerji.com`).
  - `role` → uygulama içi yetki seviyesi (örn. `ORG_ADMIN`, `ORG_VIEWER`).
  - `employee_id` (opsiyonel) → bu kullanıcı hangi `employees` kaydına karşılık geliyor?

Bu tasarım sayesinde:

- **Çalışan (`employees`)** tablosu, şirketteki herkesin organizasyonel
  tarihçesini tutar (kim, nerede, ne zaman çalıştı).
- **Uygulama kullanıcısı (`app_users`)** ise, sadece sisteme giriş yapan ve
  belli bir rol/yetkiyle çalışan kişileri temsil eder.
- Bir kullanıcı için gerekirse `employee_id` alanı kullanılarak ilgili çalışan
  kaydına bağ kurulabilir; bu ilişki zorunlu değildir, kademeli olarak
  tamamlanabilir.

Roller (örneğin `ORG_ADMIN` / `ORG_VIEWER`) uygulama katmanında
`app_users.role` üzerinden yönetilir; veri modeli herhangi bir departmana
(İK, muhasebe vb.) sabitlenmez. Hangi kişinin hangi rolü alacağı tamamen
RT Enerji’nin iş kararına bırakılmıştır.


