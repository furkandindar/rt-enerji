# Onay Kapağı Tamamlama Adımı ve Vekalet Sistemi — Tasarım Planı

> Durum: **Faz A uygulandı (dev + prod). Faz B: B1–B4 tamamlandı (2026-09-05), dev'de uçtan uca test bekliyor. Prod'a alma sırası Bölüm 9'da.**
> İlk taslaktaki "havuz" (`workflow_step_actors`) ve "admin yeniden ata" (Faz 0) fikirleri
> tartışma sonucu **rafa kaldırıldı**; nedenleri Bölüm 3'te. Kalan iş: Faz A (config) + Faz B (vekalet).

---

## 1. Problem

Finans Onay Kapağı'nın (`FINANCE_APPROVAL_COVER`) son adımı (5. adım, `phase = COMPLETION`,
`form_section_key = ykb_signed_pdf`) YKB'nin ıslak imzaladığı taranmış PDF'in yüklendiği
**teknik** bir adımdır. Adım `STATIC_POSITION → F100 (Finans Müdürü)` olarak tanımlı; yani
yükleme yalnızca Elvan Kavas tarafından yapılabiliyor. Elvan izne çıkınca süreçler
`AWAITING_COMPLETION` durumunda kalıyor.

Gelen geri bildirim:

> "Finans Onay Kapağı süreçlerinde taranmış PDF yükleme adımı şu anda yalnızca ilgili
> müdüre atanıyor. Bu adım, süreç bazında belirlenecek yetkili Finans personellerine de
> açılmalıdır." — ayrıca **vekalet sistemi** istendi.

Aynı yapı başka süreçlerde de var (şimdilik kapsam dışı, karar: önce finans):

| Süreç | Completion adımı | Bağlı pozisyon | Kişi |
|---|---|---|---|
| `FINANCE_APPROVAL_COVER` | 5. YKB (ykb_signed_pdf) | F100 Finans Müdürü | Elvan Kavas |
| `ACCOUNTING_APPROVAL_COVER` | 5. YKB (ykb_signed_pdf) | M100 Muhasebe Müdürü | Sevda Çal |
| `COMPARISON_FORM` | 4. YKB (ykb_signed_pdf) | ASIST100 Yönetici Asistanı | Burcu Akdoğan |

### Prod durumu (2026-09-05, read-only sorgu)

| Durum | Adet | Not |
|---|---:|---|
| `AWAITING_COMPLETION` | 30 | Hepsi Elvan'ın yükleme adımında. Onay PDF'i zaten üretilmiş; bekleyen şey yalnız imzalı taramanın arşivlenmesi |
| `PENDING` | 16 | 3. adım (**Finans Müdürü onayı**) Elvan'da → izin boyunca bunlar da durur, yeni açılanlar eklenir (4 Eylül'de tek günde 16 kapak açıldı) |
| `REVISION_REQUESTED` | 13 | Yeniden gönderilince zincir yeniden kurulur → yeni konfigürasyonu alır |
| `COMPLETED` | 101 | Tamamı Elvan yüklemiş; GM onayı → tarama arası medyan 2,1 gün |

**Belirleyici veri:** 176 finans kapağının **tamamı** üç finans personeli tarafından açılmış
(Ümmühan Oğuz 71, Hatice Ceren Arslan 64, Oğuzhan Yılmaz 41). Elvan hiç kapak açmıyor;
yalnız onaylıyor ve tarama yüklüyor.

### Motor kısıtı

Zincir talep oluşturma anında kurulur, her adım tek bir `request_approvals.approver_employee_id`
ile sabitlenir ve dört yerde **birebir** karşılaştırılır: karar route'u
(`app/api/approvals/[id]/route.ts`), tarama yükleme route'u
(`app/api/workflow-completion/upload-signed-pdf/route.ts`), RLS `request_approvals_update`,
view `v_user_pending_approvals`. `ORG_ADMIN` dahil kimse başkasının adımını işleyemez.

---

## 2. Alınan kararlar (2026-09-05)

