# İşe Giriş Takip Formu Süreci

> **Workflow Code:** `EMPLOYEE_ONBOARDING`  
> **Versiyon:** 1.0  
> **Tarih:** 2026-02-25

---

## 1. Genel Bakış

İşe giriş takip formu, yeni işe başlayan personelin tüm giriş süreçlerinin takip edilmesini sağlayan çok adımlı bir süreçtir. İK süreci başlatır, ardından farklı departmanlar kendi sorumluluk alanlarındaki checklist maddelerini doldurur ve son olarak Genel Müdür onaylar.

### Özellikler

| Özellik | Değer |
|---------|-------|
| Workflow Code | `EMPLOYEE_ONBOARDING` |
| is_restricted | `true` (sadece İK başlatabilir) |
| Toplam Adım | 7 |
| Form Dolduran Adımlar | 6 (Adım 1-6: FILL_AND_SIGN) |
| Son Onay | 1 (Adım 7: SIGN_ONLY) |
| Toplam Checklist Maddesi | 22 |

---

## 2. Onay Zinciri

| Adım | Onaycı | approver_type | action_type | form_section_key | Doldurduğu Bölüm |
|------|--------|---------------|-------------|------------------|-------------------|
| 1 | İnsan Kaynakları | `REQUESTER` | `FILL_AND_SIGN` | `section_1` | Temel Bilgiler |
| 2 | Genel Müdür/CEO | `STATIC_POSITION` | `FILL_AND_SIGN` | `section_2` | Mail İşlemleri |
| 3 | İnsan Kaynakları | `REQUESTER` | `FILL_AND_SIGN` | `section_3` | İK İşlemleri |
| 4 | Muhasebe Müdürü | `STATIC_POSITION` | `FILL_AND_SIGN` | `section_4` | Sözleşme İşlemleri |
| 5 | İdari İşler Müdürü | `STATIC_POSITION` | `FILL_AND_SIGN` | `section_5` | IT İşlemleri |
| 6 | Finans Uzmanı | `STATIC_POSITION` | `FILL_AND_SIGN` | `section_6` | Diğer |
| 7 | Genel Müdür/CEO | `STATIC_POSITION` | `SIGN_ONLY` | `null` | Son Onay |

---

## 3. Form Alanları

### 3.1 Section 1: Temel Bilgiler (İK tarafından doldurulur)

| Alan | DB Sütunu | Tip | Zorunlu | Açıklama |
|------|-----------|-----|---------|----------|
| İşe Başlayacak Kişi | `employee_name` | Text | ✅ | Ad Soyad |
| Unvanı | `employee_title` | Text | ✅ | Pozisyon unvanı |
| Departmanı | `department` | Text | ✅ | Departman adı |
| Lokasyonu | `location` | Text | ✅ | Çalışma lokasyonu |
| İş Tanımı / Kapsamı / Kodu | `job_description` | Text | ✅ | İş tanımı detayı |
| Bağlı Olduğu Yönetici | `reporting_manager` | Text | ✅ | Yönetici adı |
| İşe Giriş Tarihi | `start_date` | Date | ✅ | Başlangıç tarihi |
| Zaman Aralığı | `employment_period` | Text | ✅ | Örn: "1 yıl", "Belirsiz süreli" |

### 3.2 Section 2: Mail İşlemleri (Genel Müdür/CEO)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 5 | Mail Adresinin Açılması | `mail_setup_status` | `mail_setup_notes` |
| 6 | Ekleneceği Mail/Sharepoint/Bulut Grupları | `mail_groups_status` | `mail_groups_notes` |

