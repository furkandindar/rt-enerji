# Fazla Mesai Onay Formu Süreci

> **Workflow Code:** `OVERTIME`  
> **Versiyon:** 1.0  
> **Tarih:** 2026-01-27

---

## 1. Genel Bakış

Fazla mesai onay formu, çalışanların fazla mesai taleplerinin yönetilmesini sağlayan süreçtir. İki farklı fazla mesai tipi vardır:

1. **Acil Durum (EMERGENCY):** Tek çalışan için, talep üzerine oluşturulan fazla mesai
2. **Personel Eksikliği (STAFF_SHORTAGE):** Çoklu çalışan için, raporlama amaçlı fazla mesai

### Özellikler

| Özellik | Değer |
|---------|-------|
| Workflow Code | `OVERTIME` |
| is_restricted | `true` (sadece İK başlatabilir) |
| Toplam Adım | 2 |
| Form Dolduran | Sadece 1. adım (İnsan Kaynakları) |

---

## 2. Fazla Mesai Tipleri

### 2.1 Olağan Dışı Durumlar (EMERGENCY)

Tek bir çalışan için, acil durumlar veya talep üzerine oluşturulan fazla mesai.

**Neden Kategorileri:**
| Kod | Açıklama |
|-----|----------|
| `SHIFT_OUTSIDE` | Vardiya Dışı |
| `NON_CONTINUOUS` | Sürekli Olmayan |
| `EMERGENCY_CASE` | Acil Durumlar |
| `SUDDEN_DEVELOPMENT` | Ani Gelişen |
| `ON_REQUEST` | Talep Üzerine |

### 2.2 Olağan Durumlar (STAFF_SHORTAGE)

Birden fazla çalışan için, raporlama amaçlı oluşturulan fazla mesai.

**Neden Kategorileri:**
| Kod | Açıklama |
|-----|----------|
| `STAFF_SHORTAGE` | Personel Eksikliği |
| `REPORTING` | Raporlama |
| `ENERGY_PRODUCTION` | 7/24 Enerji Üretimi |

---

## 3. Form Alanları

### 3.1 Ortak Alanlar (Her İki Tip)

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `overtime_type` | Enum | ✅ | `EMERGENCY` veya `STAFF_SHORTAGE` |
| `month` | Varchar | ✅ | Ay (Ocak, Şubat, ...) |
| `year` | Integer | ✅ | Yıl (2026) |
| `reason_category` | Enum | ✅ | Fazla mesai neden kategorisi |
| `reason_detail` | Text | ✅ | Çalışmayı talep eden kişi veya durum |
| `hr_note` | Text | ❌ | İnsan Kaynakları notu |

### 3.2 Sadece EMERGENCY Alanları

| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `work_location` | Text | ✅ | Çalışma yeri (ofis/işletme) |
| `work_start_date` | Timestamptz | ✅ | Çalışma başlangıç tarihi/saati |
| `work_end_date` | Timestamptz | ✅ | Çalışma bitiş tarihi/saati |
| `previous_shift` | Text | ✅ | Bir önceki mesai saati |
| `next_shift` | Text | ✅ | Bir sonraki mesai saati |
| `work_reason` | Text | ✅ | Mesai dışı yapılma nedeni |

### 3.3 Sadece STAFF_SHORTAGE Alanları

**Ana Tablo:**
| Alan | Tip | Açıklama |
|------|-----|----------|
| `total_hours` | Decimal | Toplam FM saati (otomatik hesaplanır) |
| `total_pay` | Decimal | Toplam ücret karşılığı (otomatik hesaplanır) |

**Çalışan Satırları (overtime_entries):**
| Alan | Tip | Zorunlu | Açıklama |
|------|-----|---------|----------|
| `role_title` | Varchar | ✅ | Rol/Unvan (Mesul Teknisyen, Operatör, vb.) |
| `overtime_hours` | Decimal | ✅ | FM Saati |
| `overtime_pay` | Decimal | ✅ | Ücret karşılığı |

---

## 4. Onay Zinciri

| Adım | Onaycı | approver_type | action_type | form_section_key | Not |
|------|--------|---------------|-------------|------------------|-----|
| 1 | İnsan Kaynakları | `STATIC_POSITION` | `FILL_AND_SIGN` | `overtime_details` | Formu doldurur + imzalar |
| 2 | Genel Müdür | `STATIC_POSITION` | `SIGN_ONLY` | `null` | Son onay |

---

## 5. Veritabanı

### 5.1 Enum Types

```sql
-- Fazla mesai tipi
CREATE TYPE public.overtime_type AS ENUM ('EMERGENCY', 'STAFF_SHORTAGE');

-- Fazla mesai neden kategorisi
CREATE TYPE public.overtime_reason_category AS ENUM (
  -- EMERGENCY nedenleri
  'SHIFT_OUTSIDE',
  'NON_CONTINUOUS',
  'EMERGENCY_CASE',
  'SUDDEN_DEVELOPMENT',
  'ON_REQUEST',
  -- STAFF_SHORTAGE nedenleri
  'STAFF_SHORTAGE',
  'REPORTING',
  'ENERGY_PRODUCTION'
);
```