| # | Konu | Karar |
|---|---|---|
| 1 | Tamamlama adımını kim yapacak | **Talep eden** (`REQUESTER`). Havuz/e-posta yayını yok, formda "tamamlayacak kişi" seçimi yok |
| 2 | Kapsam | Finans + muhasebe kapağı birlikte uygulandı (muhasebe, uygulama sırasında birlikte geçti ve geri alınmadı); mukayese formu sonra |
| 3 | Vekalette imza | Vekil **kendi** imzasını atar + PDF'te "Vekaleten — X adına" etiketi |
| 4 | Vekaleti kim tanımlar | Kişinin kendisi (self-service) + `ORG_ADMIN` |
| 5 | Bugün bekleyen talepler | Dokunulmayacak; mevcut zincirler eski haliyle Elvan'da kalır |
| 6 | Faz 0 (admin yeniden ata) | Yapılmayacak |
| 7 | Vekil aynı zincirde başka adımda da onaycıysa | **İzin ver**; imza "vekaleten" etiketiyle ayrışır |
| 8 | Vekalet kapsamı (bu aşama) | **Yalnız `FINANCE_APPROVAL_COVER`** — süreç seçimi yok, kod tarafında sabit liste |
| 9 | Mukayese formu (`COMPARISON_FORM`) | Kapsam dışı, kullanılmıyor |

---

## 3. Neden "havuz" değil, "talep eden"?

Tartışılan üç seçenek:

| Seçenek | Artı | Eksi |
|---|---|---|
| **a) Havuz = tüm Finans birimi** | Kim müsaitse yükler | Her kapakta 3-4 kişiye e-posta (haftada 30+ kapak → gürültü); yeni tablo + RLS + view + 2 route + bildirim değişikliği |
| **b) Talep açılırken tamamlayıcı seçilsin** | Tek e-posta, mevcut "İlgili Kişiler" seçicisine benzer UX | Talep eden 1 hafta sonra kimin müsait olacağını bilemez; seçilen kişi izindeyse aynı tıkanma; ek form alanı |
| **c) Talep eden tamamlar** ✅ | Kapağı açan zaten takip eden kişi; sıfır konfigürasyon, sıfır gürültü; `TRAVEL_ASSIGNMENT` ile birebir aynı emsal (2026-07-05); motor değişikliği yok | Talep eden izindeyse tıkanır → **Faz B vekalet** (self-service) çözer; Elvan bu adımı artık yapamaz (zaten hiç kapak açmıyor, kâğıt talep edene gider) |

(c) seçildi. Havuz fikri, ileride birden çok kişinin gerçekten aynı adımı sahiplenmesi gereken
bir süreç çıkarsa (`workflow_initiators` deseniyle `workflow_step_actors`) geri açılabilir.

---

## 4. Faz A — Tamamlama adımı talep edene (config-only) ✅ UYGULANDI

> **2026-09-05:** `FINANCE_APPROVAL_COVER` ve `ACCOUNTING_APPROVAL_COVER` 5. adımı dev + prod'da
> `REQUESTER` / `static_position_id = NULL` yapıldı. Read-only doğrulama: 3. adımlar STATIC_POSITION
> kaldı, başka workflow'da yan etki yok. Arşiv: `sql/feature_cover_completion_by_requester.sql`.
> Dokümanlar güncellendi: `workflow-approvers-prod.md`, `workflow-approvers-dev.md`.

`sql/feature_travel_completion_by_traveler.sql` ile aynı desen. **Kod değişikliği gerekmez**;
motorun ilgili yerleri zaten onaycı tipinden bağımsız çalışıyor:

| Yer | Neden etkilenmiyor |
|---|---|
| `createApprovalChain` | `REQUESTER` tipi için `determineApprover` talep edeni döner; yalnız `step_order = 1` auto-approve edilir; ileriye dönük auto-approve yalnız `SIGN_ONLY` adımlar için (bu adım `FILL_AND_SIGN`) |
| PATCH forward auto-approve | Aynı `SIGN_ONLY` filtresi → adım PENDING kalır |
| PATCH 3e (`ykb_signed_pdf`) | `action_type + form_section_key` ile çalışır, onaycı tipine bakmaz |
| `upload-signed-pdf` route | `approver_employee_id = current user` → talep eden eşleşir |
| Onay detayı UI (`isYkbSignedPdfForm`) | `action_type + form_section_key` |
| PDF şablonu (`finance-approval-cover-pdf-template.tsx`) | ykb satırı zaten imza kolonlarından hariç (`isYkbSignedPdf` + `approver_type === 'STATIC_POSITION'` filtresi) |
| `getApproverDisplayName` / aktivite logu | `phase + form_section_key` → yine `RAMAZAN TAŞ` |
| Statü etiketi | `AWAITING_COMPLETION = "RT Onayı"` doğru kalır (hâlâ YKB ıslak imzası bekleniyor) |