### 3.3 Section 3: İK İşlemleri (İnsan Kaynakları)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 2 | İşten Çıkış Sebebi Kontrolü | `exit_reason_check_status` | `exit_reason_check_notes` |
| 3 | CV'de Yazan Şirketlerin SGK Hizmet Dökümü İle Kontrolü | `sgk_verification_status` | `sgk_verification_notes` |
| 4 | PDKS Kayıtları / Kart Tanımı | `pdks_card_status` | `pdks_card_notes` |
| 11 | Kırtasiye Taleplerinin Yapılması | `stationery_request_status` | `stationery_request_notes` |
| 12 | Masa / Dolap Tanımı | `desk_cabinet_status` | `desk_cabinet_notes` |
| 13 | Sabit Telefon Temini ve Tanımı | `phone_setup_status` | `phone_setup_notes` |
| 14 | İşe Alım Duyurusu | `hiring_announcement_status` | `hiring_announcement_notes` |
| 15 | Adres Bilgileri ve Mobil Numarası Temini | `contact_info_status` | `contact_info_notes` |
| 16 | Organizasyon Şemasına Eklenmesi ve Yayımı | `org_chart_status` | `org_chart_notes` |
| 17 | Yönergelerin Basılı ve Elektronik Olarak Teslimi | `guidelines_delivery_status` | `guidelines_delivery_notes` |
| 18 | SGK, İşkur ve Emniyet Bildirimlerinin Yapılması | `sgk_iskur_notification_status` | `sgk_iskur_notification_notes` |
| 19 | İş Kazası Talimatı ve İş Sağlığı Güvenliği Talimatının İmzalatılması | `safety_instructions_status` | `safety_instructions_notes` |
| 21 | İşe Giriş İşlemleri ve Sicil Numarasının Yapılması | `entry_registration_status` | `entry_registration_notes` |
| 22 | İşe Giriş Evraklarının Bulut'a Yüklenmesi (İK/Belgeler) | `documents_upload_status` | `documents_upload_notes` |

### 3.4 Section 4: Sözleşme İşlemleri (Muhasebe Müdürü)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 9 | İş Sözleşmesi, ekleri ve zimmet tutanağın imzalatılması | `contract_signature_status` | `contract_signature_notes` |
| 10 | Yönergelerin Basılı ve Elektronik Olarak Teslimi | `s4_guidelines_delivery_status` | `s4_guidelines_delivery_notes` |

### 3.5 Section 5: IT İşlemleri (İdari İşler Müdürü)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 7 | Bilgisayar Temini | `computer_setup_status` | `computer_setup_notes` |
| 8 | QNAP Kaydı, O365 Arşiv ve IP Telefon Kaydı | `qnap_o365_ip_status` | `qnap_o365_ip_notes` |

### 3.6 Section 6: Diğer (Finans Uzmanı)

| No | Madde | Status Key | Notes Key |
|----|-------|------------|-----------|
| 1 | Sigara Kullanımı | `smoking_info_status` | `smoking_info_notes` |
| 20 | 2/6/12. Aylarda Değerlendirme Form Tarihlerinin Takvime Kaydedilmesi | `evaluation_calendar_status` | `evaluation_calendar_notes` |

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
VALUES ('EMPLOYEE_ONBOARDING', 'İşe Giriş Takip Formu', 'Yeni personel işe giriş takip süreci', true, true);
```

### 4.2 Workflow Steps

```sql
DO $$
DECLARE
  v_workflow_id UUID;
  v_gm_position_id UUID;
  v_muhasebe_position_id UUID;
  v_idari_position_id UUID;
  v_finans_position_id UUID;
BEGIN
  SELECT id INTO v_workflow_id FROM workflow_definitions WHERE code = 'EMPLOYEE_ONBOARDING';
  SELECT id INTO v_gm_position_id FROM positions WHERE title = 'Genel Müdür/CEO';
  SELECT id INTO v_muhasebe_position_id FROM positions WHERE title = 'Muhasebe Müdürü';
  SELECT id INTO v_idari_position_id FROM positions WHERE title = 'İdari İşler Müdürü';
  SELECT id INTO v_finans_position_id FROM positions WHERE title = 'Finans Uzmanı';

  -- Adım 1: İnsan Kaynakları (Requester)
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 1, 'İnsan Kaynakları', 'REQUESTER', NULL, true, 'FILL_AND_SIGN', 'section_1');

  -- Adım 2: Genel Müdür/CEO (Mail İşlemleri)
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 2, 'Adım 2', 'STATIC_POSITION', v_gm_position_id, true, 'FILL_AND_SIGN', 'section_2');

  -- Adım 3: İnsan Kaynakları (İK İşlemleri)
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 3, 'İnsan Kaynakları', 'REQUESTER', NULL, true, 'FILL_AND_SIGN', 'section_3');

  -- Adım 4: Muhasebe Müdürü (Sözleşme İşlemleri)
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 4, 'Adım 4', 'STATIC_POSITION', v_muhasebe_position_id, true, 'FILL_AND_SIGN', 'section_4');

  -- Adım 5: İdari İşler Müdürü (IT İşlemleri)
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 5, 'Adım 5', 'STATIC_POSITION', v_idari_position_id, true, 'FILL_AND_SIGN', 'section_5');

  -- Adım 6: Finans Uzmanı (Diğer)
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 6, 'Adım 6', 'STATIC_POSITION', v_finans_position_id, true, 'FILL_AND_SIGN', 'section_6');

  -- Adım 7: Genel Müdür/CEO (Son Onay)
  INSERT INTO workflow_steps (workflow_definition_id, step_order, name, approver_type, static_position_id, is_required, action_type, form_section_key)
  VALUES (v_workflow_id, 7, 'Adım 7', 'STATIC_POSITION', v_gm_position_id, true, 'SIGN_ONLY', NULL);
