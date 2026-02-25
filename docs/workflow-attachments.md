# Workflow Attachment Sistemi

> **Versiyon:** 1.0
> **Tarih:** 2026-02-25
> **Durum:** Tasarım tamamlandı, implementasyona hazır

---

## 1. Problem Tanımı

Bazı workflow adımlarında onaycıdan ek dosya yüklenmesi gerekiyor. Örneğin:

- **İşe Giriş Takip Formu** → Adım 4 (Muhasebe Müdürü): Zimmet Tutanağı PDF'i
- İleride başka süreçlerde de benzer ihtiyaçlar olacak

Bu ihtiyaç süreç-spesifik değil, **workflow engine seviyesinde generic** bir çözüm gerektiriyor.

---

## 2. Alınan Kararlar

| Konu | Karar | Açıklama |
|------|-------|----------|
| Mimari | **Generic** | Tüm workflow'lar için ortak altyapı |
| Veri Modeli | **Config + Data** | Beklenti (config) ve yüklenen dosya (data) ayrı tablolarda |
| Storage | **Ayrı bucket** | `workflow-attachments` adında yeni bucket |
| Zorunluluk | **Konfigüre edilebilir** | Her attachment config'de `is_required` flag'i |
| Dosya Sayısı | **Konfigüre edilebilir** | `max_files` ile kontrol (varsayılan: 1) |
| PDF Birleştirme | **Evet** | Ek dosyalar süreç sonunda oluşan PDF'e eklenir |
| PDF Kütüphanesi | **pdf-lib** | Mevcut PDF'e ek dosya sayfalarını birleştirmek için |

---

## 3. Mimari

### Temel Kavramlar

```
workflow_step_attachments   →  "Bu adımda şu dosya bekleniyor" (KONFİGÜRASYON)
request_attachments         →  "Bu talep için şu dosya yüklendi" (VERİ)
```

### Akış

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. Onaycı, onay detayını açar                                    │
│    → API: workflow_step_attachments config'i çekilir             │
│    → API: Bu request+step için mevcut dosyalar çekilir          │
├─────────────────────────────────────────────────────────────────┤
│ 2. Onaycı dosya yükler                                           │
│    → Frontend: Dosya seçilir (drag & drop veya file picker)     │
│    → API: POST /api/attachments/upload (FormData)               │
│    → Storage: workflow-attachments/{request_id}/{uuid}.pdf      │
│    → DB: request_attachments kaydı oluşturulur                  │
├─────────────────────────────────────────────────────────────────┤
│ 3. Onaycı formu tamamlar ve onaylar                              │
│    → API: PATCH /api/approvals/[id]                             │
│    → Validasyon: Zorunlu attachment'lar yüklendi mi?            │
├─────────────────────────────────────────────────────────────────┤
│ 4. Sonraki adımlarda                                             │
│    → Yüklenen dosyalar read-only olarak gösterilir              │
│    → İndirme butonu ile erişilebilir                            │
├─────────────────────────────────────────────────────────────────┤
│ 5. Süreç tamamlandığında                                         │
│    → pdf-lib ile: Ana PDF + Ek dosya PDF'leri birleştirilir     │
│    → Tek bir PDF olarak Storage'a yüklenir                      │
└─────────────────────────────────────────────────────────────────┘
```

---

## 4. Veritabanı

### 4.1 Tablo: `workflow_step_attachments` (Konfig)

```sql
CREATE TABLE public.workflow_step_attachments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_step_id    UUID NOT NULL REFERENCES public.workflow_steps(id) ON DELETE CASCADE,
  label               TEXT NOT NULL,                      -- "Zimmet Tutanağı"
  is_required         BOOLEAN NOT NULL DEFAULT false,     -- Zorunlu mu?
  allowed_mime_types  TEXT[] DEFAULT '{application/pdf}',  -- İzin verilen dosya tipleri
  max_file_size_bytes BIGINT DEFAULT 10485760,            -- 10MB
  max_files           INT DEFAULT 1,                      -- Kaç dosya yüklenebilir
  created_at          TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_wsa_workflow_step_id ON public.workflow_step_attachments(workflow_step_id);
