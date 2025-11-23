# RT Enerji Organizasyon Sistemi - Frontend Geliştirme Planı

## 📊 Sistemin Amacı

RT Enerji ve bağlı sahaların organizasyon yapısını, pozisyonları, çalışanları ve atamalarını **tarihçeli** olarak yönetmek için merkezi bir platform.

---

## 🗂️ Mevcut Durum - Neler Var?

### ✅ 1. Altyapı (Hazır)
- **Auth**: Microsoft Azure/Entra ID SSO (`@rtenerji.com`)
- **Database**: Supabase + PostgreSQL
- **UI Framework**: Next.js 15 + React 19 + shadcn/ui
- **Styling**: Tailwind CSS v4 + dark/light theme
- **Type Safety**: TypeScript + Supabase type generation

### ✅ 2. Database Schema (Hazır)

**Sözlük Tabloları:**
- `unit_types` - Birim tipleri (Direktörlük, Departman, Saha vb.)
- `position_types` - Pozisyon tipleri (Yönetici, Uzman, Asistan vb.)
- `grade_levels` - Seviye bantları (100, 200, 300, 400, 500)

**Ana Tablolar:**
- `organizational_units` - Organizasyon birimleri (hiyerarşik)
- `positions` - Pozisyonlar/kadrolar (job_code ile)
- `employees` - Çalışanlar
- `employee_positions` - Atamalar (tarihçeli)
- `app_users` - Uygulama kullanıcıları + roller

### ✅ 3. Security (Hazır)
- **RLS Policies**: ORG_ADMIN (full CRUD) + ORG_VIEWER (read-only)
- **Triggers**: Auto-provisioning (auth.users → app_users)
- **Email Matching**: Otomatik employee linking

### ✅ 4. UI Components (Hazır)
- App Shell + Sidebar layout
- shadcn/ui component library
- Theme switcher
- Breadcrumb navigation
- Loading states

---

## ❌ Eksik Olanlar - Frontend Geliştirme Gereken Alanlar

### 🔴 1. Ana Sayfa (Dashboard)
- Şu an sadece "hello" yazıyor
- Gerekli: Özet kartlar, istatistikler, hızlı erişim

### 🔴 2. CRUD Sayfaları (Hiç Yok)
Aşağıdaki tablolar için yönetim sayfaları gerekli:
- **Organizasyon Birimleri** (`/units`)
- **Pozisyonlar** (`/positions`)
- **Çalışanlar** (`/employees`)
- **Atamalar** (`/assignments`)
- **Sözlük Yönetimi** (`/settings/dictionaries`)

### 🔴 3. Görselleştirme (Hiç Yok)
- **Org Chart**: Organizasyon şeması (ağaç yapısı)
- **Pozisyon Hiyerarşisi**: reports_to_position_id ilişkisi
- **Çalışan Tarihçesi**: Timeline view

### 🔴 4. Sidebar Navigation (Placeholder)
Şu an örnek data var, gerçek menü yapısı gerekli:
- Dashboard
- Organizasyon Yönetimi
  - Birimler
  - Pozisyonlar
  - Çalışanlar
  - Atamalar
- Raporlar
- Ayarlar

---

## 🎯 BAŞLANMASI GEREKEN İLK NOKTA

### **Öncelik 1: Sözlük Tabloları Yönetimi** 

**Neden bu ilk olmalı?**

1. **Bağımlılık Zinciri:**
   ```
   unit_types → organizational_units → positions → employee_positions
   position_types ↗                    ↗
   grade_levels ────────────────────────┘
   ```
   Sözlükler olmadan diğer tablolar doldurulmaz!

2. **Basit CRUD:**
   - Karmaşık ilişkiler yok
   - Hiyerarşi yok
   - Sadece temel form işlemleri
   - UI pattern'leri öğrenmek için ideal

3. **Tekrar Kullanılabilir Componentler:**
   - Data table component
   - Form dialog component
   - Delete confirmation
   - Bu componentler sonra her yerde kullanılır

4. **Hızlı İlerleme:**
   - Kısa sürede tamamlanır
   - Motivasyon sağlar
   - Diğer sayfalar için template olur

---

## 📋 Önerilen Geliştirme Sırası

### **Faz 1: Temel Altyapı (1-2 hafta)**

#### 1. ✅ Sözlük Yönetimi (`/settings/dictionaries`)
- `unit_types` CRUD
- `position_types` CRUD
- `grade_levels` CRUD
- Ortak data table + form componentleri

#### 2. Dashboard Skeleton (`/`)
- Temel istatistik kartları
- Son eklenenler listesi
- Hızlı erişim butonları

### **Faz 2: Organizasyon Yönetimi (2-3 hafta)**

#### 3. Organizasyon Birimleri (`/units`)
- Hiyerarşik tree view
- Parent-child ilişkileri
- Drag & drop sıralama (opsiyonel)

