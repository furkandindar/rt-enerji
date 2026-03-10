# İşten Çıkış Takip Formu Süreci

> **Workflow Code:** `EMPLOYEE_SEPARATION`
> **Versiyon:** 1.0
> **Tarih:** 2026-03-08

---

## 1. Genel Bakış

İşten çıkış takip formu, işten ayrılan personelin tüm çıkış süreçlerinin takip edilmesini sağlayan çok adımlı bir süreçtir. İK süreci başlatır, ardından farklı departmanlar kendi sorumluluk alanlarındaki checklist maddelerini doldurur ve son olarak Genel Müdür onaylar.

### Özellikler

| Özellik | Değer |
|---------|-------|
| Workflow Code | `EMPLOYEE_SEPARATION` |
| is_restricted | `true` (sadece İK başlatabilir) |
| Toplam Adım | 9 |
| Form Dolduran Adımlar | 8 (Adım 1-8: FILL_AND_SIGN) |
| Son Onay | 1 (Adım 9: SIGN_ONLY) |
| Toplam Checklist Maddesi | 24 |

---

## 2. Onay Zinciri

| Adım | Onaycı | approver_type | action_type | form_section_key | Doldurduğu Bölüm |
|------|--------|---------------|-------------|------------------|-------------------|
| 1 | İnsan Kaynakları | `REQUESTER` | `FILL_AND_SIGN` | `section_1` | Temel Bilgiler + Mali Tablo |
| 2 | Genel Müdür/CEO | `STATIC_POSITION` | `FILL_AND_SIGN` | `section_2` | Bilgi İşlem İşlemleri |
| 3 | İnsan Kaynakları | `REQUESTER` | `FILL_AND_SIGN` | `section_3` | İK İşlemleri |
| 4 | Hukuk Müşaviri | `STATIC_POSITION` | `FILL_AND_SIGN` | `section_4` | Hukuki İşlemler |
| 5 | Muhasebe Şefi | `STATIC_POSITION` | `FILL_AND_SIGN` | `section_5` | Muhasebe İşlemleri |
| 6 | İdari İşler Uzmanı | `STATIC_POSITION` | `FILL_AND_SIGN` | `section_6` | IT / İdari İşlemler |
| 7 | İK Uzmanı | `STATIC_POSITION` | `FILL_AND_SIGN` | `section_7` | Belge Tarama |
| 8 | Asistan | `STATIC_POSITION` | `FILL_AND_SIGN` | `section_8` | Takvim İşlemleri |
| 9 | Genel Müdür/CEO | `STATIC_POSITION` | `SIGN_ONLY` | `null` | Son Onay |

---

## 3. Form Alanları

### 3.1 Section 1: Temel Bilgiler (İK tarafından doldurulur)

| Alan | DB Sütunu | Tip | Zorunlu | Açıklama |
|------|-----------|-----|---------|----------|
| İşten Çıkan Kişi | `employee_name` | Text | ✅ | Ad Soyad |
| Unvanı | `employee_title` | Text | ✅ | Pozisyon unvanı |
| Departmanı | `department` | Text | ✅ | Departman adı |
| Lokasyonu | `location` | Text | ✅ | Çalışma lokasyonu |
| İş Tanımı / Kapsamı / Kodu | `job_description` | Text | ✅ | İş tanımı detayı |
| Bağlı Olduğu Yönetici | `reporting_manager` | Text | ✅ | Yönetici adı |
| İşten Çıkış Tarihi | `separation_date` | Date | ✅ | Ayrılış tarihi |
| İşten Çıkış Sebebi / Şekli | `separation_reason` | Text | ✅ | Örn: "İstifa", "Fesih" |
| Şirketimizde Bulunduğu Zaman Aralığı | `employment_period` | Text | ✅ | Örn: "2 yıl 3 ay" |

**Mali Tablo:**

| Alan | DB Sütunları | Tip | Birim |
|------|-------------|-----|-------|
| Yıllık İzin | `annual_leave_days` + `annual_leave_amount` | INTEGER + NUMERIC | Gün + TL |
| Kıdem Tazminatı | `severance_days` + `severance_amount` | INTEGER + NUMERIC | Gün + TL |
| İhbar Tazminatı | `notice_weeks` + `notice_amount` | INTEGER + NUMERIC | Hafta + TL |

