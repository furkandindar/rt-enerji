# Custom Kaşe Pozisyonu Seçme Özelliği

## Context
Mevcut kaşeli belge onay sürecinde kullanıcılar kaşeyi sadece 5 predefined pozisyona (Sol Üst, Sağ Üst, Orta, Sol Alt, Sağ Alt) yerleştirebiliyor ve bu pozisyon tüm sayfalara aynı şekilde uygulanıyor.

Bu özellik ile:
- Predefined pozisyonlar korunacak (eski davranış aynen devam)
- **"Özel Konum"** seçeneği eklenecek → sayfa sayfa gezinme açılacak
- Her sayfa için bağımsız olarak predefined VEYA custom (tıkla+sürükle) pozisyon seçilebilecek

---

## Veri Modeli

### Sayfa bazlı pozisyon verisi
`stamp_requests` tablosuna yeni bir JSONB kolon eklenir:

```sql
ALTER TABLE stamp_requests
  ADD COLUMN page_positions jsonb DEFAULT NULL;
```

`stamp_position = 'custom'` olduğunda `page_positions` kullanılır. Formatı:

```json
{
  "1": { "type": "predefined", "position": "bottom-right" },
  "2": { "type": "custom", "x": 0.65, "y": 0.30 },
  "3": { "type": "predefined", "position": "top-left" },
  "5": { "type": "custom", "x": 0.10, "y": 0.85 }
}
```

- Key: sayfa numarası (1-based, string)
- `type: "predefined"` → `position` alanı kullanılır (mevcut 5 seçenek)
- `type: "custom"` → `x` ve `y` alanları kullanılır (0-1 arası oran, sayfa boyutuna göre)
- `x`: kaşenin sol kenarının sayfa genişliğine oranı
- `y`: kaşenin alt kenarının sayfa yüksekliğine oranı

Predefined pozisyon seçildiğinde (eski akış): `stamp_position` alanı kullanılır, `page_positions` null kalır.

---

## Uygulama Planı

### 1. `pdfjs-dist` paketini kur
PDF sayfalarını canvas'a render etmek için gerekli.
```bash
npm install pdfjs-dist
```

### 2. Veritabanı migration
Supabase'de:
```sql
ALTER TABLE stamp_requests ADD COLUMN page_positions jsonb DEFAULT NULL;
```

### 3. Type güncellemeleri
**Dosya:** `lib/workflow/types.ts`

```typescript
// StampPosition'a 'custom' ekle
export type StampPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'center' | 'custom';

// Sayfa bazlı pozisyon tipi
export type PagePositionEntry =
  | { type: 'predefined'; position: Exclude<StampPosition, 'custom'> }
  | { type: 'custom'; x: number; y: number };

export type PagePositions = Record<string, PagePositionEntry>;

// StampRequest'e page_positions ekle
export interface StampRequest {
  // ... mevcut alanlar
  page_positions: PagePositions | null;
}
```

### 4. Yeni bileşen: `StampPositionPicker`
**Dosya:** `components/stamp-position-picker.tsx`

Sayfa sayfa gezinerek her sayfaya bağımsız pozisyon atama bileşeni:

**Yapısı:**
- Üstte sayfa navigasyonu: `[◀] Sayfa 2 / 5 [▶]` + sayfa durumu göstergesi
- Ortada PDF sayfası canvas render (pdfjs-dist ile)
- Canvas üzerinde kaşe overlay (absolute positioned div, kaşe görseli ile)
- Her sayfa için pozisyon tipi seçimi: dropdown (Sağ Alt / Sol Alt / ... / Özel) 
- "Özel" seçilince tıkla+sürükle aktif olur
- Predefined seçilince kaşe o pozisyona otomatik yerleşir (görsel feedback)

**Etkileşim:**
- **Tıklama:** Canvas'a tıklayınca kaşe tıklanan noktaya yerleşir (merkez hizalı)
- **Sürükleme:** mousedown/mousemove/mouseup + touch events ile kaşe sürüklenebilir
- **Sınır kontrolü:** Kaşe sayfa dışına çıkamaz
- **Koordinat dönüşümü:** Piksel → yüzde (0-1) olarak parent'a iletilir

**Props:**
```typescript
interface StampPositionPickerProps {
  pdfFile: File;
  stampImageUrl: string;         // kaşe görseli URL'i (supabase public url)
  stampWidth: number;            // kaşe genişliği (px)
  stampHeight: number;           // kaşe yüksekliği (px)
  selectedPages: number[];       // kaşelenecek sayfa numaraları (1-based)
  value: PagePositions;          // mevcut sayfa pozisyonları
  onChange: (positions: PagePositions) => void;
}
```

