# RT Enerji Süreç Yönetimi - V2 Workflow Engine

Bu doküman, RT Enerji için geliştirilecek **genel amaçlı workflow engine** tasarımını ve ilk uygulama olarak **yıllık izin talep sürecini** tanımlar.

---

## 1. Amaç ve Vizyon

### V1'de Tamamlanan (Organizasyon Yönetimi)
- ✅ Sözlük tabloları (unit_types, position_types, grade_levels)
- ✅ Organizasyon birimleri (organizational_units)
- ✅ Pozisyonlar (positions)
- ✅ Çalışanlar (employees)
- ✅ Atamalar (employee_positions)
- ✅ Auth + RLS + User management

### V2'nin Amacı (Süreç Yönetimi)
- 🎯 Genel amaçlı bir **workflow engine** oluşturmak
- 🎯 Çeşitli onay süreçlerini tek bir altyapıyla yönetmek
- 🎯 Yeni süreç eklemek için kod yazmak yerine **konfigürasyon** kullanmak
- 🎯 İlk süreç olarak **yıllık izin talebi** ile başlamak

### Gelecekte Eklenecek Süreçler
- Avans/Masraf talepleri
- Seyahat talepleri
- Satın alma talepleri
- Diğer onay gerektiren iş süreçleri

---

## 2. Workflow Engine Konsepti

### Neden Genel Bir Engine?

| Yaklaşım | Avantaj | Dezavantaj |
|----------|---------|------------|
| Form-specific | Hızlı başlangıç | Her form için tekrar yazılır |
| **Genel Engine** ⭐ | Bir kere yaz, her yerde kullan | İlk kurulum biraz uzun |

**Karar:** Genel workflow engine ile başlıyoruz. Yıllık izin formu üzerinden geliştirip test edeceğiz.

### Temel Kavramlar

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         WORKFLOW ENGINE MODELI                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  workflow_definitions    Süreç şablonları (İzin, Avans, Seyahat...)    │
│         │                                                               │
│         ▼                                                               │
│  workflow_steps          Her sürecin onay adımları                      │
│         │                                                               │
│         ▼                                                               │
│  requests                Oluşturulan talepler                           │
│         │                                                               │
│         ├──► request_approvals    Her adımın onay kayıtları            │
│         │                                                               │
│         └──► leave_requests       Form-specific veriler (izin detayı)  │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Onay Akışı Tasarımı

### Onaycı Tipleri

| Tip | Açıklama | Örnek |
|-----|----------|-------|
| `REQUESTER` | Talebi başlatan kişi | Talep Eden |
| `UNIT_HEAD` | Talep edenin birim müdürü | İlgili Bölüm Müdürü |
| `STATIC_POSITION` | Sabit bir pozisyon | Personel Müdürlüğü, Muhasebe Müdürlüğü |

### İzin Türleri ve Onay Zincirleri

Sistemde 2 farklı izin türü ve her biri için farklı onay zinciri var:

#### 1. Yıllık İzin (`ANNUAL_LEAVE`) - 5 Adım

| Sıra | Adım | Onaycı Tipi | Not |
|------|------|-------------|-----|
| 1 | Talep Eden | `REQUESTER` | Formu dolduran |
| 2 | Talep Eden Amiri | `UNIT_HEAD` | Birim müdürü |
| 3 | Muhasebe | `STATIC_POSITION` | Fazla mesai hesabı |
| 4 | İnsan Kaynakları | `STATIC_POSITION` | Personel Müdürlüğü |
| 5 | Genel Koordinatör | `STATIC_POSITION` | Final onay |

#### 2. Kısa Süreli İzin (`SHORT_LEAVE`) - 4 Adım

| Sıra | Adım | Onaycı Tipi | Not |
|------|------|-------------|-----|
| 1 | Talep Eden | `REQUESTER` | Formu dolduran |
| 2 | İlgili Bölüm Müdürü | `UNIT_HEAD` | Birim müdürü |
| 3 | İnsan Kaynakları | `STATIC_POSITION` | Personel Müdürlüğü |
| 4 | Genel Koordinatör | `STATIC_POSITION` | Final onay |

> **Not:** İş kuralları (kota kontrolü, tarih kısıtlamaları vb.) V3'te eklenecek.

### Onay Türü

**Sıralı Onay (Sequential)** tercih edildi:
- Her adım bir öncekinin onayına bağlı
- Audit trail net ve takip edilebilir
- Paralel onay gerekirse ileride eklenebilir

---

## 4. Edge Case Kararları