```

### 4.2 Tablo: `request_attachments` (Veri)

```sql
CREATE TABLE public.request_attachments (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id                UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,
  step_attachment_config_id UUID NOT NULL REFERENCES public.workflow_step_attachments(id),
  file_name                 TEXT NOT NULL,                 -- Orijinal dosya adı: "sozlesme.pdf"
  file_path                 TEXT NOT NULL,                 -- Storage path
  file_size                 BIGINT NOT NULL,               -- Dosya boyutu (bytes)
  mime_type                 TEXT NOT NULL,                 -- "application/pdf"
  uploaded_by               UUID NOT NULL REFERENCES public.employees(id),
  uploaded_at               TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_ra_request_id ON public.request_attachments(request_id);
CREATE INDEX idx_ra_config_id ON public.request_attachments(step_attachment_config_id);
```

### 4.3 RLS Politikaları

```sql
-- workflow_step_attachments: Herkes okuyabilir (config tablosu)
ALTER TABLE public.workflow_step_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wsa_select" ON public.workflow_step_attachments
  FOR SELECT USING (true);

-- request_attachments: Talep sahibi veya onaycılar görebilir
ALTER TABLE public.request_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ra_select" ON public.request_attachments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_attachments.request_id
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

-- Insert: Sadece ilgili adımın onaycısı yükleyebilir
CREATE POLICY "ra_insert" ON public.request_attachments
  FOR INSERT WITH CHECK (
    uploaded_by IN (SELECT employee_id FROM app_users WHERE id = auth.uid())
  );

-- Delete: Sadece yükleyen kişi silebilir (adım henüz PENDING iken)
CREATE POLICY "ra_delete" ON public.request_attachments
  FOR DELETE USING (
    uploaded_by IN (SELECT employee_id FROM app_users WHERE id = auth.uid())
  );
```

### 4.4 Seed Data: İşe Giriş Adım 4

```sql
-- Onboarding Adım 4 (Muhasebe Müdürü) için "Zimmet Tutanağı" attachment config'i
INSERT INTO public.workflow_step_attachments (workflow_step_id, label, is_required, allowed_mime_types, max_file_size_bytes, max_files)
SELECT ws.id, 'Zimmet Tutanağı', true, '{application/pdf}', 10485760, 1
FROM public.workflow_steps ws
JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
WHERE wd.code = 'EMPLOYEE_ONBOARDING' AND ws.step_order = 4;
```

---

## 5. Supabase Storage

### Bucket: `workflow-attachments`

| Ayar | Değer |
|------|-------|
| Name | `workflow-attachments` |
| Public | `false` |
| File size limit | 10485760 (10MB) |
| Allowed MIME types | `application/pdf` (başlangıç için) |

### Storage RLS Politikaları

```sql
-- SELECT: Talep sahibi veya onaycılar indirebilir
CREATE POLICY "Authenticated users can read workflow attachments"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'workflow-attachments'
  AND auth.role() = 'authenticated'
);

-- INSERT: Authenticated kullanıcılar yükleyebilir (API seviyesinde yetki kontrolü yapılır)
CREATE POLICY "Authenticated users can upload workflow attachments"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'workflow-attachments'
  AND auth.role() = 'authenticated'
);

-- DELETE: Authenticated kullanıcılar silebilir (API seviyesinde yetki kontrolü yapılır)
CREATE POLICY "Authenticated users can delete workflow attachments"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'workflow-attachments'
  AND auth.role() = 'authenticated'
);
```

### Dosya Yolu Yapısı

```
workflow-attachments/
└── {request_id}/
    └── {uuid}_{original_filename}.pdf
```

Örnek: `workflow-attachments/abc123/f47ac10b_zimmet-tutanagi.pdf`

---

## 6. API Endpoint'leri

### 6.1 POST `/api/attachments/upload`

Dosya yükleme endpoint'i. FormData kabul eder.

**Request:**
```
Content-Type: multipart/form-data

Fields:
  - file: PDF dosyası
  - request_id: UUID
  - step_attachment_config_id: UUID
```

**Validasyonlar:**
1. Kullanıcı authenticated mi?
2. Bu request'in ilgili adımının onaycısı mı?
3. Dosya tipi `allowed_mime_types` içinde mi?
4. Dosya boyutu `max_file_size_bytes` altında mı?
5. Yüklenen dosya sayısı `max_files` altında mı?

**Response:**
```json
{
  "id": "uuid",
  "file_name": "zimmet-tutanagi.pdf",
  "file_path": "abc123/f47ac10b_zimmet-tutanagi.pdf",
  "file_size": 245760,
  "mime_type": "application/pdf"
}
```

### 6.2 DELETE `/api/attachments/[id]`

Yüklenen dosyayı siler.

**Validasyonlar:**
1. Kullanıcı dosyayı yükleyen kişi mi?
2. İlgili adım henüz PENDING durumunda mı?

### 6.3 GET `/api/attachments/[id]/download`

Dosyayı indirir. Signed URL ile yönlendirir.

### 6.4 PATCH `/api/approvals/[id]` (Mevcut - Güncelleme)

Onay verilirken zorunlu attachment kontrolü eklenir:

```typescript
// Onay öncesi kontrol
if (decision === 'APPROVED') {
  const { data: requiredConfigs } = await supabase
    .from('workflow_step_attachments')
    .select('id')
    .eq('workflow_step_id', stepData.workflow_step_id)
    .eq('is_required', true);

  if (requiredConfigs && requiredConfigs.length > 0) {
    const { data: uploadedFiles } = await supabase
      .from('request_attachments')
      .select('step_attachment_config_id')
      .eq('request_id', requestData.id)
      .in('step_attachment_config_id', requiredConfigs.map(c => c.id));

    const missingConfigs = requiredConfigs.filter(
      c => !uploadedFiles?.some(f => f.step_attachment_config_id === c.id)
    );

    if (missingConfigs.length > 0) {
      return NextResponse.json({ error: "Zorunlu ek dosyalar yüklenmemiş" }, { status: 400 });
    }
  }
}
```

---

## 7. PDF Birleştirme

Süreç tamamlandığında (son adım onaylandığında), ek dosyalar ana PDF'e eklenir.

### Kütüphane: `pdf-lib`

```bash
npm install pdf-lib
```

### Birleştirme Akışı

```typescript
import { PDFDocument } from 'pdf-lib';