#### 4. Pozisyonlar (`/positions`)
- Pozisyon listesi + filtreleme
- Job code validation
- Reports-to ilişkisi

### **Faz 3: Çalışan Yönetimi (2-3 hafta)**

#### 5. Çalışanlar (`/employees`)
- Çalışan listesi + arama
- Detay sayfası
- Status yönetimi

#### 6. Atamalar (`/assignments`)
- Tarihçeli atama yönetimi
- Terfi/transfer işlemleri
- Çoklu atama desteği

### **Faz 4: Görselleştirme (2-3 hafta)**

#### 7. Org Chart (`/org-chart`)
- İnteraktif organizasyon şeması
- Tarih bazlı görüntüleme
- Export (PDF/PNG)

#### 8. Raporlar (`/reports`)
- Çalışan tarihçesi
- Pozisyon doluluk oranı
- Birim bazlı istatistikler

---

## 🛠️ Teknik Öneriler

### Kullanılacak Teknolojiler

- **Data Table**: `@tanstack/react-table` (shadcn/ui ile entegre)
- **Forms**: `react-hook-form` + `zod` validation
- **Date Picker**: `react-day-picker` (shadcn/ui)
- **Icons**: `lucide-react` (zaten var)
- **Toast Notifications**: `sonner` (shadcn/ui)
- **Org Chart**: `react-organizational-chart` veya custom D3.js implementation

### Önerilen Klasör Yapısı

```
app/
├── (dashboard)/
│   ├── page.tsx                    # Ana sayfa
│   ├── units/                      # Organizasyon birimleri
│   │   ├── page.tsx
│   │   ├── [id]/
│   │   │   └── page.tsx
│   │   └── _components/
│   ├── positions/                  # Pozisyonlar
│   │   ├── page.tsx
│   │   ├── [id]/
│   │   │   └── page.tsx
│   │   └── _components/
│   ├── employees/                  # Çalışanlar
│   │   ├── page.tsx
│   │   ├── [id]/
│   │   │   └── page.tsx
│   │   └── _components/
│   ├── assignments/                # Atamalar
│   │   ├── page.tsx
│   │   └── _components/
│   ├── org-chart/                  # Organizasyon şeması
│   │   └── page.tsx
│   ├── reports/                    # Raporlar
│   │   └── page.tsx
│   └── settings/
│       └── dictionaries/           # 👈 BURADAN BAŞLA
│           ├── page.tsx
│           ├── unit-types/
│           │   └── page.tsx
│           ├── position-types/
│           │   └── page.tsx
│           └── grade-levels/
│               └── page.tsx
│
components/
├── data-table/                     # Ortak table component
│   ├── data-table.tsx
│   ├── data-table-toolbar.tsx
│   ├── data-table-pagination.tsx
│   └── data-table-column-header.tsx
├── forms/                          # Ortak form componentler
│   ├── form-dialog.tsx
│   ├── form-fields.tsx
│   └── form-validation.ts
├── dialogs/                        # Ortak dialog componentler
│   ├── delete-dialog.tsx
│   └── confirm-dialog.tsx
└── charts/                         # Görselleştirme componentleri
    ├── org-chart.tsx
    └── timeline.tsx
```

### API Route Pattern

```
app/api/
├── units/
│   ├── route.ts                    # GET (list), POST (create)
│   └── [id]/
│       └── route.ts                # GET (detail), PATCH (update), DELETE
├── positions/
│   ├── route.ts
│   └── [id]/
│       └── route.ts
├── employees/
│   ├── route.ts
│   └── [id]/
│       └── route.ts
└── dictionaries/
    ├── unit-types/
    │   ├── route.ts
    │   └── [id]/
    │       └── route.ts
    ├── position-types/
    │   ├── route.ts
    │   └── [id]/
    │       └── route.ts
    └── grade-levels/
        ├── route.ts
        └── [id]/
            └── route.ts
```

---

## 💡 İlk Sprint Hedefi

### Başlangıç: Sözlük Yönetimi - Unit Types

**Hedef:** `/settings/dictionaries/unit-types` sayfasını tamamlamak

**Deliverables:**

1. **Data Table Component** (Ortak)
   - Sıralama (sortable columns)
   - Filtreleme (search)
   - Pagination
   - Row selection
   - Bulk actions

2. **Form Dialog Component** (Ortak)
   - Create mode
   - Edit mode
   - Form validation (zod)
   - Error handling
   - Loading states

3. **Unit Types CRUD**
   - List view (data table)
   - Create dialog
   - Edit dialog
   - Delete confirmation
   - Toast notifications
   - Optimistic updates

