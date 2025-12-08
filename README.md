# RT Enerji Organizasyon Yönetim Sistemi v1.1

RT Enerji ve bağlı sahaların organizasyon yapısını, pozisyonları, çalışanları ve atamalarını **tarihçeli** olarak yönetmek için merkezi platform.

## 🚀 Teknoloji Stack

- **Frontend**: Next.js 15 + React 19 + TypeScript
- **Backend**: Supabase (PostgreSQL + Auth + Storage)
- **UI**: shadcn/ui + Tailwind CSS v4
- **Auth**: Microsoft Azure/Entra ID SSO (`@rtenerji.com`)

## 📚 Dokümantasyon

- [Organizasyon Veri Modeli](docs/organizasyon-veri-modeli.md) - Database şeması ve ilişkiler
- [Yönetici Özeti](docs/organizasyon-sistemi-yonetici-ozet.md) - İş tarafı için özet
- [Teknik Tasarım](docs/teknik-tasarim-veritabani-ve-auth.md) - Teknik detaylar
- [Auth Setup](docs/auth-setup.md) - OAuth callback fix dokümantasyonu
- **[Frontend Geliştirme Planı](docs/frontend-development-plan.md)** 👈 **Buradan başla!**

---

## ✨ Özellikler

### Mevcut (Hazır)
- ✅ Microsoft Azure/Entra ID SSO entegrasyonu
- ✅ OAuth callback flow (düzeltildi)
- ✅ Database schema (7 tablo + RLS policies)
- ✅ Auto-provisioning (auth.users → app_users)
- ✅ Role-based access (ORG_ADMIN / ORG_VIEWER)
- ✅ App Shell + Sidebar layout
- ✅ Dark/Light theme
- ✅ TypeScript + Type generation

### Geliştirme Aşamasında
- 🚧 Sözlük yönetimi (unit_types, position_types, grade_levels)
- 🚧 Organizasyon birimleri CRUD
- 🚧 Pozisyon yönetimi
- 🚧 Çalışan yönetimi
- 🚧 Atama yönetimi (tarihçeli)
- 🚧 Org chart görselleştirmesi
- 🚧 Raporlar

## 🚀 Hızlı Başlangıç

### 1. Gereksinimler

- Node.js 18+
- npm / yarn / pnpm
- Supabase hesabı

### 2. Kurulum

```bash
# Bağımlılıkları yükle
npm install

# Environment variables ayarla
cp .env.example .env.local
```

`.env.local` dosyasını düzenle:
```env
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
```

### 3. Database Setup

Supabase SQL Editor'de sırasıyla çalıştır:

```bash
# 1. Schema
sql/organizasyon_mvp_schema.sql

# 2. Triggers
sql/organizasyon_mvp_triggers.sql

# 3. RLS Policies
sql/organizasyon_mvp_rls.sql
```

### 4. Supabase Auth Ayarları

**Authentication → Providers → Azure:**
- Client ID ve Secret ekle
- Redirect URL: `http://localhost:3000/auth/callback`

**Authentication → URL Configuration:**
- Redirect URLs'e ekle: `http://localhost:3000/auth/callback`

### 5. Uygulamayı Başlat

```bash
npm run dev
```

Uygulama [localhost:3000](http://localhost:3000) adresinde çalışacak.

### 6. İlk Kullanıcı

- `/auth/login` sayfasına git
- "Microsoft ile giriş yap" butonuna tıkla
- `@rtenerji.com` hesabınla giriş yap
- Otomatik olarak `ORG_VIEWER` rolü atanacak

**Admin yapmak için:**
```sql
UPDATE app_users
SET role = 'ORG_ADMIN'
WHERE email = 'your-email@rtenerji.com';
```

## 📂 Proje Yapısı

```
rt-enerji/
├── app/
│   ├── (dashboard)/              # Ana uygulama sayfaları
│   │   ├── page.tsx              # Dashboard
│   │   └── settings/
│   │       └── dictionaries/     # 👈 İlk geliştirme buradan başlayacak
│   ├── auth/                     # Auth sayfaları
│   │   ├── login/
│   │   ├── callback/             # OAuth callback
│   │   └── auth-code-error/
│   ├── api/                      # API routes (gelecek)
│   └── layout.tsx
├── components/
│   ├── app-shell.tsx             # Ana layout
│   ├── app-sidebar.tsx           # Sidebar navigation
│   └── ui/                       # shadcn/ui components
├── lib/
│   ├── supabase/                 # Supabase clients
│   ├── database.types.ts         # Auto-generated types
│   └── utils.ts
├── sql/
│   ├── organizasyon_mvp_schema.sql    # Database schema
│   ├── organizasyon_mvp_triggers.sql  # Triggers
│   └── organizasyon_mvp_rls.sql       # RLS policies
└── docs/
    ├── organizasyon-veri-modeli.md
    ├── organizasyon-sistemi-yonetici-ozet.md
    ├── teknik-tasarim-veritabani-ve-auth.md
    ├── auth-setup.md
    └── frontend-development-plan.md   # 👈 Geliştirme planı
```

## 🎯 Geliştirme Yol Haritası

### Faz 1: Temel Altyapı (1-2 hafta)
- [ ] Sözlük yönetimi (unit_types, position_types, grade_levels)
- [ ] Ortak data table component
- [ ] Ortak form dialog component
- [ ] Dashboard skeleton

### Faz 2: Organizasyon Yönetimi (2-3 hafta)
- [ ] Organizasyon birimleri CRUD
- [ ] Pozisyon yönetimi
- [ ] Hiyerarşik tree view

### Faz 3: Çalışan Yönetimi (2-3 hafta)
- [ ] Çalışan CRUD
- [ ] Atama yönetimi (tarihçeli)
- [ ] Terfi/transfer işlemleri

### Faz 4: Görselleştirme (2-3 hafta)
- [ ] Org chart
- [ ] Raporlar
- [ ] Export fonksiyonları

Detaylı plan için: [Frontend Geliştirme Planı](docs/frontend-development-plan.md)

## 🔧 Geliştirme Komutları

```bash
# Development server
npm run dev

# Type generation (Supabase)
npx supabase gen types typescript --project-id your-project-id > lib/database.types.ts

# Lint
npm run lint

# Build
npm run build

# Production server
npm start
```

## 📝 Notlar

- **Next.js 15**: `proxy.ts` kullanıyor (`middleware.ts` yerine)
- **RLS**: Tüm tablolarda aktif, ORG_ADMIN ve ORG_VIEWER rolleri
- **Soft Delete**: `is_active` alanı kullanılıyor
- **Type Safety**: Supabase CLI ile otomatik type generation

## 🤝 Katkıda Bulunma

1. Feature branch oluştur (`git checkout -b feature/amazing-feature`)
2. Değişiklikleri commit et (`git commit -m 'feat: add amazing feature'`)
3. Branch'i push et (`git push origin feature/amazing-feature`)
4. Pull Request aç

## 📄 Lisans

Bu proje RT Enerji için geliştirilmiştir.