async function mergeAttachments(workflowPdfBuffer: Buffer, requestId: string, supabase: SupabaseClient): Promise<Buffer> {
  // 1. Bu request'e ait tüm ek dosyaları getir
  const { data: attachments } = await supabase
    .from('request_attachments')
    .select('file_path, file_name')
    .eq('request_id', requestId)
    .order('uploaded_at', { ascending: true });

  // Ek dosya yoksa direkt ana PDF'i döndür
  if (!attachments || attachments.length === 0) {
    return workflowPdfBuffer;
  }

  // 2. Birleşik PDF oluştur
  const mergedPdf = await PDFDocument.create();

  // Ana PDF sayfalarını ekle
  const mainDoc = await PDFDocument.load(workflowPdfBuffer);
  const mainPages = await mergedPdf.copyPages(mainDoc, mainDoc.getPageIndices());
  mainPages.forEach(page => mergedPdf.addPage(page));

  // Ek dosya sayfalarını ekle
  for (const att of attachments) {
    const { data: blob } = await supabase.storage
      .from('workflow-attachments')
      .download(att.file_path);

    if (blob) {
      const attBuffer = await blob.arrayBuffer();
      const attDoc = await PDFDocument.load(attBuffer);
      const attPages = await mergedPdf.copyPages(attDoc, attDoc.getPageIndices());
      attPages.forEach(page => mergedPdf.addPage(page));
    }
  }

  // 3. Birleşik PDF'i döndür
  return Buffer.from(await mergedPdf.save());
}
```

### Entegrasyon Noktası

`app/api/approvals/[id]/route.ts` dosyasında, son adım onaylandığında:

```typescript
// Mevcut kod:
const pdfBuffer = await generateRequestPDF({ requestId: requestData.id, supabase });

// Yeni eklenen satır:
const finalPdfBuffer = await mergeAttachments(pdfBuffer, requestData.id, supabase);

// Birleşik PDF'i yükle:
const pdfPath = await uploadRequestPDF({ requestId: requestData.id, pdfBuffer: finalPdfBuffer });
```

### Sonuç PDF Yapısı

```
📄 Sayfa 1-2:  İşe Giriş Takip Formu (form + checklist + imzalar)
📄 Sayfa 3+:   Zimmet Tutanağı (ek dosya)
```

---

## 8. Frontend

### 8.1 Reusable Component: `<AttachmentUploader>`

**Dosya:** `components/attachment-uploader.tsx`

```typescript
interface AttachmentConfig {
  id: string;
  label: string;
  is_required: boolean;
  allowed_mime_types: string[];
  max_file_size_bytes: number;
  max_files: number;
}

interface UploadedFile {
  id: string;
  file_name: string;
  file_size: number;
  mime_type: string;
  uploaded_at: string;
}

