# SharePoint Entegrasyonu — PDF Otomatik Yükleme

## Context

RT-enerji İK/Talep Yönetim Sistemi şu an üretilen PDF'leri Supabase Storage'a yüklüyor (`request-documents` bucket). Şirket sahibi, süreç tamamlandığında bu PDF'lerin **aynı zamanda** SharePoint'e de yüklenmesini istiyor — kurumsal arşiv ve dokümantasyon için. Mevcut Microsoft entegrasyonu (auth, mail, calendar, to-do) ile uyumlu, mevcut PDF üretim akışını bozmadan eklenecek.

**Tasarım kararları (kullanıcı onaylı):**
- **Kimlik:** Application Permission (service account, mail gönderimi gibi). Tenant admin tek seferlik onay.
- **Site/Library:** IT ile netleşecek — env var olarak tutulacak.
- **Hangi PDF'ler:** 4 statünün hepsi (COMPLETED, APPROVED, REJECTED, AWAITING_COMPLETION).
- **Hata davranışı:** Bloklanmaz; başarısız upload'lar retry kuyruğuna girer.
- **Folder yapısı:** Kategori → Talep Tipi → Yıl → Ay.
- **Versionlama:** Her statü ayrı dosya (file naming convention zaten statüyü içeriyor).

---

## Mimarî Yaklaşım

Mevcut PDF akışı:
```
generateRequestPDF() → mergeAttachments() → uploadRequestPDF() (Supabase) → requests.pdf_path UPDATE
```

Yeni akış ([lib/pdf/build-and-upload-request-pdf.ts](../lib/pdf/build-and-upload-request-pdf.ts) içinde minimal değişiklik):
```
generateRequestPDF() → mergeAttachments() → uploadRequestPDF() (Supabase) → requests.pdf_path UPDATE
                                                                          ↓ (fire-and-forget)
                                                          enqueueSharePointSync(requestId, pdfBuffer, status)
                                                                          ↓
                                                          uploadPdfToSharePoint() — async, hata bloklamaz
                                                                          ↓
                                          requests.sharepoint_path / sharepoint_sync_status UPDATE
```

