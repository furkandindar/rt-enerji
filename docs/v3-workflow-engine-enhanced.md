# RT Enerji Workflow Engine V3 - Gelişmiş Süreç Yönetimi

Bu doküman, V2 workflow engine üzerine yapılacak geliştirmeleri tanımlar. V2'de sadece "onay zinciri" vardı, V3'te **"katkı zinciri"** ekleniyor.

---

## 1. Problem Tanımı

### V2'deki Durum
- Requester formu doldurur
- Diğer adımlar sadece imzalar (APPROVED/REJECTED)
- Örnek: Yıllık izin talebi ✅

### V3'te Yeni İhtiyaç
- Farklı adımlarda farklı kişiler form doldurabilmeli
- Her kişi kendi bölümünü doldurup imzalamalı
- Örnek: İşe alım süreci, satın alma talebi

```
İŞE ALIM SÜRECİ:
┌─────────────────────────────────────────────────────────────┐
│ Adım 1: İK Uzmanı                                           │
│   → Pozisyon adı, departman, başlangıç tarihi DOLDURUR      │
│   → İmzalar 🖊️                                              │
├─────────────────────────────────────────────────────────────┤
│ Adım 2: Departman Müdürü                                    │
│   → Teknik gereksinimler, mülakat notları EKLER             │
│   → İmzalar 🖊️                                              │
├─────────────────────────────────────────────────────────────┤
│ Adım 3: Finans                                              │
│   → Maaş aralığı, bütçe kodu DOLDURUR                       │
│   → İmzalar 🖊️                                              │
├─────────────────────────────────────────────────────────────┤
│ Adım 4: Genel Müdür                                         │
│   → Sadece İMZALAR 🖊️                                       │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. Alınan Kararlar

| Konu | Karar | Açıklama |
|------|-------|----------|
| Form Tasarımı | **Hibrit** | Ortak bileşenler + süreç bazlı formlar |
| Audit Trail | **Gerek yok** | İmza yeterli, ayrı log tutulmayacak |
| Mimari | **Tutarlı Model** | Tüm süreçler aynı yapıda (V2 refactor) |
| Form Verileri | **Süreç-spesifik tablolar** | `leave_requests`, `hiring_requests` vb. |
| Başlatma Yetkisi | **Pozisyon bazlı** | Bazı formları sadece belirli pozisyonlar başlatabilir |

---

## 3. Yeni Kavramlar

### 3.1 Action Types

Her workflow adımının bir `action_type`'ı var:

| Tip | Açıklama | Örnek |
|-----|----------|-------|
| `FILL_AND_SIGN` | Form bölümü doldur + imzala | İK pozisyon bilgisi girer |
| `SIGN_ONLY` | Sadece imzala | GM final onay verir |

### 3.2 Form Sections

Her `FILL_AND_SIGN` adımının bir `form_section_key`'i var:

```typescript
// Örnek: İşe Alım Formu Bölümleri
const HIRING_FORM_SECTIONS = {
  'position_info': {
    title: 'Pozisyon Bilgileri',
    fields: ['position_title', 'department_id', 'start_date'],
    step: 1
  },
  'technical_requirements': {
    title: 'Teknik Gereksinimler',
    fields: ['requirements', 'interview_notes'],
    step: 2
  },
  'budget_info': {
    title: 'Bütçe Bilgileri',
    fields: ['salary_range', 'budget_code'],
    step: 3
  }
};
```

### 3.3 Workflow Initiators

Bazı workflow'ları sadece belirli pozisyonlar başlatabilir:

| Workflow | Kısıtlı mı? | Başlatabilenler |
|----------|-------------|-----------------|
| Yıllık İzin | ❌ Hayır | Herkes |
| İşe Alım | ✅ Evet | Asistan, İK Uzmanı |
| Bütçe Talebi | ✅ Evet | Departman Müdürleri |

---

## 4. Veritabanı Değişiklikleri

### 4.1 workflow_definitions (Güncelleme)

```sql
ALTER TABLE workflow_definitions 
  ADD COLUMN is_restricted BOOLEAN DEFAULT false;
