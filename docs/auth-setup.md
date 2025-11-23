# Authentication Setup - OAuth Callback Fix

## Problem
İlk login denemesinde Azure'a gidiyor, giriş yapıyor ama sonra tekrar `/auth/login`'e atılıyordu. İkinci denemede sorunsuz giriş yapılabiliyordu.

## Neden Oluyordu?
OAuth callback route'u (`/app/auth/callback/route.ts`) eksikti. Azure'dan dönen auth code'u session'a çeviren endpoint yoktu.

**Eski Akış (Hatalı):**
```
User → Azure Login → Azure Callback → / → No cookies yet → Middleware redirect → /auth/login ❌
```

**Yeni Akış (Doğru):**
```
User → Azure Login → Azure Callback → /auth/callback → Exchange Code → Set Cookies → Redirect to / ✅
```

## Yapılan Değişiklikler

### 1. OAuth Callback Route Eklendi
**Dosya:** `app/auth/callback/route.ts`
- Azure'dan dönen `code` parametresini alır
- `exchangeCodeForSession()` ile session oluşturur
- Cookie'leri set eder
- Ana sayfaya redirect eder

### 2. Login Form Güncellendi
**Dosya:** `components/login-form.tsx`
- `redirectTo` değiştirildi: `/` → `/auth/callback`
- Artık Azure callback'i doğru endpoint'e yönlendiriyor

### 3. Hata Sayfası Eklendi
**Dosya:** `app/auth/auth-code-error/page.tsx`
- Auth code exchange başarısız olursa kullanıcıyı bilgilendiren sayfa

## Supabase Dashboard Ayarları

⚠️ **ÖNEMLİ:** Supabase Dashboard'da redirect URL'i eklemeyi unutmayın!

1. Supabase Dashboard → Authentication → URL Configuration
2. **Redirect URLs** bölümüne ekleyin:
   - Development: `http://localhost:3000/auth/callback`
   - Production: `https://your-domain.com/auth/callback`

## Test Etme

1. Uygulamayı başlatın: `npm run dev`
2. `/auth/login` sayfasına gidin
3. "Microsoft ile giriş yap" butonuna tıklayın
4. Azure'da giriş yapın
5. Otomatik olarak ana sayfaya yönlendirilmelisiniz ✅

## Teknik Detaylar

### PKCE Flow
Supabase SSR, güvenlik için PKCE (Proof Key for Code Exchange) flow kullanır:
1. Client → Azure: Login isteği
2. Azure → Callback: Auth code döner
3. Callback → Supabase: Code exchange edilir
4. Supabase → Client: Session cookies set edilir

### Session Management
- Cookies: HTTP-only, secure
- Middleware: Her request'te session validate eder
- Auto-refresh: Expired token'lar otomatik yenilenir

## Kaynaklar
- [Supabase SSR Docs](https://supabase.com/docs/guides/auth/server-side/nextjs)
- [OAuth PKCE Flow](https://supabase.com/docs/guides/auth/social-login)