Failure isolation: SharePoint upload kendi try/catch'inde, hatası approval flow'una sızmaz. Mevcut [graphAppFetch()](../lib/msgraph/app-client.ts#L95) ve `createServiceRoleClient()` yeniden kullanılır.

---

## 1. Azure AD Uygulama Yapılandırması (Manuel — IT/Admin)

Mevcut Azure AD uygulamasına (Client ID: `6a38b6cf-aefb-4ae3-9365-4ef7b52fcc29`) eklenecek:

**Application Permissions (önerilen: en az ayrıcalık prensibi):**
- `Sites.Selected` (önerilen) — sadece IT'nin atadığı belirli site'a yazma yetkisi
- VEYA `Files.ReadWrite.All` (broad permission, daha basit ama az güvenli)

**Önerilen yol (Sites.Selected):**
1. Azure Portal → App registrations → mevcut app → API permissions → Add permission → Microsoft Graph → Application permissions → `Sites.Selected` → Grant admin consent
2. Site'a write izni verilmesi için (admin gerekli):
   ```http
   POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
   {
     "roles": ["write"],
     "grantedToIdentities": [{
       "application": {
         "id": "6a38b6cf-aefb-4ae3-9365-4ef7b52fcc29",
         "displayName": "RT-enerji App"
       }
     }]
   }
   ```

**IT'den alınacak bilgiler:**
- SharePoint Site URL (örn: `https://rtenerji.sharepoint.com/sites/Talepler`)
- Hedef Document Library adı (default: `Documents`)
- Site ID (Graph API'den çekilebilir): `GET /sites/rtenerji.sharepoint.com:/sites/Talepler`
- Drive ID (library): `GET /sites/{site-id}/drives`

---

## 2. Database Migrations (Supabase READ-only kuralı: SQL kullanıcıya teslim edilecek, kullanıcı çalıştıracak)

**Migration 1:** `requests` tablosuna SharePoint sync alanları:
```sql
ALTER TABLE requests
  ADD COLUMN sharepoint_path text,
  ADD COLUMN sharepoint_item_id text,
  ADD COLUMN sharepoint_web_url text,
  ADD COLUMN sharepoint_sync_status text
    CHECK (sharepoint_sync_status IN ('pending','success','failed','skipped')),
  ADD COLUMN sharepoint_synced_at timestamptz,
  ADD COLUMN sharepoint_last_error text;

CREATE INDEX idx_requests_sharepoint_pending
  ON requests(sharepoint_sync_status)
  WHERE sharepoint_sync_status IN ('pending','failed');
```

**Migration 2:** Sync queue (her statü değişikliği ayrı kayıt — bir talep birden fazla PDF tetikleyebilir):
```sql
CREATE TABLE sharepoint_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  request_status text NOT NULL,
  supabase_pdf_path text NOT NULL,
  target_sharepoint_path text NOT NULL,
  sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending','processing','success','failed')),
  attempt_count int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_spq_pending ON sharepoint_sync_queue(sync_status, created_at)
  WHERE sync_status IN ('pending','failed');
CREATE INDEX idx_spq_request ON sharepoint_sync_queue(request_id);
```

---

## 3. Yeni Kod Dosyaları

### 3.1 `lib/msgraph/sharepoint.ts` — Graph API wrapper (low-level)

[graphAppFetch()](../lib/msgraph/app-client.ts#L95) üzerine SharePoint endpoint'leri için ince katman. Pattern olarak [app-client.ts:95-119](../lib/msgraph/app-client.ts#L95) baz alınacak.

Ana fonksiyonlar:
- `resolveSharePointSite(siteUrl)` → site ID döner (in-memory cache)
- `resolveSharePointDrive(siteId, libraryName)` → drive ID döner (in-memory cache)
- `ensureFolderPath(siteId, driveId, folderPath)` → klasör yoksa recursive oluşturur, idempotent
- `uploadFileToSharePoint(siteId, driveId, folderPath, fileName, buffer)` → `PUT /drives/{drive-id}/root:/{path}:/content`, DriveItem döner
- `getFileWebUrl(siteId, driveId, itemId)` → tarayıcı linki

**Not:** PDF'ler birkaç MB civarında olduğu için simple `PUT` yeterli (250MB'a kadar). Upload session API gereksiz.

### 3.2 `lib/sharepoint/folder-mapper.ts` — workflow code → folder path

```typescript
const CATEGORY_MAP: Record<string, [string, string]> = {
  ANNUAL_LEAVE:              ['01_Insan_Kaynaklari', 'Yillik_Izin'],
  SHORT_LEAVE:               ['01_Insan_Kaynaklari', 'Kisa_Sureli_Izin'],
  SALARY_ADVANCE:            ['01_Insan_Kaynaklari', 'Maas_Avans'],
  OVERTIME:                  ['01_Insan_Kaynaklari', 'Fazla_Mesai'],
  EMPLOYEE_ONBOARDING:       ['01_Insan_Kaynaklari', 'Ise_Giris'],
  EMPLOYEE_SEPARATION:       ['01_Insan_Kaynaklari', 'Isten_Cikis'],
  REQUEST_FORM:              ['01_Insan_Kaynaklari', 'Talep_Formu'],
  FINANCE_APPROVAL_COVER:    ['02_Finans', 'Onay_Kapagi_Finans'],
  COMPARISON_FORM:           ['02_Finans', 'Mukayese'],
  ACCOUNTING_APPROVAL_COVER: ['03_Muhasebe', 'Onay_Kapagi_Muhasebe'],
  EXPENSE_FORM:              ['03_Muhasebe', 'Harcama'],   // Muhasebe onay zincirinde
  TRAVEL_ASSIGNMENT:         ['04_Idari_Isler', 'Gorev_Formu'],
  APPROVAL_LETTER:           ['04_Idari_Isler', 'Olur_Yazisi'],
  STAMP_APPROVAL:            ['04_Idari_Isler', 'Kaseli_Belge_Onayi'],
};

export function buildSharePointPath(workflowCode: string, date: Date): string {
  const segments = CATEGORY_MAP[workflowCode] ?? ['99_Diger', workflowCode];
  const year = date.getFullYear().toString();
  const monthIdx = date.getMonth();
  const month = `${String(monthIdx + 1).padStart(2, '0')}-${TURKISH_MONTHS[monthIdx]}`;
  return `${ROOT_FOLDER}/${segments.join('/')}/${year}/${month}`;
}
```

`ROOT_FOLDER` env var: `SHAREPOINT_ROOT_FOLDER` (default: `Talepler`).

### 3.3 `lib/sharepoint/upload-pdf.ts` — Business logic

```typescript
export async function uploadPdfToSharePoint(params: {
  requestId: string;
  workflowCode: string;
  status: RequestStatus;
  pdfBuffer: Buffer;
  fileName: string;       // file-naming.ts'den gelen
  createdAt: Date;
}): Promise<SharePointUploadResult>
```

Akış:
1. `buildSharePointPath()` ile hedef klasör hesaplanır
2. `ensureFolderPath()` ile klasörler garanti edilir
3. `uploadFileToSharePoint()` ile yüklenir
4. `requests` tablosu güncellenir: `sharepoint_path`, `sharepoint_item_id`, `sharepoint_web_url`, `sharepoint_sync_status='success'`, `sharepoint_synced_at=now()`
5. `sharepoint_sync_queue` kaydı `success`'e geçirilir, `completed_at` set edilir

Hata durumunda:
- Try/catch içinde, exception yutulur (loglanır)
- `sharepoint_sync_queue.attempt_count++`, `sync_status='failed'`, `last_error` set edilir
- `requests.sharepoint_sync_status='failed'`, `sharepoint_last_error` set edilir

### 3.4 `lib/sharepoint/enqueue-sync.ts` — Queue producer

```typescript
export async function enqueueSharePointSync(params: {
  requestId: string;
  workflowCode: string;
  status: RequestStatus;
  pdfBuffer: Buffer;
  fileName: string;
  supabasePdfPath: string;
  createdAt: Date;
}): Promise<void>
```

İki şey yapar:
1. `sharepoint_sync_queue` tablosuna `pending` kayıt INSERT
2. Hemen async `uploadPdfToSharePoint()` çağırır (await DEĞİL — `void` ile fire-and-forget). Başarısız olursa retry job ele alır.

### 3.5 Retry Mekanizması — Supabase Edge Function (cron)

`supabase/functions/sharepoint-sync-retry/index.ts`:
- pg_cron veya Supabase scheduled function ile her 5 dakikada bir çalışır
- `sharepoint_sync_queue` tablosunda `sync_status IN ('pending','failed')` AND `attempt_count < SHAREPOINT_MAX_RETRY_ATTEMPTS` kayıtları çeker
- Her biri için `uploadPdfToSharePoint()` tetikler (Supabase Storage'dan PDF buffer'ı download eder)
- Exponential backoff: `attempt_count * 5 dakika` minimum aralık (`last_attempt_at` ile kontrol)

`pg_cron` setup SQL'i ayrıca verilecek (kullanıcı çalıştıracak).

### 3.6 Admin endpoint — manuel retry

`app/api/admin/sharepoint-sync/retry/route.ts`:
- `POST { requestId }` veya `POST { all: true }`
- Yetki: sadece admin rolü
- İlgili kuyruk kaydını manuel tetikler

---

## 4. Mevcut Kodda Değişiklikler

### 4.1 [lib/pdf/build-and-upload-request-pdf.ts](../lib/pdf/build-and-upload-request-pdf.ts)

Supabase upload başarılı olduktan sonra (yani `requests.pdf_path` UPDATE'inden sonra), tek satır eklenecek:

```typescript
// Mevcut Supabase upload akışı bittiğinde:
await supabaseAdmin.from('requests').update({ pdf_path: supabasePath }).eq('id', requestId);

// YENİ: Fire-and-forget SharePoint sync (env ile kapatılabilir)
if (process.env.SHAREPOINT_SYNC_ENABLED === 'true') {
  void enqueueSharePointSync({
    requestId,
    workflowCode,
    status: currentStatus,
    pdfBuffer,
    fileName,                  // file-naming.ts'den hesaplanan
    supabasePdfPath: supabasePath,
    createdAt: new Date(),
  }).catch(err => console.error('[sharepoint-enqueue]', err));
}
```

**Önemli:** `await` YOK — approval flow'u SharePoint'i beklemez.

### 4.2 [app/api/approvals/[id]/route.ts](../app/api/approvals/[id]/route.ts) — DOKUNULMAZ

`buildAndUploadRequestPDF()` çağrıları olduğu gibi kalır. SharePoint mantığı tamamen helper'ın içinde, route bilmez.

### 4.3 [.env.local](../.env.local) — Yeni env var'lar

```bash
# SharePoint Integration
SHAREPOINT_SITE_URL=https://rtenerji.sharepoint.com/sites/Talepler  # IT'den
SHAREPOINT_LIBRARY_NAME=Documents                                    # IT'den (default: Documents)
SHAREPOINT_ROOT_FOLDER=Talepler                                      # Library içindeki kök klasör
SHAREPOINT_SYNC_ENABLED=true                                         # Killswitch
SHAREPOINT_MAX_RETRY_ATTEMPTS=5
```

---

## 5. Kritik Dosyalar — Değişiklik Özeti

| Dosya | Aksiyon |
|-------|---------|
| `lib/msgraph/sharepoint.ts` | YENİ — Graph wrapper |
| `lib/sharepoint/folder-mapper.ts` | YENİ — workflow → path |
| `lib/sharepoint/upload-pdf.ts` | YENİ — Business logic |
| `lib/sharepoint/enqueue-sync.ts` | YENİ — Queue producer |
| [lib/pdf/build-and-upload-request-pdf.ts](../lib/pdf/build-and-upload-request-pdf.ts) | EDİT — fire-and-forget enqueue |
| `supabase/functions/sharepoint-sync-retry/index.ts` | YENİ — retry worker |
| `app/api/admin/sharepoint-sync/retry/route.ts` | YENİ — manuel trigger |
| [.env.local](../.env.local) | EDİT — env var'lar |
| Migration SQL'leri (kullanıcı çalıştıracak) | YENİ — 2 migration |

---

## 6. Yeniden Kullanılacak Mevcut Yardımcılar

- [graphAppFetch()](../lib/msgraph/app-client.ts#L95) — Service account Graph çağrıları (mevcut, mail tarafında kullanılan, token refresh dahil)
- `createServiceRoleClient()` — RLS bypass'lı Supabase client (queue update için)
- [generateFileName()](../lib/pdf/file-naming.ts#L122) — Mevcut PDF dosya adı üreteci, SharePoint'te de aynısı kullanılır
- Mevcut workflow_definition_code mapping ([file-naming.ts](../lib/pdf/file-naming.ts)) — folder-mapper aynı kodları kullanır

---

## 7. Verification (End-to-End Test)

### 7.1 Sandbox/test SharePoint site'ında manuel test
1. IT'den test site provision edilir, env var'lar doldurulur
2. Test kullanıcısıyla bir izin talebi oluştur, onay zincirinden geçir
3. Talep COMPLETED olunca:
   - Supabase'de PDF'in oluştuğunu doğrula
   - SharePoint'te `Talepler/01_Insan_Kaynaklari/Yillik_Izin/2026/05-Mayis/` altında dosyanın oluştuğunu doğrula
   - `requests.sharepoint_path`, `sharepoint_web_url`, `sharepoint_sync_status='success'` olduğunu kontrol et
   - SharePoint web URL'sinden dosyayı tarayıcıda aç

### 7.2 Failure scenario testi
1. Geçici olarak `SHAREPOINT_SITE_URL` yanlış değer ver
2. Bir talep tamamla
3. Beklenen: Talep başarıyla COMPLETED olur, `sharepoint_sync_status='failed'` olur
4. Env var'ı düzelt
5. Manuel retry endpoint'i çağır → `sharepoint_sync_status='success'`

### 7.3 4 statü için test
- COMPLETED: yıllık izin → completion phase'i tamamla
- APPROVED (no completion): kısa izin → son onayı yap
- REJECTED: bir adımda reddet
- AWAITING_COMPLETION: completion phase'e gir, imzalı PDF yüklemeden bekle

Hepsinin SharePoint'te ayrı dosya olarak (filename'de farklı statü ile) gözükmesi beklenir.

### 7.4 Eş zamanlılık testi
- Aynı anda 5+ talebi tamamlayıp queue'nun sıkışmadığını, retry job takıldığında bile yeni talepler için bloklamadığını doğrula

---

## 8. IT'ye Sorulacak Açık Sorular (kullanıcı IT ile konuşurken)

1. SharePoint site URL'si (mevcut mu, yeni mi?)
2. Document library adı (özel mi, default `Documents` mı?)
3. `Sites.Selected` mi `Files.ReadWrite.All` mi tercih edilir? (Önerimiz `Sites.Selected`)
4. Retention policy uygulansın mı? (örn: 7 yıl sonrası archive)
5. Ayrı kategori klasörleri için farklı SharePoint permission grupları olacak mı? (İK sadece İK klasörünü görsün vb.)

---

## 9. Önemli Notlar

- **Supabase READ-only kuralı:** Bu plan'daki SQL migration'ları kullanıcı kendisi çalıştıracak; biz uygulamayacağız.
- **Geriye dönük migration:** Mevcut tamamlanmış talepler SharePoint'te yok. Geçmiş talepler için backfill istenirse ayrı bir script gerekir (bu plan kapsamında DEĞİL — sonra konuşulabilir).
- **Maliyet:** SharePoint storage tenant'ın quota'sından düşer; her talep ~birkaç MB.
- **Performance:** PDF buffer hafıza üzerinden geçiyor (Supabase'e yüklenirken oluşan buffer reuse ediliyor), tekrar download gerekmez.
- **Killswitch:** `SHAREPOINT_SYNC_ENABLED=false` ile entegrasyon kapatılabilir, mevcut akış etkilenmez.

---

## 10. Aşamalı Uygulama Planı (Step-by-Step)

Plan onaylandıktan sonra aşağıdaki sırayla ilerleyeceğiz. Her aşama bağımsız test edilebilir.

### Faz 0 — Plan'ı dokümantasyona kaydet (ilk iş)
- Bu plan dosyası `rt-enerji-frontend/docs/sharepoint-integration-plan.md` olarak kopyalanacak (folder structure ileride değişebilir; referans olarak duracak).

### Faz 1 — Manuel prerequisites (kullanıcı yapar, kod yazımı yok)
- **1a.** Azure AD'de SharePoint izinleri (admin consent)
- **1b.** SharePoint site URL/Library bilgisi temini (IT'den)
- **1c.** Supabase migration SQL'lerini çalıştırma
- **1d.** `.env.local`'e SharePoint değişkenlerini ekleme

Detaylar §11'de.

### Faz 2 — Microsoft Graph SharePoint wrapper
- `lib/msgraph/sharepoint.ts` yazılır
- Site & drive resolver, klasör oluşturma, dosya upload fonksiyonları
- Standalone test: bir script ile `resolveSharePointSite()` ve `ensureFolderPath()` çağrılır, SharePoint'te klasör oluştuğu doğrulanır

### Faz 3 — Folder mapper + Business logic
- `lib/sharepoint/folder-mapper.ts` (saf fonksiyon, unit test edilebilir)
- `lib/sharepoint/upload-pdf.ts` (Graph + DB güncellemesi)
- `lib/sharepoint/enqueue-sync.ts` (queue producer)

### Faz 4 — Mevcut akışa entegre
- [lib/pdf/build-and-upload-request-pdf.ts](../lib/pdf/build-and-upload-request-pdf.ts) içine fire-and-forget `enqueueSharePointSync()` eklenir
- Bir izin talebi e2e test edilir: COMPLETED → SharePoint'te dosya gözükür mü?

### Faz 5 — Retry/cron worker
- Supabase Edge Function veya pg_cron + worker
- Failure scenario test edilir

### Faz 6 — Admin manuel retry endpoint
- `app/api/admin/sharepoint-sync/retry/route.ts`

Her fazın sonunda dur, kullanıcıdan onay al, sonraki faza geç.

---

## 11. Manuel Adımlar Checklist (Kullanıcı Yapar)

### 11.1 Azure AD Yapılandırması

> **Kim yapar:** Tenant Admin (kullanıcı consent talep edip admin'e iletecek)
> **Tahmini süre:** 15-30 dk

**Adım 1 — Mevcut app'a yeni Application Permission ekle:**
1. https://portal.azure.com → Azure Active Directory → App registrations
2. RT-enerji uygulamasını aç (Client ID: `6a38b6cf-aefb-4ae3-9365-4ef7b52fcc29`)
3. Sol menü → **API permissions** → **Add a permission**
4. **Microsoft Graph** → **Application permissions** (Delegated DEĞİL)
5. Arama: `Sites.Selected` → seç → **Add permissions**
6. **Grant admin consent for [Tenant]** butonuna bas (admin yetkisi gerekli)

> **Alternatif:** `Sites.Selected` yerine `Files.ReadWrite.All` seçilirse adım 7 atlanır ama tüm tenant'a yazma yetkisi alır. Güvenlik için `Sites.Selected` önerilir.

**Adım 2 — App'i hedef SharePoint site'a yetkilendir (sadece `Sites.Selected` kullanıyorsan):**

IT/Admin Graph Explorer veya PowerShell ile şu çağrıyı yapacak:
```http
POST https://graph.microsoft.com/v1.0/sites/{site-id}/permissions
Content-Type: application/json

{
  "roles": ["write"],
  "grantedToIdentities": [{
    "application": {
      "id": "6a38b6cf-aefb-4ae3-9365-4ef7b52fcc29",
      "displayName": "RT-enerji App"
    }
  }]
}
```

**Adım 3 — Site ID'yi al (Graph Explorer ile):**
```http
GET https://graph.microsoft.com/v1.0/sites/{tenant}.sharepoint.com:/sites/{site-name}
```
Dönen `id` değerini env var için kaydet.

**Adım 4 — Drive ID'yi al:**
```http
GET https://graph.microsoft.com/v1.0/sites/{site-id}/drives
```
Hedef Document Library'nin `id` değerini al.

---

### 11.2 Supabase Migration SQL'leri

> **Kim yapar:** Kullanıcı (Supabase Studio → SQL Editor)
> **Tahmini süre:** 5 dk
> **Not:** Bu plan'ın Supabase READ-only kuralı gereği biz çalıştırmıyoruz.

**Migration 1 — `requests` tablosuna SharePoint alanları:**
```sql
ALTER TABLE requests
  ADD COLUMN sharepoint_path text,
  ADD COLUMN sharepoint_item_id text,
  ADD COLUMN sharepoint_web_url text,
  ADD COLUMN sharepoint_sync_status text
    CHECK (sharepoint_sync_status IN ('pending','success','failed','skipped')),
  ADD COLUMN sharepoint_synced_at timestamptz,
  ADD COLUMN sharepoint_last_error text;

CREATE INDEX idx_requests_sharepoint_pending
  ON requests(sharepoint_sync_status)
  WHERE sharepoint_sync_status IN ('pending','failed');
```

**Migration 2 — Sync queue tablosu:**
```sql
CREATE TABLE sharepoint_sync_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  request_status text NOT NULL,
  supabase_pdf_path text NOT NULL,
  target_sharepoint_path text NOT NULL,
  sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status IN ('pending','processing','success','failed')),
  attempt_count int NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX idx_spq_pending ON sharepoint_sync_queue(sync_status, created_at)
  WHERE sync_status IN ('pending','failed');
CREATE INDEX idx_spq_request ON sharepoint_sync_queue(request_id);
```

**Migration doğrulama:**
```sql
-- requests tablosunda yeni alanları gör
\d requests

-- queue tablosunu kontrol et
SELECT * FROM sharepoint_sync_queue LIMIT 1;
```

---

### 11.3 `.env.local` Güncellemesi

Faz 1 sonunda eklenecek değişkenler (IT'den gelen değerlerle doldurulacak):

```bash
# SharePoint Integration
SHAREPOINT_SITE_URL=https://rtenerji.sharepoint.com/sites/Talepler
SHAREPOINT_SITE_ID=                  # 11.1 Adım 3'ten gelen değer
SHAREPOINT_DRIVE_ID=                 # 11.1 Adım 4'ten gelen değer
SHAREPOINT_LIBRARY_NAME=Documents
SHAREPOINT_ROOT_FOLDER=Talepler
SHAREPOINT_SYNC_ENABLED=false        # Başlangıçta false — geliştirme bitince true
SHAREPOINT_MAX_RETRY_ATTEMPTS=5
```

---

### 11.4 Faz 1 Tamamlanma Kriteri

Aşağıdakiler sağlanmadan Faz 2'ye geçmiyoruz:
- [ ] Azure AD app'a `Sites.Selected` (veya `Files.ReadWrite.All`) eklendi ve admin consent verildi
- [ ] (Sites.Selected ise) hedef site'a write izni atandı
- [ ] Supabase'de 2 migration başarıyla çalıştı
- [ ] `requests` tablosunda 6 yeni kolon var (sharepoint_*)
- [ ] `sharepoint_sync_queue` tablosu oluştu
- [ ] `.env.local`'e değişkenler eklendi (IT'den gelenler dahil)
- [ ] IT'den `SHAREPOINT_SITE_ID` ve `SHAREPOINT_DRIVE_ID` alındı
