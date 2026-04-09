# RT Enerji Workflow Engine V4 - Koşullu Adımlar, Çok Fazlı Süreçler ve İlişkili Talepler

Bu doküman, V3 workflow engine üzerine yapılan geliştirmeleri tanımlar. V3'te tüm adımlar sıralı ve zorunluydu, V4'te **koşullu adımlar**, **çok fazlı süreçler** ve **ilişkili talepler** desteği ekleniyor.

> **Tarih:** 2026-04-08
> **Durum:** Implementasyon tamamlandı

---

## 1. V3'teki Durum ve Yeni İhtiyaçlar

### V3'te Olan
- Lineer onay zinciri (Adım 1 → 2 → 3 → ...)
- Her adımda FILL_AND_SIGN veya SIGN_ONLY
- Tüm adımlar zorunlu ve sıralı
- Tek fazlı süreç: PENDING → APPROVED

### V4'te Yeni İhtiyaçlar
- **Koşullu adımlar:** Bazı adımlar form verisine göre atlanabilmeli (ör: avans yoksa muhasebe onayı gerekmez)
- **Çok fazlı süreçler:** Onay sonrası tamamlama adımları olabilmeli (ör: görev dönüşünde asistan gerçekleşen tarihleri girer)
- **İlişkili talepler:** Bir süreç başka bir süreci tetikleyebilmeli (ör: görev formu → avans talebi)

---

## 2. Yeni Kavramlar

### 2.1 Koşullu Adım (Conditional Step)

`workflow_steps` tablosuna eklenen `condition` (JSONB) kolonu ile bir adımın hangi koşulda aktif olacağı tanımlanır.

```
condition = NULL              → Adım her zaman çalışır (mevcut davranış)
condition = {"field": "x", "value": y}  → Sadece formData[x] === y ise çalışır
```

**Örnek:** Muhasebe onay adımı
```json
{"field": "advance_requested", "value": true}
```
- Kullanıcı avans talep etti → muhasebe adımı aktif
- Kullanıcı avans talep etmedi → muhasebe adımı otomatik APPROVED (skip)

**Kontrol mekanizması:** `shouldSkipStep()` fonksiyonu (`workflow-service.ts`):
1. `condition = NULL` → adımı ATLAMA (her zaman çalış)
2. `formData = undefined` → adımı ATLAMA (mevcut süreçlerde formData geçilmez)
3. `formData[field] === value` → koşul sağlandı, adımı ATLAMA (aktif)
4. `formData[field] !== value` → koşul sağlanmadı, adımı ATLA (skip → auto-APPROVED)

### 2.2 Çok Fazlı Süreç (Multi-Phase Workflow)

`workflow_steps` tablosuna eklenen `phase` kolonu ile adımlar iki faza ayrılır:

| Faz | Açıklama | Örnek |
|-----|----------|-------|
| `APPROVAL` | Onay adımları (varsayılan) | Birim amiri, muhasebe, genel koordinatör |
| `COMPLETION` | Tamamlama adımları (onay sonrası) | Asistanın gerçekleşen tarihleri girmesi |

**Akış:**
```
APPROVAL fazı adımları tamamlandı
  → COMPLETION adımı var mı?
    → Hayır → status = APPROVED (mevcut davranış, tek fazlı süreçler)
    → Evet → status = AWAITING_COMPLETION + onay PDF'i oluşur
              → COMPLETION adımları tamamlandı
              → status = COMPLETED + final PDF oluşur (üzerine yazar)
```

### 2.3 İlişkili Talepler (Linked Requests)

`requests` tablosuna eklenen `parent_request_id` kolonu ile talepler birbirine bağlanır.

```
Görev Formu (parent_request_id = NULL)      ← Ana talep
  └── Avans Talebi (parent_request_id = görev_formu_id)  ← Alt talep
```

- Her talep kendi onay zinciriyle **bağımsız** ilerler
- Frontend'de ilişki gösterilebilir (detay sayfasında bağlı talepler)

---

## 3. Veritabanı Değişiklikleri

