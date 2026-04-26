# Ana Sayfa Yeniden Tasarımı

Login sonrası landing page'i `/org-chart`'tan `/` (ana sayfa) a çevirmek ve burada takvim, döviz kurları ve kişisel notlar widget'larını sunmak için yapılan değişikliklerin kayıt dokümanıdır. Her faz tamamlandıkça bu dosya güncellenir.

## Amaç
- Kullanıcı sisteme giriş yaptığında `/org-chart` yerine `/` 'a düşsün.
- Ana sayfada üç widget bulunsun:
  1. **Takvim** — sade görsel takvim (v1). Sonraki sürümde izin/onay tarihleri işaretlenebilir.
  2. **Döviz Kurları** — TCMB kaynaklı EUR/TRY, USD/TRY, EUR/USD kurları.
  3. **Notlarım** — kullanıcıya özel, RLS korumalı kişisel notlar (title + body, v1).
- Sidebar'a "Ana Sayfa" linki eklenecek.
- `/org-chart` erişilebilir olmaya devam eder — sadece default landing değil.

## Faz Planı

| Faz | İçerik | Durum |
|---|---|---|
| 1 | Redirect'leri `/` a çevir | ✅ Tamamlandı |
| 2 | Ana sayfa iskeleti (3 placeholder widget) | ✅ Tamamlandı |
| 3 | Takvim widget'ı (sade) | ✅ Tamamlandı |
| 4 | Döviz kurları (TCMB + dinamik TTL cache) | ✅ Tamamlandı |
| 5 | Notlarım (DB + API + UI) | ⏳ |
| 6 | Sidebar linki + cleanup | ⏳ |

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

## Faz 5 — Notlarım Widget'ı ⏳

_Uygulama sırası geldiğinde güncellenecek. SQL kullanıcı tarafından Supabase SQL Editor'da çalıştırılacak._

---

## Faz 6 — Cleanup ⏳

_Uygulama sırası geldiğinde güncellenecek._
