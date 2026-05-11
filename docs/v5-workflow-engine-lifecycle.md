# RT Enerji Workflow Engine V5 — Talep Yaşam Döngüsü: Güncelleme, Geri Çekme, İptal ve Revize İsteme

Bu doküman, V4 workflow engine üzerine yapılan geliştirmeleri tanımlar. V4'te bir talep oluşturulduktan sonra **PENDING** durumunda kilitleniyordu — talep eden yazım hatasını bile düzeltemiyor, ancak onaycı APPROVE/REJECT verebiliyordu. V5'te talep yaşam döngüsü esnekleştirildi: talep eden **geri çekebilir**, onaycı **revize isteyebilir**, talep eden veya ORG_ADMIN **iptal edebilir**, ORG_ADMIN her durumda **düzenleyebilir**.

> **Tarih:** 2026-05-11 (son revizyon: 2026-05-12)
> **Durum:** Uygulandı — dev üzerinde test ediliyor

---

## 1. V4'teki Durum ve Yeni İhtiyaçlar

### V4'te Olan
- Talep PENDING durumdayken talep eden hiçbir alanı değiştiremez
- Hiçbir PATCH/DELETE API endpoint'i yok
- RLS politikaları detay tablolarda `r.status = 'DRAFT'` ile kilitli
- Onaycı sadece APPROVE veya REJECT verebilir — "şu satırı düzelt" diyemez
- Soft cancel mekanizması yok (`CANCELLED` status enum'da var ama hiçbir akış buna düşürmez)

### V5'te Yeni İhtiyaçlar
- **Withdraw (Geri Çek):** Talep eden, henüz onay verilmediyse talebi DRAFT'a geri çekip düzenlemeli
- **Revision Request (Revize İste):** Onaycı, "düzelt ve yeniden gönder" diyebilmeli; talep eden düzeltip resubmit edince zincir başa dönmeli
- **Soft Cancel:** Talep eden veya ORG_ADMIN talebi `CANCELLED`'a çekebilmeli; hard delete yok, audit korunsun
- **ORG_ADMIN Override:** Operasyonel düzeltme için APPROVED/COMPLETED dahil her durumda edit yetkisi
- **Audit:** Onay zinciri sıfırlandığında eski kararlar (kim, ne zaman, hangi yorumla) kaybolmasın

---

## 2. Yeni Kavramlar

### 2.1 Revision Cycle (Revize Turu)

Onay zincirinin **kaçıncı kez** çalıştığını izler. Her revize sıfırlamasında cycle artırılır, eski cycle'ın kayıtları olduğu yerde kalır.

```
requests.current_revision_cycle smallint DEFAULT 0
request_approvals.revision_cycle smallint DEFAULT 0
```

**İlk submit:** Hem `requests.current_revision_cycle` hem oluşan onay kayıtları `revision_cycle = 0`.

**Resubmit sonrası:**
- `requests.current_revision_cycle` artırılır (0 → 1)
- Yeni `request_approvals` kayıtları `revision_cycle = 1` ile insert edilir
- Eski `revision_cycle = 0` kayıtları **dokunulmaz** (audit)

**Aktif kayıtları filtreleme:**
```sql
SELECT ra.*
FROM request_approvals ra
JOIN requests r ON r.id = ra.request_id
WHERE ra.revision_cycle = r.current_revision_cycle
```

### 2.2 Yeni Status: REVISION_REQUESTED

Talep onaycı tarafından "revize iste" ile geri döndüğünde girer. Talep eden bu durumda detay tablolarda UPDATE yapabilir (RLS izin verir). Resubmit edince `PENDING`'e döner, cycle sıfırlanır.

```
PENDING → REVISION_REQUESTED → DRAFT-benzeri edit → PENDING (yeni cycle)
```

### 2.3 Yeni Approval Status: REVISION_REQUESTED

Onaycının kendi `request_approvals` kaydında verdiği üçüncü karar tipi (APPROVED/REJECTED dışında). Karar metadata'sı (`decided_at`, `comment`) doldurulur ve eski cycle'da bu hâliyle kalır.

### 2.4 Withdraw (Geri Çek)

Talep eden, **henüz hiçbir gerçek onay verilmemişse** talebi DRAFT'a çekebilir.

**Eligibility:**
- `requests.status = 'PENDING'`
- Aktif cycle'daki **REQUESTER tipindeki adımlar hariç** tüm `request_approvals.status = 'PENDING'` (yani APPROVED/REJECTED/REVISION_REQUESTED yok)
- Çağıran kişi: talep sahibi VEYA ORG_ADMIN

> **Önemli:** `REQUESTER` tipindeki adım (genellikle 1. adım, "Talep Eden" imzası) `createApprovalChain` tarafından insert anında otomatik APPROVED işaretlenir — bu **gerçek bir onaycı kararı değil**, talep gönderme imzasıdır. Withdraw eligibility'sinde bu adımlar yok sayılır; aksi takdirde yeni oluşturulan PENDING talepler bile "1 onay alındı" gibi görünüp geri çekme kapanırdı.

**Yarış güvenliği:** Eligibility kontrolünde okunan `current_step`, UPDATE anında `.eq("current_step", req.current_step)` ile shadow update'e dahil edilir. Bir onaycı kararı araya girip `current_step` ilerletmişse 0 satır etkilenir → 409.

**Sonuç:** `status = DRAFT`, `submitted_at = NULL`, audit = `WITHDRAWN`. Approval kayıtlarına dokunulmaz; resubmit edilince cycle yeniden başlar.

### 2.5 Revision Request (Revize İste)

Onaycı sırası geldiğinde "Revize İste" diyebilir.

**Eligibility:**
- Çağıran kişi sıradaki onaycı (`current_step === sequence_order`)
- Comment **zorunlu** (talep edenin ne düzelteceği)

**Sonuç:**
- `request_approvals.status = 'REVISION_REQUESTED'` (kendi kaydı), `decided_at = now()`, `comment = ...`
- `requests.status = 'REVISION_REQUESTED'`, `current_step = 1`
- **Zincir HEMEN sıfırlanmaz** — resubmit anında sıfırlanır

### 2.6 Resubmit (Yeniden Gönder)

Talep eden, `DRAFT` veya `REVISION_REQUESTED` durumdayken düzenleyip yeniden gönderir.

**UX davranışı:** Resubmit kullanıcının doğrudan tıkladığı bir buton değildir. Edit form sayfasının "Talebi Güncelle ve Gönder" submit'i **PATCH + resubmit zincirini otomatik tetikler** (bkz. §2.8). Bu sayede iki adımlı kullanım (önce kaydet, sonra gönder) tek tıka indirgenir.

**Sonuç:**
- `current_revision_cycle++`
- Yeni cycle için `createApprovalChain` çağrılır → tüm adımlar yeni `PENDING` kayıtlarla insert edilir
- `requests.status = 'PENDING'`, `current_step = 1`, `submitted_at = now()`

**Hata durumu:** PATCH başarılı ama resubmit başarısız olursa talep DRAFT/REVISION_REQUESTED'da kalır, kullanıcıya toast uyarısı verilir ve "Düzenle" butonu hâlâ açık kaldığı için tekrar denenebilir.

### 2.7 Soft Cancel

Talep eden veya ORG_ADMIN, herhangi bir aktif durumdaki talebi iptal edebilir.

**Eligibility:** `status NOT IN (CANCELLED, COMPLETED, APPROVED)` ve (requester VEYA ORG_ADMIN).

**Sonuç:** `status = CANCELLED`, `completed_at = now()`. Hard delete yok.

### 2.8 Edit (Düzenle)

Detay tablo (`leave_requests`, `expense_requests`, vb.) ve items üzerinde UPDATE. PATCH endpoint'i status'u **değiştirmez** — sadece detay alanlarını günceller.

**Eligibility:**
- Talep sahibi: `status IN (DRAFT, REVISION_REQUESTED)`
- ORG_ADMIN: her durumda

**UX akışı:** Talep detay Sheet'inde "Düzenle" tıklanır → `/<type>/new?edit=<id>` query parametresiyle form sayfası "edit mode"da açılır. Form mevcut değerlerle doldurulur. Submit butonu **"Talebi Güncelle ve Gönder"** olarak değişir; submit anında **PATCH + resubmit zincirini otomatik çalıştırır** ve kullanıcı tek tıkla güncelleyip onaya yollar. Bu sayede DRAFT/REVISION_REQUESTED durumunda ayrı bir "Yeniden Gönder" butonuna gerek kalmaz.

> ORG_ADMIN APPROVED/COMPLETED bir talebi düzenlerse otomatik resubmit tetiklenmez — sadece PATCH yapılır, talep durumunu korur. (Bu senaryo henüz form UI'da kapsanmadı; ORG_ADMIN düzeltmeleri için ayrı bir admin akışı ileride eklenebilir.)

---

## 3. Yeni Bildirim Tipleri

| Tip | Alıcı | Tetikleyici |
|-----|-------|-------------|
| `REVISION_REQUESTED` | Talep sahibi | Onaycı "revize iste" dedi |
| `REQUEST_UPDATED` | Eski cycle'da APPROVED veren onaycılar | Talep eden resubmit etti |

Mevcut tipler (`APPROVAL_REQUIRED`, `REQUEST_APPROVED`, `REQUEST_REJECTED`, `REQUEST_CANCELLED`) korunur.

---

## 4. Veritabanı Değişiklikleri

### Migration 1 — Enum genişletmeleri (`sql/feature_request_lifecycle_v1_enums.sql`)
ALTER TYPE ADD VALUE statement'ları PostgreSQL'de ayrı transaction'larda çalışır.

```sql
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'REVISION_REQUESTED';
ALTER TYPE public.approval_status ADD VALUE IF NOT EXISTS 'REVISION_REQUESTED';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'REQUEST_UPDATED';
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'REVISION_REQUESTED';
```

### Migration 2 — Kolon + index + audit (`sql/feature_request_lifecycle_v1_columns.sql`)

```sql
ALTER TABLE public.request_approvals
  ADD COLUMN revision_cycle smallint NOT NULL DEFAULT 0;

ALTER TABLE public.requests
  ADD COLUMN current_revision_cycle smallint NOT NULL DEFAULT 0,
  ADD COLUMN last_action text,
  ADD COLUMN last_action_at timestamptz,
  ADD COLUMN last_action_by uuid REFERENCES public.employees(id);

CREATE INDEX idx_request_approvals_req_cycle
  ON public.request_approvals (request_id, revision_cycle, sequence_order);
```

### Migration 2-hotfix — UNIQUE constraint'i cycle ile genişlet (`sql/feature_request_lifecycle_v1_hotfix_unique.sql`)

Canlı şemada V3'ten kalma şu constraint vardı:
```
UNIQUE (request_id, workflow_step_id, approver_employee_id)
```
V3'te DYNAMIC_USER_LIST için "aynı kişi aynı adıma iki kez insert edilmesin" diye eklenmişti. V5'te resubmit yeni cycle insert edince **aynı kişi aynı adımda farklı cycle ile** çakışıyor → constraint hatası. Çözüm: cycle'ı constraint'e dahil et.

```sql
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_approvals_request_step_approver_key') THEN
    ALTER TABLE public.request_approvals
      DROP CONSTRAINT request_approvals_request_step_approver_key;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'request_approvals_request_step_approver_cycle_key') THEN
    ALTER TABLE public.request_approvals
      ADD CONSTRAINT request_approvals_request_step_approver_cycle_key
      UNIQUE (request_id, workflow_step_id, approver_employee_id, revision_cycle);
  END IF;
END $$;
```

> **Not:** İlk plan bu constraint'i `(request_id, sequence_order)` olarak varsaymıştı (dump'taki dosya adı `fix_request_approvals_unique_for_dynamic_list.sql` yanıltıcıydı). Canlı şemada gerçek constraint farklı kolonlar üzerindeydi; hotfix bu eksiği kapatıyor. Yeni kurulumda Migration 2'ye bu DO bloğu doğrudan dahil edilebilir.

### Migration 3 — RLS güncellemeleri (`sql/feature_request_lifecycle_v1_rls.sql`)

6 farklı pattern uygulanır:

| Pattern | Tablo(lar) | Değişiklik |
|---------|------------|-----------|
| **A** — DRAFT'ı genişlet + ORG_ADMIN ekle | `expense_requests`, `expense_items`, `mukayese_requests`+items+suppliers+prices, `accounting_approval_cover_*`, `finance_approval_cover_*`, `request_form_requests` | `r.status = 'DRAFT'` → `r.status IN ('DRAFT','REVISION_REQUESTED')` + ORG_ADMIN dalı |
| **B** — Zengin policy genişlet | `leave_requests` | Status genişletilir; FILL_AND_SIGN approver dalı **aynen korunur** |
| **C** — Yeni requester policy ekle | `salary_advance_requests`, `travel_assignment_requests` | Mevcut approver-only policy (HR consent / actual_dates) korunur; yanına yeni `_requester` policy eklenir |
| **D** — Yeniden yaz | `separation_requests` | Mevcut policy status kontrolsüzdü, geniş — requester + ORG_ADMIN + PENDING-approver olarak yeniden yazılır |
| **E** — Sıfırdan ekle | `overtime_requests`, `overtime_entries`, `approval_letter_requests` | UPDATE policy yoktu, yeni policy eklenir |
| **F** — WITH CHECK genişlet | `request_approvals` | WITH CHECK'e `REVISION_REQUESTED` eklenir; onaycı kendi kaydını revize talebine çekebilir |

---

## 5. Yeni Status Akışları

### Tek Fazlı Süreç (Lifecycle V5)
```
DRAFT → PENDING ⇄ REVISION_REQUESTED → PENDING → APPROVED
   ↑                                              ↘
   ↑← (withdraw)                                   → REJECTED
   ↓                                               
CANCELLED  (soft cancel; her durumdan giriş)
```

### Çok Fazlı Süreç (V4'ten miras + V5 lifecycle)
```
DRAFT → PENDING ⇄ REVISION_REQUESTED → PENDING → AWAITING_COMPLETION → COMPLETED
```

### Status Tablosu (V4'ten farklılaşan satırlar **bold**)
| Status | Renk | Etiket | Açıklama |
|--------|------|--------|----------|
| DRAFT | Gri | Taslak | Henüz gönderilmedi |
| PENDING | Sarı | Beklemede | Onay bekliyor |
| **REVISION_REQUESTED** | Turuncu | Revize İstendi | Onaycı düzeltme istedi |
| APPROVED | Yeşil | Onaylandı | Tüm adımlar tamam (tek fazlı) |
| AWAITING_COMPLETION | Mavi | Tamamlanma Bekleniyor | Onay bitti, tamamlama adımı bekleniyor |
| COMPLETED | Koyu Yeşil | Tamamlandı | Tüm fazlar tamam (çok fazlı) |
| REJECTED | Kırmızı | Reddedildi | Reddedildi |
| CANCELLED | Gri | İptal Edildi | İptal edildi |

---

## 6. Backend Değişiklikleri

### 6.1 TypeScript Tipleri (`lib/workflow/types.ts`)

```typescript
type RequestStatus = ... | 'REVISION_REQUESTED';
type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';
type NotificationType = ... | 'REQUEST_UPDATED' | 'REVISION_REQUESTED';

interface Request {
  ...
  current_revision_cycle: number;
  last_action: string | null;
  last_action_at: string | null;
  last_action_by: string | null;
}

interface RequestApproval {
  ...
  revision_cycle: number;
}
```

### 6.2 Yeni Helper Modülü: `lib/workflow/lifecycle.ts`

```typescript
canEditRequest(req, user, role): boolean
canWithdrawRequest(req, approvals): boolean
canCancelRequest(req, user, role): boolean
canRequestRevision(approval, req): boolean
resetApprovalChain(supabase, requestId): Promise<void>
applyAuditStamp(supabase, requestId, action, byEmployeeId): Promise<void>
```

### 6.3 createApprovalChain Genişletmesi (`lib/workflow/workflow-service.ts`)

7. opsiyonel parametre `cycle: number = 0`. Tüm INSERT'lere `revision_cycle: cycle` propage edilir. İlk submit'te 0 (mevcut davranış), resubmit'te artırılarak çağrılır.

### 6.4 Yeni Endpoint'ler

| Endpoint | Amaç |
|----------|------|
| `POST /api/requests/[id]/withdraw` | Geri çek (status → DRAFT) |
| `POST /api/requests/[id]/resubmit` | Yeniden gönder (cycle++, zincir sıfırla) |
| `POST /api/requests/[id]/cancel` | Soft cancel (status → CANCELLED) |
| `POST /api/approvals/[id]/request-revision` | Onaycı revize ister |
| `PATCH /api/leave-requests/[id]` | İzin detayını güncelle |
| `PATCH /api/expense-form/[id]` | Harcama detayını + items güncelle |
| `PATCH /api/comparison-form/[id]` | Mukayese detayını + items+suppliers+prices güncelle |
| `PATCH /api/salary-advance/[id]` | Avans detayını güncelle |
| `PATCH /api/overtime/[id]` | Fazla mesai detayını güncelle |
| `PATCH /api/separation/[id]` | Ayrılma detayını güncelle |
| `PATCH /api/travel-assignment/[id]` | Seyahat görev detayını güncelle |
| `PATCH /api/request-form/[id]` | Talep formu detayını güncelle |

### 6.5 Mevcut Sorgulara Cycle Filtresi

`request_approvals` okuyan SELECT'lere `revision_cycle = requests.current_revision_cycle` filtresi eklenmeli — yoksa eski cycle'daki APPROVED kayıtları yeni cycle'daki PENDING'lerle karışır.

Etkilenen dosyalar:
- `app/api/approvals/[id]/route.ts` — `allApprovals` sorgusu (forward auto-approve SIGN_ONLY için kritik) + PATCH eligibility check (`approval.revision_cycle === request.current_revision_cycle`, eski cycle'ın PENDING kaydına karar verilemez)
- `app/api/approvals/route.ts` — pending filter'a cycle eşitliği, nested approvals filter, history'ye `REVISION_REQUESTED` dahil
- `app/api/my-requests/route.ts` — nested approvals client-side filter
- `lib/email/request-summary.ts` — email context approval zinciri
- `lib/pdf/generate-request-pdf.ts` — **PDF render** — eski cycle kayıtları PDF'te görünmemeli (yoksa onay tablosunda kolonlar tekrarlanır)

> Yetki/authorization için `request_approvals` okuyan endpoint'lere (`app/api/requests/[id]/pdf*`) cycle filtresi **konmaz** — bir onaycı eski cycle'da onayladıysa hâlâ PDF görme yetkisi olmalı.

---

## 7. Frontend Değişiklikleri

### 7.1 Detay Sheet Aksiyon Butonları (`my-requests`)

Yeni component `components/my-requests/request-lifecycle-actions.tsx`. Detay Sheet'te statüye göre:

| Buton | Görünme Koşulu |
|-------|----------------|
| **Geri Çek** | `status=PENDING` && **REQUESTER hariç** hiçbir approval kararlı değil |
| **Düzenle** | `status ∈ (DRAFT, REVISION_REQUESTED)` veya ORG_ADMIN |
| **İptal Et** | `status ∉ (CANCELLED, COMPLETED, APPROVED)` |

"Düzenle" `/<type>/new?edit=<requestId>` query parametresiyle yönlendirir.

> Bu listede **"Yeniden Gönder" yer almaz** — edit form sayfasının submit'i PATCH + resubmit zincirini otomatik tetiklediği için ayrı bir butona gerek yoktur (bkz. §2.6).
>
> Withdraw'ın eligibility'sinde **REQUESTER tipindeki adımlar yok sayılır** — bu adım talep gönderme imzası olarak insert anında otomatik APPROVED işaretlenir, gerçek bir onaycı kararı değildir. Aksi takdirde yeni oluşturulan PENDING talepler bile "geri çekme kapalı" görünürdü.

### 7.2 Edit Mode (`/<type>/new` sayfaları)

8 form sayfası (`leave-requests`, `expense-form`, `comparison-form`, `salary-advance`, `overtime`, `separation`, `travel-assignment`, `request-form`) ufak bir değişiklikle edit modunu destekler:

1. `useSearchParams()` ile `edit` query param okunur
2. Mount'ta mevcut talep çekilir, `form.reset(defaultValues)` ile doldurulur
3. `onSubmit`:
   - **Create modu:** orijinal POST akışı (attachment upload dahil)
   - **Edit modu:** PATCH `/api/<type>/${editId}` ardından otomatik POST `/api/requests/${editId}/resubmit` — talep PENDING'e döner, ilk gerçek onaycıya bildirim gider. Attachment upload bu akışta çalışmaz; mevcut attachment'lar olduğu yerde kalır.
4. Header/submit metni toggle:
   - Create: "Yeni Talep" / "İmzala ve Talebi Gönder"
   - Edit: "Talebi Güncelle" / "Talebi Güncelle ve Gönder"
5. Edit modunda imza paneli zorunluluğu bypass'lı (kullanıcı ilk oluştururken zaten imzaladı).

**Hata yönetimi:** PATCH başarılı + resubmit başarısız olursa toast'ta "Talep güncellendi ama yeniden gönderilemedi" gösterilir. Talep DRAFT/REVISION_REQUESTED'da kalır; kullanıcı "Düzenle" butonu hâlâ açık olduğu için tekrar deneyebilir.

### 7.3 Revize İste (`approvals`)

`components/approvals/approval-actions.tsx`: Onayla/Reddet yanına 3. buton — "Revize İste" (outline, sarı). Comment zorunlu. `use-approvals.ts:handleRequestRevision()` POST `/api/approvals/[id]/request-revision`.

### 7.4 Görsel Stiller

- `lib/approvals/constants.ts` → `requestStatusLabels.REVISION_REQUESTED = 'Revize İstendi'`, renk turuncu
- `components/notification-popover.tsx` → `REQUEST_UPDATED` mavi, `REVISION_REQUESTED` turuncu badge

---

## 8. Talep Yaşam Döngüsü Senaryoları

### Senaryo 1 — Talep eden yazım hatası fark etti (hiç onay verilmedi)
```
1. Kullanıcı talep oluşturur → PENDING, 1. onaycıya bildirim
   - 1. adım REQUESTER tipi → createApprovalChain anında auto-APPROVED (gönderme imzası)
   - current_step gerçek 1. onaycıya (2. adım) atlar
2. Hata fark eder, detay Sheet'inde "Geri Çek" → DRAFT
   - REQUESTER auto-APPROVED eligibility'de yok sayılır, geri çekme açık
3. "Düzenle" → /<type>/new?edit=<id> sayfasına gider, düzeltir
4. "Talebi Güncelle ve Gönder" → tek tıkla:
   - PATCH detail
   - POST /api/requests/[id]/resubmit → cycle=1
   - createApprovalChain(cycle=1) → tüm adımlar yeni PENDING
   - status PENDING, 1. gerçek onaycıya APPROVAL_REQUIRED bildirimi
```

### Senaryo 2 — Onaycı revize istedi
```
1. Talep PENDING, 1. onaycı onayladı (cycle=0)
2. 2. onaycı "Revize İste" + comment → REVISION_REQUESTED
   - request_approvals[2].status = 'REVISION_REQUESTED' (cycle=0)
   - requests.status = 'REVISION_REQUESTED'
   - Talep edene REVISION_REQUESTED bildirimi (comment ile)
3. Talep eden detay Sheet'inden "Düzenle" → /<type>/new?edit=<id>
4. Düzeltip "Talebi Güncelle ve Gönder" → tek tıkla:
   - PATCH detail
   - POST /api/requests/[id]/resubmit → cycle=1
   - createApprovalChain(cycle=1) → tüm adımlar yeni PENDING (cycle=1)
   - requests.current_revision_cycle = 1, status = 'PENDING'
   - 1. onaycıya APPROVAL_REQUIRED bildirimi
   - Eski 1. onaycı (cycle=0'da APPROVED veren) → REQUEST_UPDATED bildirimi
   - Cycle=0 kayıtları olduğu yerde audit için kalır
```

### Senaryo 3 — ORG_ADMIN APPROVED talebi düzeltti
```
1. Talep APPROVED
2. ORG_ADMIN /<type>/new?edit=<id> sayfasına gider, hatalı bir alanı düzeltir
3. PATCH detail → status değişmez, kimseye bildirim gitmez
4. Audit alanı (last_action='EDITED_BY_ADMIN') güncellenir
```

### Senaryo 4 — Talep eden vazgeçti
```
1. Talep herhangi bir aktif durumda (DRAFT, PENDING, REVISION_REQUESTED, AWAITING_COMPLETION)
2. "İptal Et" + onay diyaloğu → status = CANCELLED
3. Eski cycle'da APPROVED veren onaycılara REQUEST_CANCELLED bildirimi
4. Talep listede "İptal Edildi" badge ile görünür, hard delete edilmez
```

---

## 9. Geriye Uyumluluk

| Değişiklik | Mevcut Süreçlere Etki |
|-----------|----------------------|
| Enum'a `REVISION_REQUESTED` eklenmesi | Mevcut talepler bu status'a hiç düşmez |
| Enum'a `REQUEST_UPDATED`/`REVISION_REQUESTED` notification | Mevcut bildirim akışı korunur |
| `revision_cycle` kolonu (DEFAULT 0) | Mevcut tüm `request_approvals` kayıtları cycle=0 ile gelir |
| `current_revision_cycle` kolonu (DEFAULT 0) | Mevcut tüm `requests` kayıtları cycle=0 olur |
| `last_action_*` audit kolonları (NULLable) | Mevcut talepler için NULL — yeni eylem olunca dolar |
| UNIQUE constraint cycle ile genişletildi | Eski tüm satırlar cycle=0 olduğu için tek (request_id, step, approver) çifti hâlâ unique; yeni cycle insert açılır |
| Tip A RLS değişiklikleri | Eski "requester+DRAFT" izni **korunur**, üstüne REVISION_REQUESTED ve ORG_ADMIN eklenir |
| Tip B (`leave_requests`) | FILL_AND_SIGN onaycı dalı **aynen korunur** |
| Tip C (`salary_advance_requests`, `travel_assignment_requests`) | Mevcut approver-only policy **silinmez**, ek requester policy eklenir |
| Tip D (`separation_requests`) | **Kısıtlama getirilir** — mevcut policy approver'a status kontrolsüz UPDATE veriyordu; yeni policy onaycıyı `status=PENDING`'e kısıtlar (bkz. risk notu) |
| Tip E (`overtime_requests`, `overtime_entries`, `approval_letter_requests`) | UPDATE policy zaten yoktu, yenisi eklenmek geriye uyumlu |
| Tip F (`request_approvals` WITH CHECK) | APPROVED/REJECTED hâlâ geçerli, sadece REVISION_REQUESTED eklendi |
| `createApprovalChain(... cycle=0)` | Yeni parametre opsiyonel, mevcut çağrılarda 0 default ile aynı davranış |
| `request_approvals` SELECT'lerine cycle filtresi | Mevcut talepler cycle=0, filtre `0=0` true verir — eski davranış korunur |
| Yeni endpoint'ler (`PATCH /api/<type>/[id]`, lifecycle endpoint'leri) | Tamamen yeni route'lar; mevcut POST/GET endpoint'leri değişmez |
| Edit mode (`?edit=<id>` query param) | Query param yoksa eski "yeni talep" davranışı |
| Edit submit'in auto-resubmit zinciri | Sadece edit modunda — create akışı (POST + attachment upload) aynen çalışır |
| `request-lifecycle-actions` component | Detay Sheet'e ek butonlar; mevcut PDF download / detay görünümü etkilenmez |
| UI sabitler (yeni renk/etiket) | Sadece yeni status için tanım, eski badge'ler değişmez |

### Risk Notu: `separation_requests` Policy Kısıtlaması

Canlı şemada `separation_requests_update` policy'si onaycıya **status kontrolsüz** UPDATE veriyor — yani APPROVED'dan sonra bile checklist alanı doldurulabiliyor olabilir. Yeni policy bunu `ra.status = 'PENDING'`'e kısıtlıyor.

Eğer İK akışında "onay sonrası dosya tamamlama" gerekiyorsa bu davranış kısıtlamış oluruz. Mevcut akışta bunun yapıldığı bir senaryo varsa, Tip D'deki `ra.status = 'PENDING'` koşulu kaldırılarak mevcut davranış aynen korunabilir. **Bu noktayı uygulamadan önce iş tarafıyla doğrulamak gerekir.**

### Sonuç

V5 değişiklikleri **opt-in ve additive**: yeni status'lara düşmek, yeni endpoint'leri çağırmak, edit moduna girmek hep kullanıcı aksiyonu. Mevcut talep oluşturma + onay akışları (POST `/api/<type>`, PATCH `/api/approvals/[id]`) aynen çalışmaya devam eder. Tek davranışsal değişiklik separation_requests RLS policy'sindeki status kısıtlamasıdır (yukarıdaki risk notu).

---

## 10. Uygulama Sırasında Yakalanan Bug'lar ve Fix'ler

Bu sürüm dev'de test edilirken yakalanan üç bulgu — sonraki sürüm planlamasına ışık tutsun diye kayıt altına alındı.

### Bug 1 — Eksik UNIQUE constraint genişletmesi (Migration 2 → Hotfix)

**Belirti:** Resubmit edildiğinde `duplicate key value violates unique constraint "request_approvals_request_step_approver_key"` hatası.

**Sebep:** V3'ten kalma `UNIQUE (request_id, workflow_step_id, approver_employee_id)` constraint'i vardı (dynamic approver için). V5'te yeni cycle insert edince aynı kişi aynı adımda farklı cycle ile çakışıyordu. İlk plan bu constraint'i `sql/fix_request_approvals_unique_for_dynamic_list.sql` dosyasının adına bakarak `(request_id, sequence_order)` olarak varsaymıştı — canlı şemada gerçek tanım farklıydı.

**Fix:** `sql/feature_request_lifecycle_v1_hotfix_unique.sql` — eski constraint DROP, `revision_cycle` dahil yeni constraint CREATE (idempotent DO bloğu ile). Yeni kurulumda Migration 2'ye dahil edilmeli.

**Ders:** Planlama aşamasında varsayım yerine canlı şemadan SELECT'le constraint tanımlarını doğrulamalı. Dosya adlarına güvenilmemeli.

### Bug 2 — REQUESTER auto-approve "gerçek onay" gibi muamele görüyor

**Bağlam:** `createApprovalChain`, REQUESTER tipindeki ilk adımı insert anında otomatik APPROVED işaretler — bu **talep gönderme imzasıdır**, kullanıcının ayrıca verdiği bir onaycı kararı değildir. V5'in birkaç noktasında bu auto-APPROVED kayıtları "gerçek bir karar" gibi davranıyor ve UX bozuyordu:

**Belirti 2a — Withdraw kilitleniyor:** Yeni oluşturulan PENDING bir talepte hiçbir gerçek onaycı karar vermemişken "Geri Çek" butonu görünmüyor, server tarafında eligibility false dönüyordu.

**Belirti 2b — Onay Geçmişi REQUESTER ile şişiyor:** Bir talep N kez resubmit edilince `/approvals` "Onay Geçmişi" tablosunda her cycle'ın REQUESTER auto-APPROVED kaydı ayrı satır olarak listeleniyor; talep eden 7 kez gönderdiyse aynı talep 7 kez "onayladığı bir karar" gibi görünüyordu.

**Belirti 2c — `current_step` shadow update:** Withdraw'ın yarış-safe `.eq("current_step", 1)` sabitlemesi auto-approve sonrası `current_step` 2'den başlayan talepleri 0 satır etkiledi → 409.

**Belirti 2d — Onay Geçmişi forward auto-approve ile şişiyor:** Aynı kullanıcı bir süreçte birden fazla adımda onaycıysa (örn. 2. adım UNIT_HEAD + 4. adım STATIC_POSITION), gerçek kararı verdiğinde V3'ten miras forward auto-approve mantığı aynı kişinin ilerideki **SIGN_ONLY** adımlarını otomatik APPROVED'a çekiyor (aynı kişiden tekrar imza istemeyelim diye). Sonuç: aynı talep "Onay Geçmişi"nde 2 satır — biri fiilen tıklanan karar, biri auto-approve.

**Fix (her dört belirti için):**
- `components/my-requests/request-lifecycle-actions.tsx` — withdraw eligibility client (REQUESTER hariç)
- `app/api/requests/[id]/withdraw/route.ts` — withdraw eligibility server (REQUESTER hariç) + shadow update'i `req.current_step` ile dinamik yap
- `app/api/approvals/route.ts` — `approvalHistory` filter'ı:
  1. REQUESTER tipindeki kayıtları çıkar (Belirti 2b için)
  2. **`(request_id, revision_cycle)` üzerinden dedup**: aynı talep+cycle için en küçük `sequence_order`'lı kaydı tut (Belirti 2d için — forward auto-approve daha büyük seq alır, elenir)

**Ders:** REQUESTER tipinin "talep gönderme imzası" + SIGN_ONLY forward auto-approve'un "implicit imza" semantiği `request_approvals` tablosunu "gerçek kararların log'u" olarak okuyan her yere yansıtılmalı. İki kavramı bir helper olarak ayrıştırmak değerli olabilir:

```typescript
// önerilen helper (henüz yazılmadı):
function realDecisionsByApprover(approvals: RequestApproval[]): RequestApproval[] {
  // 1. REQUESTER tipini ele
  // 2. (request_id, cycle, approver) için en erken sequence_order'lı kaydı tut
}
```

Bu kalıp `request_approvals` okuyan diğer endpoint'ler için de (örneğin dashboard stats, performans raporları, audit log görünümleri) gelecekte gerekli olabilir.

### Bug 3 — PDF'te eski cycle approval'ları tekrar tekrar render ediliyor

**Belirti:** Bir talep birkaç kez revize edilince PDF "Onay" tablosunda her onaycı kolonu N kez tekrar görünüyordu.

**Sebep:** `lib/pdf/generate-request-pdf.ts` nested `approvals` SELECT'i cycle filtresi olmadan tüm cycle'lardaki kayıtları çekiyor, hepsini render ediyordu.

**Fix:** SELECT'e `revision_cycle` eklendi, mapping'den önce `.filter(a => a.revision_cycle === request.current_revision_cycle)` ile sadece aktif cycle render ediliyor. Yetki kontrolü için olan `app/api/requests/[id]/pdf*` SELECT'lerine **filtre eklenmedi** — onaycı eski cycle'da onayladıysa hâlâ PDF görme yetkisi olmalı.

**Ders:** §6.5'teki cycle filtresi listesinde sadece API ve hook'lar değil, PDF/email render kodları da kontrol edilmeli.

### UX iyileştirmesi — Edit + Auto-Resubmit

İlk implementasyonda "Düzenle" sonrası kullanıcı `/my-requests`'e dönüp ayrıca "Yeniden Gönder"e tıklamak zorundaydı. Test sırasında bu iki adımlı UX kafa karıştırıcı bulundu. Çözüm: edit form sayfasının submit'i PATCH başarılı olduktan sonra `POST /api/requests/[id]/resubmit` zincirini otomatik tetikler. "Yeniden Gönder" butonu detay Sheet'inden kaldırıldı.

**Trade-off:** PATCH başarılı + resubmit başarısız edge case'inde talep DRAFT'ta takılır. Bu durum kullanıcıya toast'la bildirilir; "Düzenle" butonu hâlâ açık olduğu için kullanıcı tekrar deneyebilir. Pragmatik kabul edilen risk.
