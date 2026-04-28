# Mukayese Formu Süreci

> **Workflow Code:** `COMPARISON_FORM`
> **Versiyon:** 1.1
> **Tarih:** 2026-04-26
> **Durum:** Faz 1–4 tamamlandı, end-to-end test bekleniyor

---

## 1. Genel Bakış

Mukayese Formu, bir proje veya talep için birden fazla tedarikçiden alınan tekliflerin **matris formatında** karşılaştırılmasını sağlayan süreçtir. Talep eden, satır olarak mal/hizmet kalemlerini, sütun olarak da firma tekliflerini girer; her hücreye o firma için birim fiyat yazar. Form genelinde tek bir para birimi seçilir (TRY/USD/EUR) ve oluşturma anındaki TCMB pariteleri form üzerinde snapshot olarak saklanır.

Süreç 4 adımdan oluşur. İlk 3 adım (Talep Eden, Birim Müdürü, Genel Koordinatör) standart `APPROVAL` fazındadır. Son adım, **Yönetim Kurulu Başkanı (YKB) sistemi kullanmadığı için** `COMPLETION` fazına alınmıştır: Genel Koordinatör onayından sonra talep `AWAITING_COMPLETION` durumuna geçer; **YKB Asistanı** formun çıktısını alıp YKB'ye fiziksel olarak imzalattıktan sonra taranmış imzalı PDF'i sisteme yükler ve süreç `COMPLETED` durumuna geçer.

### Özellikler

| Özellik | Değer |
|---------|-------|
| Workflow Code | `COMPARISON_FORM` |
| is_restricted | `false` (herkes başlatabilir) |
| Toplam Adım | 4 |
| Form Dolduran | 1. adım (matris) + 4. adım (imzalı PDF) |
| Çok Fazlı (V4) | ✅ Evet (`APPROVAL` + `COMPLETION`) |
| Para Birimi | Form genelinde tek seçim (TRY/USD/EUR) |
| FX Snapshot | Oluşturma anında TCMB'den çekilir |

---

## 2. Form Yapısı

### 2.1 Başlık (Header)

| Bölüm | Alan | Tip | Açıklama |
|-------|------|-----|----------|
| Sol Üst | Proje / Başlık | TEXT | Mukayesenin hangi proje için yapıldığı |
| Sol Üst | EUR/TRY, USD/TRY, EUR/USD | NUMERIC | TCMB'den çekilen anlık pariteler (snapshot) |
| Sol Üst | Form Para Birimi | ENUM | TRY / USD / EUR — tüm fiyatlar bu birimde girilir |
| Sağ Üst | Form Tarihi | DATE | Default `CURRENT_DATE` |
| Sağ Üst | Düzenleyen | TEXT | Formu düzenleyen kişinin adı |
| Sağ Üst | Açıklama / Notlar | TEXT | Serbest metin |

### 2.2 Matris (Satırlar × Sütunlar)

**Satırlar (`mukayese_items`):** Her satır bir mal/hizmet kalemini temsil eder.
- `row_type = ITEM` → `description`, `quantity`, `unit (ADET/SET/GUN)` zorunlu
- `row_type = SUBTOTAL` → "Ara Toplam" satırı; bu satıra ait fiyat kaydı oluşturulmaz, runtime'da bir önceki ara toplamdan sonraki `ITEM` satırlarının toplamı hesaplanır
- Bir formda birden fazla `SUBTOTAL` satırı olabilir
- `SUBTOTAL` satırlarında, 2'den fazla firma varsa: en düşük toplama sahip firma yeşil, en yüksek toplama sahip firma kırmızı olarak gösterilir (UI/PDF tarafında)

**Sütunlar (`mukayese_suppliers`):** Her sütun teklif alınan bir firmayı temsil eder.
- `company_name` zorunlu
- Footer alanları (firma başına): `payment_terms`, `technical_description`, `delivery_time`, `contact_name`, `contact_phone`

**Hücreler (`mukayese_prices`):** Her `(item, supplier)` kombinasyonu için `unit_price`. Toplam fiyat (`unit_price × quantity`) runtime'da hesaplanır, kolon olarak tutulmaz.

### 2.3 Tablo Altı Özet

- KDV'siz Toplam Tutar: runtime hesaplanır
- KDV Oranı: `kdv_rate` (default `20.00`, kullanıcı değiştirebilir)
- KDV Dahil Toplam Tutar: runtime hesaplanır