### 5.2 Workflow Definition

```sql
INSERT INTO workflow_definitions (code, name, description, is_active, is_restricted)
VALUES ('OVERTIME', 'Fazla Mesai Onay Formu', 'Fazla mesai talep ve onay süreci', true, true);
```

### 5.3 Workflow Steps

```sql
DO $$
DECLARE
  v_workflow_id UUID;
  v_hr_position_id UUID;
  v_gm_position_id UUID;
BEGIN
  SELECT id INTO v_workflow_id FROM workflow_definitions WHERE code = 'OVERTIME';
  SELECT id INTO v_hr_position_id FROM positions WHERE code = 'HR_MANAGER'; -- İK Müdürü
  SELECT id INTO v_gm_position_id FROM positions WHERE code = 'GENERAL_MANAGER'; -- Genel Müdür

  -- Adım 1: İnsan Kaynakları
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 1, 'İnsan Kaynakları', 'STATIC_POSITION', v_hr_position_id, true, 'FILL_AND_SIGN', 'overtime_details');

  -- Adım 2: Genel Müdür
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 2, 'Genel Müdür', 'STATIC_POSITION', v_gm_position_id, true, 'SIGN_ONLY', NULL);
END $$;
```

### 5.4 Workflow Initiators (Kısıtlı Başlatma)

```sql
DO $$
DECLARE
  v_workflow_id UUID;
  v_hr_position_id UUID;
BEGIN
  SELECT id INTO v_workflow_id FROM workflow_definitions WHERE code = 'OVERTIME';
  SELECT id INTO v_hr_position_id FROM positions WHERE code = 'HR_MANAGER';

  INSERT INTO workflow_initiators (workflow_definition_id, position_id)
  VALUES (v_workflow_id, v_hr_position_id);
END $$;
```

### 5.5 Ana Tablo: overtime_requests

```sql
CREATE TABLE public.overtime_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,

  -- Ortak alanlar
  overtime_type public.overtime_type NOT NULL,
  month VARCHAR(20) NOT NULL,
  year INTEGER NOT NULL,
  reason_category public.overtime_reason_category NOT NULL,
  reason_detail TEXT NOT NULL,
  hr_note TEXT,

  -- Sadece EMERGENCY alanları (STAFF_SHORTAGE için NULL)
  work_location TEXT,
  work_start_date TIMESTAMPTZ,
  work_end_date TIMESTAMPTZ,
  previous_shift TEXT,
  next_shift TEXT,
  work_reason TEXT,

  -- Sadece STAFF_SHORTAGE alanları (otomatik hesaplanır)
  total_hours DECIMAL(10,2),
  total_pay DECIMAL(12,2),

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX idx_overtime_requests_request_id ON public.overtime_requests(request_id);
CREATE INDEX idx_overtime_requests_type ON public.overtime_requests(overtime_type);

-- CHECK Constraint: EMERGENCY ise ilgili alanlar zorunlu
ALTER TABLE public.overtime_requests
ADD CONSTRAINT check_emergency_required_fields
CHECK (
  overtime_type != 'EMERGENCY'
  OR (
    work_location IS NOT NULL
    AND work_start_date IS NOT NULL
    AND work_end_date IS NOT NULL
    AND previous_shift IS NOT NULL
    AND next_shift IS NOT NULL
    AND work_reason IS NOT NULL
  )
);

-- CHECK Constraint: Reason category tip ile uyumlu olmalı
ALTER TABLE public.overtime_requests
ADD CONSTRAINT check_reason_category_matches_type
CHECK (
  (overtime_type = 'EMERGENCY' AND reason_category IN ('SHIFT_OUTSIDE', 'NON_CONTINUOUS', 'EMERGENCY_CASE', 'SUDDEN_DEVELOPMENT', 'ON_REQUEST'))
  OR
  (overtime_type = 'STAFF_SHORTAGE' AND reason_category IN ('STAFF_SHORTAGE', 'REPORTING', 'ENERGY_PRODUCTION'))
);
```

### 5.6 Çalışan Satırları Tablosu: overtime_entries

```sql
CREATE TABLE public.overtime_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  overtime_request_id UUID NOT NULL REFERENCES public.overtime_requests(id) ON DELETE CASCADE,
  role_title VARCHAR(100) NOT NULL,
  overtime_hours DECIMAL(6,2) NOT NULL,
  overtime_pay DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX idx_overtime_entries_request_id ON public.overtime_entries(overtime_request_id);
```

### 5.7 RLS Politikaları

