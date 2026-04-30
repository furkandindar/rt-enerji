# Ana Sayfa Yeniden Tasarımı

Login sonrası landing page'i `/org-chart`'tan `/` (ana sayfa) a çevirmek ve burada takvim, döviz kurları ve kişisel notlar widget'larını sunmak için yapılan değişikliklerin kayıt dokümanıdır. Her faz tamamlandıkça bu dosya güncellenir.

## Amaç
- Kullanıcı sisteme giriş yaptığında `/org-chart` yerine `/` 'a düşsün.
- Ana sayfada üç widget bulunsun:
  1. **Takvim** — Outlook calendar event'leri (delegated MS Graph) ile gün bazlı liste + dot işaretleri.
  2. **Döviz Kurları** — TCMB kaynaklı EUR/TRY, USD/TRY, EUR/USD kurları.
  3. **Notlarım** — Microsoft To Do (delegated MS Graph) "RT Enerji" listesi üzerinden CRUD.
- Sidebar'a "Ana Sayfa" linki eklenecek.
- `/org-chart` erişilebilir olmaya devam eder — sadece default landing değil.

## Faz Planı

| Faz | İçerik | Durum |
|---|---|---|
| 1 | Redirect'leri `/` a çevir | ✅ Tamamlandı |
| 2 | Ana sayfa iskeleti (3 placeholder widget) | ✅ Tamamlandı |
| 3 | Takvim widget'ı (sade) | ✅ Tamamlandı |
| 3b | Takvim — Outlook event overlay | ✅ Tamamlandı |
| 4 | Döviz kurları (TCMB + dinamik TTL cache) | ✅ Tamamlandı |
| 5a | MS Graph delegated altyapısı (token store + user-client + app-client) | ✅ Tamamlandı |
| 5 | Notlarım — Microsoft To Do entegrasyonu | ✅ Tamamlandı |
| 6 | Sidebar linki + breadcrumb/metadata cleanup | ✅ Tamamlandı |

---

## Faz 1 — Redirect'leri `/` ya Çevir ✅

### Problem
Login olan kullanıcı her zaman `/org-chart`'a yönlendiriliyordu. Aslında `app/page.tsx` (root route) zaten mevcut ve bir dashboard render ediyordu; fakat middleware tüm `/` trafiğini `/org-chart`'a çeviriyordu, bu yüzden erişilemiyordu.

### Yapılan Değişiklikler

**1. Middleware (`lib/supabase/proxy.ts`)**

`/` için olan özel redirect bloğu tamamen kaldırıldı. Zaten aşağıda duran genel "unauthenticated → `/auth/login`" guard'ı anonim kullanıcıları login'e yönlendirmeye devam ediyor. Authenticated kullanıcı artık `/` 'da kalıp `app/page.tsx`'i görüyor.

**Silinen blok:**
```ts
if (request.nextUrl.pathname === "/") {
  const url = request.nextUrl.clone();
  url.pathname = user ? "/org-chart" : "/auth/login";
  return NextResponse.redirect(url);
}
```

**2. OAuth Callback (`app/auth/callback/route.ts`)**

Azure login sonrası default redirect hedefi `/org-chart`'tan `/` 'a çevrildi.

```ts
// önce
const next = searchParams.get("next") ?? "/org-chart";
// sonra
const next = searchParams.get("next") ?? "/";
```

### Etkilenmeyen Yerler
- `components/nav-organization.tsx` — Sidebar'daki `/org-chart` linki olduğu gibi duruyor, sayfa erişilebilir kalmalı.
- `app/org-chart/*` — sayfa ve komponent dosyaları olduğu gibi.
- `docs/*` — bazı docs içinde `/org-chart` referansları var, ama kod değil; Faz 6'da gözden geçirilecek.

### Test Sonucu
- Logout → Microsoft login → `/` 'a düşüyor ✅
- Manuel olarak `/org-chart` açılabiliyor ✅
- Anonim kullanıcı → herhangi bir route → `/auth/login` ✅

---

## Faz 2 — Ana Sayfa İskeleti ✅

### Amaç
Eski "Hoş Geldiniz" dashboard'unu (workflow özet kartları) kaldırıp yerine 3 widget'lık yeni bir iskelet kur. Widget'ların içeriği sonraki fazlarda dolacak.

### Yapılan Değişiklikler

**1. Yeni Klasör: `app/_home/`**

Next.js konvansiyonu gereği `_` prefix'i ile private folder (route olarak ele alınmaz). Ana sayfaya özel widget'ları burada topluyoruz.

**2. Placeholder Widget'lar**

Her biri shadcn `Card` tabanlı, iconlu başlık + açıklama + "yakında eklenecek" yer tutucusu:
- `app/_home/calendar-widget.tsx` — Takvim
- `app/_home/fx-rates-widget.tsx` — Döviz Kurları
- `app/_home/notes-widget.tsx` — Notlarım