### 3.2 Section 2: Bilgi İşlem İşlemleri (Genel Müdür/CEO)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 1 | E-posta Hesaplarının Kapatılması / Yönlendirilmesi | `email_closure_status` | `email_closure_notes` |
| 2 | Bilgi İşlem Hesaplarının ve Erişimlerin İptali | `it_access_revocation_status` | `it_access_revocation_notes` |

### 3.3 Section 3: İK İşlemleri (İnsan Kaynakları)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 1 | İşten Çıkış Evraklarının Hazırlanması | `exit_documents_status` | `exit_documents_notes` |
| 2 | Personel Listesine Çıkış Kaydının Yapılması | `personnel_list_removal_status` | `personnel_list_removal_notes` |
| 3 | Bordro ile İlgili İşlemlerin Yapılması | `payroll_processing_status` | `payroll_processing_notes` |
| 4 | Personel Avans Kontrolü | `advance_check_status` | `advance_check_notes` |
| 5 | Zimmetli Eşyaların Teslim Alınması / Tutanak | `equipment_return_status` | `equipment_return_notes` |
| 6 | Zimmetli Kıyafetlerin Teslimi / Tutanak | `uniform_return_status` | `uniform_return_notes` |
| 7 | Anlaşmalı Hastane Kayıtlarından Silinmesi İçin Bildirim Yapılması | `hospital_removal_status` | `hospital_removal_notes` |
| 8 | Ana Bina ve Ofis Giriş Kartı Teslimi | `access_card_return_status` | `access_card_return_notes` |
| 9 | Çalıştığı Lokasyon Güvenliğe Bilgi Verilmesi | `security_notification_status` | `security_notification_notes` |
| 10 | Organizasyon Şemasından Çıkartılması | `org_chart_removal_status` | `org_chart_removal_notes` |
| 11 | SGK ve Emniyet Bildirimlerinin Yapılması | `sgk_notification_status` | `sgk_notification_notes` |

### 3.4 Section 4: Hukuki İşlemler (Hukuk Müşaviri)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 1 | Vekaletname, Yetki Belgesi ve UYAP Kaydı Kontrolü / Azli | `poa_uyap_revocation_status` | `poa_uyap_revocation_notes` |
| 2 | Mersis Kayıtları Kontrolü / İptali | `mersis_revocation_status` | `mersis_revocation_notes` |
| 3 | Zimmetli Eşyaların Teslim Alınması / Tutanak | `legal_equipment_return_status` | `legal_equipment_return_notes` |

### 3.5 Section 5: Muhasebe İşlemleri (Muhasebe Şefi)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 1 | Personel Harcama Formunun Personel Tarafından Eksiksiz Olarak Teslimi | `expense_form_submission_status` | `expense_form_submission_notes` |
| 2 | Personel Harcama Formu Muhasebe Kontrolü | `expense_form_review_status` | `expense_form_review_notes` |
| 3 | Personel Avans Kontrolü | `accounting_advance_check_status` | `accounting_advance_check_notes` |
| 4 | Banka ve Kurum Kayıtları Kontrolü / Erişimin Kapatılması (TEİAŞ, EPİAŞ vb.) | `bank_institution_access_revocation_status` | `bank_institution_access_revocation_notes` |

### 3.6 Section 6: IT / İdari İşlemler (İdari İşler Uzmanı)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 1 | Bilg/QNAP Arşiv ve Sıfırlama O365 Arşiv IP Telefon Kaydı Kaldırılması | `qnap_o365_ip_removal_status` | `qnap_o365_ip_removal_notes` |
| 2 | PC Kontrolü (İhtiyaç Halinde Profesyonel Kontrol) | `pc_check_status` | `pc_check_notes` |

### 3.7 Section 7: Belge Tarama (İK Uzmanı)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 1 | Tüm Belgelerin Taranması | `documents_scan_status` | `documents_scan_notes` |

### 3.8 Section 8: Takvim İşlemleri (Asistan)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 1 | 2/6/12. Aylar Değerlendirme Formlarının Takvimden Silinmesi | `evaluation_calendar_removal_status` | `evaluation_calendar_removal_notes` |