interface AttachmentUploaderProps {
  requestId: string;
  configs: AttachmentConfig[];
  existingFiles: UploadedFile[];
  onUpload: (file: UploadedFile) => void;
  onDelete: (fileId: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
}
```

**Özellikler:**
- Her config için ayrı upload alanı
- Dosya tipi ve boyut validasyonu (client-side)
- Yükleme progress göstergesi
- Yüklenen dosya adı + boyut + silme butonu
- Zorunlu alanlar için kırmızı yıldız (*)
- `readOnly` modda sadece indirme butonu gösterir

### 8.2 Approvals Sayfası Entegrasyonu

`app/approvals/page.tsx` dosyasında:

1. Approval seçildiğinde, ilgili step'in attachment config'lerini çek
2. Mevcut yüklenen dosyaları çek
3. Checklist formunun altına `<AttachmentUploader>` render et
4. Onay butonuna basmadan önce zorunlu dosyaların yüklendiğini kontrol et

### 8.3 Read-Only Görünüm (Sonraki Adımlar)

Daha önce doldurulmuş section'lar read-only gösterilirken, o adıma ait yüklenen dosyalar da indirme linki ile gösterilir.

---

## 9. TypeScript Tipleri

**Dosya:** `lib/workflow/types.ts`

```typescript
export interface WorkflowStepAttachmentConfig {
  id: string;
  workflow_step_id: string;
  label: string;
  is_required: boolean;
  allowed_mime_types: string[];
  max_file_size_bytes: number;
  max_files: number;
}

export interface RequestAttachment {
  id: string;
  request_id: string;
  step_attachment_config_id: string;
  file_name: string;
  file_path: string;
  file_size: number;
  mime_type: string;
  uploaded_by: string;
  uploaded_at: string;
}
```

---

## 10. Dosya Yapısı (Yeni/Değişen)

```
rt-enerji-frontend/
├── app/api/
│   ├── attachments/
│   │   ├── upload/
│   │   │   └── route.ts                🆕 POST - dosya yükle
│   │   └── [id]/
│   │       ├── route.ts                🆕 DELETE - dosya sil
│   │       └── download/
│   │           └── route.ts            🆕 GET - dosya indir
│   └── approvals/[id]/
│       └── route.ts                    📝 Zorunlu attachment validasyonu
├── components/
│   └── attachment-uploader.tsx         🆕 Reusable upload component
├── lib/
│   ├── pdf/
│   │   └── merge-attachments.ts        🆕 PDF birleştirme utility
│   └── workflow/
│       └── types.ts                    📝 Attachment type'ları
├── sql/
│   └── workflow_attachments.sql        🆕 Tablo + RLS + Storage + Seed
└── docs/
    └── workflow-attachments.md         📝 Bu doküman
```

---

## 11. Implementasyon Planı

### Faz 1: Veritabanı & Storage
- [ ] `workflow_step_attachments` tablosu oluştur
- [ ] `request_attachments` tablosu oluştur
- [ ] RLS politikaları ekle
- [ ] `workflow-attachments` Storage bucket oluştur
- [ ] Storage RLS politikaları ekle
- [ ] Onboarding Adım 4 seed data ekle

### Faz 2: Backend
- [ ] `lib/workflow/types.ts` → Attachment type'ları ekle
- [ ] `POST /api/attachments/upload` → Dosya yükleme endpoint
- [ ] `DELETE /api/attachments/[id]` → Dosya silme endpoint
- [ ] `GET /api/attachments/[id]/download` → Dosya indirme endpoint
- [ ] `PATCH /api/approvals/[id]` → Zorunlu attachment validasyonu

### Faz 3: Frontend
- [ ] `components/attachment-uploader.tsx` → Reusable component
- [ ] `app/approvals/page.tsx` → Upload entegrasyonu
- [ ] `app/approvals/page.tsx` → Read-only görünüm (sonraki adımlar)

### Faz 4: PDF Birleştirme
- [ ] `pdf-lib` paketini yükle
- [ ] `lib/pdf/merge-attachments.ts` → Birleştirme utility
- [ ] `app/api/approvals/[id]/route.ts` → Son adımda merge entegrasyonu

---

## 12. Yeni Süreçlere Attachment Ekleme

Herhangi bir workflow adımına ek dosya beklentisi eklemek için sadece bir `INSERT` yeterlidir:

```sql
-- Örnek: Fazla Mesai sürecinin 2. adımına "Onay Belgesi" ekleme
INSERT INTO public.workflow_step_attachments (workflow_step_id, label, is_required, allowed_mime_types, max_file_size_bytes, max_files)
SELECT ws.id, 'Onay Belgesi', false, '{application/pdf,image/jpeg,image/png}', 5242880, 3
FROM public.workflow_steps ws
JOIN public.workflow_definitions wd ON wd.id = ws.workflow_definition_id
WHERE wd.code = 'OVERTIME' AND ws.step_order = 2;
```

Frontend ve backend kodu **hiç değişmeden** çalışır — sistem config tablosundan otomatik olarak hangi adımda ne bekleneceğini bilir.

---

## 13. Notlar

- **Generic Tasarım:** `onboarding_requests` tablosuna sütun eklenmez. Attachment sistemi tamamen bağımsızdır.
- **Client-side Validasyon:** Dosya tipi ve boyut kontrolü hem frontend'de hem backend'de yapılır.
- **Storage Temizliği:** Yüklenen ama onaylanmayan dosyalar storage'da kalır. İleride bir cleanup job eklenebilir.
- **PDF Merge Sırası:** Ek dosyalar `uploaded_at` sırasına göre ana PDF'in sonuna eklenir.
- **Birden Fazla Attachment Config:** Bir adımda birden fazla farklı dosya beklenebilir (örn: hem sözleşme hem zimmet tutanağı).

---

*Son güncelleme: 2026-02-25*