**3. `app/page.tsx` Yeniden Yazıldı**

214 satırdan 30 satıra indi. Artık bir server component (state yok, `"use client"` yok).

```tsx
import { CalendarWidget } from "./_home/calendar-widget";
import { FxRatesWidget } from "./_home/fx-rates-widget";
import { NotesWidget } from "./_home/notes-widget";

export default function HomePage() {
  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Ana Sayfa</h1>
        <p className="text-muted-foreground">
          Takvim, güncel döviz kurları ve kişisel notlarınız
        </p>
      </div>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2"><CalendarWidget /></div>
        <div><FxRatesWidget /></div>
        <div className="lg:col-span-3"><NotesWidget /></div>
      </div>
    </div>
  );
}
```

### Grid Yerleşimi
- **Mobile / tablet:** Tüm widget'lar tek kolonda alt alta.
- **`lg` ve üzeri:** 3 kolonlu grid; üst satırda Takvim (2 kol) + Döviz (1 kol), alt satırda Notlarım (3 kol full-width).

### Henüz Yapılmayanlar (Sonraki Fazlarda)
- Widget'ların gerçek içerikleri (Faz 3-5).
- Breadcrumb şu an hâlâ "Home" yazıyor — "Ana Sayfa" olarak güncelleme Faz 6'da.
- `app/api/dashboard/workflow-summary` endpoint'i eski `page.tsx` tarafından kullanılıyordu; şu an orphan olabilir. Faz 6'da başka kullanım var mı diye bakılacak.

---

## Faz 3 — Takvim Widget'ı ✅

### Amaç
Ana sayfada sade, görsel bir takvim göstermek. İzin/onay tarihlerini işaretleme gibi zenginleştirmeler sonraki sürüme bırakıldı.

### Yapılan Değişiklikler

**`app/_home/calendar-widget.tsx`** — placeholder, gerçek takvim render edecek hale getirildi.

- shadcn `Calendar` component'i kullanıldı (zaten `components/ui/calendar.tsx` vardı — `react-day-picker` v9 sarmalayıcısı).
- `"use client"` — state'li component (seçili tarih).
- `locale={tr}` (`date-fns/locale`) → ay/gün isimleri Türkçe.
- `weekStartsOn={1}` → hafta Pazartesi başlar.
- `mode="single"` + `selected` / `onSelect` → kullanıcı tıklayarak gün seçebiliyor.
- Başlangıç değeri: bugün (`new Date()`).
- Kart başlığının altında seçili/bugünün tarihi `d MMMM yyyy, EEEE` formatında Türkçe gösteriliyor (örn. "21 Nisan 2026, Salı").

### Teknik Notlar
- Projede tutarlılık için mevcut `date-fns/locale` → `tr` importu kullanıldı (diğer sayfalarda da bu pattern var).
- v1 fonksiyonel olarak "read-only + tıklanabilir UX" — seçilen tarih herhangi bir veriyi filtrelemiyor; sadece görsel feedback.

### Henüz Yapılmayanlar (Sonraki Sürümde)
- İzin talepleri / yaklaşan onay tarihleri / doğum günleri gibi tarihlerin dot/badge ile işaretlenmesi (`modifiers` + `modifiersClassNames` ile yapılabilir).
- "Bugüne dön" butonu.
- Takvim üzerinden tıklanınca ilgili günün detayları (v2).

---

## Faz 4 — Döviz Kurları Widget'ı ✅

### Amaç
TCMB resmi kurlarından EUR/TRY, USD/TRY ve EUR/USD paritesini ana sayfada göstermek.

### Yapılan Değişiklikler

**1. Yeni Bağımlılık**

```bash
npm install fast-xml-parser
```

TCMB yanıtı XML olduğu için parser gerekti.

**2. Yeni API Route: `app/api/fx-rates/route.ts`**

- TCMB `https://www.tcmb.gov.tr/kurlar/today.xml` kaynağından fetch.
- `fast-xml-parser` ile parse; `USD` ve `EUR` kayıtları bulunur.
- **EUR/USD paritesi** TCMB'de hazır halde var: EUR kaydının `CrossRateOther` alanı (örn. `1.1765`). Bu yüzden `eurTry / usdTry` bölmesi yapılmıyor — parite direkt TCMB'den okunuyor. Güvenlik için fallback mevcut.
- Kur alanı olarak `ForexSelling` (Döviz Satış) tercih edildi — finans sitelerinin çoğunluğunun tercih ettiği alan.
- Response: `{ eurTry, usdTry, eurUsd, sourceDate, fetchedAt }`.
- Hata durumunda 503 ile Türkçe mesaj döner.

**3. Cache Stratejisi (Dinamik TTL)**