### Yapılacak (kullanıcı çalıştırır — `workflow_steps` yazma kuralı)

`FINANCE_APPROVAL_COVER` workflow'unun `phase = 'COMPLETION' AND form_section_key = 'ykb_signed_pdf'`
adımında:

- `approver_type` → `'REQUESTER'`
- `static_position_id` → `NULL`
- `name` → öneri: `'Yönetim Kurulu Başkanı (Tarama — Talep Eden)'` (isteğe bağlı; UI'da adım adı olarak görünür)

Doğrulama: ilgili satırda `approver_type = REQUESTER`, `static_position_id IS NULL`.
Script `sql/feature_cover_completion_by_requester.sql` olarak arşivlendi.

### Etki

- Yalnız **yeni açılan** talepler ve **yeniden gönderilen** revizeler (yeni cycle) etkilenir.
- Mevcut 30 `AWAITING_COMPLETION` + 16 `PENDING` talep eski zincirinde kalır (karar 5).
- Talep eden completion'a girince iki bildirim alır ("onaylandı" + "onayınızı bekliyor") —
  travel ile aynı, bilinen davranış. İstenirse `notifyApprover` metni ykb adımı için
  "YKB imzalı taramayı yükleyin" olarak özelleştirilebilir (küçük, opsiyonel).
- `docs/workflow-approvers-prod.md` ve `docs/workflow-approvers-dev.md` tablosu güncellenmeli.
- Dev ortamına da aynı script uygulanmalı (parite).

---

## 5. Faz B — Vekalet (`approval_delegations`)

Genel çözüm: izindeki **her** onaycı (Finans Müdürü'nün 3. adım onayı, GM, talep edenin
kendi tamamlama adımı…) için geçerli.

### Ortak çekirdek (Faz B ile gelir)

1. `request_approvals.acted_by_employee_id uuid NULL` — işlemi fiilen yapan. `NULL` = atanan
   onaycının kendisi (eski kayıtlar için migration yok). `approver_employee_id` "adına" olarak
   değişmez.
2. `public.can_act_on_approval(p_approval_id uuid) returns boolean` (SECURITY DEFINER, STABLE)
   + TS karşılığı `lib/workflow/acting-rights.ts`. İki dal: kendisi VEYA aktif vekil.
   RLS `request_approvals_update`, `v_user_pending_approvals`, PATCH route ve upload route
   birebir karşılaştırma yerine bunu çağırır.
3. `v_user_approval_history`'ye `OR acted_by_employee_id = get_current_employee_id()`.

### Veri modeli

```sql
create table public.approval_delegations (
  id                     uuid primary key default gen_random_uuid(),
  delegator_employee_id  uuid not null references public.employees(id),
  delegate_employee_id   uuid not null references public.employees(id),
  starts_at              timestamptz not null,
  ends_at                timestamptz not null,
  workflow_definition_id uuid not null references public.workflow_definitions(id), -- karar 8: bu aşamada zorunlu, yalnız finans kapağı
  reason                 text,
  status                 text not null default 'ACTIVE' check (status in ('ACTIVE','CANCELLED')),
  source                 text not null default 'MANUAL' check (source in ('MANUAL','LEAVE_REQUEST')),
  leave_request_id       uuid references public.leave_requests(id),       -- Faz 2 E2 için hazır
  created_by_user_id     uuid not null references public.app_users(id),
  created_at             timestamptz not null default now(),
  check (delegator_employee_id <> delegate_employee_id),
  check (ends_at > starts_at)
);
-- indeks: (delegator_employee_id, status, starts_at, ends_at)
-- Kapsam kısıtı DB'de değil kod tarafında: lib/workflow/delegation-scope.ts →
-- DELEGATION_ALLOWED_WORKFLOWS = ['FINANCE_APPROVAL_COVER']; API bu liste dışını reddeder,
-- UI süreç seçici göstermez (tek seçenek). Yeni süreç açmak = listeye kod ekle.
-- partial unique: aynı delegator için aynı anda tek ACTIVE vekalet
```

### Çözümleme: işlem anında, dinamik (satır taşınmaz)

Satır delegator'da kalır; vekil `can_act_on_approval` ile görür ve işler
(`acted_by = vekil`). Zincir kurulurken değişiklik yok. Vekalet bitince / erken dönüşte
satırlar kendiliğinden geri döner; iptal izini sürmek gerekmez.

### Kurallar

- Transitif değil (vekilin vekili yok).
- Vekil = talep sahibi ise o talepte işlem yapamaz (self-approval engeli).
- Vekil aynı zincirde başka adımda zaten onaycıysa: **izin** (karar 7). PDF'te iki imza ayrı
  kolonlarda görünür; vekaleten olanın altında etiket vardır.
- **Vekaleten işlemde ileriye dönük otomatik onay kapalı.** Motor bugün bir onaycı onay
  verince aynı kişinin ilerideki `SIGN_ONLY` adımlarını otomatik onaylıyor
  (`app/api/approvals/[id]/route.ts`, `forwardAutoApproveIds`). Vekil olarak atılan imza bu
  mekanizmayı tetiklememeli; vekil kendi adımına sırası gelince ayrıca imza atar. Aksi hâlde tek
  tıkla "Elvan adına + kendi adına" iki imza oluşurdu. Uygulama: `acted_by` dolu (vekaleten)
  ise forward-approve bloğu atlanır.
- Delegator ve vekil aynı anda PENDING görürse (dönüş günü) ilk işlem kazanır; route'taki
  `status = PENDING` guard'ı ikinciyi zaten reddeder.

### İmza / PDF (karar 3)

Vekil kendi imzasını atar; imza kolonunun altına "Vekaleten — Elvan Kavas adına" etiketi.
`generate-request-pdf.ts` imzayı `approver → employees.signature_*` üzerinden çekiyor;
`acted_by` doluysa oradan çekmeli. Kapak şablonlarının ortak imza bandı
(`approval-cover-shared.tsx`) tek noktadan güncellenir.

### UI (karar 4)

- Profil → "Vekalet ver": vekil seç (aktif + `app_users` bağı olan çalışanlar), tarih aralığı,
  gerekçe. Kapsam bu aşamada sabit ("Finans Onay Kapağı") — seçici yok, bilgi metni var.
  Kendi aktif/geçmiş vekaletlerini görür, iptal eder.
- Admin: `position-assignments` benzeri "Vekaletler" sayfası (herkes adına tanımla/iptal).
- Onay detayı: "Elvan Kavas adına vekaleten işlem yapıyorsunuz" şeridi.
- Talep sahibi görünümü: adım kartında "Onaycı: Elvan Kavas (vekil: Y)".

### Bildirim

- Aktif vekalet varken delegator'a giden `APPROVAL_REQUIRED` vekile de gider (delegator'a
  da gitmeye devam eder). `buildApproverCtaPath` approval id'yi `approver_employee_id` ile
  arıyor → vekil için delegator'ın satırını bulacak şekilde genişletilir.