### Checklist Durum Değerleri

| Değer | Açıklama |
|-------|----------|
| `DONE` | Yapıldı |
| `NOT_DONE` | Yapılmadı |
| `NA` | Uygulanmaz |

---

## 4. Veritabanı

### 4.1 Workflow Definition

```sql
INSERT INTO workflow_definitions (code, name, description, is_active, is_restricted)
VALUES ('EMPLOYEE_SEPARATION', 'İşten Çıkış Takip Formu', 'Personel işten çıkış takip süreci', true, true);
```

### 4.2 Workflow Steps

```sql
DO $$
DECLARE
  v_workflow_id UUID;
BEGIN
  SELECT id INTO v_workflow_id FROM workflow_definitions WHERE code = 'EMPLOYEE_SEPARATION';

  -- Adım 1: İnsan Kaynakları (Requester)
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 1, 'İnsan Kaynakları', 'REQUESTER', NULL, true, 'FILL_AND_SIGN', 'section_1');

  -- Adım 2: Genel Müdür/CEO
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 2, 'Adım 2', 'STATIC_POSITION', 'c07655d5-a90c-4687-87ee-0eea2d9c0bd5', true, 'FILL_AND_SIGN', 'section_2');

  -- Adım 3: İnsan Kaynakları (Requester)
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 3, 'İnsan Kaynakları', 'REQUESTER', NULL, true, 'FILL_AND_SIGN', 'section_3');

  -- Adım 4: Hukuk Müşaviri
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 4, 'Adım 4', 'STATIC_POSITION', '88443864-d65b-4779-afb8-b908d6408298', true, 'FILL_AND_SIGN', 'section_4');

  -- Adım 5: Muhasebe Şefi
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 5, 'Adım 5', 'STATIC_POSITION', '98960ff3-1685-4ea7-8316-75fbf64a0295', true, 'FILL_AND_SIGN', 'section_5');

  -- Adım 6: İdari İşler Uzmanı
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 6, 'Adım 6', 'STATIC_POSITION', 'e3895873-dfc7-4f79-b1fc-ab64d30c6dc1', true, 'FILL_AND_SIGN', 'section_6');

  -- Adım 7: İK Uzmanı
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 7, 'Adım 7', 'STATIC_POSITION', '59fc065d-310c-4bfe-ae41-ac1ef7795ac4', true, 'FILL_AND_SIGN', 'section_7');

  -- Adım 8: Asistan
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 8, 'Adım 8', 'STATIC_POSITION', '861f17b9-2609-42c8-9198-808cdd0eb682', true, 'FILL_AND_SIGN', 'section_8');

  -- Adım 9: Genel Müdür/CEO (Son Onay)
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 9, 'Adım 9', 'STATIC_POSITION', 'c07655d5-a90c-4687-87ee-0eea2d9c0bd5', true, 'SIGN_ONLY', NULL);
END $$;
```

### 4.3 Workflow Initiators (Kısıtlı Başlatma)

```sql
DO $$
DECLARE
  v_workflow_id UUID;
BEGIN
  SELECT id INTO v_workflow_id FROM workflow_definitions WHERE code = 'EMPLOYEE_SEPARATION';

  INSERT INTO workflow_initiators (workflow_definition_id, position_id)
  VALUES (v_workflow_id, 'd9e2f7d3-86a3-47f0-8373-78b8b946b8b7');
END $$;
```


### 4.4 Ana Tablo: separation_requests