```

### 4.2 workflow_steps (Güncelleme)

```sql
ALTER TABLE workflow_steps 
  ADD COLUMN action_type TEXT DEFAULT 'SIGN_ONLY'
    CHECK (action_type IN ('FILL_AND_SIGN', 'SIGN_ONLY')),
  ADD COLUMN form_section_key TEXT;
```

### 4.3 workflow_initiators (Yeni Tablo)

```sql
CREATE TABLE workflow_initiators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_definition_id UUID NOT NULL REFERENCES workflow_definitions(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),

  UNIQUE(workflow_definition_id, position_id)
);
```

> **Not:** `request_approvals` tablosuna `signature_data` eklemeye gerek yok.
> İmza bilgisi zaten `employees` tablosunda (`signature_text`, `signature_font`) saklanıyor.
> Onay verildiğinde `decided_at` timestamp kaydediliyor ve PDF oluşturulurken imza render ediliyor.

---

## 5. Mevcut Verilerin Migrasyonu

```sql
-- Yıllık izin workflow'larının ilk adımını güncelle
UPDATE workflow_steps 
SET action_type = 'FILL_AND_SIGN',
    form_section_key = 'leave_details'
WHERE step_order = 1 
  AND workflow_definition_id IN (
    SELECT id FROM workflow_definitions 
    WHERE code IN ('ANNUAL_LEAVE', 'SHORT_LEAVE')
  );

-- Diğer adımlar zaten SIGN_ONLY (default)
```

---

## 6. API Değişiklikleri

### 6.1 Kullanılabilir Workflow'ları Getir

```
GET /api/workflows/available

Response:
[
  { code: 'ANNUAL_LEAVE', name: 'Yıllık İzin', ... },
  { code: 'HIRING', name: 'İşe Alım', ... }  // Sadece yetkili pozisyonlara
]
```

### 6.2 Yetki Kontrolü

```typescript
async function canStartWorkflow(employeeId: string, workflowCode: string): Promise<boolean> {
  const workflow = await getWorkflowDefinition(workflowCode);
  
  if (!workflow.is_restricted) return true;
  
  const employeePositions = await getEmployeePositions(employeeId);
  const allowedPositions = await getWorkflowInitiators(workflow.id);
  
  return employeePositions.some(ep =>
    allowedPositions.some(ap => ap.position_id === ep.position_id)
  );
}
```

---

## 7. Frontend Değişiklikleri

### 7.1 Workflow Seçim Ekranı

```typescript
// Sadece kullanıcının başlatabileceği workflow'ları göster
const { data: availableWorkflows } = useQuery({
  queryKey: ['available-workflows'],
  queryFn: () => fetch('/api/workflows/available').then(r => r.json())
});

return (
  <div className="grid grid-cols-3 gap-4">
    {availableWorkflows.map(wf => (
      <WorkflowCard key={wf.code} workflow={wf} />
    ))}
  </div>
);
```

### 7.2 Adım Bazlı Form Render

```typescript
function StepContent({ step, formData, onUpdate }) {
  if (step.action_type === 'FILL_AND_SIGN') {
    return (
      <>
        <FormSection
          sectionKey={step.form_section_key}
          data={formData}
          onChange={onUpdate}
        />
        <SignaturePad onSign={handleSign} />
      </>
    );
  }

  // SIGN_ONLY
  return (
    <>
      <FormPreview data={formData} readonly />
      <SignaturePad onSign={handleSign} />
    </>
  );
}
```

---

## 8. Güncellenmiş Mimari Diyagramı

```
┌─────────────────────────────────────────────────────────────────┐
│                     WORKFLOW ENGINE V3                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  workflow_definitions          workflow_initiators ⭐ NEW        │
│  ┌──────────────────┐         ┌────────────────────────┐        │
│  │ id               │────────▶│ workflow_definition_id │        │
│  │ code             │         │ position_id ───────────┼──▶ positions
│  │ name             │         └────────────────────────┘        │
│  │ is_restricted ⭐ │                                            │
│  │ is_active        │         workflow_steps                    │
│  └────────┬─────────┘         ┌────────────────────────┐        │
│           │                   │ id                     │        │
│           └──────────────────▶│ workflow_definition_id │        │
│                               │ step_order             │        │
│                               │ name                   │        │
│                               │ approver_type          │        │
│                               │ action_type ⭐ NEW      │        │
│                               │ form_section_key ⭐ NEW │        │
│                               │ static_position_id     │        │
│                               └────────────────────────┘        │
│                                                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  requests                      request_approvals                 │
│  ┌──────────────────┐         ┌────────────────────────┐        │
│  │ id               │────────▶│ id                     │        │
│  │ workflow_def_id  │         │ request_id             │        │
│  │ requester_emp_id │         │ workflow_step_id       │        │
│  │ status           │         │ approver_employee_id   │        │
│  │ current_step     │         │ status                 │        │
│  │ submitted_at     │         │ comment                │        │
│  │ completed_at     │         │ decided_at             │        │
│  └────────┬─────────┘         └────────────────────────┘        │
│           │                                                      │
│           │ 1:1 (Süreç-spesifik tablolar)                       │
│           ▼                                                      │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────┐ │
│  │ leave_requests   │  │ hiring_requests  │  │ expense_req... │ │
│  │ (izin detayları) │  │ (işe alım det.)  │  │ (masraf det.)  │ │
│  └──────────────────┘  └──────────────────┘  └────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 9. Yıllık İzin - Tutarlı Modelde

