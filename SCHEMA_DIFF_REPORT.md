# Dev → Prod Schema Karşılaştırma Raporu

- **Dev dosyası:** `rt-enerji-frontend/dev_schema.sql`
- **Prod dosyası:** `rt-enerji-frontend/prod_schema.sql`

> Bu rapor `pg_dump --schema-only` çıktıları karşılaştırılarak otomatik üretilmiştir.
> İki ortam arasındaki **şema farklılıklarını** gösterir, **veri farkı** içermez.

## 📊 Özet

| Kategori | Sadece DEV'de | Sadece PROD'da | İki tarafta farklı |
|---|---|---|---|
| Tablolar | 10 | 0 | 5 (gerçekte 3, aşağıya bak) |
| Enum types | 6 | 0 | 1 |
| Functions | 2 | 0 | 0 |
| Policies | 35 | 1 | 0 |
| Triggers | 1 | 0 | 0 |
| Indexes | 11 | 0 | 0 |

> 💡 **Tablo farkı notu:** 5 tabloda raw SQL farkı görünüyor ama 2'si kozmetik:
> - `employees`: sadece CHECK constraint syntax farkı (`ARRAY[...]::text[]` vs `ARRAY[(text), ...]`) — semantik olarak özdeş, **migration'a gerek yok**
> - `request_form_requests`: trailing whitespace farkı — **migration'a gerek yok**
> - Gerçek değişiklik: `app_users`, `request_approvals`, `stamp_requests` (3 tablo)

## 🚨 Migration için Kritik Notlar

1. **`companies_select` policy'si** prod'da var, dev'de **`companies_select_auth`** olarak yeniden yazılmış. Migration'da:
   - Önce `DROP POLICY "companies_select" ON "public"."companies";`
   - Sonra `companies_select_auth`, `companies_insert_admin`, `companies_update_admin` policy'lerini ekle
2. **`approver_type` enum'una `DYNAMIC_USER_LIST` değeri eklenecek** — `ALTER TYPE ... ADD VALUE` ile (önemli: enum ekleme tek bir transaction içinde olmaz, ayrı çalıştır)
3. **`request_approvals` tablosuna `sequence_order INTEGER NOT NULL`** ekleniyor — prod'da mevcut satırlar varsa önce DEFAULT ver, sonra NOT NULL yap, yoksa fail eder
4. **Yeni tablolar arasında FK bağımlılığı var** — sıra önemli:
   - Önce: `mukayese_requests`, `accounting_approval_cover_requests`, `finance_approval_cover_requests`, `approval_letter_requests`
   - Sonra: bunların `_items`, `_suppliers`, `_prices` çocuk tabloları
5. **`user_ms_tokens` tablosu** Microsoft entegrasyonu için — `auth.users` ile FK ilişkisi olabilir, dikkatlice incele

## 🆕 Yeni Tablolar (DEV'de var, PROD'da yok)

### `accounting_approval_cover_items`
**Kolonlar (11):**

| Kolon | Tipi |
|---|---|
| `id` | `"uuid" DEFAULT "gen_random_uuid"() NOT NULL` |
| `accounting_request_id` | `"uuid" NOT NULL` |
| `row_order` | `smallint NOT NULL` |
| `item_date` | `"date" NOT NULL` |
| `company_name` | `"text" NOT NULL` |
| `payee_name` | `"text" NOT NULL` |
| `item_subject` | `"text" NOT NULL` |
| `capacity_type` | `"public"."accounting_capacity_type" NOT NULL` |
| `invoice_amount` | `numeric(14,2) NOT NULL` |
| `payable_amount` | `numeric(14,2) NOT NULL` |
| `created_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |

### `accounting_approval_cover_requests`
**Kolonlar (14):**

| Kolon | Tipi |
|---|---|
| `id` | `"uuid" DEFAULT "gen_random_uuid"() NOT NULL` |
| `request_id` | `"uuid" NOT NULL` |
| `subject` | `"text" NOT NULL` |
| `request_date` | `"date" DEFAULT CURRENT_DATE NOT NULL` |
| `document_no` | `"text" NOT NULL` |
| `demirbas_registered` | `boolean NOT NULL` |
| `has_dispatch_note` | `boolean NOT NULL` |
| `has_delivery_info` | `boolean NOT NULL` |
| `has_invoice_record` | `boolean NOT NULL` |
| `has_accounting_prog_entry` | `boolean NOT NULL` |
| `has_arvento_record` | `boolean NOT NULL` |
| `paid_from_credit` | `boolean NOT NULL` |
| `created_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |
| `updated_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |

### `approval_letter_requests`
**Kolonlar (17):**

| Kolon | Tipi |
|---|---|
| `id` | `"uuid" DEFAULT "gen_random_uuid"() NOT NULL` |
| `request_id` | `"uuid" NOT NULL` |
| `letter_date` | `"date" NOT NULL` |
| `company` | `"text" NOT NULL` |
| `project` | `"text" NOT NULL` |
| `subject` | `"text" NOT NULL` |
| `content` | `"text" NOT NULL` |
| `has_payment_table` | `boolean DEFAULT false` |
| `comparison_approval_date` | `"date"` |
| `agreement_amount` | `"text"` |
| `has_contract` | `boolean` |
| `paid_amounts` | `"jsonb" DEFAULT '[]'::"jsonb"` |
| `remaining_payment` | `"text"` |
| `requested_payment_amount` | `"text"` |
| `remaining_after_payment` | `"text"` |
| `created_at` | `timestamp with time zone DEFAULT "now"()` |
| `updated_at` | `timestamp with time zone DEFAULT "now"()` |

### `finance_approval_cover_items`
**Kolonlar (10):**

| Kolon | Tipi |
|---|---|
| `id` | `"uuid" DEFAULT "gen_random_uuid"() NOT NULL` |
| `finance_request_id` | `"uuid" NOT NULL` |
| `row_order` | `smallint NOT NULL` |
| `item_date` | `"date" NOT NULL` |
| `company_name` | `"text" NOT NULL` |
| `payee_name` | `"text" NOT NULL` |
| `item_subject` | `"text" NOT NULL` |
| `invoice_amount` | `numeric(14,2) NOT NULL` |
| `payable_amount` | `numeric(14,2) NOT NULL` |
| `created_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |

### `finance_approval_cover_requests`
**Kolonlar (12):**

| Kolon | Tipi |
|---|---|
| `id` | `"uuid" DEFAULT "gen_random_uuid"() NOT NULL` |
| `request_id` | `"uuid" NOT NULL` |
| `subject` | `"text" NOT NULL` |
| `request_date` | `"date" DEFAULT CURRENT_DATE NOT NULL` |
| `document_no` | `"text" NOT NULL` |
| `account_available` | `boolean NOT NULL` |
| `cash_flow_recorded` | `boolean NOT NULL` |
| `expense_area` | `"public"."finance_expense_area" NOT NULL` |
| `funding_source` | `"public"."finance_funding_source" NOT NULL` |
| `has_rt_enerji_proforma` | `boolean NOT NULL` |
| `created_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |
| `updated_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |

### `mukayese_items`
**Kolonlar (8):**

| Kolon | Tipi |
|---|---|
| `id` | `"uuid" DEFAULT "gen_random_uuid"() NOT NULL` |
| `mukayese_request_id` | `"uuid" NOT NULL` |
| `row_order` | `smallint NOT NULL` |
| `row_type` | `"public"."mukayese_row_type" DEFAULT 'ITEM'::"public"."mukayese_row_type" NOT NULL` |
| `description` | `"text"` |
| `quantity` | `numeric(14,4)` |
| `unit` | `"public"."mukayese_unit"` |
| `created_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |

### `mukayese_prices`
**Kolonlar (5):**

| Kolon | Tipi |
|---|---|
| `id` | `"uuid" DEFAULT "gen_random_uuid"() NOT NULL` |
| `mukayese_item_id` | `"uuid" NOT NULL` |
| `mukayese_supplier_id` | `"uuid" NOT NULL` |
| `unit_price` | `numeric(14,4) DEFAULT 0 NOT NULL` |
| `created_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |

### `mukayese_requests`
**Kolonlar (19):**

| Kolon | Tipi |
|---|---|
| `id` | `"uuid" DEFAULT "gen_random_uuid"() NOT NULL` |
| `request_id` | `"uuid" NOT NULL` |
| `project_title` | `"text" NOT NULL` |
| `form_currency` | `"public"."mukayese_currency" NOT NULL` |
| `fx_eur_try` | `numeric(12,4)` |
| `fx_usd_try` | `numeric(12,4)` |
| `fx_eur_usd` | `numeric(12,6)` |
| `fx_snapshot_at` | `timestamp with time zone` |
| `form_date` | `"date" DEFAULT CURRENT_DATE NOT NULL` |
| `notes` | `"text"` |
| `kdv_rate` | `numeric(5,2) DEFAULT 20.00 NOT NULL` |
| `preparer_full_name` | `"text" NOT NULL` |
| `company` | `"text" NOT NULL` |
| `subject` | `"text" NOT NULL` |
| `request_content` | `"text" NOT NULL` |
| `request_amount_text` | `"text" NOT NULL` |
| `request_reason` | `"text" NOT NULL` |
| `created_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |
| `updated_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |

### `mukayese_suppliers`
**Kolonlar (10):**