| # | Durum | Karar | Açıklama |
|---|-------|-------|----------|
| 1 | Talep eden = Onaycı (UNIT_HEAD) | ✅ **ÜST BİRİME ESCALATE** | Detay aşağıda |
| 2 | Talep eden = Onaycı (STATIC) | ✅ **SELF-APPROVAL** | Kayıt amaçlı, adım atlanmaz |
| 3 | Birim müdürü pozisyonu boş | 🚫 **HATA** | Süreç başlatılmasın, hata mesajı gösterilsin |
| 4 | Birden fazla aktif atama | 📌 **PRIMARY** | `is_primary = true` olan pozisyona göre git |

### Edge Case #1: Talep Eden = Onaycı (ÇÖZÜLDÜ ✅)

#### Kural 1: STATIC_POSITION Adımları

**Hiçbir zaman değişmez veya atlanmaz.**

- İK Müdürü izin talep etse bile, İK adımında kendi kendini onaylar
- Muhasebe Müdürü talep etse bile, Muhasebe adımında kendi kendini onaylar
- **Neden?** Bu adımlar sadece onay için değil, kayıt ve takip için de kritik

```
İK Müdürü izin talep ediyor
         │
         ▼
┌─────────────────────────────────────┐
│ Adım 4: İnsan Kaynakları            │
│ Onaycı: İK Müdürü (kendisi)         │
│ İşlem: Self-approval ✅              │
│ Kayıt: Sistemde tutulur (audit)     │
└─────────────────────────────────────┘
```

#### Kural 2: UNIT_HEAD Adımı

**Üst birime escalate edilir.**

| Durum | Çözüm |
|-------|-------|
| Talep eden ≠ Birim müdürü | Normal: Birim müdürü onaylar |
| Talep eden = Birim müdürü | Üst birimin müdürüne git |
| Talep eden = En üst birim müdürü | Self-approval (üst birim yok) |

```
Yazılım Birim Müdürü izin talep ediyor
         │
         ▼
┌─────────────────────────────────────┐
│ Adım 2: Bölüm Müdürü (UNIT_HEAD)    │
│ Normal onaycı: Kendisi ❌            │
│ Escalate: Üst birim (Teknik Dir.)   │
│ Onaycı: Teknik Direktör ✅           │
└─────────────────────────────────────┘
```

#### Implementasyon Pseudocode

