# RT Enerji — Proje Onboarding Dokümanı

> **Kimin için:** Projeye yeni katılan geliştirici **ve** kullandığı AI agent (Claude Code, Cursor vb.).
> **Nasıl kullanılır:** Önce baştan sona bir kez oku. AI agent kullanıyorsan bu dosyayı ve repo kökündeki `CLAUDE.md`'yi bağlama (context) ekle — `CLAUDE.md` agent'ın uyması gereken kuralların kısa özetidir, bu doküman ise tam resimdir.
> **Güncellik:** 2026-07-08 itibarıyla yazıldı. Sistemin genel anlatımı için ikinci durak: [docs/genel-bakis.md](docs/genel-bakis.md).

---

## 1. Bu sistem ne işe yarar?

RT Enerji'nin **kurumsal onay süreçleri + organizasyon yönetimi** platformu. İki ana yetenek:

1. **Onay süreçleri (workflow):** İzin, fazla mesai, harcama, maaş avansı, mukayese, görev, kaşe onayı, olur yazısı, onay kapağı vb. **14 süreç** dijital olarak yürütülür. Talep açılır → onay zincirinden geçer → süreç sonunda **imzalı/kaşeli PDF** üretilir → SharePoint'e otomatik arşivlenir.
2. **Organizasyon yönetimi:** Şirketler, birimler (hiyerarşik), pozisyonlar, çalışanlar ve **tarihçeli** pozisyon atamaları; ReactFlow ile org şeması.

