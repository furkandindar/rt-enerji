# RT Enerji Organizasyon Sistemi
## Veritabanı ve Auth Teknik Tasarım (MVP)

Bu doküman, organizasyon veri modeli için **SQL/RLS/trigger** tasarımlarını içeren
"teknik ek"tir. Temel kavramlar ve tablo açıklamaları için
`organizasyon-veri-modeli.md` dosyası referans alınmalıdır.

---

## 1. Mimari genel yaklaşım

MVP aşağıdaki katmanlar üzerinde çalışacaktır:

1. **Supabase Auth (`auth.users`)**  
   - Kimlik doğrulama katmanı.  
   - Kullanıcılar **Microsoft Azure (Entra ID) / Outlook hesabı** ile giriş yapar.  
   - Uygulamaya sadece `@rtenerji.com` hesapları erişebilir (Azure + uygulama kontrolüyle).

2. **Uygulama kullanıcısı tablosu (`public.app_users`)**  
   - `auth.users` ile **1–1 eşleşir** (`id` alanı aynıdır).  
   - Uygulama içi rol ve yetkiler burada tutulur:  
     - Örn. `role = 'ORG_ADMIN' | 'ORG_VIEWER'`.  
   - Opsiyonel olarak bir **çalışan kaydına** bağlanır:  
     - `employee_id` → `public.employees.id`.

3. **Organizasyon verisi (7 temel tablo)**  
   - `unit_types`, `position_types`, `grade_levels`  
   - `organizational_units`, `positions`, `employees`, `employee_positions`  
   - Bu tablolar tamamen **iş verisini** tutar; login ve rol mantığı bu katmanın dışında tutulur.

---

## 2. Roller ve yetki modeli (MVP)

Uygulama seviyesinde en az iki rol tanımlanacaktır:

- `ORG_ADMIN`  
  - Organizasyon yapısı üzerinde **tam yetki** (CRUD).  
  - Birim, pozisyon, çalışan ve atama kayıtlarını yönetebilir.

- `ORG_VIEWER`  
  - Organizasyon şemasını ve çalışan/kariyer bilgilerini **sadece okuyabilir**.  
  - CRUD yetkisi yoktur.

Bu roller **departmana göre sabitlenmeyecektir** (sadece İK’ya bağlı olmak zorunda değil).  
Hangi kişilere `ORG_ADMIN` verileceği tamamen RT Enerji’nin kararıdır ve
`app_users.role` alanı üzerinden yönetilecektir.

---

## 3. Çalışan ile kullanıcı ilişkilendirme stratejisi

Veri modeli, **çalışan (employees)** ile **uygulama kullanıcısını (app_users)** ayırır:

- `employees`  
  - Şirketteki tüm çalışanları temsil eder.  
  - Organizasyonel bilgiler (pozisyon atamaları, kariyer tarihi) bu tabloya bağlıdır.

- `app_users`  
  - Uygulamaya giriş yapabilen hesapları temsil eder.  
  - Kimlik kaynağı `auth.users` (Supabase Auth / Azure).  
  - Rol (`role`) ve isteğe bağlı çalışan bağlantısı (`employee_id`) burada tutulur.

### 3.1. Seçilen strateji (Senaryo A - esnek)

1. **Çalışanlar mümkün olduğunca önceden yüklenir.**  
   - İK / Excel kaynaklarından `employees` tablosu doldurulur (ad, soyad, email vb.).

2. Kullanıcı ilk kez Azure üzerinden login olduğunda:
   - Supabase, `auth.users` kaydını oluşturur.  
   - Bir trigger / edge function, `public.app_users` tablosunda kayıt açar:
     - `id = auth.users.id`
     - `email = auth.users.email`
     - `role = 'ORG_VIEWER'` (varsayılan)

3. Aynı fonksiyon, `employees` tablosunda **email ile eşleşme** arar:
   - Eşleşen çalışan bulunursa:  
     - `app_users.employee_id = employees.id` atanır (otomatik bağlama).  
   - Eşleşme bulunamazsa:  
     - `employee_id` **boş bırakılır** (kullanıcı yine de sisteme girebilir).  
     - Gerekirse daha sonra bir yönetici paneli üzerinden
       ilgili `employees` kaydıyla manuel eşleştirme yapılır.

Bu sayede:
- Sistemi yayına almadan önce çalışan listesi yüklenirse çoğu kullanıcı **otomatik eşleşir**.
- Önceden yüklenmemiş veya email formatı farklı çalışanlar için **zorunlu bağlama yoktur**;  
  bu kayıtlar zamanla manuel olarak düzeltilebilir.

---

## 4. Sonraki adımlar (bu dokümana eklenecekler)

Aşağıdaki başlıklar, bu teknik dokümana adım adım eklenecektir:

1. **Tablo şemaları (CREATE TABLE)**  
   - Sözlük tablolar: `unit_types`, `position_types`, `grade_levels`  
   - Ana tablolar: `organizational_units`, `positions`, `employees`, `employee_positions`  
   - Uygulama kullanıcıları: `app_users`.

2. **Trigger ve fonksiyonlar**  
   - `auth.users` için `INSERT` sonrası çalışan `app_users` kaydı oluşturan fonksiyon.  
   - Email üzerinden `employees` ile otomatik eşleştirme yapan mantık.

3. **RLS (Row Level Security) politikaları**  
   - `ORG_ADMIN` için tam CRUD, `ORG_VIEWER` için sadece SELECT kuralları.  
   - Gerekirse bazı sözlük tabloları için herkese açık okuma izinleri.

Bu adımlar ilerleyen aşamalarda doldurulacak ve bu dosya, veritabanı ve güvenlik
tarafında referans alınacak ana teknik doküman olacaktır.

