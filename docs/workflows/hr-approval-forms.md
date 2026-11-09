# İşe Giriş / İşten Çıkış ONAY Formları

> **Workflow kodları:** `EMPLOYEE_ONBOARDING_APPROVAL` · `EMPLOYEE_SEPARATION_APPROVAL`
> **Kağıt karşılığı:** MİY-EK-03_11 İşe Giriş Onay Formu · MİY-EK-03_10 İşten Çıkış Onay Formu
> **Tarih:** 2026-11-09

Takip formlarıyla (`EMPLOYEE_ONBOARDING` / `EMPLOYEE_SEPARATION`, bkz. [onboarding.md](onboarding.md), [separation.md](separation.md)) **aynı şey değildir ve bağlı değildir**: onay formları ücret / hak ediş içerir, bu yüzden ayrı süreçtir (Takip formunu görenler maaşı görmesin). Takip formundan ön doldurma yoktur (İK kararı, 2026-11-07).

---

## 1. Görünürlük

Diğer kısıtlı İK süreçleriyle (Fazla Mesai, Takip formları) **aynı kural** — yeni RLS yok:

| Kim görür? | Kural |
|---|---|
| Talep sahibi | Her zaman |
| Onay zincirindeki kişiler | Her zaman (`is_approver_for_request`) |
| İnsan Kaynakları departmanı | Süreci başlatabilenler (`workflow_initiators` → birim) — `can_view_workflow_requests()` |
| ORG_ADMIN | Görür ve başlatabilir |

> 2026-11-07'de ORG_ADMIN'i dışlayan bir "gizli süreç" (`is_confidential`) tasarlanıp yalnız dev'e uygulanmıştı; kullanıcı kararıyla (2026-11-09: admin de görmeli) geri alındı ve prod'a hiç gitmedi (`sql/dev_revert_hr_approval_forms_confidential.sql`).

- E-postada ücret/hak ediş tutarı **yazılmaz** ("E-postada gösterilmez — BYS üzerinden görüntüleyin"; `lib/email/workflow-details.ts`, iş koduna göre).
- SharePoint: `İnsan Kaynakları/Birim Süreçleri/İşe Giriş Onay Formu` ve `.../İşten Çıkış Onay Formu` — maaş içerdiği için **klasör izni BT tarafından İK'ya (ve yöneticilere)** daraltılmalı.
- Kalıcı PDF (`buildAndUploadRequestPDF`) **service role ile render edilir**: onay ucu karar veren onaycının RLS'li client'ını geçirir; kısıtlı süreçte onaycı (başlatıcı birimden/admin değilse) `request_approvals`'ta yalnız kendi satırını gördüğü için önceki parafları düşüyordu (2026-11-09 dev e2e'de yakalandı). Yetki çağıranda kontrol edilir; `preview-live` aynı gerekçeyle zaten service role kullanıyordu.

---

## 2. Onay zinciri (kağıttaki sıra)

**İşe Giriş Onay:** İK (talep sahibi) → Genel Müdür → Yönetici Asistanı Antalya → YKB tarama

**İşten Çıkış Onay:** İK (talep sahibi) → Hukuk Müşaviri → Genel Müdür → YKB tarama

| Adım | Onaycı | approver_type | action_type | form_section_key | phase |
|---|---|---|---|---|---|
| 1 | İnsan Kaynakları | `REQUESTER` | `FILL_AND_SIGN` | `request_info` | APPROVAL |
| 2–3 | Sabit pozisyonlar (yukarıdaki sıra) | `STATIC_POSITION` | `SIGN_ONLY` | — | APPROVAL |
| 4 | Yönetim Kurulu Başkanı | `REQUESTER` | `FILL_AND_SIGN` | `ykb_signed_pdf` | COMPLETION |

- Formun **tamamını İK doldurur**; onaycılar yalnız paraflar (SIGN_ONLY).
- YKB (Ramazan Taş) sistemde yok: PDF'teki ONAY kutusu ıslak imza içindir. İmzalanan kağıdı İK (fiziksel taramayı Burcu Hanım da yapabilir) tamamlama adımında yükler → `requests.pdf_path` taramaya döner (finans/muhasebe kapağıyla aynı desen). Yükleme yolu talep kimliğine bağlıdır ve onayda doğrulanır (`lib/storage/ykb-signed-pdf-path.ts`).
- SQL: `sql/feature_hr_approval_forms_2_schema.sql` → `_2b_steps.sql` → `_3_attachments.sql`.