4. **API Routes**
   - `GET /api/dictionaries/unit-types` - List
   - `POST /api/dictionaries/unit-types` - Create
   - `GET /api/dictionaries/unit-types/[id]` - Detail
   - `PATCH /api/dictionaries/unit-types/[id]` - Update
   - `DELETE /api/dictionaries/unit-types/[id]` - Delete

5. **Type Safety**
   - Zod schemas
   - TypeScript types
   - API response types

**Tahmini Süre:** 3-5 gün

**Sonraki Adım:** Aynı pattern'i `position-types` ve `grade-levels` için tekrarla (1-2 gün her biri)

---

## 🎨 UI/UX Standartları

### Tasarım Prensipleri

1. **Tutarlılık**: Tüm CRUD sayfaları aynı pattern'i takip etmeli
2. **Responsive**: Mobile-first yaklaşım
3. **Accessibility**: ARIA labels, keyboard navigation
4. **Performance**: Optimistic updates, debounced search
5. **Error Handling**: Kullanıcı dostu hata mesajları

### Renk Kodları (Position Types için)

Dokümantasyonda belirtildiği üzere, pozisyon tipleri için renk kodları kullanılacak:
- **Üst Yönetim**: Mavi (#3B82F6)
- **Müdür**: Yeşil (#10B981)
- **Uzman**: Turuncu (#F59E0B)
- **Asistan**: Sarı (#EAB308)
- **Stajyer**: Gri (#6B7280)

### Form Validation Kuralları

**unit_types:**
- `code`: Required, unique, uppercase, max 50 chars
- `name`: Required, max 100 chars
- `description`: Optional, max 500 chars
- `display_order`: Number, default 0

**position_types:**
- `code`: Required, unique, uppercase, max 50 chars
- `name`: Required, max 100 chars
- `color`: Optional, hex color format
- `description`: Optional, max 500 chars
- `display_order`: Number, default 0

**grade_levels:**
- `band`: Required, unique, one of [100, 200, 300, 400, 500]
- `name`: Required, max 100 chars
- `description`: Optional, max 500 chars
- `display_order`: Number, default 0

---

## 🚀 Başlangıç Adımları

### 1. Gerekli Paketleri Yükle

```bash
npm install @tanstack/react-table @tanstack/react-query
npm install react-hook-form @hookform/resolvers zod
npm install sonner
npm install date-fns
```

### 2. shadcn/ui Componentlerini Ekle

```bash
npx shadcn@latest add table
npx shadcn@latest add dialog
npx shadcn@latest add form
npx shadcn@latest add select
npx shadcn@latest add toast
npx shadcn@latest add sonner
```

### 3. İlk Sayfayı Oluştur

```bash
mkdir -p app/\(dashboard\)/settings/dictionaries/unit-types
touch app/\(dashboard\)/settings/dictionaries/unit-types/page.tsx
```

### 4. API Route'ları Oluştur

```bash
mkdir -p app/api/dictionaries/unit-types/\[id\]
touch app/api/dictionaries/unit-types/route.ts
touch app/api/dictionaries/unit-types/\[id\]/route.ts
```

---

## 📝 Notlar

- **RLS Policies**: Tüm tablolar için RLS aktif, ORG_ADMIN ve ORG_VIEWER rolleri tanımlı
- **Soft Delete**: `is_active` alanı kullanılarak soft delete tercih edilmeli
- **Audit Trail**: `created_at` ve `updated_at` alanları otomatik yönetiliyor
- **Type Generation**: Supabase CLI ile type'lar otomatik generate ediliyor (`lib/database.types.ts`)

---

## 🎯 Başarı Kriterleri

### Faz 1 Tamamlandığında:

- ✅ 3 sözlük tablosu için tam CRUD
- ✅ Ortak data table component
- ✅ Ortak form dialog component
- ✅ Toast notifications çalışıyor
- ✅ Loading states her yerde
- ✅ Error handling düzgün
- ✅ Type-safe API calls
- ✅ Responsive design
- ✅ Dark/light theme desteği

### Tüm Fazlar Tamamlandığında:

- ✅ Tüm organizasyon verisi yönetilebiliyor
- ✅ Org chart görselleştirmesi çalışıyor
- ✅ Tarihçeli atama yönetimi aktif
- ✅ Raporlar üretilebiliyor
- ✅ Export fonksiyonları çalışıyor
- ✅ Kullanıcı dostu ve hızlı arayüz

---

## 📚 Referanslar

- [Next.js 15 Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [shadcn/ui](https://ui.shadcn.com/)
- [TanStack Table](https://tanstack.com/table/latest)
- [React Hook Form](https://react-hook-form.com/)
- [Zod](https://zod.dev/)

---

**Son Güncelleme:** 2025-11-23
**Durum:** Planlama tamamlandı, geliştirme başlayabilir
**İlk Hedef:** `/settings/dictionaries/unit-types` CRUD sayfası

