# Maaş Avans Talebi Süreci

> **Workflow Code:** `SALARY_ADVANCE`  
> **Versiyon:** 1.0  
> **Tarih:** 2026-01-25

---

## 1. Genel Bakış

Maaş avans talebi, çalışanların maaşlarından avans talep etmelerini sağlayan süreçtir. Talep eden formu doldurur ve imzalar, ardından 5 farklı onaycı sırasıyla onaylar.

### Özellikler

| Özellik | Değer |
|---------|-------|
| Workflow Code | `SALARY_ADVANCE` |
| is_restricted | `false` (herkes başlatabilir) |
| Toplam Adım | 6 |
| Form Dolduran | Sadece 1. adım (Talep Eden) |

---

## 2. Form Alanları

### Otomatik Doldurulan

| Alan | Kaynak |
|------|--------|
| Adı / Soyadı | Talep eden çalışan |
| Şirket | RT Enerji Turizm San. Tic. A.Ş. (sabit) |
| Görev Unvanı | Çalışanın pozisyonu |
| Tarih | Talep tarihi |

### Kullanıcı Tarafından Doldurulan

| Alan | Tip | Açıklama |
|------|-----|----------|
| Avans Miktarı | Decimal | TL cinsinden miktar |
| Ödeme Şekli | Enum | `CASH` (Nakit), `BANK_TRANSFER` (Banka Havalesi) |
| Maaş Kesinti Muvafakatı | Boolean | Onay kutusu |

---

## 3. Onay Zinciri

| Adım | Onaycı | approver_type | action_type | form_section_key | Not |
|------|--------|---------------|-------------|------------------|-----|
| 1 | Talep Eden | `REQUESTER` | `FILL_AND_SIGN` | `advance_details` | Formu doldurur + imzalar |
| 2 | Personel (İK) | `STATIC_POSITION` | `SIGN_ONLY` | `null` | Muvafakatname 25% kontrolü |
| 3 | Muhasebe | `STATIC_POSITION` | `SIGN_ONLY` | `null` | Avans kaydı, avans durumu |
| 4 | Finans | `STATIC_POSITION` | `SIGN_ONLY` | `null` | - |
| 5 | Genel Koordinatör | `STATIC_POSITION` | `SIGN_ONLY` | `null` | - |
| 6 | Genel Müdür | `STATIC_POSITION` | `SIGN_ONLY` | `null` | Son onay |

---

## 4. Veritabanı

### 4.1 Workflow Definition

```sql
INSERT INTO workflow_definitions (code, name, description, is_active, is_restricted)
VALUES ('SALARY_ADVANCE', 'Maaş Avans Talebi', 'Maaş avans talep süreci', true, false);
```

### 4.2 Workflow Steps

```sql
-- Adım 1: Talep Eden
INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
VALUES ('<workflow_id>', 1, 'Talep Eden', 'REQUESTER', NULL, true, 'FILL_AND_SIGN', 'advance_details');

-- Adım 2: Personel
INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
VALUES ('<workflow_id>', 2, 'Personel', 'STATIC_POSITION', '<personel_position_id>', true, 'SIGN_ONLY', NULL);

-- Adım 3: Muhasebe
INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
VALUES ('<workflow_id>', 3, 'Muhasebe', 'STATIC_POSITION', '<muhasebe_position_id>', true, 'SIGN_ONLY', NULL);

-- Adım 4: Finans
INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
VALUES ('<workflow_id>', 4, 'Finans', 'STATIC_POSITION', '<finans_position_id>', true, 'SIGN_ONLY', NULL);

-- Adım 5: Genel Koordinatör
INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
VALUES ('<workflow_id>', 5, 'Genel Koordinatör', 'STATIC_POSITION', '<gk_position_id>', true, 'SIGN_ONLY', NULL);

-- Adım 6: Genel Müdür
INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
VALUES ('<workflow_id>', 6, 'Genel Müdür', 'STATIC_POSITION', '<gm_position_id>', true, 'SIGN_ONLY', NULL);
```

### 4.3 Detay Tablosu

```sql
CREATE TABLE public.salary_advance_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL,
  salary_deduction_consent BOOLEAN DEFAULT false,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH', 'BANK_TRANSFER')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(request_id)
);

-- RLS
ALTER TABLE public.salary_advance_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "salary_advance_requests_select_own" ON public.salary_advance_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = salary_advance_requests.request_id
      AND au.id = auth.uid()
    )
  );

CREATE POLICY "salary_advance_requests_insert_own" ON public.salary_advance_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id
      AND au.id = auth.uid()
    )
  );
```

---

## 5. Implementasyon Planı

### Faz 1: Veritabanı
- [ ] `workflow_definitions` kaydı ekle
- [ ] `workflow_steps` kayıtları ekle (6 adım)
- [ ] `salary_advance_requests` tablosu oluştur
- [ ] RLS politikaları ekle

### Faz 2: Backend
- [ ] `lib/workflow/types.ts` - `SalaryAdvanceRequest` interface ekle
- [ ] `lib/workflow/types.ts` - `PaymentMethod` type ekle
- [ ] `app/api/salary-advance/route.ts` - POST ve GET endpoint'leri

### Faz 3: Frontend
- [ ] `app/salary-advance/new/page.tsx` - Yeni talep formu
- [ ] `components/nav-workflow.tsx` - Menüye ekle
- [ ] Onay sayfasında maaş avans detaylarını göster

### Faz 4: PDF (Opsiyonel)
- [ ] `lib/pdf/salary-advance-pdf-template.tsx` - PDF şablonu

---

## 6. API Endpoint'leri

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/salary-advance` | Kullanıcının maaş avans taleplerini listele |
| POST | `/api/salary-advance` | Yeni maaş avans talebi oluştur |

### POST Request Body

```typescript
interface CreateSalaryAdvanceInput {
  amount: number;
  payment_method: 'CASH' | 'BANK_TRANSFER';
  salary_deduction_consent: boolean;
}
```

---

## 7. Notlar

- **Maaş Kesinti Muvafakatnamesi:** Şu an sadece onay kutusu olarak implement edilecek. İleride ayrı bir belge olarak eklenebilir.
- **Asistan Bildirimi:** Formda belirtilen "Onaylı form personele eposta gönderilmelidir" gibi bildirimler ileride notification sistemiyle entegre edilebilir.