`computeSecondsUntilNextTcmbUpdate()` fonksiyonu her istek geldiğinde mevcut zamandan bir sonraki **iş günü 15:31 TSİ**'ye kadar kalan saniye sayısını hesaplar. Bu değer `fetch`'e `next: { revalidate }` olarak verilir.

- Türkiye saati UTC+3, DST yok → 15:31 TSİ = 12:31 UTC.
- Hafta sonu (Pzr=0, Ctsi=6) otomatik atlanır.
- Minimum 60 sn koruması var (çok kısa cache olmasın).
- Sonuç: TCMB'ye günde **yalnızca 1 kez** gidilir; yayın sonrası (15:31) ilk istek taze veriyi alır.

**4. Widget: `app/_home/fx-rates-widget.tsx`**

- `"use client"` — `useEffect` içinde `/api/fx-rates` çağırır.
- 3 durum: loading (spinner), error (AlertCircle + mesaj), success (3 satır kur listesi).
- Sayılar `Intl.NumberFormat("tr-TR")` ile Türk formatında: TRY pairleri 2 ondalık, parity 4 ondalık.
- Kart başlığının altında TCMB bülten tarihi (`sourceDate`) gösterilir.
- `tabular-nums` ile rakamlar hizalı.

### Bilinen Kısıtlar
- TCMB **resmi tatillerde** yayın yapmaz; o günlerde widget bir gün eski veriyi gösterir (her yerde öyle oluyor, dert değil).
- Hafta sonu `today.xml` cuma verisini döndürür, sorun değil.

### Henüz Yapılmayanlar (Sonraki Sürümde)
- Kurun yönü (↑/↓ önceki güne göre) badge'i.
- Banknote / Forex Buying değerlerini de gösterme opsiyonu.
- Resmi tatil listesi entegrasyonu (TCMB tatil günleri).

---

## Faz 3b — Takvim: Outlook Event Overlay ✅

### Amaç
Outlook (MS Graph delegated) event'lerini takvim üzerinde göstermek; kullanıcının seçtiği günün etkinliklerini liste halinde altına dökmek.

### Yapılan Değişiklikler

**1. `lib/msgraph/calendar.ts`** — `getEventsInRange(userId, fromUtcIso, toUtcIso)` helper'ı.
- `/me/calendarView` endpoint'i kullanılır (recurring event'leri otomatik occurrence'lara açar).
- `URLSearchParams` `$` karakterini encode ettiği için `replace(/%24/g, "$")` ile geri çevriliyor — Graph aksini reddediyor.
- `start.dateTime` UTC olarak okunup ISO Z formatına normalize ediliyor.

**2. `app/api/calendar/events/route.ts`** — `GET ?from=&to=`.
- `auth.getUser()` ile kullanıcı, `getEventsInRange(user.id, ...)` ile event'ler.
- `MsTokenNotFoundError` / `MsReconsentRequiredError` → `412` + Türkçe mesaj.

**3. `app/_home/calendar-widget.tsx`** — controlled month, event fetch, dot modifier.
- `month` state'i + `onMonthChange` ile ay değişiminde fetch tekrar tetiklenir; `AbortController` ile eski request iptal.
- `modifiers={{ hasEvent: eventDays }}` + `modifiersClassNames` ile event olan günlere `after:` pseudo-element ile küçük dot.
- Seçili günün event'leri saat + subject (+ konum) olarak listelenir; başlık tıklanınca `webLink` yeni sekmede açılır.

---

## Faz 5a — Microsoft Graph Delegated Altyapısı ✅

### Amaç
Hem Calendar hem To Do widget'larının ortak kullanacağı, kullanıcı bazlı (delegated) MS Graph altyapısını kurmak. App-only (sadece e-posta gönderme) flow'u da aynı paterne refactor edildi.

### Mimari

```
Kullanıcı login (Azure SSO)
   │  scopes: openid profile email offline_access Calendars.ReadWrite Tasks.ReadWrite
   ▼
app/auth/callback → provider_refresh_token + access_token capture
   ▼
user_ms_tokens tablosu (Supabase, RLS = service role only)
   ▼
lib/msgraph/user-client.ts
   • getUserAccessToken(userId) — DB'den token, expire'a yakınsa refresh
   • graphUserFetch(userId, path, init?) — /me/... çağrıları
   • In-memory dedup map → aynı kullanıcı için paralel refresh tek isteğe toplanır
   • invalid_grant → DB'den sil + MsReconsentRequiredError
```

### Eklenen Dosyalar
- `lib/msgraph/token-store.ts` — Supabase service-role ile `user_ms_tokens` upsert/get/delete.
- `lib/msgraph/user-client.ts` — refresh + graphUserFetch + custom errors.
- `lib/msgraph/app-client.ts` — Application permission'lar için `getAppAccessToken` + `graphAppFetch` (client-credentials flow, in-memory cache, 60 sn güvenlik payı).

