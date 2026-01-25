# Workflow Süreç Ekleme Rehberi

Bu doküman, RT Enerji Workflow Engine V3'e yeni bir süreç eklemek isteyen geliştiriciler için adım adım rehber niteliğindedir.

## 📋 İçindekiler

1. [Genel Bakış](#genel-bakış)
2. [Mimari Yapı](#mimari-yapı)
3. [Implementasyon Fazları](#implementasyon-fazları)
4. [Faz 1: Veritabanı](#faz-1-veritabanı)
5. [Faz 2: Backend](#faz-2-backend)
6. [Faz 3: Frontend](#faz-3-frontend)
7. [Faz 4: PDF (Opsiyonel)](#faz-4-pdf-opsiyonel)
8. [Checklist](#checklist)
9. [Örnek Süreçler](#örnek-süreçler)

---

## Genel Bakış

### Workflow Engine V3 Özellikleri

| Özellik | Açıklama |
|---------|----------|
| **Multi-step Form** | Farklı adımlarda farklı kişiler form doldurabilir |
| **Action Types** | `FILL_AND_SIGN` (form doldur + imzala) veya `SIGN_ONLY` (sadece imzala) |
| **Kısıtlı Başlatma** | Bazı süreçler sadece belirli pozisyonlar tarafından başlatılabilir |
| **Dinamik Onay Zinciri** | `REQUESTER`, `UNIT_HEAD`, `STATIC_POSITION` onaycı tipleri |
| **İmza Sistemi** | Font-based dijital imza |

### Temel Kavramlar

```
workflow_definitions     → Süreç tanımı (SALARY_ADVANCE, ANNUAL_LEAVE, vb.)
       ↓
workflow_steps          → Süreç adımları (1. Talep Eden, 2. Personel, vb.)
       ↓
requests                → Oluşturulan talepler
       ↓
request_approvals       → Her adım için onay kayıtları
       ↓
[process]_requests      → Süreç-spesifik veriler (salary_advance_requests, leave_requests)
```

---

## Mimari Yapı

### Dosya Yapısı

```
rt-enerji-frontend/
├── app/
│   ├── api/
│   │   ├── [process-name]/          # API endpoint
│   │   │   └── route.ts
│   │   ├── approvals/               # Onay API (güncellenmeli)
│   │   │   └── route.ts
│   │   └── my-requests/             # Taleplerim API (güncellenmeli)
│   │       └── route.ts
│   ├── [process-name]/              # Frontend sayfaları
│   │   └── new/
│   │       └── page.tsx
│   ├── approvals/                   # Onay sayfası (güncellenmeli)
│   │   └── page.tsx
│   └── my-requests/                 # Taleplerim sayfası (güncellenmeli)
│       └── page.tsx
├── components/
│   └── nav-workflow.tsx             # Sidebar menü (güncellenmeli)
├── lib/
│   ├── pdf/
│   │   ├── [process]-pdf-template.tsx  # PDF template
│   │   └── generate-request-pdf.ts     # PDF generator (güncellenmeli)
│   └── workflow/
│       └── types.ts                 # TypeScript tipleri (güncellenmeli)
└── docs/
    └── workflows/
        ├── README.md                # Bu dosya
        └── [process-name].md        # Süreç dokümantasyonu
```

---

## Implementasyon Fazları

Her yeni süreç 4 fazda implement edilir:

| Faz | Açıklama | Zorunlu |
|-----|----------|---------|
| **Faz 1** | Veritabanı (workflow + tablo + RLS) | ✅ Evet |
| **Faz 2** | Backend (types + API endpoint) | ✅ Evet |
| **Faz 3** | Frontend (form + menü + detay gösterimi) | ✅ Evet |
| **Faz 4** | PDF template | ⚪ Opsiyonel |

---

## Faz 1: Veritabanı

### Adım 1.1: Workflow Definition Oluştur

```sql
INSERT INTO public.workflow_definitions (code, name, description, is_active, is_restricted)
VALUES (
  'PROCESS_CODE',           -- Benzersiz kod (UPPER_SNAKE_CASE)
  'Süreç Adı',              -- Görünen ad
  'Süreç açıklaması',       -- Açıklama
  true,                     -- Aktif mi?
  false                     -- Kısıtlı mı? (true = sadece belirli pozisyonlar başlatabilir)
);
```

### Adım 1.2: Workflow Steps Oluştur

```sql
DO $$
DECLARE
  v_workflow_id UUID;
BEGIN
  SELECT id INTO v_workflow_id FROM public.workflow_definitions WHERE code = 'PROCESS_CODE';

  -- Adım 1: Talep Eden (her zaman FILL_AND_SIGN)
  INSERT INTO public.workflow_steps 
    (workflow_definition_id, step_order, name, approver_type, action_type, form_section_key, is_required)
  VALUES 
    (v_workflow_id, 1, 'Talep Eden', 'REQUESTER', 'FILL_AND_SIGN', 'request_info', true);

  -- Adım 2+: Onaycılar (genellikle SIGN_ONLY)
  INSERT INTO public.workflow_steps 
    (workflow_definition_id, step_order, name, approver_type, static_position_id, action_type, is_required)
  VALUES 
    (v_workflow_id, 2, 'Personel', 'STATIC_POSITION', '<position_uuid>', 'SIGN_ONLY', true);
  
  -- Diğer adımlar...
END $$;
```

**Approver Types:**
- `REQUESTER`: Talep eden kişi
- `UNIT_HEAD`: Talep edenin birim amiri (escalation mantığı ile)
- `STATIC_POSITION`: Sabit pozisyon (static_position_id gerekli)

> **⚠️ Önemli: Talep Eden = Onaycı Durumu**
>
> Eğer `STATIC_POSITION` veya `UNIT_HEAD` tipinde belirlenen onaycı, talebi oluşturan kişi ile aynı ise:
> 1. Önce **aynı birimde** alternatif bir kişi aranır (level_band sıralı, en yüksek rütbeli önce)
> 2. Bulunamazsa **üst birime** escalate edilir
> 3. Hiç alternatif bulunamazsa **self-approval** uygulanır (talep eden kendini onaylar)
>
> **Örnek:** Finans Müdürü talep oluşturdu, onay adımında da Finans Müdürü var → Finans Şefi'ne atanır

**Action Types:**
- `FILL_AND_SIGN`: Form doldurur ve imzalar
- `SIGN_ONLY`: Sadece imzalar (mevcut veriyi inceler)

### Adım 1.3: Süreç-Spesifik Tablo Oluştur

```sql
CREATE TABLE public.[process]_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id UUID NOT NULL REFERENCES public.requests(id) ON DELETE CASCADE,

  -- Süreç-spesifik alanlar
  field_1 TEXT,
  field_2 DECIMAL(10,2),
  field_3 BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index
CREATE INDEX idx_[process]_requests_request_id ON public.[process]_requests(request_id);
```

### Adım 1.4: RLS Politikaları

```sql
ALTER TABLE public.[process]_requests ENABLE ROW LEVEL SECURITY;

-- Select: Talep sahibi veya onaycılar görebilir
CREATE POLICY "[process]_requests_select" ON public.[process]_requests
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.requests r
      WHERE r.id = request_id
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

-- Insert: Sadece kendi talebi için
CREATE POLICY "[process]_requests_insert" ON public.[process]_requests
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.requests r
      JOIN public.app_users au ON au.employee_id = r.requester_employee_id
      WHERE r.id = request_id AND au.id = auth.uid()
    )
  );
```

---

## Faz 2: Backend

### Adım 2.1: TypeScript Tipleri Ekle

**Dosya:** `lib/workflow/types.ts`

```typescript
// Süreç-spesifik tipler
export type FieldType = 'VALUE_1' | 'VALUE_2';

export interface ProcessRequest {
  id: string;
  request_id: string;
  field_1: string;
  field_2: number;
  field_3: boolean;
  created_at: string;
  updated_at: string;
}

export interface CreateProcessInput {
  field_1: string;
  field_2: number;
  field_3: boolean;
}
```

### Adım 2.2: API Endpoint Oluştur

**Dosya:** `app/api/[process-name]/route.ts`

```typescript
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { createApprovalChain, getWorkflowDefinitionByCode, notifyApprover, canStartWorkflow } from "@/lib/workflow";
import type { CreateProcessInput } from "@/lib/workflow";

// GET - Kullanıcının taleplerini listele
export async function GET() {
  const supabase = await createClient();

  // 1. Kullanıcı doğrulama
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // 2. Employee ID al
  const { data: appUser } = await supabase
    .from("app_users")
    .select("employee_id")
    .eq("id", user.id)
    .single();

  // 3. Talepleri getir
  const { data: requests } = await supabase
    .from("requests")
    .select(`*, workflow_definition:workflow_definitions(*), [process]_request:[process]_requests(*)`)
    .eq("requester_employee_id", appUser.employee_id)
    .eq("workflow_definition.code", "PROCESS_CODE");

  return NextResponse.json(requests);
}

// POST - Yeni talep oluştur
export async function POST(request: Request) {
  const supabase = await createClient();
  const body: CreateProcessInput = await request.json();

  // 1. Kullanıcı doğrulama
  // 2. Workflow definition al
  // 3. Yetki kontrolü (canStartWorkflow)
  // 4. Validasyon
  // 5. Request oluştur
  // 6. Process-specific request oluştur
  // 7. Approval chain oluştur
  // 8. Onaycıya bildirim gönder
  // 9. Response döndür
}
```

### Adım 2.3: Mevcut API'leri Güncelle

**`app/api/my-requests/route.ts`** - Select sorgusuna ekle:
```typescript
.select(`
  *,
  [process]_request:[process]_requests(*),
  ...
`)
```

**`app/api/approvals/route.ts`** - Select sorgusuna ekle:
```typescript
.select(`
  *,
  request:requests(
    *,
    [process]_request:[process]_requests(*),
    ...
  )
`)
```

---

## Faz 3: Frontend

### Adım 3.1: Talep Formu Sayfası Oluştur

**Dosya:** `app/[process-name]/new/page.tsx`

```typescript
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { SignaturePanel } from "@/components/signature-panel";

// 1. Zod schema tanımla
const formSchema = z.object({
  field_1: z.string().min(1, "Zorunlu alan"),
  field_2: z.number().min(0, "Geçerli değer girin"),
  field_3: z.boolean(),
});

export default function NewProcessPage() {
  // 2. Form state ve imza state'leri
  // 3. İmza bilgilerini yükle
  // 4. Form submit handler
  // 5. UI render
}
```

### Adım 3.2: Menüye Ekle

**Dosya:** `components/nav-workflow.tsx`

```typescript
import { IconName } from "lucide-react";

const items = [
  // Mevcut menü öğeleri...
  {
    title: "Süreç Adı",
    url: "/[process-name]/new",
    icon: IconName,
  },
];
```

### Adım 3.3: Detay Gösterimini Güncelle

**`app/approvals/page.tsx`** ve **`app/my-requests/page.tsx`**:

1. Interface'e süreç-spesifik tip ekle
2. `getRequestSummary()` fonksiyonunu güncelle
3. Detay sheet'ine süreç-spesifik alanları ekle

```typescript
// Interface güncelleme
interface Request {
  // ...
  [process]_request?: ProcessRequest;
}

// getRequestSummary güncelleme
const getRequestSummary = (request: Request): string => {
  if (request.[process]_request) {
    return `${request.[process]_request.field_2} TL`;
  }
  return "-";
};

// Detay sheet'e ekleme
{selectedRequest.[process]_request && (
  <>
    <div className="grid grid-cols-2 gap-4">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Alan 1</p>
        <p className="text-sm font-semibold">{selectedRequest.[process]_request.field_1}</p>
      </div>
    </div>
  </>
)}
```

---

## Faz 4: PDF (Opsiyonel)

### Adım 4.1: PDF Template Oluştur

**Dosya:** `lib/pdf/[process]-pdf-template.tsx`

Mevcut template'leri referans al:
- `request-pdf-template.tsx` (İzin talebi)
- `salary-advance-pdf-template.tsx` (Maaş avans)

### Adım 4.2: PDF Generator'ı Güncelle

**Dosya:** `lib/pdf/generate-request-pdf.ts`

```typescript
import { ProcessPDFTemplate } from './[process]-pdf-template';

// Select sorgusuna ekle
salary_advance_request:salary_advance_requests(*),
[process]_request:[process]_requests(*),

// Template seçimi
if (request.[process]_request) {
  pdfDocument = React.createElement(ProcessPDFTemplate, { ... });
} else if (request.salary_advance_request) {
  // ...
}
```

---

## Checklist

### Yeni Süreç Ekleme Checklist

```
□ Faz 1: Veritabanı
  □ workflow_definitions kaydı oluşturuldu
  □ workflow_steps kayıtları oluşturuldu
  □ [process]_requests tablosu oluşturuldu
  □ RLS politikaları eklendi
  □ Pozisyon atamaları yapıldı (static_position_id)

□ Faz 2: Backend
  □ lib/workflow/types.ts güncellendi
  □ app/api/[process]/route.ts oluşturuldu
  □ app/api/my-requests/route.ts güncellendi
  □ app/api/approvals/route.ts güncellendi

□ Faz 3: Frontend
  □ app/[process]/new/page.tsx oluşturuldu
  □ components/nav-workflow.tsx güncellendi
  □ app/approvals/page.tsx güncellendi
  □ app/my-requests/page.tsx güncellendi

□ Faz 4: PDF (Opsiyonel)
  □ lib/pdf/[process]-pdf-template.tsx oluşturuldu
  □ lib/pdf/generate-request-pdf.ts güncellendi

□ Test
  □ Talep oluşturma test edildi
  □ Onay süreci test edildi
  □ PDF indirme test edildi
```

---

## Örnek Süreçler

| Süreç | Doküman | Karmaşıklık |
|-------|---------|-------------|
| Maaş Avans Talebi | [salary-advance.md](./salary-advance.md) | Düşük |
| Yıllık İzin Talebi | (mevcut sistem) | Düşük |

---

## Notlar

### Önemli Noktalar

1. **Workflow Code**: Her zaman `UPPER_SNAKE_CASE` kullan
2. **İlk Adım**: Her zaman `REQUESTER` + `FILL_AND_SIGN` olmalı
3. **RLS**: Güvenlik için mutlaka RLS politikaları ekle
4. **Rollback**: API'de hata durumunda rollback mantığı ekle
5. **Bildirim**: Talep oluşturulduğunda onaycıya bildirim gönder
6. **Alternatif Onaycı**: Talep eden = onaycı durumunda sistem otomatik olarak aynı birimde veya üst birimde alternatif arar

### Onaycı Belirleme Mantığı

```
STATIC_POSITION adımında:
┌─────────────────────────────────────────────────────────────┐
│ 1. Pozisyondaki kişiyi bul                                  │
│ 2. Onaycı = Talep Eden mi?                                  │
│    ├── Hayır → Normal şekilde ata                           │
│    └── Evet → Alternatif ara:                               │
│        ├── Aynı birimde başka biri var mı? (level_band ↑)   │
│        │   ├── Evet → Ona ata                               │
│        │   └── Hayır → Üst birime git                       │
│        ├── Üst birimde biri var mı?                         │
│        │   ├── Evet → Ona ata                               │
│        │   └── Hayır → Daha üst birime git                  │
│        └── Hiç kimse bulunamadı → Self-approval             │
└─────────────────────────────────────────────────────────────┘
```

### Sık Yapılan Hatalar

- ❌ `static_position_id` atamayı unutmak
- ❌ API select sorgularına yeni tabloyu eklememek
- ❌ Frontend interface'lerini güncellememek
- ❌ RLS politikalarını eklememek

---

*Son güncelleme: 2026-01-25*

