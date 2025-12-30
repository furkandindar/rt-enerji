# V2 Implementation Plan - Workflow Engine

Bu doküman, RT Enerji Workflow Engine (V2) için uygulama planını içerir.

**Bağlantılı Doküman:** [V2 Workflow Engine Tasarımı](./v2-workflow-engine.md)

---

## Genel Bakış

```
┌─────────────────────────────────────────────────────────────────┐
│                         V2 AŞAMALARI                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  AŞAMA 1: Veritabanı Şeması                                     │
│  ├── Workflow engine tabloları                                  │
│  ├── Notifications tablosu                                      │
│  ├── RLS politikaları                                           │
│  └── Seed data                                                  │
│                                                                 │
│  AŞAMA 2: Backend API                                           │
│  ├── Workflow engine servisleri                                 │
│  ├── İzin talep API'leri                                        │
│  ├── Onay API'leri                                              │
│  └── Bildirim API'leri                                          │
│                                                                 │
│  AŞAMA 3: Frontend                                              │
│  ├── İzin talep formları                                        │
│  ├── Onay/Talep sayfaları                                       │
│  └── Bildirimler UI                                             │
│                                                                 │
│  AŞAMA 4: Test & Polish                                         │
│  └── End-to-end test & iyileştirmeler                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## AŞAMA 1: Veritabanı Şeması

**Öncelik:** 🔴 Kritik  
**Tahmini Süre:** -

### Görevler

| # | Görev | Açıklama | Durum |
|---|-------|----------|-------|
| 1.1 | `workflow_definitions` | Süreç şablonları tablosu | [ ] |
| 1.2 | `workflow_steps` | Onay adımları tablosu | [ ] |
| 1.3 | `requests` | Ana talep tablosu | [ ] |
| 1.4 | `request_approvals` | Onay kayıtları tablosu | [ ] |
| 1.5 | `leave_requests` | İzin detayları tablosu | [ ] |
| 1.6 | `notifications` | Bildirimler tablosu | [ ] |
| 1.7 | RLS Politikaları | Güvenlik kuralları | [ ] |
| 1.8 | Seed Data | ANNUAL_LEAVE, SHORT_LEAVE tanımları | [ ] |

### Tablo İlişkileri

```
workflow_definitions
       │ 1:N
       ▼
workflow_steps ←─────────────────────┐
                                     │
requests ─────────────────────────── │ N:1
       │                             │
       │ 1:N                         │
       ▼                             │
request_approvals ───────────────────┘
       
requests
       │ 1:1
       ▼