```sql
CREATE TABLE public.separation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,

  -- Section 1: Temel Bilgiler
  employee_name TEXT,
  employee_title TEXT,
  department TEXT,
  location TEXT,
  job_description TEXT,
  reporting_manager TEXT,
  separation_date DATE,
  separation_reason TEXT,
  employment_period TEXT,

  -- Section 1: Mali Tablo
  annual_leave_days INTEGER DEFAULT 0,
  annual_leave_amount NUMERIC DEFAULT 0,
  severance_days INTEGER DEFAULT 0,
  severance_amount NUMERIC DEFAULT 0,
  notice_weeks INTEGER DEFAULT 0,
  notice_amount NUMERIC DEFAULT 0,

  -- Section 2: Bilgi İşlem İşlemleri
  email_closure_status TEXT DEFAULT 'NOT_DONE',
  email_closure_notes TEXT,
  it_access_revocation_status TEXT DEFAULT 'NOT_DONE',
  it_access_revocation_notes TEXT,

  -- Section 3: İK İşlemleri
  exit_documents_status TEXT DEFAULT 'NOT_DONE',
  exit_documents_notes TEXT,
  personnel_list_removal_status TEXT DEFAULT 'NOT_DONE',
  personnel_list_removal_notes TEXT,
  payroll_processing_status TEXT DEFAULT 'NOT_DONE',
  payroll_processing_notes TEXT,
  advance_check_status TEXT DEFAULT 'NOT_DONE',
  advance_check_notes TEXT,
  equipment_return_status TEXT DEFAULT 'NOT_DONE',
  equipment_return_notes TEXT,
  uniform_return_status TEXT DEFAULT 'NOT_DONE',
  uniform_return_notes TEXT,
  hospital_removal_status TEXT DEFAULT 'NOT_DONE',
  hospital_removal_notes TEXT,
  access_card_return_status TEXT DEFAULT 'NOT_DONE',
  access_card_return_notes TEXT,
  security_notification_status TEXT DEFAULT 'NOT_DONE',
  security_notification_notes TEXT,
  org_chart_removal_status TEXT DEFAULT 'NOT_DONE',
  org_chart_removal_notes TEXT,
  sgk_notification_status TEXT DEFAULT 'NOT_DONE',
  sgk_notification_notes TEXT,

  -- Section 4: Hukuki İşlemler
  poa_uyap_revocation_status TEXT DEFAULT 'NOT_DONE',
  poa_uyap_revocation_notes TEXT,
  mersis_revocation_status TEXT DEFAULT 'NOT_DONE',
  mersis_revocation_notes TEXT,
  legal_equipment_return_status TEXT DEFAULT 'NOT_DONE',
  legal_equipment_return_notes TEXT,

  -- Section 5: Muhasebe İşlemleri
  expense_form_submission_status TEXT DEFAULT 'NOT_DONE',
  expense_form_submission_notes TEXT,
  expense_form_review_status TEXT DEFAULT 'NOT_DONE',
  expense_form_review_notes TEXT,
  accounting_advance_check_status TEXT DEFAULT 'NOT_DONE',
  accounting_advance_check_notes TEXT,
  bank_institution_access_revocation_status TEXT DEFAULT 'NOT_DONE',
  bank_institution_access_revocation_notes TEXT,

  -- Section 6: IT / İdari İşlemler
  qnap_o365_ip_removal_status TEXT DEFAULT 'NOT_DONE',
  qnap_o365_ip_removal_notes TEXT,
  pc_check_status TEXT DEFAULT 'NOT_DONE',
  pc_check_notes TEXT,

  -- Section 7: Belge Tarama
  documents_scan_status TEXT DEFAULT 'NOT_DONE',
  documents_scan_notes TEXT,

  -- Section 8: Takvim İşlemleri
  evaluation_calendar_removal_status TEXT DEFAULT 'NOT_DONE',
  evaluation_calendar_removal_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_separation_requests_request_id ON public.separation_requests(request_id);
```

### 4.5 RLS Politikaları

```sql
ALTER TABLE public.separation_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "separation_requests_select" ON public.separation_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = separation_requests.request_id
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

CREATE POLICY "separation_requests_insert" ON public.separation_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
    )
  );

CREATE POLICY "separation_requests_update" ON public.separation_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = separation_requests.request_id
      AND EXISTS (
        SELECT 1 FROM public.request_approvals ra
        WHERE ra.request_id = r.id
        AND ra.approver_employee_id IN (SELECT employee_id FROM app_users WHERE id = auth.uid())
      )
    )
  );
```

> **Not:** `request_id` sütununda `UNIQUE` constraint var. Bu sayede Supabase/PostgREST join sorgularında dizi yerine tek obje döner.

---

## 5. Implementasyon Planı