Mevcut yıllık izin sistemi yeni modele uyarlanacak:

| Adım | action_type | form_section_key | Açıklama |
|------|-------------|------------------|----------|
| 1 - Talep Eden | `FILL_AND_SIGN` | `leave_details` | Formu doldurur + imzalar |
| 2 - Birim Müdürü | `SIGN_ONLY` | `null` | Sadece imzalar |
| 3 - Muhasebe | `SIGN_ONLY` | `null` | Sadece imzalar |
| 4 - İK | `SIGN_ONLY` | `null` | Sadece imzalar |
| 5 - Genel Koordinatör | `SIGN_ONLY` | `null` | Sadece imzalar |

---

## 10. İşe Alım - Yeni Model Örneği

| Adım | action_type | form_section_key | Açıklama |
|------|-------------|------------------|----------|
| 1 - İK Uzmanı | `FILL_AND_SIGN` | `position_info` | Pozisyon bilgileri |
| 2 - Dept. Müdürü | `FILL_AND_SIGN` | `technical_requirements` | Teknik gereksinimler |
| 3 - Finans | `FILL_AND_SIGN` | `budget_info` | Bütçe bilgileri |
| 4 - Genel Müdür | `SIGN_ONLY` | `null` | Final onay |

---

## 11. Implementasyon Planı

### Faz 1: Veritabanı (1-2 gün)
- [ ] `workflow_definitions` → `is_restricted` ekle
- [ ] `workflow_steps` → `action_type`, `form_section_key` ekle
- [ ] `workflow_initiators` tablosu oluştur
- [ ] Mevcut izin workflow'larını migrate et

### Faz 2: Backend (2-3 gün)
- [ ] `canStartWorkflow()` fonksiyonu
- [ ] `GET /api/workflows/available` endpoint
- [ ] Approval API'de `action_type` desteği
- [ ] İmza kaydetme desteği

### Faz 3: Frontend (3-4 gün)
- [ ] Workflow seçim ekranı (filtrelenmiş)
- [ ] `FormSection` bileşeni
- [ ] `SignaturePad` bileşeni
- [ ] Adım bazlı form render mantığı

### Faz 4: Test & Migration (1-2 gün)
- [ ] Mevcut izin sistemi test
- [ ] Yeni workflow ekleme testi
- [ ] Production migration

---

## 12. Gelecek Geliştirmeler (V4+)

- [ ] Config-driven form builder (admin panelden form tasarlama)
- [ ] Paralel onay adımları
- [x] Koşullu adımlar (if-else mantığı) → **V4'te implement edildi** → [v4-workflow-engine-conditional.md](./v4-workflow-engine-conditional.md)
- [x] Çok fazlı süreçler (APPROVAL + COMPLETION) → **V4'te implement edildi**
- [x] İlişkili talepler (parent-child) → **V4'te implement edildi**
- [ ] Timeout/Deadline mekanizması
- [ ] Email bildirimleri (Microsoft Graph API)

---

**Son Güncelleme:** 2026-01-25
**Durum:** Tasarım tamamlandı, implementasyona hazır
**Öncelik:** Faz 1 (Veritabanı) ile başla