leave_requests
```

---

## AŞAMA 2: Backend API

**Öncelik:** 🔴 Kritik  
**Tahmini Süre:** -

### Görevler

| # | Görev | Endpoint | Method | Durum |
|---|-------|----------|--------|-------|
| 2.1 | İzin talebi oluştur | `/api/leave-requests` | POST | [ ] |
| 2.2 | Taleplerimi listele | `/api/my-requests` | GET | [ ] |
| 2.3 | Onay bekleyenlerimi listele | `/api/pending-approvals` | GET | [ ] |
| 2.4 | Talep detayı getir | `/api/requests/:id` | GET | [ ] |
| 2.5 | Talep onayla | `/api/requests/:id/approve` | POST | [ ] |
| 2.6 | Talep reddet | `/api/requests/:id/reject` | POST | [ ] |
| 2.7 | Talep iptal et | `/api/requests/:id/cancel` | POST | [ ] |
| 2.8 | Bildirimlerimi getir | `/api/notifications` | GET | [ ] |
| 2.9 | Bildirimi okundu işaretle | `/api/notifications/:id/read` | PATCH | [ ] |

### API Detayları

#### POST `/api/leave-requests`
Yeni izin talebi oluşturur.

```json
// Request Body
{
  "leave_type": "ANNUAL_LEAVE",
  "start_datetime": "2025-01-15T09:00:00Z",
  "end_datetime": "2025-01-20T18:00:00Z",
  "total_days": 5,
  "remaining_days": 14,
  "address_during_leave": "Antalya",
  "reason": "Aile ziyareti"
}
```

#### POST `/api/requests/:id/approve`
Talebi onaylar, bir sonraki adıma geçirir.

```json
// Request Body (opsiyonel)
{
  "comment": "Onaylandı",
  "overtime_amount": 1500.00  // Sadece İK için
}
```

#### POST `/api/requests/:id/reject`
Talebi reddeder, süreç durur.

```json
// Request Body
{
  "comment": "Bütçe uygun değil"  // Zorunlu
}
```

---

## AŞAMA 3: Frontend

**Öncelik:** 🟡 Yüksek  
**Tahmini Süre:** -

### Görevler

| # | Görev | Sayfa/Route | Durum |
|---|-------|-------------|-------|
| 3.1 | Yıllık izin formu | `/izin-talep/yillik` | [ ] |
| 3.2 | Kısa süreli izin formu | `/izin-talep/kisa-sureli` | [ ] |
| 3.3 | Taleplerim sayfası | `/taleplerim` | [ ] |
| 3.4 | Onay bekleyenler sayfası | `/onay-bekleyenler` | [ ] |
| 3.5 | Talep detay modal | - | [ ] |
| 3.6 | Bildirimler dropdown | Header component | [ ] |
| 3.7 | Sidebar güncelleme | Yeni menü linkleri | [ ] |

### Sayfa Yapıları

#### `/taleplerim`
```
┌─────────────────────────────────────────────────────────────┐
│ Taleplerim                                    [+ Yeni Talep]│
├─────────────────────────────────────────────────────────────┤
│ Filtre: [Tümü ▼] [Yıllık İzin ▼] [Tarih ▼]                  │
├─────────────────────────────────────────────────────────────┤
│ │ Tip        │ Tarih       │ Durum    │ Adım      │ İşlem │ │
│ ├────────────┼─────────────┼──────────┼───────────┼───────┤ │
│ │ Yıllık     │ 15-20 Ocak  │ Bekliyor │ Muhasebe  │ İptal │ │
│ │ Kısa Süreli│ 10 Ocak     │ Onaylandı│ -         │ Görüntüle│
│ │ Yıllık     │ 1-3 Aralık  │ Reddedildi│ -        │ Görüntüle│
└─────────────────────────────────────────────────────────────┘
```

#### `/onay-bekleyenler`
```
┌─────────────────────────────────────────────────────────────┐
│ Onay Bekleyen Talepler                                      │
├─────────────────────────────────────────────────────────────┤
│ │ Talep Eden │ Tip        │ Tarih      │ İşlem            │ │
│ ├────────────┼────────────┼────────────┼──────────────────┤ │
│ │ Ahmet Y.   │ Yıllık     │ 15-20 Ocak │ [Onayla] [Reddet]│ │
│ │ Ayşe K.    │ Kısa Süreli│ 12 Ocak    │ [Onayla] [Reddet]│ │
└─────────────────────────────────────────────────────────────┘
```

---

## AŞAMA 4: Test & Polish

**Öncelik:** 🟢 Normal  
**Tahmini Süre:** -

### Görevler

| # | Görev | Durum |
|---|-------|-------|
| 4.1 | Yıllık izin full flow test | [ ] |
| 4.2 | Kısa süreli izin full flow test | [ ] |
| 4.3 | Rejection flow test | [ ] |
| 4.4 | Cancel flow test | [ ] |
| 4.5 | Edge case: Talep eden = Onaycı | [ ] |
| 4.6 | Edge case: Pozisyon boş | [ ] |
| 4.7 | Bildirim testleri | [ ] |
| 4.8 | UI/UX iyileştirmeleri | [ ] |
| 4.9 | Hata mesajları düzenleme | [ ] |

---

## Bağımlılık Grafiği

```
AŞAMA 1 (DB)
    │
    ├── 1.1 workflow_definitions
    │       │
    │       ▼
    ├── 1.2 workflow_steps
    │       │
    │       ▼
    ├── 1.3 requests
    │       │
    │       ├── 1.4 request_approvals
    │       │
    │       └── 1.5 leave_requests
    │
    ├── 1.6 notifications
    │
    ├── 1.7 RLS
    │
    └── 1.8 Seed Data
            │
            ▼
AŞAMA 2 (API) ─────────────────────────────────────────────────
            │
            ├── 2.1 leave-requests POST  ──┐
            │                              │
            ├── 2.2 my-requests GET        │
            │                              ├── 2.4, 2.5, 2.6, 2.7
            ├── 2.3 pending-approvals GET  │
            │                              │
            └── 2.8, 2.9 notifications ────┘
                    │
                    ▼
AŞAMA 3 (Frontend) ────────────────────────────────────────────
                    │
                    ├── 3.1, 3.2 İzin formları
                    │
                    ├── 3.3, 3.4 Liste sayfaları
                    │
                    ├── 3.5 Detay modal
                    │
                    └── 3.6, 3.7 Bildirim & Sidebar
                            │
                            ▼
AŞAMA 4 (Test) ────────────────────────────────────────────────
```

---

## Çözülen Kararlar

| # | Konu | Karar |
|---|------|-------|
| 1 | Edge Case: Talep eden = Onaycı (UNIT_HEAD) | ✅ Üst birime escalate, en üstte self-approval |
| 2 | Edge Case: Talep eden = Onaycı (STATIC) | ✅ Self-approval (adım atlanmaz, kayıt amaçlı) |
| 3 | Email bildirimi | ✅ V3'te (V2'de sadece in-app notification) |

Detaylar için: [V2 Workflow Engine - Edge Case Kararları](./v2-workflow-engine.md#4-edge-case-kararları)

---

## Notlar

- Her aşama tamamlandığında bu doküman güncellenecek
- Yeni edge case'ler keşfedildikçe eklenecek
- Tahmini süreler başladıktan sonra güncellenecek

---

**Son Güncelleme:** 2025-12-22
**Durum:** ✅ Planlama tamamlandı, implementasyona hazır