**Durum:** Faz 1 **canlıda ve aktif kullanılıyor** (Haziran 2026'dan beri). Faz 2 (İK derinleşmesi: izin bakiyesi, zimmet, performans, mobil) tasarım aşamasında — özet: [docs/faz2-yonetici-ozeti.md](docs/faz2-yonetici-ozeti.md).

**Dil:** UI, kod yorumları ve dokümantasyon **Türkçe**; kod tanımlayıcıları (değişken/tablo/enum) İngilizce.

---

## 2. Teknoloji yığını

| Katman | Teknoloji |
|---|---|
| Frontend | **Next.js 16** (App Router) · **React 19** · TypeScript |
| UI | shadcn/ui (Radix) · Tailwind CSS v4 · lucide-react · sonner · motion |
| Form | react-hook-form + **Zod v4** |
| Backend | **Supabase** — PostgreSQL + Auth + Storage + Realtime (ayrı backend servisi yok; API = Next.js route handler'ları) |
| Kimlik | **Microsoft Azure / Entra ID SSO** (yalnızca `@rtenerji.com`; şifreli giriş YOK) |
| Entegrasyon | **Microsoft Graph** — e-posta, Outlook takvim, To-Do, SharePoint |
| Belge | `@react-pdf/renderer` (şablonlar) · `pdf-lib` (imza/kaşe/birleştirme) · ExcelJS/xlsx |
| Durum | Zustand (bildirimler) · React Context (kullanıcı) · URL query param (filtre/sayfalama) |
| Arka plan | pg_cron + pg_net (SharePoint retry — **yalnız prod'da**) |

---

## 3. Ortamlar — ⚠️ önce bunu oku

| Ortam | Supabase projesi | Ne var? |
|---|---|---|
| **dev** | `ghrfpfapklbswydmyutb` | Test verisi. Senin çalışma alanın. Şema prod ile birebir tutulur. |
| **prod** | `iiagqsbiexyukupkffwb` | **GERÇEK kullanıcılar, gerçek talepler, gerçek imzalar.** Vercel'de yayında. |

**Kurallar (pazarlıksız):**

1. Lokal `.env.local` **her zaman dev** projesine bağlanır. Prod anahtarları lokalde bulunmaz.
2. **Prod'a hiçbir koşulda yazma yapılmaz**; prod'u incelemek gerekiyorsa Furkan'la birlikte, read-only.
3. **Veritabanına yazma işlemi (INSERT/UPDATE/DELETE/DDL) AI agent tarafından yapılmaz** — dev'de bile. AI SQL üretir, insan inceleyip Supabase SQL Editor'de kendisi çalıştırır. (Ayrıntılı kural seti: [docs/workflows/README.md](docs/workflows/README.md) baş kısmı.)
4. Uygulama üzerinden (UI'dan talep açmak, onaylamak) dev DB'sine veri girmek serbest — test bunun için var.

**E-posta uyarısı:** Onay aksiyonları Microsoft Graph ile **gerçek e-posta** gönderir (`AZURE_MAIL_FROM` hesabından). `.env.local`'inde mail secret'ları varsa, dev'de onaycı olarak seçtiğin kişiye gerçekten mail gider. Test kullanıcıları dışında kimseyi onay zincirine sokma. Mail secret'ları sende yoksa e-posta bildirimi sessizce atlanır — bu bir hata değildir.

**SharePoint:** `SHAREPOINT_SYNC_ENABLED=false` iken senkron tamamen kapalıdır (killswitch). Cron retry altyapısı (pg_cron) yalnız prod'da kuruludur; lokalde PDF üretimi çalışır ama SharePoint'e gitmez — normaldir.

---

## 4. Lokal kurulum (adım adım)

**Gereksinimler:** Node.js 18+ (20 önerilir), npm, git.

```bash
git clone <repo-url>          # erişimi Furkan verir
cd rt-enerji-frontend
npm install
# .env.local dosyasını Furkan'dan hazır al, repo köküne koy
npm run dev                   # → http://localhost:3000
```

### `.env.local` değişkenleri

| Değişken | Ne işe yarar |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Dev** Supabase bağlantısı (tarayıcı + sunucu) |
| `SUPABASE_SERVICE_ROLE_KEY` | RLS'i aşan sunucu anahtarı (PDF üretimi, onay motoru). **Gizli — asla client koduna/loglara sızmasın** |
| `AZURE_TENANT_ID` / `AZURE_CLIENT_ID` / `AZURE_CLIENT_SECRET` | Microsoft Graph app-only kimlik (mail, SharePoint) |
| `AZURE_MAIL_FROM` | Bildirim maillerinin gönderen hesabı |
| `NEXT_PUBLIC_APP_URL` | E-postalardaki bağlantıların taban URL'i (lokalde `http://localhost:3000`) |
| `SHAREPOINT_SITE_URL` / `SHAREPOINT_LIBRARY_NAME` / `SHAREPOINT_ROOT_FOLDER` | Arşiv hedefi |
| `SHAREPOINT_SYNC_ENABLED` | Killswitch — lokalde `false` tut |
| `SHAREPOINT_MAX_RETRY_ATTEMPTS` | Retry üst sınırı |
| `CRON_SECRET` | `/api/cron/*` uçlarının bearer token'ı |

### İlk giriş — bunlar yoksa uygulama "boş" görünür

Giriş **yalnızca Azure SSO** ile (`@rtenerji.com` hesabı şart; şifre formu yok). İlk girişte DB trigger'ı (`handle_auth_user_created`) otomatik bir `app_users` kaydı açar ve e-posta üzerinden `employees` tablosunda eşleşme arar:

- **E-posta eşleşen bir `employees` kaydı varsa** → `employee_id` otomatik bağlanır. ✅
- **Yoksa** → `employee_id` **kalıcı NULL** kalır (sonradan employee eklense bile geri bağlayan mekanizma yok). Kullanıcı giriş yapabilir ama talep açamaz, onay göremez. Bu bilinen bir boşluktur (bkz. §11).

**Bu yüzden sıralama önemli:** senin test hesabının e-postasıyla bir `employees` kaydı + aktif bir **pozisyon ataması** (`employee_positions`) **girişten önce** dev DB'de hazır olmalı. Pozisyon ataması olmazsa onay zinciri kurulamaz (birim amiri çözülemez).

> **Hazırlayan için kontrol listesi:** ① repo erişimi ② dev `.env.local` ③ `@rtenerji.com` test hesabı ④ dev DB'de aynı e-postayla `employees` kaydı ⑤ pozisyon ataması ⑥ rol kararı (`app_users.role`: test için önce `ORG_VIEWER`, sonra `ORG_ADMIN` denemesi).

İlk girişte bir **KVKK/gizlilik onayı** ekranı gelir — kabul etmeden uygulama açılmaz (`privacy_accepted_at`).

### Komutlar

```bash
npm run dev         # geliştirme sunucusu
npm run build       # production build (değişiklik sonrası kırmızı çizgi testi)
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
```

Husky pre-commit hook'u commit sırasında `eslint --fix` çalıştırır (lint-staged).

### Sık kurulum sorunları

- **Login sonrası tekrar login'e düşme** → Supabase dev projesinde Redirect URL olarak `http://localhost:3000/auth/callback` tanımlı olmalı (bkz. [docs/auth-setup.md](docs/auth-setup.md)).
- **Giriş oldu ama sidebar bomboş / talep açılmıyor** → `app_users.employee_id` NULL (yukarıdaki sıralama bozulmuş). Furkan'a söyle; düzeltme SQL ile yapılır.
- **Takvim/not widget'ları hata veriyor** → MS Graph delegated token'ı yok/expired; çıkış yapıp tekrar girmek çoğu zaman çözer. Kritik değil.
- **Telefondan yerel ağ üzerinden test** → `next.config.ts` `allowedDevOrigins` yaygın alt ağları kapsıyor; kendi alt ağın farklıysa ekle.

---

## 5. Repo haritası

```
rt-enerji-frontend/
├── proxy.ts                  # Next.js 16 middleware (middleware.ts'in yeni adı) — oturum tazeleme
│                             #   NOT: /api middleware dışındadır; her API route kendi auth'unu yapar
├── app/
│   ├── api/                  # TÜM backend uçları (aşağıda §7)
│   ├── auth/                 # login + /auth/callback (OAuth code exchange)
│   ├── <form>/new/           # 13 talep formu sayfası (düzenleme: /new?edit=<id>)
│   ├── my-requests/          # Taleplerim (+ [id] detay)   ─┐
│   ├── approvals/            # Bekleyen Onaylar + history  ─┤ herkese açık ekranlar
│   ├── notifications/ profile/ org-chart/                  ─┘
│   ├── employees/ positions/ position-assignments/
│   │   organizational-units/ # organizasyon CRUD — ORG_ADMIN (layout'ta AdminPageWrapper)
│   └── (dictionaries)/       # companies, unit-types, position-types, grade-levels — ORG_ADMIN
├── components/
│   ├── ui/                   # shadcn/ui primitifleri
│   ├── approvals/            # onay detayı + her form tipine bir *-details.tsx
│   ├── my-requests/          # talep detayı + yaşam döngüsü aksiyonları
│   ├── app-shell.tsx app-sidebar.tsx nav-*.tsx admin-page-wrapper.tsx
│   └── signature-*.tsx stamp-position-picker.tsx attachment-uploader.tsx ...
├── lib/
│   ├── supabase/             # 3 client: client(tarayıcı) / server(SSR-cookie) / service-role(RLS bypass)
│   ├── workflow/             # ⭐ MOTOR: workflow-service, lifecycle, notification-service, types, route-map
│   ├── approvals/            # onay UI veri katmanı: types, constants (TR etiketler), use-approvals hook
│   ├── my-requests/          # performans-kritik select tanımları (tip-farkındalıklı 2 aşamalı fetch)
│   ├── pdf/                  # generate-request-pdf + 13 form şablonu + stamp-pdf + file-naming
│   ├── signature/ stamp-position/ storage/
│   ├── msgraph/              # Graph client'ları (app-only + delegated), sharepoint, calendar, todo
│   ├── sharepoint/           # arşiv hattı: enqueue → upload → retry-worker, folder-mapper
│   ├── email/                # HTML mail şablonu + içerik kurucular
│   ├── contexts/ stores/     # UserContext, Zustand notification store
│   ├── timezone.ts           # ⭐ Europe/Istanbul dönüşüm helper'ları — tarihlerde TEK kapı
│   └── database.types.ts     # Supabase'ten üretilen tipler — ŞEMANIN GÜNCEL GERÇEĞİ
├── sql/                      # elle uygulanan migration/feature scriptleri (migration runner YOK)
├── dev_schema.sql            # Nisan 2026 sonu şema SNAPSHOT'ı — okumaya iyi ama GÜNCEL DEĞİL
├── docs/                     # konu dokümanları (bkz. §13)
└── hooks/                    # use-mobile, use-notification-subscription (Realtime)
```

---

## 6. Sistem nasıl çalışır — çekirdek kavramlar

### 6.1 Kimlik ve yetki (4 katman)

```
proxy.ts (oturum yoksa /auth/login'e yönlendir)
  → UserContext + PrivacyConsentGuard (client kabuk)
    → AdminPageWrapper (admin sayfa guard'ı) + sidebar'ın role göre filtrelenmesi
      → API route içi kontroller (getUser + canStartWorkflow / canEditRequest / authorizePdfAccess)
        → RLS (Postgres satır güvenliği) — SON SAVUNMA HATTI
```

- **Roller** (`app_users.role`): `ORG_ADMIN` (her şey: tüm süreçleri başlatır, org yönetimi, takılan talepler için kurtarma yetkileri) ve `ORG_VIEWER` (varsayılan: kendi talepleri + üzerine atanan onaylar).
- **Kullanıcı ↔ çalışan:** `app_users.id` = Supabase auth id; `app_users.employee_id` → `employees`. İş mantığının tamamı `employee_id` üzerinden döner (`get_current_employee_id()` RLS helper'ı).
- **RLS temel deseni:** *talep sahibi VEYA o talebin onaycısı VEYA ORG_ADMIN*. Sözlük/organizasyon tablolarında: herkes okur, yalnız ORG_ADMIN yazar.
- **`service-role` client** RLS'i aşar; yalnızca sunucuda, kimlik doğrulaması yapıldıktan sonra kullanılır (onay motorunun tüm satırları görmesi, PDF üretimi, MS token deposu). Yeni kod yazarken önce RLS'li client dene; service-role'e geçiş bilinçli bir karar olmalı.

### 6.2 Veri modeli — "hub-and-spoke"

Her talep merkezde **tek bir `requests` satırı**dır:

```
workflow_definitions (şablon) ──< workflow_steps (sıralı adımlar; koşul, faz, onaycı tipi)
        │
requests (MERKEZ: status, current_step, current_revision_cycle, pdf_path)
        ├──< request_approvals   (her adım × her onaycı × her revizyon döngüsü = 1 satır; denetim izi)
        ├──1:1 tipe özel detay tablosu (leave_requests / expense_requests / mukayese_* / ...)
        └──< request_attachments (yüklenen ekler)
```

- ~40 public tablo. Organizasyon tarafı: `companies`, `organizational_units` (self-referans ağaç), `positions` (`is_unit_head`, `reports_to_position_id`), `employees`, `employee_positions` (tarih aralıklı atamalar).
- **Şemanın güncel gerçeği `lib/database.types.ts`** — `dev_schema.sql`/`prod_schema.sql` Nisan sonu snapshot'ıdır ve sonraki migration'ları (revision cycle, YEKA_1/2 enum'ları, view'lar) içermez.
- `sql/` klasörü elle uygulanan scriptlerin kronolojik arşividir; **otomatik migration runner yok**.

### 6.3 Workflow motoru (`lib/workflow/`)

Bir adımın (`workflow_steps`) dört önemli özelliği:

| Alan | Değerler | Anlamı |
|---|---|---|
| `approver_type` | `REQUESTER` | Talep edenin imza adımı — **otomatik onaylanır**, gerçek karar değildir |
| | `UNIT_HEAD` | Talep sahibinin birim amiri. Kişi kendisi amirse **üst birime tırmanır** (`determineUnitHeadApprover`, max 10 seviye; tepede kimse yoksa self-approval) |
| | `STATIC_POSITION` | Sabit pozisyonu dolduran aktif kişi (örn. Muhasebe Müdürü) |
| | `DYNAMIC_USER_LIST` | Talep açılırken seçilen "ilgili kişiler" — her kişi ayrı onay satırı |
| `action_type` | `FILL_AND_SIGN` / `SIGN_ONLY` | Alan doldurup imzalar / sadece imzalar. **SIGN_ONLY inceliği:** aynı kişi zincirin ilerisinde tekrar imzalayacaksa o satırlar karar anında otomatik onaylanır |
| `phase` | `APPROVAL` / `COMPLETION` | Normal onay / onaylar bittikten sonraki tamamlama fazı (örn. görev dönüşü özet girme) |
| `condition` | `{field, value}` JSON | Koşul tutmazsa adım **tamamen atlanır** — satır hiç açılmaz (örn. avans istenmediyse muhasebe adımı yok) |

**Akış:** Talep gönderilince `createApprovalChain()` şablon adımlarını okur, koşulları değerlendirir, onaycıları çözer, `request_approvals` satırlarını açar; ilk bekleyen adım `current_step` olur. Karar motoru **`PATCH /api/approvals/[id]`** dosyasıdır (`app/api/approvals/[id]/route.ts`, ~1000 satır — sistemin kalbi): sıra kontrolü ("Not your turn"), revizyon döngüsü kontrolü, statü guard'ı (terminal talep ezilemez), FILL_AND_SIGN yan etkileri (İK alanları, checklist'ler, YKB imzalı PDF), reddetme/onaylama dallanmaları ve zincir ilerletme burada.

**Kim başlatabilir:** `canStartWorkflow()` — ORG_ADMIN her şeyi; kısıtlı (`is_restricted`) süreçlerde pozisyon/birim `workflow_initiators` kurallarıyla eşleşmeli. Sidebar bu listeye göre öğe gizler.

### 6.4 Talep yaşam döngüsü (v5)

```
DRAFT → PENDING → (REVISION_REQUESTED ⇄ PENDING) → APPROVED               (tamamlama fazı yoksa)
                                                  → AWAITING_COMPLETION → COMPLETED
        PENDING → REJECTED | CANCELLED             DRAFT ← geri çekme (gerçek imza atılmadıysa)
```

TR etiketleri `lib/approvals/constants.ts`'te (Taslak/Beklemede/Onaylandı/…). Süreç-bazlı etiket override'ı vardır (örn. travel'da `AWAITING_COMPLETION` = "Görev Dönüşü Bekleniyor").

**Revizyon döngüsü:** "Düzeltme iste / geri çek / yeniden gönder" akışlarında `current_revision_cycle` artar ve zincir yeniden kurulur; **eski döngü satırları denetim için silinmez**. Bu yüzden onay verisi okuyan HER sorgu/PDF/e-posta güncel döngüye filtrelenmelidir — filtrelemeyi unutmak klasik bug kaynağıdır.

### 6.5 Belge hattı

Onay/red/tamamlanma → `generateRequestPDF()` (form tipine özel @react-pdf şablonu) → imzalar işlenir (font tabanlı `signature_text`+`signature_font` veya çizim PNG'si) → ekler PDF'e birleştirilir → Supabase Storage `request-documents` bucket'ına yüklenir → SharePoint kuyruğuna düşer (`sharepoint_sync_queue`, prod'da 5 dk'lık cron retry). Dosya adı standardı: `KOD_YYYYAAGG_TALEPNO_AD-SOYAD_DURUM.pdf` ([docs/dosya-isimlendirme-standardi.md](docs/dosya-isimlendirme-standardi.md)).

Kaşe süreci (`STAMP_APPROVAL`) farklıdır: kullanıcı PDF yükler, kaşe pozisyonu seçer (hazır 5 konum veya sayfa-bazlı özel konum), onay sonunda `stampPDF()` kaşeyi + imzayı basar.

### 6.6 Bildirimler

- **Uygulama içi:** `notifications` tablosu + Supabase **Realtime** aboneliği (zil ikonu; Zustand store).
- **E-posta:** Graph `sendMail` ile renk kodlu HTML şablon; onay zinciri durumu + CTA linki içerir.

---

## 7. Süreç kataloğu (14 süreç)

| Workflow kodu | Form | Rota | Erişim |
|---|---|---|---|
| `ANNUAL_LEAVE` | Yıllık İzin | `/leave-requests/new` | Herkes |
| `SHORT_LEAVE` | Kısa Süreli İzin | `/leave-requests/new` (tip seçimi) | Herkes |
| `SALARY_ADVANCE` | Maaş Avans Talebi | `/salary-advance/new` | Herkes |
| `TRAVEL_ASSIGNMENT` | Şehir İçi/Dışı Görev Formu | `/travel-assignment/new` | Herkes |
| `REQUEST_FORM` | Talep Formu (mutfak/kırtasiye/diğer) | `/request-form/new` | Herkes |
| `STAMP_APPROVAL` | Kaşeli Belge Onayı | `/stamp-approval/new` | Herkes |
| `APPROVAL_LETTER` | Olur Yazısı | `/approval-letter/new` | Herkes |
| `COMPARISON_FORM` | Mukayese Formu (tedarikçi fiyat matrisi) | `/comparison-form/new` | Herkes |
| `EXPENSE_FORM` | Harcama Formu | `/expense-form/new` | Herkes |
| `OVERTIME` | Fazla Mesai | `/overtime/new` | Kısıtlı — İK |
| `EMPLOYEE_ONBOARDING` | İşe Giriş Takip | `/onboarding/new` | Kısıtlı — İK |
| `EMPLOYEE_SEPARATION` | İşten Çıkış Takip | `/separation/new` | Kısıtlı — İK |
| `FINANCE_APPROVAL_COVER` | Onay Kapağı (Finans) | `/finance-approval-cover/new` | Kısıtlı — Finans |
| `ACCOUNTING_APPROVAL_COVER` | Onay Kapağı (Muhasebe) | `/accounting-approval-cover/new` | Kısıtlı — Muhasebe |

Süreç → onay zinciri eşlemelerinin insan-okur tam listesi: [docs/surec-bilgileri-prod.md](docs/surec-bilgileri-prod.md). Kod → rota eşlemesi: `lib/workflow/route-map.ts`.

---

## 8. Konvansiyonlar ve altın kurallar

1. **Tarih/saat:** DB'de her `timestamptz` **gerçek UTC**; gösterim her zaman **Europe/Istanbul**. Dönüşüm YALNIZCA `lib/timezone.ts` helper'larıyla yapılır (`istanbulInputToTimestamptz`, `formatTrDateTime` vb.). Salt `date` tipindeki kolonlara timezone dönüşümü **uygulanmaz**.
2. **Revizyon döngüsü filtresi:** Onay satırı okuyan her sorgu `revision_cycle = requests.current_revision_cycle` filtresi ister; eski döngüler yalnız denetim/aktivite logu içindir.
3. **Şema gerçeği:** enum/tablo/tip bakarken `lib/database.types.ts` esas alınır. Tipleri yenilemek: `npx supabase gen types typescript --project-id <dev-id> > lib/database.types.ts`.
4. **Önce RLS'li client:** Server Component/route'ta `lib/supabase/server`; tarayıcıda `lib/supabase/client`; `service-role` yalnızca gerekçeli durumda.
5. **Performans deseni:** Liste uçları hafif select (`server-selects.ts`), detay uçları tip-farkındalıklı iki aşamalı fetch kullanır (13 join'i aynı anda yapmak statement timeout'a yol açıyordu). Yeni liste/detay eklerken bu deseni koru.
6. **SQL değişiklikleri:** `sql/` klasörüne açıklayıcı isimle dosya eklenir (`feature_*`, `fix_*`, `security_*`), başına sorunu/çözümü anlatan yorum bloğu yazılır; **çalıştırmayı insan yapar**. View değiştirirken `WITH (security_invoker = on)` açıkça tekrarlanmalı (yoksa RLS bypass olur — dosyalardaki uyarıları oku).
7. **Kod stili:** Mevcut dosyalardaki desenleri takip et; UI metinleri Türkçe; commit öncesi `npm run lint && npm run typecheck`.

---

## 9. Keşif ve test rehberi

Sistemi tanımanın en iyi yolu uçtan uca senaryolar koşmak (hepsi dev'de serbest):

1. **Basit zincir:** Yıllık izin talebi aç → gönder → talep `PENDING`, ilk gerçek onaycıda. `/my-requests`'ten detayına, onay zincirine, canlı PDF önizlemesine bak.
2. **Onaycı tarafı:** Onaycı olduğun bir talepte `/approvals` kuyruğundan detaya gir → onayla/reddet → statü değişimini, bildirimi ve PDF'i gözle.
3. **Yaşam döngüsü:** Bir talebi imza düşmeden **geri çek** (DRAFT'a döner) → düzenle → yeniden gönder. Onaycıyken **düzeltme iste** → talep sahibi düzeltip yeniden göndersin → aktivite logunda eski döngünün korunduğunu gör.
4. **Koşullu adım:** Görev formunu (travel) *avans istemeden* aç → muhasebe adımının zincirde hiç oluşmadığını gör; avanslı aç → adımın geldiğini gör.
5. **İki fazlı süreç:** Görev formunu sonuna kadar onaylat → `AWAITING_COMPLETION` ("Görev Dönüşü Bekleniyor") → talep eden görev özetini girip tamamlasın → `COMPLETED` + final PDF.
6. **SIGN_ONLY oto-onay:** Aynı kişinin zincirde iki imza adımı olduğu bir süreçte, ilk kararıyla sonraki imzasının otomatik atıldığını gör.
7. **Kaşe:** `STAMP_APPROVAL` ile bir PDF yükle, sayfa-bazlı özel konum seç, onay sonrası kaşeli çıktıyı inceleyip konumu doğrula.
8. **Rol farkı:** `ORG_VIEWER` iken admin sayfalarının (çalışanlar, sözlükler) hem menüden gizlendiğini hem doğrudan URL'de "Erişim Engellendi" verdiğini; API'ye doğrudan istekte RLS'in yazmayı reddettiğini doğrula.
9. **Kısıtlı süreç:** İK biriminde olmayan kullanıcıyla `/overtime`'a gitmeyi dene (403/gizli olmalı).
10. **Organizasyon:** (Admin ile) çalışan ekle → pozisyon ata → org şemasında görünmesini ve `UNIT_HEAD` çözümlemesinin yeni yapıya uymasını izle.

**Hata bulursan:** ekran görüntüsü + talep no (`2026-XXXXXX`) + beklenen/gerçekleşen davranış — Furkan'a ilet. Dev DB'de başkalarının test verisi de var; sadece kendi açtığın talepler üzerinde yıkıcı aksiyon al.

---

## 10. Süreç incelikleri (bilmezsen kafan karışır)

- **`REQUESTER` adımı gerçek karar değildir** — gönderim anında otomatik onaylanır; "geri çekilebilir mi" hesabında ve onay geçmişinde sayılmaz.
- **Onay kuyruğu view'ları:** `/approvals` sayfaları `v_user_pending_approvals` / `v_user_approval_history` view'larından beslenir (server-side pagination). Kuyruk mantığını değiştirmek = view'ı değiştirmek.
- **YKB imza adımı:** Onay kapağı süreçlerinde son tamamlama adımı, asistanın yüklediği **ıslak imzalı taranmış PDF**'tir (`form_section_key = 'ykb_signed_pdf'`); PDF'te onaycı adı her zaman "RAMAZAN TAŞ" gösterilir ve yüklenen tarama final PDF'in yerine geçer (yeniden üretilip ezilmez).
- **Talep no** `YYYY-NNNNNN` formatındadır (örn. `2026-000142`) ve SharePoint dosya adında kullanılır.
- **`/requests/[id]` vs `/my-requests/[id]`:** aynı detay bileşeni, farklı geri-dönüş hedefi (bildirim linkleri `/requests/[id]` kullanır).
- **Cookie inceltme:** Azure callback sonrası MS token'ları çerezden çıkarılıp `user_ms_tokens` tablosuna taşınır (Vercel HTTP/2 header limiti). `proxy.ts`'in `/api`'yi middleware dışında bırakması da aynı hikayenin devamıdır (`ERR_HTTP2_PROTOCOL_ERROR` fix'i) — **bu ikisini "sadeleştirme" diye geri alma.**

---

## 11. Bilinen konular ve yakın geçmiş düzeltmeler

| Tarih | Konu | Durum |
|---|---|---|
| — | **`app_users.employee_id` boşluğu:** çalışan kaydı olmadan giriş yapan kullanıcının `employee_id`'si NULL kalır; sonradan employee eklenince otomatik bağlanmaz (tek yönlü trigger). | **Açık.** Çözüm manuel SQL. Test hesabı kurulumunda sıralamaya dikkat (§4). |
| 2026-06-15 | **Koşullu adım fix'i:** koşulu sağlanmayan adım artık tamamen atlanıyor. Fix öncesi bu adımlar `APPROVED` yazılıp **sahte onaycı/imza** üretiyordu ("kendi kendine onaylandı" şikayeti). | Fix canlıda. Fix öncesi 4 travel talebinde sahte satırlar duruyor (bilinçli) — eski kayıtlarda görürsen şaşırma. |
| 2026-06-28 | **CANCELLED→REJECTED ezilmesi:** iptal edilen talebin bekleyen completion satırı onaycı kuyruğunda kalıp reddedilince statüyü eziyordu (talep 2026-000049). Karar route'una statü guard'ı + view'a canlı-talep filtresi eklendi; iptal yetkisi faz-bazlı oldu (imza düştükten sonra yalnız admin iptal edebilir). | Fix canlıda (kod + view, dev+prod doğrulandı). 2 tarihi bozuk kayıt bilinçli bırakıldı. |
| 2026-07-05 | **Görev tamamlama devri:** travel'ın son adımını artık asistan değil **göreve giden kişi** dolduruyor (+ zorunlu görev özeti). | Canlıda. Değişiklik öncesi bekleyen eski talepler bilinçli olarak eski davranışta. |
| 2026-07-08 | **`app_users` self-escalation kapatıldı:** kullanıcılar kendi `role`'lerini `ORG_ADMIN` yapabiliyordu (RLS satır bazlı olduğundan kolon korumasızdı). Tablo-geneli UPDATE yetkisi kaldırıldı; `authenticated` yalnız `privacy_accepted_at` kolonunu güncelleyebilir. | Uygulandı (dev+prod doğrulandı). `sql/security_app_users_update_column_lockdown.sql` |
| 2026-07-08 | **PDF erişimi:** 3 PDF rotasına ORG_ADMIN muafiyeti eklendi (admin her talebin PDF'ini görebilir — `authorize-pdf-access.ts`). | Canlıda. |
| Faz 2 | **`reports_to_position_id` routing'de kullanılmıyor:** motor birim amirini `is_unit_head` + üst-birim tırmanmasıyla bulur; `reports_to` alanı dolu ama onay zincirine etkisi yok. Lokasyon-bazlı `MANAGER` onaycı tipi Faz 2 tasarımında. | Tasarım aşaması — davranışı değiştirme. |

---

## 12. AI agent ile çalışma kuralları

Repo kökündeki **`CLAUDE.md`** agent'ın otomatik okuduğu kural setidir. Özü:

1. **DB'ye yazma yok** — dev dahil. Agent SQL üretir, insan çalıştırır. `workflow_steps` INSERT'lerini agent hiç yazmaz (pozisyon id seçimi insan işi).
2. **Prod'a dokunma.**
3. Süreç implementasyonu **faz faz** ilerler, her fazda durup onay alınır ([docs/workflows/README.md](docs/workflows/README.md) tam kural seti + yeni süreç ekleme rehberi).
4. Timezone, revision-cycle ve RLS/service-role konvansiyonlarına uy (§8).

---

## 13. Doküman haritası

| Ne arıyorsun? | Doküman |
|---|---|
| Sistemin bütünsel anlatımı (ikinci durak) | [docs/genel-bakis.md](docs/genel-bakis.md) |
| Tüm süreçler + onay zincirleri (prod) | [docs/surec-bilgileri-prod.md](docs/surec-bilgileri-prod.md) |
| Yeni süreç ekleme rehberi + AI kuralları | [docs/workflows/README.md](docs/workflows/README.md) |
| Workflow motoru: koşullu adımlar / yaşam döngüsü | [docs/v4-workflow-engine-conditional.md](docs/v4-workflow-engine-conditional.md) · [docs/v5-workflow-engine-lifecycle.md](docs/v5-workflow-engine-lifecycle.md) |
| Organizasyon veri modeli | [docs/organizasyon-veri-modeli.md](docs/organizasyon-veri-modeli.md) |
| DB & Auth teknik tasarım | [docs/teknik-tasarim-veritabani-ve-auth.md](docs/teknik-tasarim-veritabani-ve-auth.md) |
| SharePoint entegrasyonu / kurulumu | [docs/sharepoint-integration-plan.md](docs/sharepoint-integration-plan.md) · [docs/sharepoint-kurulum-talimatlari.md](docs/sharepoint-kurulum-talimatlari.md) |
| SharePoint dosya isimlendirme | [docs/dosya-isimlendirme-standardi.md](docs/dosya-isimlendirme-standardi.md) |
| Ek dosya sistemi | [docs/workflow-attachments.md](docs/workflow-attachments.md) |
| Auth kurulum / callback sorunları | [docs/auth-setup.md](docs/auth-setup.md) |
| Faz 2 planı | [docs/faz2-yonetici-ozeti.md](docs/faz2-yonetici-ozeti.md) · [docs/faz2-roadmap.md](docs/faz2-roadmap.md) |
| Süreç-bazlı detay dokümanları | [docs/workflows/](docs/workflows/) (comparison-form, overtime, salary-advance, separation, onboarding) |

> Not: `docs/workflows/onboarding.md` **İşe Giriş Takip sürecinin** dokümanıdır; bu proje-onboarding dokümanıyla karıştırma.

---

## 14. Takıldığında

- Önce bu doküman + [docs/genel-bakis.md](docs/genel-bakis.md) + ilgili konu dokümanı.
- Koda sorularda başlangıç noktaları: motor → `lib/workflow/workflow-service.ts`, karar akışı → `app/api/approvals/[id]/route.ts`, yaşam döngüsü → `lib/workflow/lifecycle.ts`, PDF → `lib/pdf/generate-request-pdf.ts`.
- Cevap bulamazsan **Furkan'a sor** — özellikle DB'ye yazma gerektiren her şey, prod'la ilgili her şey ve `workflow_steps`/onay zinciri tanım değişiklikleri zaten onun onayından geçmek zorunda.

İyi çalışmalar! 🚀