### 2.4 Footer (Hazırlayan Bilgileri)

| Alan | Tip | Açıklama |
|------|-----|----------|
| Adı Soyadı | TEXT | Formu hazırlayan |
| Şirket | TEXT | |
| Konu | TEXT | |
| Talep İçerik | TEXT | |
| Talep Miktarı / Tutarı | TEXT | Text — örn: "mukayese tablosunda yazan miktarlar kadardır" |
| Talep Nedeni | TEXT | |

---

## 3. Onay Zinciri

| Adım | Onaycı | approver_type | action_type | form_section_key | phase | Not |
|------|--------|---------------|-------------|------------------|-------|-----|
| 1 | Talep Eden | `REQUESTER` | `FILL_AND_SIGN` | `comparison_matrix` | `APPROVAL` | Matrisi doldurur + imzalar; opsiyonel ek dosya yükleyebilir |
| 2 | Birim Müdürü | `UNIT_HEAD` | `SIGN_ONLY` | `null` | `APPROVAL` | Talep eden çalışanın bağlı olduğu birim müdürü |
| 3 | Genel Koordinatör | `STATIC_POSITION` | `SIGN_ONLY` | `null` | `APPROVAL` | Sabit pozisyon |
| 4 | YKB Asistanı | `STATIC_POSITION` | `FILL_AND_SIGN` | `ykb_signed_pdf` | `COMPLETION` | YKB'nin fiziksel imzaladığı PDF'i yükler; `requests.pdf_path` overwrite edilir |

> 3. adım onaylandığında talep otomatik olarak `AWAITING_COMPLETION` durumuna geçer. 4. adımı tamamlamak yalnızca **imzalı PDF yükleme** anlamına gelir; YKB Asistanı'nın imza paneli süreçte audit trail olarak yer alır ancak PDF üzerine basılmaz.

---

## 4. Veri Modeli

4 tablo: `mukayese_requests` (header + footer), `mukayese_items` (satırlar), `mukayese_suppliers` (sütunlar), `mukayese_prices` (hücreler). Tam SQL için bkz. [`sql/comparison_form_schema.sql`](../../sql/comparison_form_schema.sql).

Talep oluşturma atomik bir RPC üzerinden yapılır: [`sql/comparison_form_rpc.sql`](../../sql/comparison_form_rpc.sql) → `create_mukayese_request_atomic(...)` fonksiyonu `requests + mukayese_requests + N items + M suppliers + N×M prices` insertlerini tek transaction içinde yürütür. Onay zinciri (`request_approvals`) RPC kapsamı dışındadır; backend RPC'den dönen `request_id` ile `createApprovalChain(...)` çağırır, başarısızlık durumunda `DELETE FROM requests WHERE id = ...` ile geri alır (CASCADE sayesinde mukayese_* alt tabloları da temizlenir).

```
requests (1) ──┬─ (1) mukayese_requests
               │        ├─ (n) mukayese_items     ──┐
               │        └─ (n) mukayese_suppliers ──┤
               │                                    └─ (n) mukayese_prices  (item × supplier)
               └─ (n) request_approvals
```

### Önemli Kısıtlamalar

- `mukayese_items`: `row_type = ITEM` ise `description/quantity/unit` zorunlu; `SUBTOTAL` ise null olmalı
- `mukayese_prices`: yalnızca `ITEM` satırları için kayıt oluşturulur (uygulama katmanında doğrulanır)
- `mukayese_requests.fx_*` alanları snapshot'tır; sonradan değişmez
- `kdv_rate` 0–100 arası olmalı

---

## 5. Implementasyon Planı

