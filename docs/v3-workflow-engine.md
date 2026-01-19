# RT Enerji Workflow Engine - V3

Bu doküman, V2 workflow engine üzerine yapılacak geliştirmeleri tanımlar.

---

## 1. V3'ün Amacı

### V2'de Olan (Mevcut)
- ✅ Sıralı onay zinciri (sequential approval)
- ✅ Onaycı tipleri: `REQUESTER`, `UNIT_HEAD`, `STATIC_POSITION`
- ✅ Onay/Red mekanizması
- ✅ Bildirimler (in-app + email)
- ✅ Yıllık izin ve kısa süreli izin süreçleri

### V3'te Eklenecek
- 🎯 **Adım tipi (step_type)**: Sadece onay, form girişi veya ikisi birden
- 🎯 **Form alanları (form_fields)**: Her adımda hangi alanların doldurulacağı/görüntüleneceği
- 🎯 **Workflow bağımlılıkları (prerequisites)**: Bir sürecin başlaması için başka bir sürecin tamamlanmış olması
- 🎯 **Parent request bağlantısı**: Spesifik bir talebe bağlı talepler (örn: Seyahat → Masraf)

---

## 2. Yeni Kavramlar

### 2.1 Adım Tipi (step_type)

| Tip | Açıklama | Örnek |
|-----|----------|-------|
| `APPROVAL_ONLY` | Sadece onay/red (mevcut davranış) | İK son onayı |
| `FORM_ENTRY` | Sadece form doldurma (otomatik onay) | Veri girişi adımları |
| `FORM_ENTRY_AND_APPROVAL` | Hem form doldur hem onayla | Asistan bilgi girişi + onay |

### 2.2 Form Alanları (form_fields)

Her adımda hangi alanların görüntüleneceği ve düzenlenebileceği JSON ile tanımlanır:

```json
{
  "fields": [
    {
      "name": "employee_name",
      "label": "Çalışan Adı",
      "type": "text",
      "required": true,
      "editable": true
    },
    {
      "name": "department",
      "label": "Departman",
      "type": "text",
      "required": false,
      "editable": false
    }
  ]
}
```

### 2.3 Workflow Bağımlılıkları (Prerequisites)

Bir workflow başlamadan önce başka bir workflow'un tamamlanmış olması gerekebilir:

```
İzin Talebi ──requires──► İşe Giriş Formu (APPROVED)
Masraf Talebi ──requires──► Seyahat Talebi (APPROVED)
```

---

## 3. Veritabanı Değişiklikleri

### 3.1 Yeni Enum: `step_type`

```sql
create type public.step_type as enum (
  'APPROVAL_ONLY',
  'FORM_ENTRY',
  'FORM_ENTRY_AND_APPROVAL'
);
```

### 3.2 `workflow_steps` Tablosu Güncellemesi

```sql
alter table public.workflow_steps 
  add column step_type public.step_type not null default 'APPROVAL_ONLY',
  add column form_fields jsonb;
```

### 3.3 Yeni Tablo: `workflow_prerequisites`

```sql
create table if not exists public.workflow_prerequisites (
  id                      uuid primary key default gen_random_uuid(),
  workflow_definition_id  uuid not null references public.workflow_definitions(id),
  required_workflow_id    uuid not null references public.workflow_definitions(id),
  required_status         public.request_status not null default 'APPROVED',
  error_message           text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),
  
  unique (workflow_definition_id, required_workflow_id)
);
```

### 3.4 `requests` Tablosu Güncellemesi

```sql
alter table public.requests 
  add column parent_request_id uuid references public.requests(id);
```

---

## 4. Akış Değişiklikleri

### 4.1 Adım Tipine Göre Davranış

```
┌─────────────────────────────────────────────────────────────────┐
│ step_type = APPROVAL_ONLY                                       │
│   └── Sadece "Onayla" / "Reddet" butonları                      │
├─────────────────────────────────────────────────────────────────┤
│ step_type = FORM_ENTRY                                          │
│   └── Form alanlarını doldur + "Kaydet ve Devam" butonu         │
│   └── Otomatik APPROVED, sonraki adıma geç                      │
├─────────────────────────────────────────────────────────────────┤
│ step_type = FORM_ENTRY_AND_APPROVAL                             │
│   └── Form alanlarını doldur                                    │
│   └── "Kaydet ve Onayla" veya "Reddet" butonları                │
└─────────────────────────────────────────────────────────────────┘
```

### 4.2 Prerequisite Kontrolü

```
Kullanıcı "Yeni Talep" → checkPrerequisites() → 
  ├── ✅ Tüm ön koşullar sağlandı → Form açılır
  └── ❌ Eksik ön koşul var → Hata mesajı + yönlendirme
```