**Sayfa durumu göstergesi:**
- Her sayfanın pozisyon atanıp atanmadığı altta küçük dot/chip'lerle gösterilir
- ✓ pozisyon atanmış, ○ henüz atanmamış

### 5. Talep oluşturma sayfası güncellemesi
**Dosya:** `app/stamp-approval/new/page.tsx`

- `POSITION_OPTIONS` array'ine `{ value: "custom", label: "Özel Konum" }` ekle
- Yeni state: `pagePositions: PagePositions` (başlangıçta boş obje)
- `stampPosition === "custom"` ve PDF + kaşe seçili olduğunda `StampPositionPicker` render et
- Form submit'te `page_positions` JSON string olarak FormData'ya ekle
- Validasyon: custom seçiliyse tüm seçili sayfalar için pozisyon atanmış olmalı

### 6. API güncelleme: Talep oluşturma
**Dosya:** `app/api/stamp-approval/route.ts`

- FormData'dan `page_positions` oku (JSON string → parse)
- `stamp_requests` insert'ine `page_positions` ekle
- Validasyon: `stamp_position === 'custom'` ise `page_positions` zorunlu ve her seçili sayfa için entry olmalı

### 7. PDF stamping logic güncellemesi
**Dosya:** `lib/pdf/stamp-pdf.ts`

- `StampPDFOptions` interface'ine `pagePositions?: PagePositions` ekle
- Stamping loop'unda her sayfa için:
  - `pagePositions` varsa → o sayfanın pozisyonunu `pagePositions[pageNumber]`'dan al
  - Entry `type: 'predefined'` ise → mevcut `calculateStampPosition` kullan
  - Entry `type: 'custom'` ise → `x * pageWidth`, `y * pageHeight` ile hesapla
  - `pagePositions` yoksa → mevcut davranış (tek `stampPosition` tüm sayfalara)

### 8. Onay API güncellemesi
**Dosya:** `app/api/approvals/[id]/route.ts`

- `stampPDF()` çağrısına `pagePositions` parametresini ekle (stampRequest.page_positions'dan oku)

### 9. Detay bileşeni güncellemesi
**Dosya:** `components/approvals/stamp-request-details.tsx`

- `positionLabels` map'ine `"custom": "Özel Konum (Sayfa bazlı)"` ekle

---

## Değişecek Dosyalar Özeti

| # | Dosya | Değişiklik |
|---|-------|-----------|
| 1 | `lib/workflow/types.ts` | `StampPosition`, `PagePositionEntry`, `PagePositions` type'ları + `StampRequest` güncelleme |
| 2 | **`components/stamp-position-picker.tsx`** | **Yeni dosya** — PDF sayfa navigasyonu + tıkla/sürükle picker |
| 3 | `app/stamp-approval/new/page.tsx` | "Özel Konum" seçeneği + picker entegrasyonu + form state |
| 4 | `app/api/stamp-approval/route.ts` | `page_positions` kabul et, parse et, kaydet |
| 5 | `lib/pdf/stamp-pdf.ts` | Sayfa bazlı pozisyon desteği (`pagePositions` parametresi) |
| 6 | `app/api/approvals/[id]/route.ts` | `pagePositions`'ı stampPDF'e geçir |
| 7 | `components/approvals/stamp-request-details.tsx` | "Özel Konum" label'ı |

## Yeni Bağımlılık
- `pdfjs-dist` — PDF sayfalarını canvas'a render etmek için

## Doğrulama / Test Planı
1. Dropdown'da "Özel Konum" seçeneği görünmeli
2. PDF + kaşe seçildikten sonra "Özel Konum" seçince sayfa navigatörü açılmalı
3. Sayfalar arası ileri/geri gezilebilmeli
4. Her sayfada bağımsız olarak predefined veya custom pozisyon seçilebilmeli
5. Custom modda PDF üzerinde tıklayınca kaşe oraya yerleşmeli
6. Kaşe sürüklenebilmeli ve sayfa sınırları dışına çıkamamalı
7. Predefined seçilince kaşe o pozisyona otomatik geçmeli (görsel feedback)
8. Tüm sayfalar için pozisyon atanmadan form gönderilemememli
9. DB'de `page_positions` JSON doğru formatla kaydedilmeli
10. Onay verilince her sayfa kendi pozisyonuna göre kaşelenmeli
11. Üst dropdown'dan predefined (Sağ Alt vb.) seçilince eski davranış aynen çalışmalı