```sql
-- 3.1 Koşullu adım desteği
ALTER TABLE public.workflow_steps
ADD COLUMN condition JSONB DEFAULT NULL;

-- 3.2 Çok fazlı süreç desteği
ALTER TABLE public.workflow_steps
ADD COLUMN phase TEXT NOT NULL DEFAULT 'APPROVAL'
CHECK (phase IN ('APPROVAL', 'COMPLETION'));

-- 3.3 İlişkili talepler
ALTER TABLE public.requests
ADD COLUMN parent_request_id UUID REFERENCES public.requests(id) ON DELETE SET NULL;

CREATE INDEX idx_requests_parent_request_id
ON public.requests(parent_request_id)
WHERE parent_request_id IS NOT NULL;

-- 3.4 Yeni status değerleri
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'AWAITING_COMPLETION';
ALTER TYPE public.request_status ADD VALUE IF NOT EXISTS 'COMPLETED';
```

---

## 4. Yeni Status Akışları

### Tek Fazlı Süreçler (Mevcut — İzin, Avans, İşe Giriş vb.)
```
PENDING → APPROVED
PENDING → REJECTED
```

### Çok Fazlı Süreçler (Yeni — Görev Formu vb.)
```
PENDING → AWAITING_COMPLETION → COMPLETED
PENDING → REJECTED
```

### Status Tablosu
| Status | Renk | Etiket | Açıklama |
|--------|------|--------|----------|
| DRAFT | Gri | Taslak | Henüz gönderilmedi |
| PENDING | Sarı | Beklemede | Onay bekliyor |
| APPROVED | Yeşil | Onaylandı | Tüm adımlar tamam (tek fazlı) |
| AWAITING_COMPLETION | Mavi | Tamamlanma Bekleniyor | Onay bitti, tamamlama adımı bekleniyor |
| COMPLETED | Koyu Yeşil | Tamamlandı | Tüm fazlar tamam (çok fazlı) |
| REJECTED | Kırmızı | Reddedildi | Reddedildi |
| CANCELLED | Gri | İptal Edildi | İptal edildi |

---

## 5. Backend Değişiklikleri

### 5.1 TypeScript Tipleri (`lib/workflow/types.ts`)
```typescript
// Koşullu adım tanımı
interface StepCondition {
  field: string;   // Süreç-spesifik tablodaki kolon adı
  value: unknown;  // Beklenen değer
}

type WorkflowStepPhase = 'APPROVAL' | 'COMPLETION';

// WorkflowStep'e eklenen alanlar:
// condition: StepCondition | null
// phase: WorkflowStepPhase
```

### 5.2 createApprovalChain (`lib/workflow/workflow-service.ts`)
- Yeni opsiyonel parametre: `formData?: Record<string, unknown>`
- Koşul kontrolü: `shouldSkipStep(condition, formData)` → koşul sağlanmıyorsa auto-APPROVED
- Mevcut süreçlerde `formData` geçilmez → koşul kontrolü atlanır → mevcut davranış korunur

### 5.3 Onay Mantığı (`app/api/approvals/[id]/route.ts`)
4 dallı karar ağacı:

```
Adım onaylandı →
├── 1. isCompleted && !hasCompletionPhase
│   → status = APPROVED, PDF oluştur        (mevcut davranış)
│
├── 2. isEnteringCompletionPhase
│   → status = AWAITING_COMPLETION
│   → Onay PDF'i oluştur (gerçekleşen tarihler boş)
│   → "Görevin onaylandı" bildirimi + asistana bildirim
│
├── 3. isCompletionFinished
│   → status = COMPLETED
│   → Final PDF oluştur (üzerine yazar)
│   → "Tamamlandı" bildirimi
│
└── 4. else
    → Sonraki adıma geç, onaycıya bildirim  (mevcut davranış)
```

---

## 6. Geriye Uyumluluk

| Değişiklik | Mevcut Süreçlere Etki |
|-----------|----------------------|
| `condition` kolonu | Tümü NULL → koşul kontrolü yapılmaz |
| `phase` kolonu | Tümü APPROVAL → COMPLETION fazı yok |
| `parent_request_id` | Tümü NULL → bağımsız talepler |
| Yeni status'lar | Mevcut süreçler bu status'lara hiç düşmez |
| `createApprovalChain` yeni parametre | Opsiyonel, geçilmezse mevcut davranış |
| 4 dallı onay mantığı | Dal 1 ve 4 = mevcut davranış |

**Sonuç: Mevcut süreçlere sıfır etki.**