| Kolon | Tipi |
|---|---|
| `id` | `"uuid" DEFAULT "gen_random_uuid"() NOT NULL` |
| `mukayese_request_id` | `"uuid" NOT NULL` |
| `column_order` | `smallint NOT NULL` |
| `company_name` | `"text" NOT NULL` |
| `payment_terms` | `"text"` |
| `technical_description` | `"text"` |
| `delivery_time` | `"text"` |
| `contact_name` | `"text"` |
| `contact_phone` | `"text"` |
| `created_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |

### `user_ms_tokens`
**Kolonlar (8):**

| Kolon | Tipi |
|---|---|
| `user_id` | `"uuid" NOT NULL` |
| `access_token` | `"text" NOT NULL` |
| `access_token_expires_at` | `timestamp with time zone NOT NULL` |
| `refresh_token` | `"text" NOT NULL` |
| `scope` | `"text"` |
| `provider_user_id` | `"text"` |
| `created_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |
| `updated_at` | `timestamp with time zone DEFAULT "now"() NOT NULL` |


## 🗑️ PROD'da olup DEV'de olmayan tablolar

_(yok — hiçbir prod tablosu silinmemiş, ✅ güvenli)_

## ✏️ Mevcut Tablolarda Kolon Değişiklikleri

### `app_users`
**➕ Eklenen kolonlar:**

| Kolon | Tipi |
|---|---|
| `privacy_accepted_at` | `timestamp with time zone` |

### `request_approvals`
**➕ Eklenen kolonlar:**

| Kolon | Tipi |
|---|---|
| `sequence_order` | `integer NOT NULL` |

### `stamp_requests`
**➕ Eklenen kolonlar:**

| Kolon | Tipi |
|---|---|
| `stamp_x_ratio` | `numeric(7,6)` |
| `stamp_y_ratio` | `numeric(7,6)` |
| `stamp_position_overrides` | `"jsonb"` |


## 🧩 Enum Type Değişiklikleri

**🆕 Yeni enum'lar:**

- `accounting_capacity_type` → değerler: ['KAPASITE', 'ANASAHA', 'YEKA']
- `finance_expense_area` → değerler: ['ANA_SAHA', 'ELEKTRIKSEL_KAPASITE_ARTISI', 'YEKA']
- `finance_funding_source` → değerler: ['KREDI', 'OZ_KAYNAK', 'NAKIT_FAZLASI', 'DIGER']
- `mukayese_currency` → değerler: ['TRY', 'USD', 'EUR']
- `mukayese_row_type` → değerler: ['ITEM', 'SUBTOTAL']
- `mukayese_unit` → değerler: ['ADET', 'SET', 'GUN']

**🔄 Değişen enum'lar:**

- `approver_type`:
  - Eklenen değerler: ['DYNAMIC_USER_LIST']


## ⚙️ Function Değişiklikleri

**🆕 Yeni functionlar:**
- `create_mukayese_request("p_workflow_definition_id" "uuid", "p_requester_employee_id" "uuid", "p_header" "jsonb", "p_items" "jsonb", "p_suppliers" "jsonb", "p_prices" "jsonb")`
- `set_updated_at()`


## 🔐 RLS Policy Değişiklikleri

**🆕 Yeni policy'ler (35):**
- `accounting_approval_cover_items_delete`
- `accounting_approval_cover_items_insert`
- `accounting_approval_cover_items_select`
- `accounting_approval_cover_items_update`
- `accounting_approval_cover_requests_insert`
- `accounting_approval_cover_requests_select`
- `accounting_approval_cover_requests_update`
- `app_users_update_privacy_self`
- `approval_letter_requests_insert`
- `approval_letter_requests_select`
- `companies_insert_admin`
- `companies_select_auth`
- `companies_update_admin`
- `finance_approval_cover_items_delete`
- `finance_approval_cover_items_insert`
- `finance_approval_cover_items_select`
- `finance_approval_cover_items_update`
- `finance_approval_cover_requests_insert`
- `finance_approval_cover_requests_select`
- `finance_approval_cover_requests_update`
- `mukayese_items_delete`
- `mukayese_items_insert`
- `mukayese_items_select`
- `mukayese_items_update`
- `mukayese_prices_delete`
- `mukayese_prices_insert`
- `mukayese_prices_select`
- `mukayese_prices_update`
- `mukayese_requests_insert`
- `mukayese_requests_select`
- `mukayese_requests_update`
- `mukayese_suppliers_delete`
- `mukayese_suppliers_insert`
- `mukayese_suppliers_select`
- `mukayese_suppliers_update`

**🗑️ PROD'da olup DEV'de olmayan policy'ler (1):** ⚠️
- `companies_select`


## 🔔 Trigger Değişiklikleri

**🆕 Yeni trigger'lar:**
- `trg_user_ms_tokens_updated_at`


## 🔑 Index Değişiklikleri

**🆕 Yeni indexler (11):**
- `idx_accounting_approval_cover_items_parent`
- `idx_accounting_approval_cover_requests_request_id`
- `idx_approval_letter_requests_request_id`
- `idx_finance_approval_cover_items_parent`
- `idx_finance_approval_cover_requests_request_id`
- `idx_mukayese_items_parent`
- `idx_mukayese_prices_item`
- `idx_mukayese_prices_supplier`
- `idx_mukayese_requests_request_id`
- `idx_mukayese_suppliers_parent`
- `idx_request_approvals_request_sequence`