```sql
-- overtime_requests RLS
ALTER TABLE public.overtime_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overtime_requests_select" ON public.overtime_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = overtime_requests.request_id
      AND (
        r.requester_employee_id IN (SELECT employee_id FROM app_users WHERE id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.request_approvals ra
          WHERE ra.request_id = r.id
          AND ra.approver_employee_id IN (SELECT employee_id FROM app_users WHERE id = auth.uid())
        )
      )
    )
  );

CREATE POLICY "overtime_requests_insert" ON public.overtime_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
    )
  );

-- overtime_entries RLS
ALTER TABLE public.overtime_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overtime_entries_select" ON public.overtime_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.overtime_requests orq
      JOIN public.requests r ON r.id = orq.request_id
      WHERE orq.id = overtime_entries.overtime_request_id
      AND (
        r.requester_employee_id IN (SELECT employee_id FROM app_users WHERE id = auth.uid())
        OR EXISTS (
          SELECT 1 FROM public.request_approvals ra
          WHERE ra.request_id = r.id
          AND ra.approver_employee_id IN (SELECT employee_id FROM app_users WHERE id = auth.uid())
        )
      )
    )
  );

CREATE POLICY "overtime_entries_insert" ON public.overtime_entries
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.overtime_requests orq
      JOIN public.requests r ON r.id = orq.request_id
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE orq.id = overtime_request_id AND au.id = auth.uid()
    )
  );
```

---

## 6. Implementasyon Planı

### Faz 1: Veritabanı
- [ ] Enum types oluştur (`overtime_type`, `overtime_reason_category`)
- [ ] `workflow_definitions` kaydı ekle
- [ ] `workflow_steps` kayıtları ekle (2 adım)
- [ ] `workflow_initiators` kaydı ekle (İK)
- [ ] `overtime_requests` tablosu oluştur (CHECK constraints dahil)
- [ ] `overtime_entries` tablosu oluştur
- [ ] RLS politikaları ekle

### Faz 2: Backend
- [ ] `lib/workflow/types.ts` - `OvertimeType`, `OvertimeReasonCategory` type'ları ekle
- [ ] `lib/workflow/types.ts` - `OvertimeRequest`, `OvertimeEntry` interface'leri ekle
- [ ] `lib/workflow/types.ts` - `CreateOvertimeInput` interface ekle
- [ ] `app/api/overtime/route.ts` - POST ve GET endpoint'leri

### Faz 3: Frontend
- [ ] `app/overtime/new/page.tsx` - Yeni talep formu (tip seçimine göre dinamik)
- [ ] `components/nav-workflow.tsx` - Menüye ekle
- [ ] `app/api/my-requests/route.ts` - overtime_requests select'e ekle
- [ ] `app/api/approvals/route.ts` - overtime_requests select'e ekle
- [ ] `app/approvals/page.tsx` - Fazla mesai detaylarını göster
- [ ] `app/my-requests/page.tsx` - Fazla mesai detaylarını göster

### Faz 4: PDF (Opsiyonel)
- [ ] `lib/pdf/overtime-pdf-template.tsx` - PDF şablonu

---

## 7. API Endpoint'leri

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/overtime` | Kullanıcının fazla mesai taleplerini listele |
| POST | `/api/overtime` | Yeni fazla mesai talebi oluştur |

### POST Request Body - EMERGENCY

```typescript
interface CreateOvertimeEmergencyInput {
  overtime_type: 'EMERGENCY';
  month: string;
  year: number;
  reason_category: 'SHIFT_OUTSIDE' | 'NON_CONTINUOUS' | 'EMERGENCY_CASE' | 'SUDDEN_DEVELOPMENT' | 'ON_REQUEST';
  reason_detail: string;
  hr_note?: string;
  work_location: string;
  work_start_date: string;
  work_end_date: string;
  previous_shift: string;
  next_shift: string;
  work_reason: string;
}
```

### POST Request Body - STAFF_SHORTAGE

```typescript
interface CreateOvertimeStaffShortageInput {
  overtime_type: 'STAFF_SHORTAGE';
  month: string;
  year: number;
  reason_category: 'STAFF_SHORTAGE' | 'REPORTING' | 'ENERGY_PRODUCTION';
  reason_detail: string;
  hr_note?: string;
  entries: Array<{
    role_title: string;
    overtime_hours: number;
    overtime_pay: number;
  }>;
}
```

---

## 8. Frontend Davranışı

### Tip Seçimi
1. İK formu açar
2. Fazla mesai tipi seçer (Acil Durum / Personel Eksikliği)
3. Seçime göre form alanları dinamik olarak değişir

### EMERGENCY Formu
- Tek çalışan için standart form alanları
- Çalışma yeri, tarihler, mesai saatleri

### STAFF_SHORTAGE Formu
- Dinamik tablo (satır ekle/sil butonu)
- Her satırda: Rol, FM Saati, Ücret Karşılığı
- Altında otomatik hesaplanan TOPLAM satırı

---

## 9. Notlar

- **Kısıtlı Başlatma:** Bu süreç sadece İK pozisyonundaki kişiler tarafından başlatılabilir. `is_restricted: true` ve `workflow_initiators` tablosu kullanılır.
- **CHECK Constraints:** Database seviyesinde tip bazlı alan zorunluluğu sağlanır.
- **Toplam Hesaplama:** STAFF_SHORTAGE tipinde `total_hours` ve `total_pay` alanları, entries tablosundaki değerlerin toplamı olarak API tarafında hesaplanır.