### Faz 1: Veritabanı ✅
- [x] `workflow_definitions` kaydı ekle
- [x] `workflow_steps` kayıtları ekle (9 adım)
- [x] `workflow_initiators` kaydı ekle (İK)
- [x] `separation_requests` tablosu oluştur
- [x] RLS politikaları ekle

### Faz 2: Backend ✅
- [x] `lib/workflow/types.ts` - `SeparationRequest` interface ekle
- [x] `lib/workflow/types.ts` - `CreateSeparationInput` interface ekle
- [x] `app/api/separation/route.ts` - POST ve GET endpoint'leri
- [x] `app/api/my-requests/route.ts` - `separation_requests` select'e ekle
- [x] `app/api/approvals/route.ts` - `separation_requests` select'e ekle
- [x] `app/api/approvals/[id]/route.ts` - `separation_fields` güncelleme desteği

### Faz 3: Frontend ✅
- [x] `lib/approvals/constants.ts` - `separationSectionConfig` + `SEPARATION_SECTION_KEYS` ekle
- [x] `lib/approvals/types.ts` - `PendingApproval`'a `separation_request` field ekle
- [x] `lib/approvals/use-approvals.ts` - `separationChecklist` state, derived values, handleDecision ve useEffect
- [x] `components/approvals/approval-actions.tsx` - Section 2-8 checklist UI ekle
- [x] `components/approvals/separation-request-details.tsx` - Section 1 + Mali Tablo + önceki section'lar (read-only)
- [x] `components/approvals/approval-detail-sheet.tsx` - Separation props + SeparationRequestDetails render
- [x] `app/approvals/page.tsx` - Hook'tan separation değerleri alınıp sheet'e ilet
- [x] `components/nav-workflow.tsx` - Sidebar menüye ekle
- [x] `app/separation/new/page.tsx` - Yeni talep formu (Section 1 + Mali Tablo)

