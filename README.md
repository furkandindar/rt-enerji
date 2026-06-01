# RT Enerji – Onay Süreçleri & Organizasyon Yönetim Platformu

RT Enerji'nin **kurumsal onay süreçlerini (workflow)** dijital olarak yürüten ve **organizasyon yapısını** (şirketler, birimler, pozisyonlar, çalışanlar, tarihçeli atamalar) yöneten merkezi platform. İzin, fazla mesai, harcama, avans, mukayese, görev, kaşe onayı, onay kapağı gibi **14 form** kendi onay zinciriyle işletilir; süreç sonunda **imzalı/kaşeli PDF** üretilip SharePoint'e arşivlenir.

> ## 📖 Sistemin nasıl çalıştığını öğrenmek için → **[docs/genel-bakis.md](docs/genel-bakis.md)** 👈 **Buradan başla!**
> Mimari, veri modeli, workflow motoru, talep yaşam döngüsü ve belge üretim hattı orada tek dokümanda anlatılır.

---

## 🚀 Teknoloji Stack

- **Frontend:** Next.js 16 (App Router) + React 19 + TypeScript
- **Backend:** Supabase (PostgreSQL + Auth + Storage + Realtime)
- **UI:** shadcn/ui + Tailwind CSS v4
- **Kimlik:** Microsoft Azure / Entra ID SSO (`@rtenerji.com`)
- **Entegrasyon:** Microsoft Graph (Mail · Calendar · To-Do · SharePoint)
- **Belge:** `@react-pdf/renderer` + `pdf-lib` (PDF/imza/kaşe), ExcelJS (dışa aktarım)
- **Form:** react-hook-form + Zod · **Görselleştirme:** ReactFlow + ELK (org chart)

## ✨ Başlıca özellikler

- 🔐 Azure SSO + rol bazlı erişim (`ORG_ADMIN` / `ORG_VIEWER`) + satır düzeyi güvenlik (RLS)
- 🗂️ Organizasyon yönetimi: şirket, birim, pozisyon, çalışan ve **tarihçeli** atamalar
- 🧭 Org chart görselleştirmesi (Excel/PNG dışa aktarım)
- 📝 14 onay süreci; dinamik onaycı (birim amiri/ilgili kişiler), koşullu adımlar, çok fazlı süreçler
- 🔁 Talep yaşam döngüsü: taslak → onay → revize/geri-çek/iptal → tamamlandı (denetim izli)
- 🖊️ Dijital imza (yazı tipi veya çizim) + kaşe; otomatik **PDF üretimi**
- 📤 SharePoint'e otomatik belge arşivleme (kuyruk + her 5 dk cron retry)
- 🔔 Uygulama içi (Realtime) + e-posta bildirimleri

## 🏁 Hızlı başlangıç

**Gereksinimler:** Node.js 18+, bir Supabase projesi, Azure (Entra ID) uygulama kaydı.

```bash
npm install
cp .env.example .env.local   # yoksa .env.local'i elle oluştur
npm run dev                  # http://localhost:3000
```

`.env.local` (asgari):
```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# + Microsoft Graph / SharePoint sunucu secret'ları (mail, app-only kimlik, SharePoint site/kütüphane) — ekipten alın
```

**Supabase:** Şema `dev_schema.sql` / `sql/` altındadır; RLS tüm tablolarda aktiftir. Azure sağlayıcısı ve redirect URL'leri Supabase konsolundan ayarlanır (`/auth/callback`).

## 🔧 Komutlar

```bash
npm run dev         # geliştirme sunucusu
npm run build       # production build
npm start           # production sunucusu
npm run lint        # ESLint
npm run typecheck   # tsc --noEmit
# Supabase tipleri:
npx supabase gen types typescript --project-id <proje-id> > lib/database.types.ts
```

## 📚 Dokümantasyon

| Konu | Doküman |
|---|---|
| **Sistem genel bakış (önce bunu oku)** | **[docs/genel-bakis.md](docs/genel-bakis.md)** |
| Tüm onay süreçleri ve zincirleri | [docs/surec-bilgileri-prod.md](docs/surec-bilgileri-prod.md) |
| Workflow motoru (koşullu / yaşam döngüsü) | [docs/v4-workflow-engine-conditional.md](docs/v4-workflow-engine-conditional.md) · [docs/v5-workflow-engine-lifecycle.md](docs/v5-workflow-engine-lifecycle.md) |
| Organizasyon veri modeli | [docs/organizasyon-veri-modeli.md](docs/organizasyon-veri-modeli.md) |
| Veritabanı & Auth teknik tasarımı | [docs/teknik-tasarim-veritabani-ve-auth.md](docs/teknik-tasarim-veritabani-ve-auth.md) |
| SharePoint entegrasyonu | [docs/sharepoint-integration-plan.md](docs/sharepoint-integration-plan.md) |

## 📝 Notlar

- **Middleware:** `proxy.ts` (Next.js `middleware.ts` yerine) — her istekte oturum tazelenir.
- **RLS:** Tüm tablolarda aktif; temel desen "talep sahibi VEYA onaycı VEYA ORG_ADMIN".
- **Belge arşivi:** SharePoint senkronu prod'da `pg_cron`/`pg_net` ile çalışır (dev'de yok).

---

_Bu proje RT Enerji için geliştirilmiştir._