END $$;
```

### 4.3 Workflow Initiators (Kısıtlı Başlatma)

```sql
DO $$
DECLARE
  v_workflow_id UUID;
  v_hr_position_id UUID;
BEGIN
  SELECT id INTO v_workflow_id FROM workflow_definitions WHERE code = 'EMPLOYEE_ONBOARDING';
  SELECT id INTO v_hr_position_id FROM positions WHERE code = 'HR_MANAGER';

  INSERT INTO workflow_initiators (workflow_definition_id, position_id)
  VALUES (v_workflow_id, v_hr_position_id);
END $$;
```

### 4.4 Ana Tablo: onboarding_requests

```sql
CREATE TABLE public.onboarding_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL UNIQUE REFERENCES public.requests(id) ON DELETE CASCADE,

  -- Section 1: Temel Bilgiler
  employee_name TEXT,
  employee_title TEXT,
  department TEXT,
  location TEXT,
  job_description TEXT,
  reporting_manager TEXT,
  start_date DATE,
  employment_period TEXT,

  -- Section 2: Mail İşlemleri
  mail_setup_status TEXT DEFAULT 'NOT_DONE',
  mail_setup_notes TEXT,
  mail_groups_status TEXT DEFAULT 'NOT_DONE',
  mail_groups_notes TEXT,

  -- Section 3: İK İşlemleri
  exit_reason_check_status TEXT DEFAULT 'NOT_DONE',
  exit_reason_check_notes TEXT,
  sgk_verification_status TEXT DEFAULT 'NOT_DONE',
  sgk_verification_notes TEXT,
  pdks_card_status TEXT DEFAULT 'NOT_DONE',
  pdks_card_notes TEXT,
  guidelines_delivery_status TEXT DEFAULT 'NOT_DONE',
  guidelines_delivery_notes TEXT,
  stationery_request_status TEXT DEFAULT 'NOT_DONE',
  stationery_request_notes TEXT,
  desk_cabinet_status TEXT DEFAULT 'NOT_DONE',
  desk_cabinet_notes TEXT,
  phone_setup_status TEXT DEFAULT 'NOT_DONE',
  phone_setup_notes TEXT,
  hiring_announcement_status TEXT DEFAULT 'NOT_DONE',
  hiring_announcement_notes TEXT,
  contact_info_status TEXT DEFAULT 'NOT_DONE',
  contact_info_notes TEXT,
  org_chart_status TEXT DEFAULT 'NOT_DONE',
  org_chart_notes TEXT,
  sgk_iskur_notification_status TEXT DEFAULT 'NOT_DONE',
  sgk_iskur_notification_notes TEXT,
  safety_instructions_status TEXT DEFAULT 'NOT_DONE',
  safety_instructions_notes TEXT,
  entry_registration_status TEXT DEFAULT 'NOT_DONE',
  entry_registration_notes TEXT,
  documents_upload_status TEXT DEFAULT 'NOT_DONE',
  documents_upload_notes TEXT,

  -- Section 4: Sözleşme İşlemleri
  contract_signature_status TEXT DEFAULT 'NOT_DONE',
  contract_signature_notes TEXT,
  s4_guidelines_delivery_status TEXT DEFAULT 'NOT_DONE',
  s4_guidelines_delivery_notes TEXT,

  -- Section 5: IT İşlemleri
  computer_setup_status TEXT DEFAULT 'NOT_DONE',
  computer_setup_notes TEXT,
  qnap_o365_ip_status TEXT DEFAULT 'NOT_DONE',
  qnap_o365_ip_notes TEXT,

  -- Section 6: Diğer
  smoking_info_status TEXT DEFAULT 'NOT_DONE',
  smoking_info_notes TEXT,
  evaluation_calendar_status TEXT DEFAULT 'NOT_DONE',
  evaluation_calendar_notes TEXT,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index
