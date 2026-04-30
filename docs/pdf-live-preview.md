# PDF Anlık Önizleme (Live Preview)

> Sürecin herhangi bir ara adımında, o ana kadar oluşmuş veriyle PDF üretip
> kullanıcıya gösteren özellik. **Storage'a yazılmaz, DB'ye yazılmaz** —
> sadece okuma + on-the-fly render.

## 1. Amaç

Mevcut sistem yalnızca süreç tamamlandığında / reddedildiğinde otomatik PDF
üretip Supabase Storage'a yüklüyordu. Süreç ortasındaki kullanıcılar (talep
sahibi veya sıradaki onaylayanlar) talebin son halini PDF formatında görmek
istediğinde "PDF Görüntüle" butonu görünmüyordu. Bu özellik bu boşluğu kapatır.

## 2. Mimari Karar: Server-Side On-Demand

Üç olası yaklaşım değerlendirildi:

| Yaklaşım | Karar | Gerekçe |
|---|---|---|
| (A) Server-side on-demand render | **✅ Seçildi** | Mevcut `generateRequestPDF` yeniden kullanılır, tek bakım yüzeyi. |
| (B) Client'tan data POST + server render | Reddedildi | Net tasarruf yok (~30 ms), bayat veri ve şema senkron riski. |
| (C) Tamamen client-side render (`@react-pdf/renderer` browser modu) | Reddedildi | 12+ template refactor, font/logo lojistiği, bundle artışı. |

`@react-pdf/renderer` Node-only API'ler kullanıyor (template'lerde
`path.join(process.cwd(), 'public', 'logo.png')`), bu yüzden render server'da
kalmak zorunda. Detaylı analiz konuşma geçmişinde.

## 3. Akış

```
Browser ──GET /api/requests/[id]/pdf/preview-live──► Next.js Route
                                                       │
                                                       ├─► auth.getUser()
                                                       ├─► yetki kontrolü (requester | approver)
                                                       ├─► generateRequestPDF()  ◄── tek büyük SELECT
                                                       └─► renderToBuffer() (CPU ~0.5-2 sn)
                                                       │
        ◄──── application/pdf, no-store, inline ───────┘
        │
   <iframe> içinde gösterilir
```

**Hiçbir yan etki yok:**
- `requests.pdf_path` güncellenmez
- `request-documents` bucket'ına dosya atılmaz
- Attachment merge edilmez (gelecekte opsiyonel hale getirilebilir)

## 4. Eklenen / Değişen Dosyalar

| Dosya | Değişiklik |
|---|---|
| `app/api/requests/[id]/pdf/preview-live/route.ts` | **Yeni** — on-demand render endpoint'i |
| `components/approvals/approval-detail-sheet.tsx` | "Anlık Önizleme" butonu + ek `PdfViewerDialog` instance |
| `app/my-requests/page.tsx` | Aynı butonun talep sahibi tarafı için eklenmesi |
| `docs/pdf-live-preview.md` | Bu dokümantasyon |

## 5. Buton Görünürlüğü

| Request Status | Anlık Önizleme | Final PDF Görüntüle |
|---|:-:|:-:|
| `DRAFT` | ❌ | ❌ |
| `PENDING` (süreçte) | ✅ | ❌ |
| `AWAITING_COMPLETION` | ✅ | ✅ |
| `APPROVED` | ❌ | ✅ |
| `COMPLETED` | ❌ | ✅ |
| `REJECTED` (pdf_path varsa) | ❌ | ✅ |
| `CANCELLED` | ❌ | ❌ |

> Not: Sistemde `IN_PROGRESS` adında bir status yok; süreç içi durumu
> `PENDING` temsil ediyor. Konuşma planında geçen "IN_PROGRESS" bu nedenle
> `PENDING` olarak uygulanır.

## 6. Yetki Kontrolü

Mevcut `/api/requests/[id]/pdf/preview` route'undakiyle birebir aynı:

1. Authenticated kullanıcı şart (`auth.getUser()`).
2. `app_users` üzerinden `employee_id` çekilir.
3. Kullanıcı ya requester ya da herhangi bir adımın approver'ı olmalı.
4. Aksi halde **403 Forbidden**.

## 7. Performans Notları

| Aşama | Tipik süre |
|---|---|
| HTTP RTT | 50-200 ms |
| Yetki sorgusu | 5-10 ms |
| `generateRequestPDF` SELECT | 10-50 ms |
| `renderToBuffer` (CPU) | 500-2000 ms |
| **Toplam** | **~1-2 sn** |

DB yükü ihmal edilebilir (PK lookup + indexli LEFT JOIN'ler). CPU pahalı
kısım. Spam tıklama riskine karşı frontend'de buton açıldıktan sonra
disable edilir (PdfViewerDialog kapanana kadar tekrar tetiklenmez).

## 8. Bilinçli Kapsam Dışı Bırakılanlar

Aşağıdaki maddeler **şimdilik dahil edilmedi**, ileride istenirse eklenebilir:

- **Attachment merge:** Önizleme yalnızca workflow PDF'ini gösterir, ek dosyalar
  birleştirilmez. Eklemek için route'a `?attachments=1` query param + mevcut
  `mergeAttachments` çağrısı yeterli olur. Ek dosyalar storage'dan indirildiği
  için süreyi 2-5 sn'ye çıkarabilir.
- **TASLAK / DRAFT watermark:** Önizleme PDF'i ile final PDF görsel olarak
  ayrılmadı. İstenirse template'lere paylaşılan bir overlay component'i
  eklenebilir (`<Watermark text="TASLAK" />`).
- **Response cache:** Aynı talep için 30-60 sn'lik in-memory veya HTTP cache
  eklenebilir; ancak veri sürekli değiştiği için varsayılan olarak `no-store`.
- **Rate limiting:** Şu an sadece UI tarafında naive disable var. Yoğun
  kullanımda IP/user başına server-side throttle (örn. dakikada 10) düşünülebilir.
- **Tamamen client-side render:** En "lokal" senaryo. Fakat 12+ template'in
  refactor'ı ve font/logo client'a taşınması gerekir; ROI düşük.

## 9. Test Edilmesi Önerilen Senaryolar

1. PENDING durumdaki bir talep için önizleme — onaylanmamış adımlar imzasız.
2. Yarısı onaylanmış (örn. 2/4) bir talep — onaylananlar imzalı, kalanlar boş.
3. AWAITING_COMPLETION — hem önizleme hem final butonu görünmeli.
4. COMPLETED — önizleme butonu **görünmemeli**.
5. Yetkisiz kullanıcı (ne requester ne approver) → 403.
6. Mukayese formu (A3 landscape) gibi ağır template'lerde render süresi.
7. Üst üste hızlı tıklamada UI throttle çalışıyor mu.
8. Önizleme sonrası DB'de `pdf_path`'in değişmediği, storage'da yeni dosya
   oluşmadığı doğrulanmalı.

## 10. İlgili Dosyalar (Referans)

- `lib/pdf/generate-request-pdf.ts` — ana üretici (yeniden kullanılıyor)
- `lib/pdf/merge-attachments.ts` — şimdilik bypass
- `lib/storage/upload-request-pdf.ts` — şimdilik bypass
- `app/api/requests/[id]/pdf/preview/route.ts` — final PDF önizleme (storage'dan)
- `components/pdf-viewer-dialog.tsx` — iframe wrapper (değişiklik gerekmiyor)