### Faz 4: PDF ✅
- [x] `lib/pdf/separation-pdf-template.tsx` - Portrait A4 PDF şablonu (kırmızı #CC0000 renk şeması)
  - Header: Logo + "İŞTEN ÇIKIŞ TAKİP FORMU" başlığı
  - Section 1 Temel Bilgiler tablosu
  - Mali Tablo (Yıllık İzin / Kıdem / İhbar)
  - Checklist tablosu: 24 madde — Sütunlar: No | İş | Durum | İmza | Açıklama
  - Onay footer: 3 sütun (Zimmet Tutanağı | Form İçeriği Kontrolü | Onay GM/CEO)
- [x] `lib/pdf/generate-request-pdf.ts` - `separation_request:separation_requests(*)` select'e eklendi, `SeparationPDFTemplate` if-else zincirine eklendi

---

## 6. API Endpoint'leri

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/separation` | Kullanıcının işten çıkış takip taleplerini listele |
| POST | `/api/separation` | Yeni işten çıkış takip talebi oluştur |

### POST Request Body

```typescript
interface CreateSeparationInput {
  employee_name: string;
  employee_title: string;
  department: string;
  location: string;
  job_description: string;
  reporting_manager: string;
  separation_date: string;      // "YYYY-MM-DD" formatında
  separation_reason: string;
  employment_period: string;
  annual_leave_days: number;
  annual_leave_amount: number;
  severance_days: number;
  severance_amount: number;
  notice_weeks: number;
  notice_amount: number;
}
```

### Onay Sırasında Section Güncelleme (PATCH /api/approvals/[id])

```typescript
{
  decision: "APPROVED",
  separation_fields: {
    section_key: "section_2",
    items: {
      email_closure: { status: "DONE", notes: "Kapatıldı" },
      it_access_revocation: { status: "DONE", notes: "Tüm erişimler iptal edildi" }
    }
  }
}
```

---

## 7. Frontend Davranışı

### Süreç Akışı

1. **İK** formu açar → Section 1 (Temel Bilgiler + Mali Tablo) doldurur → İmzalar → Gönderir
2. **Genel Müdür/CEO** → Section 2 (Bilgi İşlem) checklist'ini doldurur → İmzalar
3. **İK** → Section 3 (İK İşlemleri) checklist'ini doldurur → İmzalar
4. **Hukuk Müşaviri** → Section 4 (Hukuki İşlemler) checklist'ini doldurur → İmzalar
5. **Muhasebe Şefi** → Section 5 (Muhasebe İşlemleri) checklist'ini doldurur → İmzalar
6. **İdari İşler Uzmanı** → Section 6 (IT / İdari) checklist'ini doldurur → İmzalar
7. **İK Uzmanı** → Section 7 (Belge Tarama) checklist'ini doldurur → İmzalar
8. **Asistan** → Section 8 (Takvim) checklist'ini doldurur → İmzalar
9. **Genel Müdür/CEO** → Son onay → İmzalar

### Onay Sayfası Davranışı

- **FILL_AND_SIGN** adımlarında: Onaycıya kendi section'ının checklist maddeleri gösterilir
- Section 1'deki mali tablo diğer onaycılara read-only olarak gösterilir
- Her madde için: Durum seçimi (Yapıldı / Yapılmadı / Uygulanmaz) + Açıklama alanı
- Daha önce doldurulmuş section'lar read-only olarak badge'lerle gösterilir
- Tüm maddeler doldurulmadan onay verilemez

---

## 8. PDF Şablonu

### Özellikler
- **Boyut:** Portrait A4
- **Renk Şeması:** Kırmızı (#CC0000) — onboarding (yeşil) ile ayırt etmek için
- **Dosya:** `lib/pdf/separation-pdf-template.tsx`

### Yapı
1. **Header:** Logo + "İŞTEN ÇIKIŞ TAKİP FORMU" başlığı
2. **Temel Bilgiler:** 2 sütunlu bilgi tablosu (Section 1 verileri)
3. **Mali Tablo:** Yıllık İzin / Kıdem / İhbar satırları (Gün/Hafta + TL)
4. **Checklist Tablosu:** 24 madde düz tablo — Sütunlar: No | İş | DURUM | İMZA | AÇIKLAMA
5. **Onay Footer:** 3 sütun — ZİMMET TUTANAĞI (boş) | FORM İÇERİĞİ KONTROLÜ | ONAY (GM/CEO)

### İmza Mapping (PDF)

```
section_1, section_3 → Requester (İK)
section_2            → Genel Müdür/CEO
section_4            → Hukuk Müşaviri
section_5            → Muhasebe Şefi
section_6            → İdari İşler Uzmanı
section_7            → İK Uzmanı
section_8            → Asistan
```

---

## 9. Dosya Yapısı

```
rt-enerji-frontend/
├── app/
│   ├── api/
│   │   └── separation/
│   │       └── route.ts                  # GET + POST endpoint
│   └── separation/
│       └── new/
│           └── page.tsx                  # Yeni talep formu (Section 1 + Mali Tablo)
├── lib/
│   ├── pdf/
│   │   ├── generate-request-pdf.ts       # PDF generation (separation desteği eklenecek)
│   │   └── separation-pdf-template.tsx   # PDF şablonu
│   └── workflow/
│       └── types.ts                      # SeparationRequest, CreateSeparationInput
└── docs/
    └── workflows/
        └── separation.md                 # Bu doküman
```

---

## 10. Notlar

- **Kısıtlı Başlatma:** Bu süreç sadece İK pozisyonundaki kişiler tarafından başlatılabilir. `is_restricted: true` ve `workflow_initiators` tablosu kullanılır.
- **Mali Tablo:** Section 1'e ek olarak mali tablo da İK tarafından doldurulur. Form'da ayrı bir bölüm olarak gösterilir; onay sayfasında diğer onaycılara read-only gösterilir.
- **Requester Tekrarı:** Adım 1 ve Adım 3'te aynı kişi (İK/Requester) form doldurur. Bu, `approver_type: 'REQUESTER'` ile sağlanır.
- **UNIQUE Constraint:** `separation_requests.request_id` sütununda UNIQUE constraint olmalıdır. Aksi halde Supabase join sorgularında dizi döner ve frontend'de veri gösterilmez.
- **PDF Renk Farkı:** Onboarding PDF'i yeşil renk şemasını kullanırken, separation PDF'i kırmızı (#CC0000) renk şeması kullanır. Bu, iki form türünü fiziksel olarak ayırt etmeyi kolaylaştırır.