CREATE INDEX idx_onboarding_requests_request_id ON public.onboarding_requests(request_id);
```

### 4.5 RLS Politikaları

```sql
ALTER TABLE public.onboarding_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "onboarding_requests_select" ON public.onboarding_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = onboarding_requests.request_id
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

CREATE POLICY "onboarding_requests_insert" ON public.onboarding_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
    )
  );

CREATE POLICY "onboarding_requests_update" ON public.onboarding_requests
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = onboarding_requests.request_id
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
- [x] `workflow_steps` kayıtları ekle (7 adım)
- [x] `workflow_initiators` kaydı ekle (İK)
- [x] `onboarding_requests` tablosu oluştur
- [x] RLS politikaları ekle
- [x] `request_id` UNIQUE constraint ekle

### Faz 2: Backend ✅
- [x] `lib/workflow/types.ts` - `ChecklistStatus` type ekle
- [x] `lib/workflow/types.ts` - `OnboardingRequest` interface ekle
- [x] `lib/workflow/types.ts` - `CreateOnboardingInput` interface ekle
- [x] `app/api/onboarding/route.ts` - POST ve GET endpoint'leri
- [x] `app/api/my-requests/route.ts` - `onboarding_requests` select'e ekle
- [x] `app/api/approvals/route.ts` - `onboarding_requests` select'e ekle
- [x] `app/api/approvals/[id]/route.ts` - `onboarding_fields` güncelleme desteği

### Faz 3: Frontend ✅
- [x] `app/onboarding/new/page.tsx` - Yeni talep formu (Section 1)
- [x] `components/nav-workflow.tsx` - Sidebar menüye ekle
- [x] `app/approvals/page.tsx` - Section 2-6 checklist form + önceki section'ları göster
- [x] `app/my-requests/page.tsx` - Onboarding detaylarını göster

### Faz 4: PDF ✅
- [x] `lib/pdf/onboarding-pdf-template.tsx` - Portrait A4 PDF şablonu
- [x] `lib/pdf/generate-request-pdf.ts` - Onboarding template entegrasyonu

---

## 6. API Endpoint'leri

| Method | Path | Açıklama |
|--------|------|----------|
| GET | `/api/onboarding` | Kullanıcının işe giriş takip taleplerini listele |
| POST | `/api/onboarding` | Yeni işe giriş takip talebi oluştur |

### POST Request Body

```typescript
interface CreateOnboardingInput {
  employee_name: string;
  employee_title: string;
  department: string;
  location: string;
  job_description: string;
  reporting_manager: string;
  start_date: string;       // "YYYY-MM-DD" formatında
  employment_period: string;
}
```

### Onay Sırasında Section Güncelleme (PATCH /api/approvals/[id])

```typescript
// Request body'ye eklenen alan:
{
  decision: "APPROVED",
  onboarding_fields: {
    section_key: "section_2",  // Hangi section güncelleniyor
    items: {
      mail_setup: { status: "DONE", notes: "furkan@rtenerji.com" },
      mail_groups: { status: "DONE", notes: "eklendi" }
    }
  }
}
```

---

## 7. Frontend Davranışı

### Süreç Akışı

1. **İK** formu açar → Section 1 (Temel Bilgiler) doldurur → İmzalar → Gönderir
2. **Genel Müdür/CEO** → Section 2 (Mail İşlemleri) checklist'ini doldurur → İmzalar
3. **İK** → Section 3 (İK İşlemleri) checklist'ini doldurur → İmzalar
4. **Muhasebe Müdürü** → Section 4 (Sözleşme İşlemleri) checklist'ini doldurur → İmzalar
5. **İdari İşler Müdürü** → Section 5 (IT İşlemleri) checklist'ini doldurur → İmzalar
6. **Finans Uzmanı** → Section 6 (Diğer) checklist'ini doldurur → İmzalar
7. **Genel Müdür/CEO** → Son onay → İmzalar

