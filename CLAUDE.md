# CLAUDE.md — RT Enerji Onay Süreçleri Platformu

RT Enerji'nin kurumsal onay süreçleri (14 workflow) + organizasyon yönetimi platformu. Next.js 16 (App Router) + React 19 + TypeScript + Supabase (Postgres/Auth/Storage/Realtime) + Microsoft Graph. UI, yorumlar ve dokümanlar Türkçe; tanımlayıcılar İngilizce. **Sistem canlıda aktif kullanılıyor.**

**Önce oku:** [ONBOARDING.md](ONBOARDING.md) (tam resim) → gerekirse [docs/genel-bakis.md](docs/genel-bakis.md).

## Mutlak kurallar

1. **Veritabanına YAZMA yapma** (INSERT/UPDATE/DELETE/DDL) — dev ortamında bile, hiçbir araçla (MCP, SQL editor, script). Görevin SQL *üretmek*; çalıştırmayı insan yapar. `SELECT` serbesttir.
2. **`workflow_steps` INSERT'lerini hiç yazma** — `static_position_id` seçimi insan kararıdır; yalnız metinsel öneri ver. Tam kural seti: [docs/workflows/README.md](docs/workflows/README.md).
3. **Prod'a dokunma.** Lokal `.env.local` dev Supabase'e bağlıdır; prod ayrı projedir ve gerçek veri içerir.
4. **Yeni süreç/özellik implementasyonu faz faz ilerler** — her fazda dur, özet ver, kullanıcı onayı bekle (kullanıcı "tek seferde yap" demedikçe).
5. Secret'ları (`SUPABASE_SERVICE_ROLE_KEY`, `AZURE_CLIENT_SECRET`, `CRON_SECRET`) asla client koduna, loglara veya dokümana koyma.

## Konvansiyonlar

- **Tarih/saat:** DB'de gerçek UTC; gösterim Europe/Istanbul. Dönüşüm yalnız `lib/timezone.ts` helper'larıyla. Salt `date` kolonlarına timezone dönüşümü uygulanmaz.
- **Revizyon döngüsü:** `request_approvals` okuyan her sorgu/PDF/e-posta `revision_cycle = requests.current_revision_cycle` filtresi ister; eski döngüler yalnız denetim izidir.
- **Supabase client seçimi:** tarayıcı → `lib/supabase/client`; Server Component/route → `lib/supabase/server` (RLS'li); `lib/supabase/service-role` yalnız gerekçeli sunucu işlemlerinde (RLS bypass — bilinçli karar).
- **Şema gerçeği `lib/database.types.ts`'tir.** `dev_schema.sql`/`prod_schema.sql` Nisan 2026 snapshot'ı — güncel değil. `sql/` klasörü elle uygulanan scriptlerin arşividir; migration runner yok. View değiştirirken `WITH (security_invoker = on)` açıkça tekrar edilmeli.
- **Performans:** liste uçları hafif select (`lib/*/server-selects.ts`), detay uçları tip-farkındalıklı iki aşamalı fetch kullanır — bu deseni koru (13 join = statement timeout).
- **Middleware `proxy.ts`'tir** (Next 16 adlandırması) ve `/api`'yi bilinçli dışlar (HTTP/2 framing fix'i); her API route kendi auth'unu yapar. Bunu "sadeleştirme" diye geri alma.

## Mimari çıpalar

- Onay motoru: `lib/workflow/workflow-service.ts` (zincir kurma, onaycı çözme) + `app/api/approvals/[id]/route.ts` (karar/ilerletme motoru) + `lib/workflow/lifecycle.ts` (geri çek/iptal/revize yetkileri).
- Veri modeli hub-and-spoke: merkez `requests` + tipe özel 1:1 detay tablosu + `request_approvals` (adım × onaycı × revizyon döngüsü).
- Onaycı tipleri: `REQUESTER` (oto-onay), `UNIT_HEAD` (üst birime tırmanır), `STATIC_POSITION`, `DYNAMIC_USER_LIST`. Adım özellikleri: `action_type` (SIGN_ONLY ileri oto-onay), `phase` (APPROVAL/COMPLETION), `condition` (tutmazsa adım hiç oluşmaz).
- Roller: `ORG_ADMIN` / `ORG_VIEWER` (`app_users.role`); son savunma hattı RLS ("sahibi VEYA onaycısı VEYA admin").
- Vekalet: onay satırında **kimin işlem yapabileceği** tek kaynaktan çözülür — DB `can_act_on_approval()` ↔ kod `lib/workflow/delegation.ts` (`resolveActingRights`). Route'larda `approver_employee_id === ben` karşılaştırması yazma; `acted_by_employee_id` yaz. Kapsam listesi `DELEGATION_ALLOWED_WORKFLOW_CODES`.
- PDF hattı: `lib/pdf/generate-request-pdf.ts` → imza/kaşe (`pdf-lib`) → Storage → SharePoint kuyruğu (cron yalnız prod'da).

## Komutlar

```bash
npm run dev          # http://localhost:3000
npm run lint         # ESLint
npm run typecheck    # tsc --noEmit
npm run build        # değişiklik sonrası doğrulama
```

Test framework'ü yok; doğrulama = typecheck + lint + uygulamayı sürüp akışı gözle (dev ortamında UI'dan veri girmek serbest). Onay aksiyonları gerçek e-posta gönderebilir (Graph) — test zincirine gerçek çalışan sokma.