- Vekalet başladığında vekile "üzerinde bekleyen N talep var" özeti (tek e-posta).

### Faz 2 E2 bağlantısı

`faz2-roadmap.md` E2 "müsaitlik-duyarlı onay": onaylanan yıllık izin → vekalet önerisi /
otomatik kayıt (`source = LEAVE_REQUEST`). Bu fazda yalnız kolonlar konur, otomasyon E2'de.

### Alt-fazlar (her birinde dur, onay bekle)

| Alt-faz | Kapsam |
|---|---|
| B1 — DB ✅ dev'de uygulandı (prod bekliyor) | **`sql/feature_approval_delegation_v1.sql`** — tablo + EXCLUDE (btree_gist, çakışan aktif vekalet engeli), `acted_by` kolonu, 4 fonksiyon (`is_active_delegate_for`, `approval_stored_approver`, `can_act_on_approval`, genişletilmiş `is_approver_for_request`), `request_approvals` select/update RLS, 2 view (`security_invoker = on`, `acted_by` kolonu sona eklendi), `approval_delegations` RLS. Önce dev, sonra prod — kullanıcı çalıştırır |
| B2 — Backend ✅ kodlandı (2026-09-05, typecheck+lint+build temiz) | `lib/workflow/delegation.ts` (`resolveActingRights` → RPC `can_act_on_approval`, `DELEGATION_ALLOWED_WORKFLOW_CODES`, aktif vekil lookup); PATCH karar + revize isteği + tarama yükleme route'ları tek yetki kaynağına bağlandı, `acted_by_employee_id` yazılıyor, vekaleten işlemde forward auto-approve kapalı; GET `/api/approvals/[id]` yanıtına `viewer {employee_id, can_act, is_delegate, on_behalf_of}`; pending/history yanıtına `viewer_employee_id`; dashboard sayacı view'a bağlandı; `/api/delegations` (GET/POST), `/api/delegations/[id]` (PATCH iptal/kısalt), `/api/delegations/options`; `notifyApprover` vekile fan-out + `notifyDelegationAssigned/Cancelled`; iki yeni bildirim tipi → **`sql/feature_approval_delegation_v1b_notification_types.sql`** (dev'e uygulanacak); `database.types.ts` elle güncellendi (dev'den üretilen tiplerle birebir) |
| B3 — Frontend ✅ kodlandı (2026-09-05, typecheck+lint+build temiz) | `components/delegations/` (sheet form: self/admin modu, datetime-local → `istanbulInputToTimestamptz`; tablo + iptal dialog'u; tipler), Profil → "Vekalet" kartı (`app/profile/_components/delegation-manager.tsx`: verdiğim / bana verilen), admin `/delegations` sayfası (ORG_ADMIN, sidebar "Vekaletler", breadcrumb), onay detayında mor "Vekaleten işlem yapıyorsunuz — X adına" şeridi + `viewer.can_act=false` ise aksiyonlar gizli, bekleyen/geçmiş listelerinde "Vekaleten" rozeti, `getApproverDisplayName` ve süreç logu "Vekil (Onaycı adına vekaleten)" (talep sahibi tarafı dahil) |
| B4 — PDF + docs ✅ kodlandı (2026-09-05) | `generate-request-pdf.ts`: `acted_by` join; onay vekaleten verildiyse imza VEKİLİN imzası (delegator'ın imza metni asla basılmaz) + `SignatureInfo.onBehalfNote`; finans + muhasebe kapak şablonlarında imzanın altında "Vekaleten: <vekil>" etiketi (ad/ünvan kolonu onaycınındır). Diğer şablonlar: imza yine vekilin olur, etiket render'ı kapsam açılınca eklenir. Docs: `docs/workflows/README.md` Vekalet bölümü, ONBOARDING §6.3/§6.6/§11, `genel-bakis.md` §6, CLAUDE.md mimari çıpası |

---

## 6. Bugün bekleyen talepler (karar 5: dokunulmuyor)

- 30 `AWAITING_COMPLETION`: onay PDF'i üretilmiş, ödeme sistem tarafından bloklanmıyor;
  bekleyen tek şey imzalı taramanın arşivi. Elvan dönünce yükler.
- 16 `PENDING` (3. adım): gerçek onay bekliyor; Elvan dönene kadar birikir. Şirket
  "bekleyemez" derse tek seferlik data-fix SQL deseni hazır
  (`sql/fix_stuck_approvals_mudur_test.sql`) — yalnız istek üzerine.

---

## 7. Açık sorular — KAPANDI (2026-09-05)

Bölüm 2'deki 7-9 numaralı kararlarla kapandı. Faz B'nin önünde karar bekleyen konu kalmadı.

---

## 8. Prod'a alma sırası (deploy günü)

1. Supabase prod SQL Editor: `sql/feature_approval_delegation_v1.sql` (tek transaction) → dosya sonundaki doğrulama SELECT'leri.
2. Aynı editor: `sql/feature_approval_delegation_v1b_notification_types.sql` (transaction DIŞI, iki `ALTER TYPE`).
3. Vercel deploy (B2–B4 kodu). SQL kod'dan önce olmalı: yeni kod `acted_by_employee_id` yazar ve `can_act_on_approval` RPC'sini çağırır.
4. Duman testi: bir kullanıcı Bekleyen Onaylar'ı açar (sayı değişmemeli), Profil → Vekalet kartı görünür, admin `/delegations` açılır.
5. İlk gerçek vekalet: ilgili müdür profilinden tanımlar; vekilin listesinde "Vekaleten" rozeti görünür.

## 9. Sıralama

| Faz | Kapsam | Büyüklük | Bağımlılık |
|---|---|---|---|
| A ✅ | Finans + muhasebe kapağı completion → `REQUESTER` (config + docs) — uygulandı 2026-09-05 | çok küçük | — |
| B | Vekalet (B1→B4), kapsam yalnız finans kapağı | büyük | — (A'dan bağımsız); **başlamaya hazır** |