```javascript
function getApprover(step, requester) {

  // STATIC_POSITION: Her zaman aynı pozisyon (self-approval dahil)
  if (step.approver_type === 'STATIC_POSITION') {
    return getPersonByPosition(step.static_position_id)
  }

  // UNIT_HEAD: Escalate mantığı
  if (step.approver_type === 'UNIT_HEAD') {
    const requesterUnit = requester.unit
    const unitHead = getUnitHead(requesterUnit)

    // Normal akış
    if (requester.id !== unitHead.id) {
      return unitHead
    }

    // Talep eden = Birim müdürü → Üst birime git
    const parentUnit = requesterUnit.parent_unit
    if (parentUnit) {
      return getUnitHead(parentUnit)
    }

    // En üst birim → Self-approval
    return requester
  }
}

---

## 5. Veri Modeli (Taslak)

### 5.1 workflow_definitions
Süreç şablonlarını tanımlar.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | UUID | PK |
| code | TEXT | Benzersiz kod (LEAVE_REQUEST, EXPENSE_REQUEST) |
| name | TEXT | Görünen ad |
| description | TEXT | Açıklama |
| is_active | BOOLEAN | Aktif mi |

### 5.2 workflow_steps
Her sürecin onay adımlarını tanımlar.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | UUID | PK |
| workflow_definition_id | UUID | FK → workflow_definitions |
| step_order | INTEGER | Sıra numarası (1, 2, 3...) |
| name | TEXT | Adım adı |
| approver_type | TEXT | REQUESTER, UNIT_HEAD, STATIC_POSITION |
| static_position_id | UUID | FK → positions (sadece STATIC_POSITION için) |
| is_required | BOOLEAN | Zorunlu adım mı |

### 5.3 requests
Tüm taleplerin ana tablosu.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | UUID | PK |
| workflow_definition_id | UUID | FK → workflow_definitions |
| requester_employee_id | UUID | FK → employees |
| status | TEXT | DRAFT, PENDING, APPROVED, REJECTED, CANCELLED |
| current_step | INTEGER | Şu anki adım numarası |
| submitted_at | TIMESTAMPTZ | Gönderilme tarihi |
| completed_at | TIMESTAMPTZ | Tamamlanma tarihi |

### 5.4 request_approvals
Her adımın onay kayıtları.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | UUID | PK |
| request_id | UUID | FK → requests |
| workflow_step_id | UUID | FK → workflow_steps |
| approver_employee_id | UUID | FK → employees |
| status | TEXT | PENDING, APPROVED, REJECTED |
| comment | TEXT | Onay/red açıklaması |
| decided_at | TIMESTAMPTZ | Karar tarihi |

### 5.5 leave_requests
İzin talebine özel veriler. İki farklı izin türü için ortak tablo.

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | UUID | PK |
| request_id | UUID | FK → requests |
| leave_type | TEXT | `ANNUAL_LEAVE` veya `SHORT_LEAVE` |
| start_datetime | TIMESTAMPTZ | İzne çıkış tarihi/saati |
| end_datetime | TIMESTAMPTZ | İzinden dönüş tarihi/saati |
| total_days | NUMERIC | İzin gün sayısı (yıllık izin için) |
| remaining_days | NUMERIC | Varolan izin günü (yıllık izin için) |
| address_during_leave | TEXT | İzinde bulunacağı adres (yıllık izin için) |
| reason | TEXT | İzin talep nedeni |
| overtime_amount | NUMERIC | Fazla mesai tutarı (İK tarafından girilir) |

**Not:** `leave_type` alanına göre bazı alanlar zorunlu/opsiyonel olacak:
- `ANNUAL_LEAVE`: total_days, remaining_days, address_during_leave zorunlu
- `SHORT_LEAVE`: Sadece tarih/saat ve neden zorunlu

---

## 6. Bildirim Mekanizması

### Kanallar

| Kanal | Durum | Teknoloji |
|-------|-------|-----------|
| **E-posta** | ✅ Aktif | Microsoft Outlook (Graph API veya SMTP) |
| **In-app** | ✅ Aktif | Notifications tablosu + UI |

### Bildirim Tetikleyicileri

| Olay | Alıcı | Kanal |
|------|-------|-------|
| Yeni onay bekliyor | Sıradaki onaycı | Email + In-app |
| Talep onaylandı (tamamlandı) | Talep eden | Email + In-app |
| Talep reddedildi | Talep eden | Email + In-app |

### Notifications Tablosu (Taslak)

| Alan | Tip | Açıklama |
|------|-----|----------|
| id | UUID | PK |
| user_id | UUID | FK → app_users |
| title | TEXT | Bildirim başlığı |
| message | TEXT | Bildirim içeriği |
| type | TEXT | APPROVAL_PENDING, REQUEST_APPROVED, REQUEST_REJECTED |
| reference_id | UUID | İlgili request ID |
| is_read | BOOLEAN | Okundu mu |
| created_at | TIMESTAMPTZ | Oluşturulma tarihi |

---

## 7. Timeout / Deadline

| Karar | Açıklama |
|-------|----------|
| **Şimdilik YOK** | Onay süresiz bekleyebilir |
| **İleride eklenebilir** | Hatırlatma veya escalation mekanizması |

---

## 8. İptal Mekanizması

### Kurallar

| Talep Durumu | İptal Edilebilir mi? |
|--------------|---------------------|
| DRAFT | ✅ Evet (silinebilir) |
| PENDING | ✅ Evet (iptal edilebilir) |
| APPROVED | ❌ Hayır |
| REJECTED | ❌ Hayır |
| CANCELLED | ❌ Hayır (zaten iptal) |

### İptal Akışı

```
Talep Eden "İptal Et" → status = CANCELLED → Bildirim gider (onaycılara)
```

**Not:** İptal edildiğinde, bekleyen onaycılara bilgi amaçlı bildirim gönderilebilir.

---

## 9. Bekleyen Konular

✅ **Tüm kritik konular çözüldü!** Implementasyona hazır.

---

## 10. V3 İçin Bekleyen Özellikler (İş Kuralları)

Aşağıdaki kurallar V2'de implement edilmeyecek, V3'te eklenecek:

### Yıllık İzin Kuralları
- [ ] Yıllık izin en fazla 4 parçaya bölünebilir
- [ ] Hafta sonu ve resmi tatillerle birleştirilemez
- [ ] Kalan izin günü kontrolü (kota aşımı engelleme)

### Kısa Süreli İzin Kuralları
- [ ] Pazartesi sabah kullanılamaz
- [ ] Cuma öğleden sonra kullanılamaz
- [ ] Resmi tatillerle birleştirilemez

### Genel Kurallar
- [ ] Timeout/Deadline mekanizması
- [ ] Otomatik hatırlatma bildirimleri
- [ ] Raporlama ve istatistikler
- [ ] Email bildirimleri (Microsoft Graph API)

---

## 11. Sonraki Adımlar

Detaylı plan için: [V2 Implementation Plan](./v2-implementation-plan.md)

1. [x] ~~Edge Case #1'i netleştir~~
2. [x] ~~Veri modelini finalize et~~
3. [ ] SQL şemalarını yaz
4. [ ] API endpoint'lerini tasarla
5. [ ] UI/UX tasarımını oluştur
6. [ ] İlk workflow'u (yıllık izin) implement et
7. [ ] Test et ve production'a al

---

**Son Güncelleme:** 2025-12-22
**Durum:** Planlama tamamlandı, implementasyona hazır
**İlk Hedef:** Yıllık izin talep süreci