### Onay Sayfası Davranışı

- **FILL_AND_SIGN** adımlarında: Onaycıya kendi section'ının checklist maddeleri gösterilir
- Her madde için: Durum seçimi (Yapıldı / Yapılmadı / Uygulanmaz) + Açıklama alanı
- Daha önce doldurulmuş section'lar read-only olarak badge'lerle gösterilir
- Tüm maddeler doldurulmadan onay verilemez

### Section Tespiti

```typescript
// Approval'ın workflow_step.form_section_key değerine göre
// hangi section'ın doldurulacağı tespit edilir
const onboardingSectionKey = approval.workflow_step.form_section_key; // "section_2", "section_3", vb.
const sectionConfig = onboardingSectionConfig[onboardingSectionKey];
```

---

## 8. PDF Şablonu

### Özellikler
- **Boyut:** Portrait A4
- **Renk Şeması:** Yeşil (#008000)
- **Dosya:** `lib/pdf/onboarding-pdf-template.tsx`

### Yapı
1. **Header:** Logo + "İŞE GİRİŞ TAKİP FORMU" başlığı
2. **Temel Bilgiler:** 2 sütunlu bilgi tablosu (Section 1 verileri)
3. **Checklist Tablosu:** 22 madde tek düz tablo (section başlıkları yok)
   - Sütunlar: No | İş | DURUM | İMZA | AÇIKLAMA
   - İMZA sütunu: Her maddenin ait olduğu section'ı dolduran kişinin imzası
4. **Onay Footer:** 3 sütun
   - EK: ZİMMET TUTANAĞI (boş)
   - FORM İÇERİĞİ KONTROLÜ (sondan bir önceki onaycının imzası)
   - ONAY (son onaycının imzası)

### İmza Mapping (PDF)

Her checklist maddesi bir `sectionKey`'e sahiptir. Bu key üzerinden o section'ı dolduran kişinin `employee_id`'si bulunur ve imzası render edilir:

```
section_1, section_3 → Requester (İK)
section_2 → Genel Müdür/CEO
section_4 → Muhasebe Müdürü
section_5 → İdari İşler Müdürü
section_6 → Finans Uzmanı
```

---

## 9. Dosya Yapısı

```
rt-enerji-frontend/
├── app/
│   ├── api/
│   │   └── onboarding/
│   │       └── route.ts              # GET + POST endpoint
│   └── onboarding/
│       └── new/
│           └── page.tsx              # Yeni talep formu (Section 1)
├── lib/
│   ├── pdf/
│   │   ├── generate-request-pdf.ts   # PDF generation (onboarding desteği eklendi)
│   │   └── onboarding-pdf-template.tsx  # PDF şablonu
│   └── workflow/
│       └── types.ts                  # ChecklistStatus, OnboardingRequest, CreateOnboardingInput
└── docs/
    └── workflows/
        └── onboarding.md             # Bu doküman
```

---

## 10. Notlar

- **Kısıtlı Başlatma:** Bu süreç sadece İK pozisyonundaki kişiler tarafından başlatılabilir. `is_restricted: true` ve `workflow_initiators` tablosu kullanılır.
- **Çok Adımlı Form Doldurma:** Diğer workflow'lardan farklı olarak, bu süreçte birden fazla adımda form doldurulur (FILL_AND_SIGN). Her adım kendi section'ını günceller.
- **UNIQUE Constraint:** `onboarding_requests.request_id` sütununda UNIQUE constraint olmalıdır. Aksi halde Supabase join sorgularında dizi döner ve frontend'de veri gösterilmez.
- **Requester Tekrarı:** Adım 1 ve Adım 3'te aynı kişi (İK/Requester) form doldurur. Bu, `approver_type: 'REQUESTER'` ile sağlanır.
- **İşten Çıkış Takip Formu:** Bu sürecin tersi olan işten çıkış takip formu benzer yapıda implement edilebilir. Aynı çok adımlı checklist pattern'i kullanılabilir.