### Faz 1: Veritabanı ✅
- [x] `sql/comparison_form_schema.sql` — 4 tablo + RLS + `workflow_definitions` + `workflow_step_attachments` (kullanıcı SQL Editor'de çalıştırır)
- [x] `sql/comparison_form_rpc.sql` — `create_mukayese_request_atomic(...)` RPC fonksiyonu (plan üstü eklendi; tek transaction'lı atomik insert için)
- [x] Kullanıcı `workflow_steps` INSERT'lerini elle yazar (şablon SQL dosyasında)

### Faz 2: Backend ✅
- [x] `lib/workflow/types.ts` — `MukayeseRequest`, `MukayeseItem`, `MukayeseSupplier`, `MukayeseCellPrice` tipleri + `MukayeseCurrency`, `MukayeseUnit`, `MukayeseRowType` enum'ları + `CreateMukayeseInput` (header + items + suppliers + prices)
- [x] `app/api/comparison-form/route.ts` — POST (RPC üzerinden atomik insert + `createApprovalChain` + ilk onaycıya bildirim) ve GET (kullanıcının taleplerini matris ile birlikte listeler)
- [x] `app/api/comparison-form/upload-signed-pdf/route.ts` — **(plan üstü eklendi)** YKB Asistanı'nın taranmış imzalı PDF'i yüklediği dosya endpoint'i; storage'a yazıp `pdf_path` döner. Onay PATCH çağrısı bu path'i `ykb_signed_pdf_path` olarak gönderir
- [x] `app/api/approvals/[id]/route.ts` — `form_section_key = 'ykb_signed_pdf'` dalı: `requests.pdf_path` overwrite + COMPARISON_FORM için final PDF auto-generation atlanır (taramayı ezmesin diye)
- [x] `app/api/approvals/route.ts` & `app/api/my-requests/route.ts` — select sorgularına `mukayese_request:mukayese_requests(*, items, suppliers, prices)` join eklendi
- [ ] ~~`app/api/comparison-form/[id]/route.ts` — PATCH (DRAFT iken matris düzenleme)~~ → **Scope dışı bırakıldı.** Mevcut akışta talep doğrudan `SUBMITTED` olarak gönderiliyor; DRAFT/edit modu yok. İleride gerekirse ayrı bir iş olarak eklenir

### Faz 3: Frontend ✅
- [x] `components/comparison-form/matrix-editor.tsx` — **(plan üstü eklendi)** Reusable matris bileşeni; satır/sütun ekle-sil-yeniden sırala, hücre fiyatı, ara toplam, KDV hesabı, min/max renklendirme. `disabled` prop'u ile read-only modda da kullanılabilir
- [x] `app/comparison-form/new/page.tsx` — Header + FX snapshot + `MatrixEditor` + imza paneli + submit (POST `/api/comparison-form`)
- [x] `components/approvals/comparison-form-details.tsx` — Onay panelinde read-only matris görünümü (header + FX + matris + firma footer'ı + talep bilgileri + ilgililer)
- [x] `components/approvals/ykb-signed-pdf-upload.tsx` — 4. adım için imzalı PDF yükleme paneli; **mevcut otomatik üretilmiş PDF'i indir/görüntüle** kontrolleriyle birlikte (asistan tek bileşen üzerinden indir → imzalat → yükle)
- [x] `components/nav-workflow.tsx` — Menüye "Mukayese Formu" eklendi (`/comparison-form/new`)
- [x] `app/my-requests/page.tsx` — Talep sahibi kendi mukayese talebini açtığında `ComparisonFormDetails` ile matris detayını görür

### Faz 4: PDF ✅
- [x] `lib/pdf/comparison-form-pdf-template.tsx` — A3 landscape şablon: logo + FX snapshot + dinamik firma sütunları + SUBTOTAL satırları (amber/Σ) + min/max renklendirme + KDV'li/hariç toplam + firma footer blokları + talep bilgileri + dinamik onay zinciri imzaları
- [x] `lib/pdf/generate-request-pdf.ts` — Workflow code `COMPARISON_FORM` için `ComparisonFormPDFTemplate` dispatch'i

### Sub-faz Kronolojisi (uygulama sırasında bölünme)

Faz 3 frontend işi uygulama sırasında 3.1–3.8 alt parçalarına bölündü; Faz 4 PDF de 3.6 olarak araya alındı:

| # | İçerik |
|---|---|
| 3.1 | Sidebar/menü |
| 3.2 | Form header (proje, tarih, para birimi, FX snapshot, KDV, hazırlayan, imza) |
| 3.3 | Matris UI (`MatrixEditor` componenti — satır/sütun CRUD, hücre fiyatları) |
| 3.4 | Hesaplamalar (subtotal, min/max renklendirme, KDV'li/hariç toplam) |
| 3.5 | Submit (POST `/api/comparison-form` entegrasyonu) |
| 3.6 | A3 PDF template (Faz 4) |
| 3.7 | Approval read-only matris (`ComparisonFormDetails` + my-requests entegrasyonu) |
| 3.8 | Asistan imzalı PDF upload UI (`YkbSignedPdfUpload`) |

---

## 6. API Endpoint'leri

| Method | Path | Açıklama |
|--------|------|----------|
| GET    | `/api/fx-rates` | TCMB pariteleri (mevcut endpoint, form oluşturulurken çekilir) |
| GET    | `/api/comparison-form` | Kullanıcının mukayese taleplerini matris ile birlikte listele |
| POST   | `/api/comparison-form` | Yeni mukayese talebi oluştur — RPC `create_mukayese_request_atomic` çağrılır, ardından `createApprovalChain` + ilk onaycıya bildirim |
| POST   | `/api/comparison-form/upload-signed-pdf` | YKB Asistanı için imzalı taranmış PDF yükleme (multipart/form-data); storage path döner |
| PATCH  | `/api/approvals/[id]` | Onay/red — `form_section_key=ykb_signed_pdf` ise body'deki `ykb_signed_pdf_path` ile `requests.pdf_path` overwrite edilir |

> **Not:** Orijinal planda yer alan `GET /api/comparison-form/[id]` ve `PATCH /api/comparison-form/[id]` (DRAFT edit) endpoint'leri **şu an yok**. Mevcut akışta talep doğrudan `SUBMITTED` olarak gönderiliyor; detay görüntüleme `my-requests` ve `approvals` listelerindeki join'ler üzerinden yapılıyor.

---

## 7. Notlar

- **YKB İmzası:** YKB sistemi kullanmadığı için fiziksel imza alınır. Asistanın sistemdeki imzası audit trail'dir, PDF'e basılmaz.
- **PDF Replace:** YKB Asistanı imzalı PDF'i yüklediğinde `requests.pdf_path` o dosyayla değiştirilir (mevcut Kaşeli Belge Onayı pattern'i). COMPARISON_FORM için son adım onayında otomatik final PDF üretimi atlanır — aksi halde taranmış imzalı PDF üzerine yazardı.
- **FX Snapshot:** Oluşturma anında TCMB'den çekilen pariteler `mukayese_requests.fx_*` kolonlarında saklanır; geçmiş PDF üretimleri bu snapshot'ı kullanır.
- **Ara Toplam Renklendirme:** UI ve PDF tarafında, 2'den fazla firma varsa bir ara toplam bloğunda en düşük → yeşil, en yüksek → kırmızı.
- **Kısıtlama Yok:** Şu an `is_restricted = false`. İleride sadece belirli birimlerin başlatması istenirse `workflow_initiators` ile sınırlanabilir.

---

## 8. Plan ↔ Implementasyon Farkları

Uygulama sırasında orijinal plana göre yapılan değişiklikler:

### Eklenenler (plan üstü)

| Dosya / Endpoint | Sebep |
|---|---|
| `sql/comparison_form_rpc.sql` (`create_mukayese_request_atomic`) | Çok tablolu insert için uygulama katmanında manuel rollback yerine Postgres transaction garantisi |
| `app/api/comparison-form/upload-signed-pdf/route.ts` | Asistan upload'ı önce dosyayı storage'a atıp path döner; ardından onay PATCH'i bu path'i kullanır → "approve ediliyor ama dosya yüklenmemiş" race condition'ı engellenir |
| `components/comparison-form/matrix-editor.tsx` (ayrı reusable component) | Hem create page'de editable hem de view tarafında ileride read-only kullanım için |
| `app/my-requests/page.tsx` içinde `ComparisonFormDetails` entegrasyonu | Talep sahibi de matrisi görebilsin diye (orijinal planda yalnızca onaycı tarafı vardı) |

### Atlananlar (scope dışı bırakıldı)

| Plan kalemi | Sebep |
|---|---|
| `GET /api/comparison-form/[id]` | Detay verisi `my-requests` ve `approvals` listelerindeki join'ler üzerinden geliyor; ayrı endpoint'e gerek kalmadı |
| `PATCH /api/comparison-form/[id]` (DRAFT iken matris düzenleme) | Mevcut akışta talep doğrudan `SUBMITTED` olarak gönderiliyor; DRAFT/edit modu yok. İleride gerekirse ayrı bir iş olarak eklenir |