---

## 3. Form alanları

### İşe Giriş Onay (`onboarding_approval_requests`)

| Alan | Sütun | Zorunlu |
|---|---|---|
| Şirket Unvanı (SGK kaydı olan; `companies` sözlüğünden) | `company_name` | ✅ |
| Proje Adı (fiilen çalışacağı proje/ofis) | `project_name` | ✅ |
| Adayın Adı Soyadı / Görev Unvanı | `candidate_name` / `candidate_title` | ✅ |
| İşe Başlama Tarihi | `start_date` (date) | ✅ |
| Personel Talep Nedeni (serbest metin) | `request_reason` | ✅ |
| Ayrılan Personelin Adı Soyadı / Son Ücreti | `replaced_employee_name` / `replaced_employee_last_salary` | — |
| Adayın Son Aldığı Ücret | `candidate_last_salary` | — |
| Bilgi Notu | `info_note` | — |
| Mevcut Ücret Skala Aralığı | `salary_scale_range` (metin) | — |
| Önerilen Ücret (Net) | `proposed_net_salary` | ✅ |
| Uygun Görülen Ücret | `approved_salary` | — |

### İşten Çıkış Onay (`separation_approval_requests`)

Üst bilgiler: `company_name`, `project_name`, `employee_name`, `employee_title`, `hire_date`, `separation_date` (≥ işe giriş), `separation_reason` (zorunlu), `last_salary` (opsiyonel).

Hak tablosu — satırlar tek kaynaktan: `lib/hr-approval/separation-entitlements.ts` (form, API ve PDF aynı listeyi kullanır). Her satır `<key>_period` (GÜN/AY/YIL, serbest metin: "5 Gün", "1 Yıl") + `<key>_amount` (TL):

`final_salary` Hakedilen Son Maaş · `severance` Kıdem Tazminat Hakkı · `notice` İhbar · `ugbt` UGBT Çalışmalarına Ait Hak · `overtime` Fazla Mesai · `weekend_work` Hafta Sonu Çalışması · `annual_leave` Yıllık İzin Bakiyesi · `deductions` Yapılacak Kesintiler

- Şirket alacaklıysa hak satırı **eksi** girilir (formda ve PDF'te kırmızı). Kesintiler pozitif girilir, toplamdan düşülür.
- **TOPLAM** = haklar − kesintiler (kuruş üzerinden). Formda otomatik hesaplanır; İK elle değiştirebilir (`total_is_manual = true`) ve "Otomatik hesaplamaya dön" ile geri alır. Sunucu toplamı her kayıtta yeniden hesaplar; elle girilen değer hesaplananla aynıysa elle sayılmaz. Detay ekranı elle girilen toplamın yanında hesaplananı da gösterir.

Ekler: 1. adımda opsiyonel slot (PDF/JPEG/PNG, 20 dosya, 20 MB).

---

## 4. Kod haritası

| Konu | Dosya |
|---|---|
| Doğrulama (client+server ortak) | `lib/hr-approval/forms.ts` |
| API (liste / oluştur / güncelle) | `lib/hr-approval/api.ts`, `api-config.ts`; rotalar `app/api/onboarding-approval`, `app/api/separation-approval` |
| Form sayfaları | `app/onboarding-approval/new`, `app/separation-approval/new` (+ `components/hr-approval/*`) |
| Liste sayfaları | `app/onboarding-approval`, `app/separation-approval` (`DepartmentProcessListPage`) |
| Detay özeti (onaycı + talep detayı) | `components/hr-approval/hr-approval-summary.tsx` |
| PDF | `lib/pdf/onboarding-approval-pdf-template.tsx`, `separation-approval-pdf-template.tsx`, ortak `hr-approval-form-shared.tsx` |

---

## 5. Devreye alma sırası

1. Prod SQL: `_2_schema` → `_2b_steps` → `_3_attachments` (yalnız ekleme; süreçler kapalı başlar).
2. Deploy.
3. Açma: `UPDATE workflow_definitions SET is_active = true WHERE code IN ('EMPLOYEE_ONBOARDING_APPROVAL','EMPLOYEE_SEPARATION_APPROVAL');`
4. BT: iki SharePoint klasörünün iznini İK'ya daralt.