---

## 5. Örnek: İşe Giriş Takip Formu

### Workflow Definition
- **Code:** `ONBOARDING`
- **Name:** İşe Giriş Takip Formu

### Adımlar

| Sıra | Adım | step_type | Doldurulacak Alanlar |
|------|------|-----------|---------------------|
| 1 | Asistan | `FORM_ENTRY_AND_APPROVAL` | employee_name, tc_no, department, start_date |
| 2 | Personel Şefi | `FORM_ENTRY_AND_APPROVAL` | equipment_*, access_card_no, email_created |
| 3 | İK Onayı | `APPROVAL_ONLY` | (tüm alanlar read-only) |

---

## 6. Geliştirme Planı

### Faz 1: Veritabanı (Migration)
- [ ] `step_type` enum oluştur
- [ ] `workflow_steps` tablosuna yeni alanlar ekle
- [ ] `workflow_prerequisites` tablosu oluştur
- [ ] `requests` tablosuna `parent_request_id` ekle

### Faz 2: Backend (API + Services)
- [ ] `checkPrerequisites()` fonksiyonu
- [ ] Approval API'de formData desteği
- [ ] Form validasyonu (step.form_fields'a göre)

### Faz 3: Frontend (UI)
- [ ] Dinamik form renderer bileşeni
- [ ] Adım tipine göre buton gösterimi
- [ ] Prerequisite hata mesajı gösterimi

### Faz 4: İlk Uygulama
- [ ] `onboarding_requests` tablosu
- [ ] İşe Giriş workflow tanımı + adımlar
- [ ] İşe Giriş form sayfası

---

## 7. Geriye Dönük Uyumluluk

✅ **Mevcut V2 workflow'ları etkilenmez:**
- `step_type` default olarak `APPROVAL_ONLY`
- `form_fields` default olarak `NULL`
- Yıllık izin ve kısa süreli izin süreçleri çalışmaya devam eder

---

## 8. Detaylı Şema Değişiklikleri

### 8.1 Migration SQL

```sql
-- V3 Workflow Engine Migration
-- Çalıştırılmadan önce V2 schema'nın yüklü olduğundan emin olun

-- 1. step_type enum
create type public.step_type as enum (
  'APPROVAL_ONLY',
  'FORM_ENTRY',
  'FORM_ENTRY_AND_APPROVAL'
);

-- 2. workflow_steps tablosuna yeni alanlar
alter table public.workflow_steps
  add column if not exists step_type public.step_type not null default 'APPROVAL_ONLY',
  add column if not exists form_fields jsonb;

comment on column public.workflow_steps.step_type is
  'Adım tipi: Sadece onay, form girişi, veya ikisi birden';
comment on column public.workflow_steps.form_fields is
  'JSON: Bu adımda doldurulacak/görüntülenecek form alanları';

-- 3. workflow_prerequisites tablosu
create table if not exists public.workflow_prerequisites (
  id                      uuid primary key default gen_random_uuid(),
  workflow_definition_id  uuid not null references public.workflow_definitions(id) on delete cascade,
  required_workflow_id    uuid not null references public.workflow_definitions(id) on delete cascade,
  required_status         public.request_status not null default 'APPROVED',
  error_message           text,
  is_active               boolean not null default true,
  created_at              timestamptz not null default now(),

  constraint unique_prerequisite unique (workflow_definition_id, required_workflow_id),
  constraint no_self_reference check (workflow_definition_id != required_workflow_id)
);

create index if not exists idx_prerequisites_workflow
  on public.workflow_prerequisites (workflow_definition_id);

comment on table public.workflow_prerequisites is
  'Workflow bağımlılıkları - bir süreç başlamadan önce hangi süreçler tamamlanmış olmalı';

-- 4. requests tablosuna parent_request_id
alter table public.requests
  add column if not exists parent_request_id uuid references public.requests(id);

create index if not exists idx_requests_parent
  on public.requests (parent_request_id) where parent_request_id is not null;

comment on column public.requests.parent_request_id is
  'Eğer bu talep başka bir talebe bağlıysa (örn: Masraf → Seyahat)';
```

---

## 9. form_fields JSON Şeması

### Desteklenen Alan Tipleri

| type | Açıklama | Örnek |
|------|----------|-------|
| `text` | Tek satır metin | Çalışan adı |
| `textarea` | Çok satırlı metin | Açıklama |
| `number` | Sayısal değer | Tutar |
| `date` | Tarih seçici | İşe başlama tarihi |
| `datetime` | Tarih + saat | Toplantı zamanı |
| `checkbox` | Evet/Hayır | Laptop verildi mi? |
| `select` | Dropdown seçim | Departman |
| `file` | Dosya yükleme | Belge eki |

### Örnek form_fields Tanımı

```json
{
  "fields": [
    {
      "name": "employee_name",
      "label": "Çalışan Adı Soyadı",
      "type": "text",
      "required": true,
      "editable": true,
      "placeholder": "Örn: Ahmet Yılmaz"
    },
    {
      "name": "department",
      "label": "Departman",
      "type": "select",
      "required": true,
      "editable": true,
      "options": [
        {"value": "IT", "label": "Bilgi Teknolojileri"},
        {"value": "HR", "label": "İnsan Kaynakları"},
        {"value": "FIN", "label": "Finans"}
      ]
    },
    {
      "name": "start_date",
      "label": "İşe Başlama Tarihi",
      "type": "date",
      "required": true,
      "editable": true
    },
    {
      "name": "laptop_given",
      "label": "Laptop Teslim Edildi",
      "type": "checkbox",
      "required": false,
      "editable": true
    },
    {
      "name": "notes",
      "label": "Notlar",
      "type": "textarea",
      "required": false,
      "editable": true,
      "placeholder": "Ek bilgiler..."
    }
  ]
}
```

---

## 10. API Değişiklikleri

### 10.1 Approval API Güncellemesi

**Endpoint:** `PATCH /api/approvals/[id]`

**Mevcut Request Body (V2):**
```json
{
  "decision": "APPROVED",
  "comment": "Onaylandı"
}
```

**Yeni Request Body (V3):**
```json
{
  "decision": "APPROVED",
  "comment": "Onaylandı",
  "formData": {
    "employee_name": "Ahmet Yılmaz",
    "department": "IT",
    "start_date": "2026-01-15",
    "laptop_given": true
  }
}
```

### 10.2 Yeni Endpoint: Prerequisite Kontrolü

**Endpoint:** `GET /api/workflows/[code]/can-create`

**Response (başarılı):**
```json
{
  "canCreate": true,
  "prerequisites": []
}
```

**Response (başarısız):**
```json
{
  "canCreate": false,
  "prerequisites": [
    {
      "workflowCode": "ONBOARDING",
      "workflowName": "İşe Giriş Takip Formu",
      "requiredStatus": "APPROVED",
      "currentStatus": null,
      "errorMessage": "İzin talebi oluşturabilmek için İşe Giriş Formunuz tamamlanmış olmalıdır."
    }
  ]
}
```

---

## 11. TypeScript Tipleri

```typescript
// lib/workflow/types.ts - V3 Additions

export type StepType = 'APPROVAL_ONLY' | 'FORM_ENTRY' | 'FORM_ENTRY_AND_APPROVAL';

export interface FormFieldOption {
  value: string;
  label: string;
}

export interface FormField {
  name: string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'datetime' | 'checkbox' | 'select' | 'file';
  required: boolean;
  editable: boolean;
  placeholder?: string;
  options?: FormFieldOption[];  // select için
}

export interface FormFields {
  fields: FormField[];
}

export interface WorkflowStep {
  id: string;
  workflow_definition_id: string;
  step_order: number;
  name: string;
  approver_type: ApproverType;
  static_position_id: string | null;
  is_required: boolean;
  step_type: StepType;           // V3
  form_fields: FormFields | null; // V3
  created_at: string;
}

export interface WorkflowPrerequisite {
  id: string;
  workflow_definition_id: string;
  required_workflow_id: string;
  required_status: RequestStatus;
  error_message: string | null;
  is_active: boolean;
  created_at: string;
}

export interface PrerequisiteCheckResult {
  canProceed: boolean;
  missingPrerequisites: {
    workflowCode: string;
    workflowName: string;
    requiredStatus: RequestStatus;
    currentStatus: RequestStatus | null;
    errorMessage: string;
  }[];
}
```

---

## 12. Dosya Yapısı (Yeni/Güncellenecek)

```
lib/workflow/
├── index.ts                    # Export'lar (güncelle)
├── types.ts                    # Tipler (güncelle)
├── workflow-service.ts         # Ana servis (güncelle)
├── notification-service.ts     # Bildirimler (değişiklik yok)
└── prerequisite-service.ts     # YENİ: Ön koşul kontrolü

sql/
├── workflow_engine_schema.sql  # V2 schema
├── workflow_engine_v3_migration.sql  # YENİ: V3 migration
└── workflow_engine_seed.sql    # Seed data (güncelle)

app/api/
├── approvals/[id]/route.ts     # Onay API (güncelle - formData desteği)
└── workflows/[code]/
    └── can-create/route.ts     # YENİ: Prerequisite kontrolü
```

---

**Son Güncelleme:** 2026-01-12
**Durum:** Planlama tamamlandı, implementasyona hazır
**İlk Hedef:** İşe Giriş Takip Formu