### Refactor
- `lib/email/email-service.ts` — kendi token logic'i silindi, `graphAppFetch("/users/${MAIL_FROM}/sendMail", ...)` kullanır oldu. ~60 satır azaldı, davranış değişmedi.

### Token Saklama
- DB: `user_ms_tokens` (user_id PK, access_token, refresh_token, access_token_expires_at, scope, updated_at).
- RLS: Sadece `service_role` erişebilir; client tarafına token sızdırılmaz.
- Şifreleme: v1'de plaintext (sadece service-role accessible). v2'de Vault/pgsodium düşünülebilir.

### Azure App Permissions
- **Delegated:** `User.Read`, `Calendars.ReadWrite`, `Tasks.ReadWrite`, `offline_access`.
- **Application:** `Mail.Send` (mevcut email servisi için).
- Tenant'ta user consent açık; admin consent gerekmedi.

---

## Faz 5 — Notlarım: Microsoft To Do Entegrasyonu ✅

### Amaç
Placeholder "Notlarım" widget'ını Microsoft To Do üzerinden gerçek task CRUD'a çevirmek. Kullanıcının default Tasks listesini kirletmemek için ayrı bir **"RT Enerji"** listesi oluşturulup kullanılır.

### Yapılan Değişiklikler

**1. `lib/msgraph/todo.ts`**
- `getOrCreateRtEnerjiListId(userId)` — `/me/todo/lists?$filter=displayName eq 'RT Enerji'`. Yoksa `POST /me/todo/lists`.
- In-memory `Map<userId, listId>` cache — list ID'leri stabil; 404 gelirse invalidate + 1 retry.
- `listTasks` / `createTask` / `updateTask` / `deleteTask` — `/me/todo/lists/{listId}/tasks` üzerinden.
- Status: `notStarted` ↔ `completed` toggle (diğer Graph status'leri de kabul edilir).

**2. API Route'ları**
- `app/api/todo/tasks/route.ts` — `GET` (list), `POST` (create) `{ title, body? }`.
- `app/api/todo/tasks/[taskId]/route.ts` — `PATCH` `{ title?, body?, status? }`, `DELETE`.
- Hata kategorileri: `reauth_required` / `reconsent_required` → 412.

**3. `app/_home/notes-widget.tsx`**
- Optimistic UI: toggle/delete anında uygulanır, hata olursa revert + sonner toast.
- `pendingIds` ref ile aynı task'a paralel işlem engellenir.
- Sıralama: aktifler önce (en yeni üstte), tamamlananlar altta line-through.
- Çöp kutusu sadece hover'da görünür (kazara silmeyi azaltır).
- ScrollArea h-64 (200+ task'a kadar pürüzsüz).

### Cross-Device Senkron
Microsoft To Do uygulamalarında (web/desktop/mobile) "RT Enerji" listesi otomatik görünür ve iki yönlü senkron çalışır.

---

## Faz 6 — Sidebar Linki + Cleanup ✅

### Yapılan Değişiklikler

**1. `components/nav-home.tsx` (yeni)**
- Tek item'lı `SidebarGroup` — Home icon + "Ana Sayfa" linki.
- `pathname === "/"` ile `isActive` highlighting.

**2. `components/app-sidebar.tsx`**
- `<NavHome />` `SidebarContent`'in **en üstüne** eklendi (NavWorkflow'un üstü).

**3. `components/app-shell.tsx` — Breadcrumb**
- `pathname === "/"` için `BreadcrumbPage`: `"Home"` → `"Ana Sayfa"`.
- Diğer sayfalar için kök `BreadcrumbLink`: `"Home"` → `"Ana Sayfa"` (TR tutarlılığı).

**4. `app/page.tsx` — Metadata**
- `export const metadata: Metadata = { title: "Ana Sayfa | RT Enerji" }` eklendi (browser tab'ı).

### Responsive / Tema
- Grid: mobile/tablet → tek kolon stack, `lg+` → 3 kolon (Calendar 2 + FX 1, Notes 3 full-width).
- Tüm widget'lar shadcn `Card` ve theme-aware tokens (`text-muted-foreground`, `bg-muted`, `border`) kullanır → dark/light otomatik.

### Hâlâ Bekleyen / Sonraki Sürüm
- `app/api/dashboard/workflow-summary` orphan kontrolü (eski page tarafından çağrılıyordu) — gerek varsa Faz 7'de.
- Token şifreleme (Vault / pgsodium) — güvenlik artırımı.
- Calendar widget'ında "Bugüne dön" butonu.
- FX widget'ında ↑/↓ değişim badge'i.
- To Do widget'ında inline edit + body alanı UI'ı.
