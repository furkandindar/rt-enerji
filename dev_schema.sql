


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE TYPE "public"."accounting_capacity_type" AS ENUM (
    'KAPASITE',
    'ANASAHA',
    'YEKA'
);


ALTER TYPE "public"."accounting_capacity_type" OWNER TO "postgres";


CREATE TYPE "public"."approval_status" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE "public"."approval_status" OWNER TO "postgres";


CREATE TYPE "public"."approver_type" AS ENUM (
    'REQUESTER',
    'UNIT_HEAD',
    'STATIC_POSITION',
    'DYNAMIC_USER_LIST'
);


ALTER TYPE "public"."approver_type" OWNER TO "postgres";


CREATE TYPE "public"."checklist_status" AS ENUM (
    'DONE',
    'NOT_DONE',
    'NA'
);


ALTER TYPE "public"."checklist_status" OWNER TO "postgres";


CREATE TYPE "public"."finance_expense_area" AS ENUM (
    'ANA_SAHA',
    'ELEKTRIKSEL_KAPASITE_ARTISI',
    'YEKA'
);


ALTER TYPE "public"."finance_expense_area" OWNER TO "postgres";


CREATE TYPE "public"."finance_funding_source" AS ENUM (
    'KREDI',
    'OZ_KAYNAK',
    'NAKIT_FAZLASI',
    'DIGER'
);


ALTER TYPE "public"."finance_funding_source" OWNER TO "postgres";


CREATE TYPE "public"."leave_type" AS ENUM (
    'ANNUAL_LEAVE',
    'SHORT_LEAVE'
);


ALTER TYPE "public"."leave_type" OWNER TO "postgres";


CREATE TYPE "public"."mukayese_currency" AS ENUM (
    'TRY',
    'USD',
    'EUR'
);


ALTER TYPE "public"."mukayese_currency" OWNER TO "postgres";


CREATE TYPE "public"."mukayese_row_type" AS ENUM (
    'ITEM',
    'SUBTOTAL'
);


ALTER TYPE "public"."mukayese_row_type" OWNER TO "postgres";


CREATE TYPE "public"."mukayese_unit" AS ENUM (
    'ADET',
    'SET',
    'GUN'
);


ALTER TYPE "public"."mukayese_unit" OWNER TO "postgres";


CREATE TYPE "public"."notification_type" AS ENUM (
    'APPROVAL_REQUIRED',
    'REQUEST_APPROVED',
    'REQUEST_REJECTED',
    'REQUEST_CANCELLED'
);


ALTER TYPE "public"."notification_type" OWNER TO "postgres";


CREATE TYPE "public"."overtime_reason_category" AS ENUM (
    'SHIFT_OUTSIDE',
    'NON_CONTINUOUS',
    'EMERGENCY_CASE',
    'SUDDEN_DEVELOPMENT',
    'ON_REQUEST',
    'STAFF_SHORTAGE',
    'REPORTING',
    'ENERGY_PRODUCTION'
);


ALTER TYPE "public"."overtime_reason_category" OWNER TO "postgres";


CREATE TYPE "public"."overtime_type" AS ENUM (
    'EMERGENCY',
    'STAFF_SHORTAGE'
);


ALTER TYPE "public"."overtime_type" OWNER TO "postgres";


CREATE TYPE "public"."request_status" AS ENUM (
    'DRAFT',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'CANCELLED',
    'AWAITING_COMPLETION',
    'COMPLETED'
);


ALTER TYPE "public"."request_status" OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."create_mukayese_request"("p_workflow_definition_id" "uuid", "p_requester_employee_id" "uuid", "p_header" "jsonb", "p_items" "jsonb", "p_suppliers" "jsonb", "p_prices" "jsonb") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  v_request_id          UUID;
  v_mukayese_request_id UUID;
BEGIN
  -- ----------------------------------------------------------------
  -- 1. Ana request kaydı (status = 'PENDING' → tek seferde submit)
  -- ----------------------------------------------------------------
  INSERT INTO public.requests (
    workflow_definition_id,
    requester_employee_id,
    status,
    current_step,
    submitted_at
  ) VALUES (
    p_workflow_definition_id,
    p_requester_employee_id,
    'PENDING',
    1,
    now()
  )
  RETURNING id INTO v_request_id;

  -- ----------------------------------------------------------------
  -- 2. mukayese_requests (header + footer + FX snapshot)
  -- ----------------------------------------------------------------
  INSERT INTO public.mukayese_requests (
    request_id,
    project_title,
    form_currency,
    fx_eur_try,
    fx_usd_try,
    fx_eur_usd,
    fx_snapshot_at,
    form_date,
    notes,
    kdv_rate,
    preparer_full_name,
    company,
    subject,
    request_content,
    request_amount_text,
    request_reason
  ) VALUES (
    v_request_id,
    p_header->>'project_title',
    (p_header->>'form_currency')::public.mukayese_currency,
    NULLIF(p_header->>'fx_eur_try','')::numeric,
    NULLIF(p_header->>'fx_usd_try','')::numeric,
    NULLIF(p_header->>'fx_eur_usd','')::numeric,
    NULLIF(p_header->>'fx_snapshot_at','')::timestamptz,
    (p_header->>'form_date')::date,
    NULLIF(p_header->>'notes',''),
    (p_header->>'kdv_rate')::numeric,
    p_header->>'preparer_full_name',
    p_header->>'company',
    p_header->>'subject',
    p_header->>'request_content',
    p_header->>'request_amount_text',
    p_header->>'request_reason'
  )
  RETURNING id INTO v_mukayese_request_id;

  -- ----------------------------------------------------------------
  -- 3. mukayese_items (matris satırları)
  -- ----------------------------------------------------------------
  INSERT INTO public.mukayese_items (
    mukayese_request_id, row_order, row_type, description, quantity, unit
  )
  SELECT
    v_mukayese_request_id,
    (item->>'row_order')::smallint,
    (item->>'row_type')::public.mukayese_row_type,
    NULLIF(item->>'description',''),
    NULLIF(item->>'quantity','')::numeric,
    NULLIF(item->>'unit','')::public.mukayese_unit
  FROM jsonb_array_elements(p_items) AS item;

  -- ----------------------------------------------------------------
  -- 4. mukayese_suppliers (matris sütunları + footer firma alanları)
  -- ----------------------------------------------------------------
  INSERT INTO public.mukayese_suppliers (
    mukayese_request_id, column_order, company_name,
    payment_terms, technical_description, delivery_time, contact_name, contact_phone
  )
  SELECT
    v_mukayese_request_id,
    (s->>'column_order')::smallint,
    s->>'company_name',
    NULLIF(s->>'payment_terms',''),
    NULLIF(s->>'technical_description',''),
    NULLIF(s->>'delivery_time',''),
    NULLIF(s->>'contact_name',''),
    NULLIF(s->>'contact_phone','')
  FROM jsonb_array_elements(p_suppliers) AS s;

  -- ----------------------------------------------------------------
  -- 5. mukayese_prices (hücreler) - row_order/column_order ile eşle
  -- ----------------------------------------------------------------
  INSERT INTO public.mukayese_prices (
    mukayese_item_id, mukayese_supplier_id, unit_price
  )
  SELECT
    mi.id,
    ms.id,
    (price->>'unit_price')::numeric
  FROM jsonb_array_elements(p_prices) AS price
  JOIN public.mukayese_items mi
    ON mi.mukayese_request_id = v_mukayese_request_id
   AND mi.row_order = (price->>'row_order')::smallint
  JOIN public.mukayese_suppliers ms
    ON ms.mukayese_request_id = v_mukayese_request_id
   AND ms.column_order = (price->>'column_order')::smallint;

  RETURN v_request_id;
END;
$$;


ALTER FUNCTION "public"."create_mukayese_request"("p_workflow_definition_id" "uuid", "p_requester_employee_id" "uuid", "p_header" "jsonb", "p_items" "jsonb", "p_suppliers" "jsonb", "p_prices" "jsonb") OWNER TO "postgres";


COMMENT ON FUNCTION "public"."create_mukayese_request"("p_workflow_definition_id" "uuid", "p_requester_employee_id" "uuid", "p_header" "jsonb", "p_items" "jsonb", "p_suppliers" "jsonb", "p_prices" "jsonb") IS 'Mukayese Formu için atomik talep oluşturma. requests + mukayese_requests + mukayese_items + mukayese_suppliers + mukayese_prices tek transaction''da yazılır. Onay zinciri ayrıca backend tarafından createApprovalChain ile kurulur.';



CREATE OR REPLACE FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text", "p_reference_id" "uuid" DEFAULT NULL::"uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
DECLARE
  v_notification_id uuid;
BEGIN
  INSERT INTO public.notifications (user_id, title, message, type, reference_id, is_read)
  VALUES (p_user_id, p_title, p_message, p_type::notification_type, p_reference_id, false)
  RETURNING id INTO v_notification_id;
  
  RETURN v_notification_id;
END;
$$;


ALTER FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text", "p_reference_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_current_employee_id"() RETURNS "uuid"
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  select au.employee_id
  from public.app_users au
  where au.id = auth.uid()
$$;


ALTER FUNCTION "public"."get_current_employee_id"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_auth_user_created"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO 'public', 'auth'
    AS $$
declare
  v_employee_id uuid;
  v_old_user_id uuid;
  v_old_role    text;
begin
  -- Email varsa, employees tablosunda eşleşen çalışanı bulmaya çalış
  if new.email is not null then
    select e.id
      into v_employee_id
      from public.employees e
     where lower(e.email) = lower(new.email)
     limit 1;
  end if;

  -- Eğer eşleşen bir çalışan varsa, aynı employee_id ile eski app_users kaydı var mı kontrol et
  if v_employee_id is not null then
    select au.id, au.role
      into v_old_user_id, v_old_role
      from public.app_users au
     where au.employee_id = v_employee_id
       and au.id <> new.id  -- Yeni kullanıcıdan farklı olan eski kayıt
     limit 1;

    if v_old_user_id is not null then
      -- Eski kullanıcıya ait bildirimleri yeni kullanıcıya taşı
      update public.notifications
         set user_id = new.id
       where user_id = v_old_user_id;

      -- Eski app_users kaydını sil (auth.users cascade ile silinecek)
      delete from public.app_users where id = v_old_user_id;

      -- Eski auth.users kaydını sil
      delete from auth.users where id = v_old_user_id;

      -- Yeni app_users kaydını eski rolü koruyarak oluştur
      insert into public.app_users (id, email, employee_id, role)
      values (new.id, new.email, v_employee_id, v_old_role)
      on conflict do nothing;

      return new;
    end if;
  end if;

  -- Normal akış: yeni app_users kaydı oluştur (varsayılan rol: ORG_VIEWER)
  insert into public.app_users (id, email, employee_id, role)
  values (new.id, new.email, v_employee_id, 'ORG_VIEWER')
  on conflict do nothing;

  return new;
end;
$$;


ALTER FUNCTION "public"."handle_auth_user_created"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_approver_for_request"("p_request_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.request_approvals ra
    WHERE ra.request_id = p_request_id
      AND ra.approver_employee_id = public.get_current_employee_id()
  )
$$;


ALTER FUNCTION "public"."is_approver_for_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."is_approver_for_same_request"("p_request_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.request_approvals ra
    WHERE ra.request_id = p_request_id
      AND ra.approver_employee_id = public.get_current_employee_id()
  )
$$;


ALTER FUNCTION "public"."is_approver_for_same_request"("p_request_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at := now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."update_updated_at_column"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."update_updated_at_column"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."accounting_approval_cover_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "accounting_request_id" "uuid" NOT NULL,
    "row_order" smallint NOT NULL,
    "item_date" "date" NOT NULL,
    "company_name" "text" NOT NULL,
    "payee_name" "text" NOT NULL,
    "item_subject" "text" NOT NULL,
    "capacity_type" "public"."accounting_capacity_type" NOT NULL,
    "invoice_amount" numeric(14,2) NOT NULL,
    "payable_amount" numeric(14,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "accounting_approval_cover_items_invoice_amount_check" CHECK (("invoice_amount" >= (0)::numeric)),
    CONSTRAINT "accounting_approval_cover_items_payable_amount_check" CHECK (("payable_amount" >= (0)::numeric))
);


ALTER TABLE "public"."accounting_approval_cover_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."accounting_approval_cover_items" IS 'Onay Kapağı Muhasebe - ödeme tablosu satırları (min 1 satır uygulama katmanında doğrulanır)';



CREATE TABLE IF NOT EXISTS "public"."accounting_approval_cover_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "request_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "document_no" "text" NOT NULL,
    "demirbas_registered" boolean NOT NULL,
    "has_dispatch_note" boolean NOT NULL,
    "has_delivery_info" boolean NOT NULL,
    "has_invoice_record" boolean NOT NULL,
    "has_accounting_prog_entry" boolean NOT NULL,
    "has_arvento_record" boolean NOT NULL,
    "paid_from_credit" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."accounting_approval_cover_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."accounting_approval_cover_requests" IS 'Onay Kapağı Muhasebe talebinin başlık ve değerlendirme alanları';



CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "employee_id" "uuid",
    "role" "text" DEFAULT 'ORG_VIEWER'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "privacy_accepted_at" timestamp with time zone
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."approval_letter_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "letter_date" "date" NOT NULL,
    "company" "text" NOT NULL,
    "project" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "content" "text" NOT NULL,
    "has_payment_table" boolean DEFAULT false,
    "comparison_approval_date" "date",
    "agreement_amount" "text",
    "has_contract" boolean,
    "paid_amounts" "jsonb" DEFAULT '[]'::"jsonb",
    "remaining_payment" "text",
    "requested_payment_amount" "text",
    "remaining_after_payment" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."approval_letter_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."companies" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."companies" OWNER TO "postgres";


COMMENT ON TABLE "public"."companies" IS 'Grup şirketleri tanım tablosu';



CREATE TABLE IF NOT EXISTS "public"."employee_positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "employee_id" "uuid" NOT NULL,
    "position_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "end_date" "date",
    "is_primary" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."employee_positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."employees" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "first_name" "text" NOT NULL,
    "last_name" "text" NOT NULL,
    "employee_no" "text",
    "email" "text",
    "phone" "text",
    "status" "text" DEFAULT 'ACTIVE'::"text" NOT NULL,
    "hire_date" "date",
    "termination_date" "date",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "signature_path" "text",
    "signature_text" "text",
    "signature_font" character varying(50) DEFAULT 'Great Vibes'::character varying,
    CONSTRAINT "employees_signature_font_check" CHECK (((("signature_font")::"text" = ANY ((ARRAY['Ballet'::character varying, 'Great Vibes'::character varying, 'Sacramento'::character varying])::"text"[])) OR ("signature_font" IS NULL)))
);


ALTER TABLE "public"."employees" OWNER TO "postgres";


COMMENT ON COLUMN "public"."employees"."signature_text" IS 'Dijital imza metni (genelde ad soyad)';



COMMENT ON COLUMN "public"."employees"."signature_font" IS 'Seçilen font: Ballet, Great Vibes, Sacramento';



CREATE TABLE IF NOT EXISTS "public"."expense_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "expense_request_id" "uuid" NOT NULL,
    "row_order" smallint NOT NULL,
    "item_date" "date" NOT NULL,
    "document_no" "text",
    "description" "text" NOT NULL,
    "amount" numeric(14,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expense_items_amount_check" CHECK (("amount" >= (0)::numeric))
);


ALTER TABLE "public"."expense_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."expense_items" IS 'Harcama Formu - harcama satırları (min 1 satır uygulama katmanında doğrulanır)';



CREATE TABLE IF NOT EXISTS "public"."expense_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "request_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "project_name" "text" NOT NULL,
    "project_code" "text" NOT NULL,
    "is_travel" boolean DEFAULT false NOT NULL,
    "work_or_destination" "text" NOT NULL,
    "travel_person_count" smallint,
    "travel_date" "date",
    "travel_duration" "text",
    "advance_amount" numeric(14,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "expense_requests_advance_amount_check" CHECK ((("advance_amount" IS NULL) OR ("advance_amount" >= (0)::numeric))),
    CONSTRAINT "expense_requests_travel_person_count_check" CHECK ((("travel_person_count" IS NULL) OR ("travel_person_count" > 0)))
);


ALTER TABLE "public"."expense_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."expense_requests" IS 'Harcama Formu talebinin başlık ve proje bilgileri';



CREATE TABLE IF NOT EXISTS "public"."finance_approval_cover_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "finance_request_id" "uuid" NOT NULL,
    "row_order" smallint NOT NULL,
    "item_date" "date" NOT NULL,
    "company_name" "text" NOT NULL,
    "payee_name" "text" NOT NULL,
    "item_subject" "text" NOT NULL,
    "invoice_amount" numeric(14,2) NOT NULL,
    "payable_amount" numeric(14,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "finance_approval_cover_items_invoice_amount_check" CHECK (("invoice_amount" >= (0)::numeric)),
    CONSTRAINT "finance_approval_cover_items_payable_amount_check" CHECK (("payable_amount" >= (0)::numeric))
);


ALTER TABLE "public"."finance_approval_cover_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."finance_approval_cover_items" IS 'Onay Kapağı Finans - ödeme tablosu satırları (min 1 satır uygulama katmanında doğrulanır)';



CREATE TABLE IF NOT EXISTS "public"."finance_approval_cover_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "subject" "text" NOT NULL,
    "request_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "document_no" "text" NOT NULL,
    "account_available" boolean NOT NULL,
    "cash_flow_recorded" boolean NOT NULL,
    "expense_area" "public"."finance_expense_area" NOT NULL,
    "funding_source" "public"."finance_funding_source" NOT NULL,
    "has_rt_enerji_proforma" boolean NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."finance_approval_cover_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."finance_approval_cover_requests" IS 'Onay Kapağı Finans talebinin başlık ve değerlendirme alanları';



CREATE TABLE IF NOT EXISTS "public"."grade_levels" (
    "band" smallint NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."grade_levels" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."leave_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "leave_type" "public"."leave_type" NOT NULL,
    "start_datetime" timestamp with time zone NOT NULL,
    "end_datetime" timestamp with time zone NOT NULL,
    "total_days" numeric(4,1),
    "remaining_days" numeric(4,1),
    "address_during_leave" "text",
    "reason" "text",
    "overtime_amount" numeric(10,2),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "hr_note" "text"
);


ALTER TABLE "public"."leave_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."leave_requests" IS 'İzin talebine özel veriler - requests tablosuyla 1:1 ilişkili';



COMMENT ON COLUMN "public"."leave_requests"."overtime_amount" IS 'Sadece yıllık izin için, İK tarafından girilir';



COMMENT ON COLUMN "public"."leave_requests"."hr_note" IS 'Personel Müdürlüğü tarafından eklenen not (opsiyonel)';



CREATE TABLE IF NOT EXISTS "public"."mukayese_items" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mukayese_request_id" "uuid" NOT NULL,
    "row_order" smallint NOT NULL,
    "row_type" "public"."mukayese_row_type" DEFAULT 'ITEM'::"public"."mukayese_row_type" NOT NULL,
    "description" "text",
    "quantity" numeric(14,4),
    "unit" "public"."mukayese_unit",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mukayese_items_check" CHECK (((("row_type" = 'ITEM'::"public"."mukayese_row_type") AND ("description" IS NOT NULL) AND ("quantity" IS NOT NULL) AND ("unit" IS NOT NULL) AND ("quantity" > (0)::numeric)) OR (("row_type" = 'SUBTOTAL'::"public"."mukayese_row_type") AND ("quantity" IS NULL) AND ("unit" IS NULL))))
);


ALTER TABLE "public"."mukayese_items" OWNER TO "postgres";


COMMENT ON TABLE "public"."mukayese_items" IS 'Mukayese matrisi satırları. row_type=SUBTOTAL satırları runtime''da hesaplanır.';



CREATE TABLE IF NOT EXISTS "public"."mukayese_prices" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mukayese_item_id" "uuid" NOT NULL,
    "mukayese_supplier_id" "uuid" NOT NULL,
    "unit_price" numeric(14,4) DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mukayese_prices_unit_price_check" CHECK (("unit_price" >= (0)::numeric))
);


ALTER TABLE "public"."mukayese_prices" OWNER TO "postgres";


COMMENT ON TABLE "public"."mukayese_prices" IS 'Mukayese matrisi hücreleri. Yalnızca ITEM satırları için kayıt oluşturulur.';



CREATE TABLE IF NOT EXISTS "public"."mukayese_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "project_title" "text" NOT NULL,
    "form_currency" "public"."mukayese_currency" NOT NULL,
    "fx_eur_try" numeric(12,4),
    "fx_usd_try" numeric(12,4),
    "fx_eur_usd" numeric(12,6),
    "fx_snapshot_at" timestamp with time zone,
    "form_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "notes" "text",
    "kdv_rate" numeric(5,2) DEFAULT 20.00 NOT NULL,
    "preparer_full_name" "text" NOT NULL,
    "company" "text" NOT NULL,
    "subject" "text" NOT NULL,
    "request_content" "text" NOT NULL,
    "request_amount_text" "text" NOT NULL,
    "request_reason" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "mukayese_requests_kdv_rate_check" CHECK ((("kdv_rate" >= (0)::numeric) AND ("kdv_rate" <= (100)::numeric)))
);


ALTER TABLE "public"."mukayese_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."mukayese_requests" IS 'Mukayese Formu başlık, FX snapshot ve footer metin alanları';



COMMENT ON COLUMN "public"."mukayese_requests"."form_currency" IS 'Mukayese tablosunda kullanılacak para birimi (form genelinde tek seçim)';



COMMENT ON COLUMN "public"."mukayese_requests"."fx_snapshot_at" IS 'FX kurlarının TCMB''den çekildiği zaman (geçmiş PDF üretiminde tutarlılık için)';



CREATE TABLE IF NOT EXISTS "public"."mukayese_suppliers" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "mukayese_request_id" "uuid" NOT NULL,
    "column_order" smallint NOT NULL,
    "company_name" "text" NOT NULL,
    "payment_terms" "text",
    "technical_description" "text",
    "delivery_time" "text",
    "contact_name" "text",
    "contact_phone" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."mukayese_suppliers" OWNER TO "postgres";


COMMENT ON TABLE "public"."mukayese_suppliers" IS 'Mukayese matrisi sütunları (teklif alınan firmalar) ve footer firma alanları';



CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "title" "text" NOT NULL,
    "message" "text" NOT NULL,
    "type" "public"."notification_type" NOT NULL,
    "reference_id" "uuid",
    "is_read" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."notifications" OWNER TO "postgres";


COMMENT ON TABLE "public"."notifications" IS 'In-app bildirimler';



COMMENT ON COLUMN "public"."notifications"."type" IS 'Bildirim tipi - UI''da farklı ikonlar için kullanılabilir';



COMMENT ON COLUMN "public"."notifications"."reference_id" IS 'Genellikle ilgili request_id';



CREATE TABLE IF NOT EXISTS "public"."onboarding_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "employee_name" "text",
    "employee_title" "text",
    "department" "text",
    "location" "text",
    "job_description" "text",
    "reporting_manager" "text",
    "start_date" "date",
    "employment_period" "text",
    "mail_setup_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "mail_setup_notes" "text",
    "mail_groups_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "mail_groups_notes" "text",
    "exit_reason_check_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "exit_reason_check_notes" "text",
    "sgk_verification_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "sgk_verification_notes" "text",
    "pdks_card_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "pdks_card_notes" "text",
    "guidelines_delivery_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "guidelines_delivery_notes" "text",
    "stationery_request_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "stationery_request_notes" "text",
    "desk_cabinet_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "desk_cabinet_notes" "text",
    "phone_setup_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "phone_setup_notes" "text",
    "hiring_announcement_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "hiring_announcement_notes" "text",
    "contact_info_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "contact_info_notes" "text",
    "org_chart_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "org_chart_notes" "text",
    "sgk_iskur_notification_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "sgk_iskur_notification_notes" "text",
    "safety_instructions_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "safety_instructions_notes" "text",
    "entry_registration_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "entry_registration_notes" "text",
    "documents_upload_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "documents_upload_notes" "text",
    "contract_signature_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "contract_signature_notes" "text",
    "s4_guidelines_delivery_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "s4_guidelines_delivery_notes" "text",
    "computer_setup_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "computer_setup_notes" "text",
    "qnap_o365_ip_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "qnap_o365_ip_notes" "text",
    "smoking_info_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "smoking_info_notes" "text",
    "evaluation_calendar_status" "public"."checklist_status" DEFAULT 'NOT_DONE'::"public"."checklist_status",
    "evaluation_calendar_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "hospital_notification_status" "text" DEFAULT 'NOT_DONE'::"text",
    "hospital_notification_notes" "text",
    "hospital_rights_notification_status" "text" DEFAULT 'NOT_DONE'::"text",
    "hospital_rights_notification_notes" "text"
);


ALTER TABLE "public"."onboarding_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."organizational_units" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "code" "text",
    "unit_type_id" "uuid" NOT NULL,
    "parent_id" "uuid",
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."organizational_units" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."overtime_entries" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "overtime_request_id" "uuid" NOT NULL,
    "role_title" character varying(100) NOT NULL,
    "overtime_hours" numeric(6,2) NOT NULL,
    "overtime_pay" numeric(10,2) NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "full_name" character varying(100)
);


ALTER TABLE "public"."overtime_entries" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."overtime_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "overtime_type" "public"."overtime_type" NOT NULL,
    "month" character varying(20) NOT NULL,
    "year" integer NOT NULL,
    "reason_category" "public"."overtime_reason_category" NOT NULL,
    "reason_detail" "text" NOT NULL,
    "hr_note" "text",
    "work_location" "text",
    "work_start_date" timestamp with time zone,
    "work_end_date" timestamp with time zone,
    "previous_shift" "text",
    "next_shift" "text",
    "work_reason" "text",
    "total_hours" numeric(10,2),
    "total_pay" numeric(12,2),
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "previous_shift_start" timestamp with time zone,
    "previous_shift_end" timestamp with time zone,
    "next_shift_start" timestamp with time zone,
    "next_shift_end" timestamp with time zone,
    CONSTRAINT "check_emergency_required_fields" CHECK ((("overtime_type" <> 'EMERGENCY'::"public"."overtime_type") OR (("work_location" IS NOT NULL) AND ("work_start_date" IS NOT NULL) AND ("work_end_date" IS NOT NULL) AND ("previous_shift_start" IS NOT NULL) AND ("previous_shift_end" IS NOT NULL) AND ("next_shift_start" IS NOT NULL) AND ("next_shift_end" IS NOT NULL) AND ("work_reason" IS NOT NULL)))),
    CONSTRAINT "check_reason_category_matches_type" CHECK (((("overtime_type" = 'EMERGENCY'::"public"."overtime_type") AND ("reason_category" = ANY (ARRAY['SHIFT_OUTSIDE'::"public"."overtime_reason_category", 'NON_CONTINUOUS'::"public"."overtime_reason_category", 'EMERGENCY_CASE'::"public"."overtime_reason_category", 'SUDDEN_DEVELOPMENT'::"public"."overtime_reason_category", 'ON_REQUEST'::"public"."overtime_reason_category"]))) OR (("overtime_type" = 'STAFF_SHORTAGE'::"public"."overtime_type") AND ("reason_category" = ANY (ARRAY['STAFF_SHORTAGE'::"public"."overtime_reason_category", 'REPORTING'::"public"."overtime_reason_category", 'ENERGY_PRODUCTION'::"public"."overtime_reason_category"])))))
);


ALTER TABLE "public"."overtime_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."position_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "color" "text",
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."position_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."positions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "title" "text" NOT NULL,
    "job_code" "text" NOT NULL,
    "level_band" smallint NOT NULL,
    "unit_id" "uuid" NOT NULL,
    "position_type_id" "uuid",
    "reports_to_position_id" "uuid",
    "location" "text",
    "is_unit_head" boolean DEFAULT false NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "order_index" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone
);


ALTER TABLE "public"."positions" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."request_approvals" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "workflow_step_id" "uuid" NOT NULL,
    "approver_employee_id" "uuid" NOT NULL,
    "status" "public"."approval_status" DEFAULT 'PENDING'::"public"."approval_status" NOT NULL,
    "comment" "text",
    "decided_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "sequence_order" integer NOT NULL
);


ALTER TABLE "public"."request_approvals" OWNER TO "postgres";


COMMENT ON TABLE "public"."request_approvals" IS 'Her onay adımının kaydı - kim, ne zaman, ne karar verdi';



COMMENT ON COLUMN "public"."request_approvals"."comment" IS 'Özellikle red durumunda zorunlu olabilir';



CREATE TABLE IF NOT EXISTS "public"."request_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "step_attachment_config_id" "uuid" NOT NULL,
    "file_name" "text" NOT NULL,
    "file_path" "text" NOT NULL,
    "file_size" bigint NOT NULL,
    "mime_type" "text" NOT NULL,
    "uploaded_by" "uuid" NOT NULL,
    "uploaded_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."request_attachments" OWNER TO "postgres";


COMMENT ON TABLE "public"."request_attachments" IS 'Workflow adımlarına yüklenen ek dosyalar';



COMMENT ON COLUMN "public"."request_attachments"."file_name" IS 'Orijinal dosya adı, örn: zimmet-tutanagi.pdf';



COMMENT ON COLUMN "public"."request_attachments"."file_path" IS 'Supabase Storage path';



COMMENT ON COLUMN "public"."request_attachments"."file_size" IS 'Dosya boyutu (bytes)';



COMMENT ON COLUMN "public"."request_attachments"."uploaded_by" IS 'Dosyayı yükleyen çalışan';



CREATE TABLE IF NOT EXISTS "public"."request_form_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "requester_name" "text" NOT NULL,
    "company" "text" NOT NULL,
    "request_date" "date" DEFAULT CURRENT_DATE NOT NULL,
    "subject" "text" NOT NULL,
    "content" "text" NOT NULL,
    "amount" numeric(12,2),
    "reason" "text",
    "request_type" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "quantity" "text",
    CONSTRAINT "request_form_requests_request_type_check" CHECK (("request_type" = ANY (ARRAY['MUTFAK'::"text", 'KIRTASIYE'::"text", 'DIGER'::"text"])))
);


ALTER TABLE "public"."request_form_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_definition_id" "uuid" NOT NULL,
    "requester_employee_id" "uuid" NOT NULL,
    "status" "public"."request_status" DEFAULT 'DRAFT'::"public"."request_status" NOT NULL,
    "current_step" smallint DEFAULT 1 NOT NULL,
    "submitted_at" timestamp with time zone,
    "completed_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "pdf_path" "text",
    "parent_request_id" "uuid"
);


ALTER TABLE "public"."requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."requests" IS 'Tüm talepler - workflow_definition_id ile süreç tipine bağlanır';



COMMENT ON COLUMN "public"."requests"."current_step" IS 'Şu an bekleyen adım numarası (workflow_steps.step_order)';



COMMENT ON COLUMN "public"."requests"."parent_request_id" IS 'İlişkili üst talep ID. Örnek: Görev formundan otomatik oluşturulan avans talebi, görev formuna bağlanır. NULL = bağımsız talep.';



CREATE TABLE IF NOT EXISTS "public"."salary_advance_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "amount" numeric(10,2) NOT NULL,
    "salary_deduction_consent" boolean DEFAULT false,
    "payment_method" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "salary_advance_requests_payment_method_check" CHECK (("payment_method" = ANY (ARRAY['CASH'::"text", 'BANK_TRANSFER'::"text"])))
);


ALTER TABLE "public"."salary_advance_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."separation_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "employee_name" "text",
    "employee_title" "text",
    "department" "text",
    "location" "text",
    "job_description" "text",
    "reporting_manager" "text",
    "separation_date" "date",
    "separation_reason" "text",
    "employment_period" "text",
    "annual_leave_days" integer DEFAULT 0,
    "annual_leave_amount" numeric DEFAULT 0,
    "severance_days" integer DEFAULT 0,
    "severance_amount" numeric DEFAULT 0,
    "notice_weeks" integer DEFAULT 0,
    "notice_amount" numeric DEFAULT 0,
    "email_closure_status" "text" DEFAULT 'NOT_DONE'::"text",
    "email_closure_notes" "text",
    "it_access_revocation_status" "text" DEFAULT 'NOT_DONE'::"text",
    "it_access_revocation_notes" "text",
    "exit_documents_status" "text" DEFAULT 'NOT_DONE'::"text",
    "exit_documents_notes" "text",
    "personnel_list_removal_status" "text" DEFAULT 'NOT_DONE'::"text",
    "personnel_list_removal_notes" "text",
    "payroll_processing_status" "text" DEFAULT 'NOT_DONE'::"text",
    "payroll_processing_notes" "text",
    "advance_check_status" "text" DEFAULT 'NOT_DONE'::"text",
    "advance_check_notes" "text",
    "equipment_return_status" "text" DEFAULT 'NOT_DONE'::"text",
    "equipment_return_notes" "text",
    "uniform_return_status" "text" DEFAULT 'NOT_DONE'::"text",
    "uniform_return_notes" "text",
    "hospital_removal_status" "text" DEFAULT 'NOT_DONE'::"text",
    "hospital_removal_notes" "text",
    "access_card_return_status" "text" DEFAULT 'NOT_DONE'::"text",
    "access_card_return_notes" "text",
    "security_notification_status" "text" DEFAULT 'NOT_DONE'::"text",
    "security_notification_notes" "text",
    "org_chart_removal_status" "text" DEFAULT 'NOT_DONE'::"text",
    "org_chart_removal_notes" "text",
    "sgk_notification_status" "text" DEFAULT 'NOT_DONE'::"text",
    "sgk_notification_notes" "text",
    "poa_uyap_revocation_status" "text" DEFAULT 'NOT_DONE'::"text",
    "poa_uyap_revocation_notes" "text",
    "mersis_revocation_status" "text" DEFAULT 'NOT_DONE'::"text",
    "mersis_revocation_notes" "text",
    "legal_equipment_return_status" "text" DEFAULT 'NOT_DONE'::"text",
    "legal_equipment_return_notes" "text",
    "expense_form_submission_status" "text" DEFAULT 'NOT_DONE'::"text",
    "expense_form_submission_notes" "text",
    "expense_form_review_status" "text" DEFAULT 'NOT_DONE'::"text",
    "expense_form_review_notes" "text",
    "accounting_advance_check_status" "text" DEFAULT 'NOT_DONE'::"text",
    "accounting_advance_check_notes" "text",
    "bank_institution_access_revocation_status" "text" DEFAULT 'NOT_DONE'::"text",
    "bank_institution_access_revocation_notes" "text",
    "qnap_o365_ip_removal_status" "text" DEFAULT 'NOT_DONE'::"text",
    "qnap_o365_ip_removal_notes" "text",
    "pc_check_status" "text" DEFAULT 'NOT_DONE'::"text",
    "pc_check_notes" "text",
    "documents_scan_status" "text" DEFAULT 'NOT_DONE'::"text",
    "documents_scan_notes" "text",
    "evaluation_calendar_removal_status" "text" DEFAULT 'NOT_DONE'::"text",
    "evaluation_calendar_removal_notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."separation_requests" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."stamp_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "stamp_id" "uuid" NOT NULL,
    "original_pdf_path" "text" NOT NULL,
    "stamped_pdf_path" "text",
    "selected_pages" "text" DEFAULT 'all'::"text" NOT NULL,
    "stamp_position" "text" DEFAULT 'bottom-right'::"text" NOT NULL,
    "description" "text",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    "subject" "text" DEFAULT ''::"text" NOT NULL,
    "stamp_x_ratio" numeric(7,6),
    "stamp_y_ratio" numeric(7,6),
    "stamp_position_overrides" "jsonb",
    CONSTRAINT "stamp_requests_overrides_is_object" CHECK ((("stamp_position_overrides" IS NULL) OR ("jsonb_typeof"("stamp_position_overrides") = 'object'::"text"))),
    CONSTRAINT "stamp_requests_ratio_bounds" CHECK (((("stamp_x_ratio" IS NULL) OR (("stamp_x_ratio" >= (0)::numeric) AND ("stamp_x_ratio" <= (1)::numeric))) AND (("stamp_y_ratio" IS NULL) OR (("stamp_y_ratio" >= (0)::numeric) AND ("stamp_y_ratio" <= (1)::numeric))))),
    CONSTRAINT "stamp_requests_xy_both_or_none" CHECK (((("stamp_x_ratio" IS NULL) AND ("stamp_y_ratio" IS NULL)) OR (("stamp_x_ratio" IS NOT NULL) AND ("stamp_y_ratio" IS NOT NULL))))
);


ALTER TABLE "public"."stamp_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."stamp_requests" IS 'Kaşeli belge onay süreci detayları';



COMMENT ON COLUMN "public"."stamp_requests"."stamp_x_ratio" IS 'Kaşenin sol-üst köşesi için X oranı (0-1), UI top-left origin. NULL ise stamp_position preset kullanılır.';



COMMENT ON COLUMN "public"."stamp_requests"."stamp_y_ratio" IS 'Kaşenin sol-üst köşesi için Y oranı (0-1), UI top-left origin. NULL ise stamp_position preset kullanılır.';



COMMENT ON COLUMN "public"."stamp_requests"."stamp_position_overrides" IS 'Sayfa bazlı konum override. Format: {"<1-based_page_number>": {"x": 0-1, "y": 0-1}}. NULL veya {} ise tüm sayfalarda default ratio kullanılır.';



CREATE TABLE IF NOT EXISTS "public"."stamps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "name" "text" NOT NULL,
    "image_path" "text" NOT NULL,
    "width" integer DEFAULT 150 NOT NULL,
    "height" integer DEFAULT 150 NOT NULL,
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."stamps" OWNER TO "postgres";


COMMENT ON TABLE "public"."stamps" IS 'Sistemde tanımlı kaşe görselleri';



CREATE TABLE IF NOT EXISTS "public"."travel_assignment_requests" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "request_id" "uuid" NOT NULL,
    "company_id" "uuid" NOT NULL,
    "assignment_subject" "text" NOT NULL,
    "destination_city" "text" NOT NULL,
    "destination_institution" "text" NOT NULL,
    "estimated_departure_at" timestamp with time zone NOT NULL,
    "estimated_return_at" timestamp with time zone NOT NULL,
    "transportation_type" "text" NOT NULL,
    "transportation_cost" numeric(10,2) DEFAULT 0,
    "accommodation_needed" boolean DEFAULT false NOT NULL,
    "accommodation_cost" numeric(10,2) DEFAULT 0,
    "advance_requested" boolean DEFAULT false NOT NULL,
    "actual_departure_at" timestamp with time zone,
    "actual_return_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"(),
    "updated_at" timestamp with time zone DEFAULT "now"(),
    CONSTRAINT "travel_assignment_requests_transportation_type_check" CHECK (("transportation_type" = ANY (ARRAY['COMPANY_VEHICLE'::"text", 'RENTAL_VEHICLE'::"text", 'AIRPLANE'::"text", 'OTHER'::"text"])))
);


ALTER TABLE "public"."travel_assignment_requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."travel_assignment_requests" IS 'Şehir içi/dışı görev formu detayları - requests tablosuyla 1:1 ilişkili';



CREATE TABLE IF NOT EXISTS "public"."unit_types" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "display_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."unit_types" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."user_ms_tokens" (
    "user_id" "uuid" NOT NULL,
    "access_token" "text" NOT NULL,
    "access_token_expires_at" timestamp with time zone NOT NULL,
    "refresh_token" "text" NOT NULL,
    "scope" "text",
    "provider_user_id" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."user_ms_tokens" OWNER TO "postgres";


COMMENT ON TABLE "public"."user_ms_tokens" IS 'Microsoft Graph Delegated OAuth token store. Server-only via service_role; RLS bloklu.';



COMMENT ON COLUMN "public"."user_ms_tokens"."user_id" IS 'auth.users.id ile 1:1. Kullanıcı silinirse cascade ile silinir.';



COMMENT ON COLUMN "public"."user_ms_tokens"."access_token" IS 'Short-lived access token (~1 saat). Bitince refresh_token ile yenilenir.';



COMMENT ON COLUMN "public"."user_ms_tokens"."refresh_token" IS 'Long-lived refresh token (90 güne kadar). Hassas; client''a asla gönderme.';



COMMENT ON COLUMN "public"."user_ms_tokens"."scope" IS 'Son refresh sırasında Graph tarafından iade edilen scope listesi (space separated).';



CREATE TABLE IF NOT EXISTS "public"."workflow_definitions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "code" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text",
    "is_active" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone,
    "is_restricted" boolean DEFAULT false
);


ALTER TABLE "public"."workflow_definitions" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_definitions" IS 'Süreç şablonları - her onay türü için bir tanım';



COMMENT ON COLUMN "public"."workflow_definitions"."code" IS 'Benzersiz süreç kodu: ANNUAL_LEAVE, SHORT_LEAVE, ADVANCE_REQUEST vb.';



COMMENT ON COLUMN "public"."workflow_definitions"."is_restricted" IS 'true ise sadece workflow_initiators tablosundaki pozisyonlar başlatabilir';



CREATE TABLE IF NOT EXISTS "public"."workflow_initiators" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_definition_id" "uuid" NOT NULL,
    "position_id" "uuid",
    "created_at" timestamp with time zone DEFAULT "now"(),
    "unit_id" "uuid",
    CONSTRAINT "chk_position_or_unit" CHECK ((("position_id" IS NOT NULL) OR ("unit_id" IS NOT NULL)))
);


ALTER TABLE "public"."workflow_initiators" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_initiators" IS 'Kısıtlı workflow''ları hangi pozisyonların başlatabileceğini tanımlar';



CREATE TABLE IF NOT EXISTS "public"."workflow_step_attachments" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_step_id" "uuid" NOT NULL,
    "label" "text" NOT NULL,
    "is_required" boolean DEFAULT false NOT NULL,
    "allowed_mime_types" "text"[] DEFAULT '{application/pdf}'::"text"[],
    "max_file_size_bytes" bigint DEFAULT 10485760,
    "max_files" integer DEFAULT 1,
    "created_at" timestamp with time zone DEFAULT "now"()
);


ALTER TABLE "public"."workflow_step_attachments" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_step_attachments" IS 'Workflow adımlarında beklenen ek dosya konfigürasyonları';



COMMENT ON COLUMN "public"."workflow_step_attachments"."label" IS 'Dosya etiketi, örn: Zimmet Tutanağı';



COMMENT ON COLUMN "public"."workflow_step_attachments"."is_required" IS 'true ise onay için dosya yüklenmesi zorunlu';



COMMENT ON COLUMN "public"."workflow_step_attachments"."allowed_mime_types" IS 'İzin verilen dosya tipleri';



COMMENT ON COLUMN "public"."workflow_step_attachments"."max_file_size_bytes" IS 'Maksimum dosya boyutu (bytes), varsayılan 10MB';



COMMENT ON COLUMN "public"."workflow_step_attachments"."max_files" IS 'Bu config için yüklenebilecek maksimum dosya sayısı';



CREATE TABLE IF NOT EXISTS "public"."workflow_steps" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "workflow_definition_id" "uuid" NOT NULL,
    "step_order" smallint NOT NULL,
    "name" "text" NOT NULL,
    "approver_type" "public"."approver_type" NOT NULL,
    "static_position_id" "uuid",
    "is_required" boolean DEFAULT true NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "action_type" "text" DEFAULT 'SIGN_ONLY'::"text",
    "form_section_key" "text",
    "condition" "jsonb",
    "phase" "text" DEFAULT 'APPROVAL'::"text" NOT NULL,
    CONSTRAINT "workflow_steps_action_type_check" CHECK (("action_type" = ANY (ARRAY['FILL_AND_SIGN'::"text", 'SIGN_ONLY'::"text"]))),
    CONSTRAINT "workflow_steps_phase_check" CHECK (("phase" = ANY (ARRAY['APPROVAL'::"text", 'COMPLETION'::"text"])))
);


ALTER TABLE "public"."workflow_steps" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_steps" IS 'Her sürecin sıralı onay adımları';



COMMENT ON COLUMN "public"."workflow_steps"."approver_type" IS 'REQUESTER: Talep eden, UNIT_HEAD: Birim müdürü, STATIC_POSITION: Sabit pozisyon';



COMMENT ON COLUMN "public"."workflow_steps"."static_position_id" IS 'Sadece STATIC_POSITION tipi için gerekli';



COMMENT ON COLUMN "public"."workflow_steps"."action_type" IS 'FILL_AND_SIGN: Form bölümü doldur + imzala, SIGN_ONLY: Sadece imzala';



COMMENT ON COLUMN "public"."workflow_steps"."form_section_key" IS 'FILL_AND_SIGN adımları için hangi form bölümünün doldurulacağı';



COMMENT ON COLUMN "public"."workflow_steps"."condition" IS 'Koşullu adım tanımı. NULL = her zaman çalışır. Örnek: {"field": "advance_requested", "value": true} — sadece ilgili alan eşleştiğinde aktif olur.';



COMMENT ON COLUMN "public"."workflow_steps"."phase" IS 'Adımın fazı. APPROVAL = onay adımı (varsayılan). COMPLETION = süreç onaylandıktan sonra tamamlama adımı.';



ALTER TABLE ONLY "public"."accounting_approval_cover_items"
    ADD CONSTRAINT "accounting_approval_cover_ite_accounting_request_id_row_ord_key" UNIQUE ("accounting_request_id", "row_order");



ALTER TABLE ONLY "public"."accounting_approval_cover_items"
    ADD CONSTRAINT "accounting_approval_cover_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_approval_cover_requests"
    ADD CONSTRAINT "accounting_approval_cover_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."accounting_approval_cover_requests"
    ADD CONSTRAINT "accounting_approval_cover_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_letter_requests"
    ADD CONSTRAINT "approval_letter_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."approval_letter_requests"
    ADD CONSTRAINT "approval_letter_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."companies"
    ADD CONSTRAINT "companies_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_positions"
    ADD CONSTRAINT "employee_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_employee_no_key" UNIQUE ("employee_no");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_items"
    ADD CONSTRAINT "expense_items_expense_request_id_row_order_key" UNIQUE ("expense_request_id", "row_order");



ALTER TABLE ONLY "public"."expense_items"
    ADD CONSTRAINT "expense_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_requests"
    ADD CONSTRAINT "expense_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."expense_requests"
    ADD CONSTRAINT "expense_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."finance_approval_cover_items"
    ADD CONSTRAINT "finance_approval_cover_items_finance_request_id_row_order_key" UNIQUE ("finance_request_id", "row_order");



ALTER TABLE ONLY "public"."finance_approval_cover_items"
    ADD CONSTRAINT "finance_approval_cover_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_approval_cover_requests"
    ADD CONSTRAINT "finance_approval_cover_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."finance_approval_cover_requests"
    ADD CONSTRAINT "finance_approval_cover_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."grade_levels"
    ADD CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("band");



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."mukayese_items"
    ADD CONSTRAINT "mukayese_items_mukayese_request_id_row_order_key" UNIQUE ("mukayese_request_id", "row_order");



ALTER TABLE ONLY "public"."mukayese_items"
    ADD CONSTRAINT "mukayese_items_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mukayese_prices"
    ADD CONSTRAINT "mukayese_prices_mukayese_item_id_mukayese_supplier_id_key" UNIQUE ("mukayese_item_id", "mukayese_supplier_id");



ALTER TABLE ONLY "public"."mukayese_prices"
    ADD CONSTRAINT "mukayese_prices_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mukayese_requests"
    ADD CONSTRAINT "mukayese_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."mukayese_requests"
    ADD CONSTRAINT "mukayese_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."mukayese_suppliers"
    ADD CONSTRAINT "mukayese_suppliers_mukayese_request_id_column_order_key" UNIQUE ("mukayese_request_id", "column_order");



ALTER TABLE ONLY "public"."mukayese_suppliers"
    ADD CONSTRAINT "mukayese_suppliers_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_requests"
    ADD CONSTRAINT "onboarding_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."onboarding_requests"
    ADD CONSTRAINT "onboarding_requests_request_id_unique" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."organizational_units"
    ADD CONSTRAINT "organizational_units_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."organizational_units"
    ADD CONSTRAINT "organizational_units_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."overtime_entries"
    ADD CONSTRAINT "overtime_entries_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."overtime_requests"
    ADD CONSTRAINT "overtime_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."overtime_requests"
    ADD CONSTRAINT "overtime_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."position_types"
    ADD CONSTRAINT "position_types_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."position_types"
    ADD CONSTRAINT "position_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_job_code_key" UNIQUE ("job_code");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."request_approvals"
    ADD CONSTRAINT "request_approvals_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."request_approvals"
    ADD CONSTRAINT "request_approvals_request_step_approver_key" UNIQUE ("request_id", "workflow_step_id", "approver_employee_id");



ALTER TABLE ONLY "public"."request_attachments"
    ADD CONSTRAINT "request_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."request_form_requests"
    ADD CONSTRAINT "request_form_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."request_form_requests"
    ADD CONSTRAINT "request_form_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salary_advance_requests"
    ADD CONSTRAINT "salary_advance_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."salary_advance_requests"
    ADD CONSTRAINT "salary_advance_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."separation_requests"
    ADD CONSTRAINT "separation_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."separation_requests"
    ADD CONSTRAINT "separation_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."stamp_requests"
    ADD CONSTRAINT "stamp_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."stamp_requests"
    ADD CONSTRAINT "stamp_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."stamps"
    ADD CONSTRAINT "stamps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."travel_assignment_requests"
    ADD CONSTRAINT "travel_assignment_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."travel_assignment_requests"
    ADD CONSTRAINT "travel_assignment_requests_request_id_key" UNIQUE ("request_id");



ALTER TABLE ONLY "public"."unit_types"
    ADD CONSTRAINT "unit_types_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."unit_types"
    ADD CONSTRAINT "unit_types_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."user_ms_tokens"
    ADD CONSTRAINT "user_ms_tokens_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."workflow_definitions"
    ADD CONSTRAINT "workflow_definitions_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."workflow_definitions"
    ADD CONSTRAINT "workflow_definitions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_initiators"
    ADD CONSTRAINT "workflow_initiators_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_initiators"
    ADD CONSTRAINT "workflow_initiators_workflow_definition_id_position_id_key" UNIQUE ("workflow_definition_id", "position_id");



ALTER TABLE ONLY "public"."workflow_step_attachments"
    ADD CONSTRAINT "workflow_step_attachments_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_workflow_definition_id_step_order_key" UNIQUE ("workflow_definition_id", "step_order");



CREATE INDEX "idx_accounting_approval_cover_items_parent" ON "public"."accounting_approval_cover_items" USING "btree" ("accounting_request_id");



CREATE INDEX "idx_accounting_approval_cover_requests_request_id" ON "public"."accounting_approval_cover_requests" USING "btree" ("request_id");



CREATE INDEX "idx_approval_letter_requests_request_id" ON "public"."approval_letter_requests" USING "btree" ("request_id");



CREATE INDEX "idx_employee_positions_employee" ON "public"."employee_positions" USING "btree" ("employee_id");



CREATE INDEX "idx_employee_positions_position" ON "public"."employee_positions" USING "btree" ("position_id");



CREATE INDEX "idx_expense_items_parent" ON "public"."expense_items" USING "btree" ("expense_request_id");



CREATE INDEX "idx_expense_requests_request_id" ON "public"."expense_requests" USING "btree" ("request_id");



CREATE INDEX "idx_finance_approval_cover_items_parent" ON "public"."finance_approval_cover_items" USING "btree" ("finance_request_id");



CREATE INDEX "idx_finance_approval_cover_requests_request_id" ON "public"."finance_approval_cover_requests" USING "btree" ("request_id");



CREATE INDEX "idx_leave_requests_request" ON "public"."leave_requests" USING "btree" ("request_id");



CREATE INDEX "idx_leave_requests_type" ON "public"."leave_requests" USING "btree" ("leave_type");



CREATE INDEX "idx_mukayese_items_parent" ON "public"."mukayese_items" USING "btree" ("mukayese_request_id");



CREATE INDEX "idx_mukayese_prices_item" ON "public"."mukayese_prices" USING "btree" ("mukayese_item_id");



CREATE INDEX "idx_mukayese_prices_supplier" ON "public"."mukayese_prices" USING "btree" ("mukayese_supplier_id");



CREATE INDEX "idx_mukayese_requests_request_id" ON "public"."mukayese_requests" USING "btree" ("request_id");



CREATE INDEX "idx_mukayese_suppliers_parent" ON "public"."mukayese_suppliers" USING "btree" ("mukayese_request_id");



CREATE INDEX "idx_notifications_unread" ON "public"."notifications" USING "btree" ("user_id", "is_read") WHERE ("is_read" = false);



CREATE INDEX "idx_notifications_user" ON "public"."notifications" USING "btree" ("user_id");



CREATE INDEX "idx_onboarding_requests_request_id" ON "public"."onboarding_requests" USING "btree" ("request_id");



CREATE INDEX "idx_overtime_entries_request_id" ON "public"."overtime_entries" USING "btree" ("overtime_request_id");



CREATE INDEX "idx_overtime_requests_request_id" ON "public"."overtime_requests" USING "btree" ("request_id");



CREATE INDEX "idx_overtime_requests_type" ON "public"."overtime_requests" USING "btree" ("overtime_type");



CREATE INDEX "idx_ra_config_id" ON "public"."request_attachments" USING "btree" ("step_attachment_config_id");



CREATE INDEX "idx_ra_request_id" ON "public"."request_attachments" USING "btree" ("request_id");



CREATE INDEX "idx_request_approvals_approver" ON "public"."request_approvals" USING "btree" ("approver_employee_id");



CREATE INDEX "idx_request_approvals_request" ON "public"."request_approvals" USING "btree" ("request_id");



CREATE INDEX "idx_request_approvals_request_sequence" ON "public"."request_approvals" USING "btree" ("request_id", "sequence_order");



CREATE INDEX "idx_request_approvals_status" ON "public"."request_approvals" USING "btree" ("status");



CREATE INDEX "idx_request_form_requests_request_id" ON "public"."request_form_requests" USING "btree" ("request_id");



CREATE INDEX "idx_requests_parent_request_id" ON "public"."requests" USING "btree" ("parent_request_id") WHERE ("parent_request_id" IS NOT NULL);



CREATE INDEX "idx_requests_requester" ON "public"."requests" USING "btree" ("requester_employee_id");



CREATE INDEX "idx_requests_status" ON "public"."requests" USING "btree" ("status");



CREATE INDEX "idx_requests_workflow" ON "public"."requests" USING "btree" ("workflow_definition_id");



CREATE INDEX "idx_separation_requests_request_id" ON "public"."separation_requests" USING "btree" ("request_id");



CREATE INDEX "idx_travel_assignment_requests_request" ON "public"."travel_assignment_requests" USING "btree" ("request_id");



CREATE INDEX "idx_workflow_steps_definition" ON "public"."workflow_steps" USING "btree" ("workflow_definition_id");



CREATE OR REPLACE TRIGGER "set_updated_at_leave_requests" BEFORE UPDATE ON "public"."leave_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at_requests" BEFORE UPDATE ON "public"."requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at_travel_assignment_requests" BEFORE UPDATE ON "public"."travel_assignment_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at_workflow_definitions" BEFORE UPDATE ON "public"."workflow_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "trg_user_ms_tokens_updated_at" BEFORE UPDATE ON "public"."user_ms_tokens" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "public"."accounting_approval_cover_items"
    ADD CONSTRAINT "accounting_approval_cover_items_accounting_request_id_fkey" FOREIGN KEY ("accounting_request_id") REFERENCES "public"."accounting_approval_cover_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."accounting_approval_cover_requests"
    ADD CONSTRAINT "accounting_approval_cover_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."approval_letter_requests"
    ADD CONSTRAINT "approval_letter_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_positions"
    ADD CONSTRAINT "employee_positions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."employee_positions"
    ADD CONSTRAINT "employee_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id");



ALTER TABLE ONLY "public"."expense_items"
    ADD CONSTRAINT "expense_items_expense_request_id_fkey" FOREIGN KEY ("expense_request_id") REFERENCES "public"."expense_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."expense_requests"
    ADD CONSTRAINT "expense_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_approval_cover_items"
    ADD CONSTRAINT "finance_approval_cover_items_finance_request_id_fkey" FOREIGN KEY ("finance_request_id") REFERENCES "public"."finance_approval_cover_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."finance_approval_cover_requests"
    ADD CONSTRAINT "finance_approval_cover_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mukayese_items"
    ADD CONSTRAINT "mukayese_items_mukayese_request_id_fkey" FOREIGN KEY ("mukayese_request_id") REFERENCES "public"."mukayese_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mukayese_prices"
    ADD CONSTRAINT "mukayese_prices_mukayese_item_id_fkey" FOREIGN KEY ("mukayese_item_id") REFERENCES "public"."mukayese_items"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mukayese_prices"
    ADD CONSTRAINT "mukayese_prices_mukayese_supplier_id_fkey" FOREIGN KEY ("mukayese_supplier_id") REFERENCES "public"."mukayese_suppliers"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mukayese_requests"
    ADD CONSTRAINT "mukayese_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."mukayese_suppliers"
    ADD CONSTRAINT "mukayese_suppliers_mukayese_request_id_fkey" FOREIGN KEY ("mukayese_request_id") REFERENCES "public"."mukayese_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."notifications"
    ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."onboarding_requests"
    ADD CONSTRAINT "onboarding_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."organizational_units"
    ADD CONSTRAINT "organizational_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "public"."organizational_units"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."organizational_units"
    ADD CONSTRAINT "organizational_units_unit_type_id_fkey" FOREIGN KEY ("unit_type_id") REFERENCES "public"."unit_types"("id");



ALTER TABLE ONLY "public"."overtime_entries"
    ADD CONSTRAINT "overtime_entries_overtime_request_id_fkey" FOREIGN KEY ("overtime_request_id") REFERENCES "public"."overtime_requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."overtime_requests"
    ADD CONSTRAINT "overtime_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_level_band_fkey" FOREIGN KEY ("level_band") REFERENCES "public"."grade_levels"("band");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_position_type_id_fkey" FOREIGN KEY ("position_type_id") REFERENCES "public"."position_types"("id");



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_reports_to_position_id_fkey" FOREIGN KEY ("reports_to_position_id") REFERENCES "public"."positions"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."positions"
    ADD CONSTRAINT "positions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."organizational_units"("id");



ALTER TABLE ONLY "public"."request_approvals"
    ADD CONSTRAINT "request_approvals_approver_employee_id_fkey" FOREIGN KEY ("approver_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."request_approvals"
    ADD CONSTRAINT "request_approvals_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."request_approvals"
    ADD CONSTRAINT "request_approvals_workflow_step_id_fkey" FOREIGN KEY ("workflow_step_id") REFERENCES "public"."workflow_steps"("id");



ALTER TABLE ONLY "public"."request_attachments"
    ADD CONSTRAINT "request_attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."request_attachments"
    ADD CONSTRAINT "request_attachments_step_attachment_config_id_fkey" FOREIGN KEY ("step_attachment_config_id") REFERENCES "public"."workflow_step_attachments"("id");



ALTER TABLE ONLY "public"."request_attachments"
    ADD CONSTRAINT "request_attachments_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."request_form_requests"
    ADD CONSTRAINT "request_form_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_parent_request_id_fkey" FOREIGN KEY ("parent_request_id") REFERENCES "public"."requests"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_requester_employee_id_fkey" FOREIGN KEY ("requester_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_workflow_definition_id_fkey" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id");



ALTER TABLE ONLY "public"."salary_advance_requests"
    ADD CONSTRAINT "salary_advance_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."separation_requests"
    ADD CONSTRAINT "separation_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stamp_requests"
    ADD CONSTRAINT "stamp_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."stamp_requests"
    ADD CONSTRAINT "stamp_requests_stamp_id_fkey" FOREIGN KEY ("stamp_id") REFERENCES "public"."stamps"("id");



ALTER TABLE ONLY "public"."travel_assignment_requests"
    ADD CONSTRAINT "travel_assignment_requests_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id");



ALTER TABLE ONLY "public"."travel_assignment_requests"
    ADD CONSTRAINT "travel_assignment_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."user_ms_tokens"
    ADD CONSTRAINT "user_ms_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_initiators"
    ADD CONSTRAINT "workflow_initiators_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_initiators"
    ADD CONSTRAINT "workflow_initiators_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "public"."organizational_units"("id");



ALTER TABLE ONLY "public"."workflow_initiators"
    ADD CONSTRAINT "workflow_initiators_workflow_definition_id_fkey" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_step_attachments"
    ADD CONSTRAINT "workflow_step_attachments_workflow_step_id_fkey" FOREIGN KEY ("workflow_step_id") REFERENCES "public"."workflow_steps"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_static_position_id_fkey" FOREIGN KEY ("static_position_id") REFERENCES "public"."positions"("id");



ALTER TABLE ONLY "public"."workflow_steps"
    ADD CONSTRAINT "workflow_steps_workflow_definition_id_fkey" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id") ON DELETE CASCADE;



ALTER TABLE "public"."accounting_approval_cover_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounting_approval_cover_items_delete" ON "public"."accounting_approval_cover_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (("public"."accounting_approval_cover_requests" "acr"
     JOIN "public"."requests" "r" ON (("r"."id" = "acr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("acr"."id" = "accounting_approval_cover_items"."accounting_request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



CREATE POLICY "accounting_approval_cover_items_insert" ON "public"."accounting_approval_cover_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."accounting_approval_cover_requests" "acr"
     JOIN "public"."requests" "r" ON (("r"."id" = "acr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("acr"."id" = "accounting_approval_cover_items"."accounting_request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "accounting_approval_cover_items_select" ON "public"."accounting_approval_cover_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."accounting_approval_cover_requests" "acr"
     JOIN "public"."requests" "r" ON (("r"."id" = "acr"."request_id")))
  WHERE (("acr"."id" = "accounting_approval_cover_items"."accounting_request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))))))));



CREATE POLICY "accounting_approval_cover_items_update" ON "public"."accounting_approval_cover_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."accounting_approval_cover_requests" "acr"
     JOIN "public"."requests" "r" ON (("r"."id" = "acr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("acr"."id" = "accounting_approval_cover_items"."accounting_request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



ALTER TABLE "public"."accounting_approval_cover_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "accounting_approval_cover_requests_insert" ON "public"."accounting_approval_cover_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "accounting_approval_cover_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "accounting_approval_cover_requests_select" ON "public"."accounting_approval_cover_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "accounting_approval_cover_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))))))));



CREATE POLICY "accounting_approval_cover_requests_update" ON "public"."accounting_approval_cover_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "accounting_approval_cover_requests"."request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_users_select_all" ON "public"."app_users" FOR SELECT TO "authenticated" USING (true);



CREATE POLICY "app_users_update_privacy_self" ON "public"."app_users" FOR UPDATE USING (("id" = "auth"."uid"())) WITH CHECK (("id" = "auth"."uid"()));



ALTER TABLE "public"."approval_letter_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "approval_letter_requests_insert" ON "public"."approval_letter_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "approval_letter_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "approval_letter_requests_select" ON "public"."approval_letter_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "approval_letter_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))))))));



ALTER TABLE "public"."companies" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "companies_insert_admin" ON "public"."companies" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "companies_select_auth" ON "public"."companies" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['ORG_ADMIN'::"text", 'ORG_VIEWER'::"text"]))))));



CREATE POLICY "companies_update_admin" ON "public"."companies" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



ALTER TABLE "public"."employee_positions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employee_positions_delete_admin" ON "public"."employee_positions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "employee_positions_insert_admin" ON "public"."employee_positions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "employee_positions_select_auth" ON "public"."employee_positions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['ORG_ADMIN'::"text", 'ORG_VIEWER'::"text"]))))));



CREATE POLICY "employee_positions_update_admin" ON "public"."employee_positions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



ALTER TABLE "public"."employees" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "employees_delete_admin" ON "public"."employees" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "employees_insert_admin" ON "public"."employees" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "employees_select_auth" ON "public"."employees" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['ORG_ADMIN'::"text", 'ORG_VIEWER'::"text"]))))));



CREATE POLICY "employees_update_admin" ON "public"."employees" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "employees_update_own_signature" ON "public"."employees" FOR UPDATE USING (("id" = ( SELECT "app_users"."employee_id"
   FROM "public"."app_users"
  WHERE ("app_users"."id" = "auth"."uid"())))) WITH CHECK (("id" = ( SELECT "app_users"."employee_id"
   FROM "public"."app_users"
  WHERE ("app_users"."id" = "auth"."uid"()))));



ALTER TABLE "public"."expense_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_items_delete" ON "public"."expense_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (("public"."expense_requests" "er"
     JOIN "public"."requests" "r" ON (("r"."id" = "er"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("er"."id" = "expense_items"."expense_request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



CREATE POLICY "expense_items_insert" ON "public"."expense_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."expense_requests" "er"
     JOIN "public"."requests" "r" ON (("r"."id" = "er"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("er"."id" = "expense_items"."expense_request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "expense_items_select" ON "public"."expense_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."expense_requests" "er"
     JOIN "public"."requests" "r" ON (("r"."id" = "er"."request_id")))
  WHERE (("er"."id" = "expense_items"."expense_request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))))))));



CREATE POLICY "expense_items_update" ON "public"."expense_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."expense_requests" "er"
     JOIN "public"."requests" "r" ON (("r"."id" = "er"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("er"."id" = "expense_items"."expense_request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



ALTER TABLE "public"."expense_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "expense_requests_insert" ON "public"."expense_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "expense_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "expense_requests_select" ON "public"."expense_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "expense_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))))))));



CREATE POLICY "expense_requests_update" ON "public"."expense_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "expense_requests"."request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



ALTER TABLE "public"."finance_approval_cover_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_approval_cover_items_delete" ON "public"."finance_approval_cover_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (("public"."finance_approval_cover_requests" "fcr"
     JOIN "public"."requests" "r" ON (("r"."id" = "fcr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("fcr"."id" = "finance_approval_cover_items"."finance_request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



CREATE POLICY "finance_approval_cover_items_insert" ON "public"."finance_approval_cover_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."finance_approval_cover_requests" "fcr"
     JOIN "public"."requests" "r" ON (("r"."id" = "fcr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("fcr"."id" = "finance_approval_cover_items"."finance_request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "finance_approval_cover_items_select" ON "public"."finance_approval_cover_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."finance_approval_cover_requests" "fcr"
     JOIN "public"."requests" "r" ON (("r"."id" = "fcr"."request_id")))
  WHERE (("fcr"."id" = "finance_approval_cover_items"."finance_request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))))))));



CREATE POLICY "finance_approval_cover_items_update" ON "public"."finance_approval_cover_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."finance_approval_cover_requests" "fcr"
     JOIN "public"."requests" "r" ON (("r"."id" = "fcr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("fcr"."id" = "finance_approval_cover_items"."finance_request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



ALTER TABLE "public"."finance_approval_cover_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "finance_approval_cover_requests_insert" ON "public"."finance_approval_cover_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "finance_approval_cover_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "finance_approval_cover_requests_select" ON "public"."finance_approval_cover_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "finance_approval_cover_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))))))));



CREATE POLICY "finance_approval_cover_requests_update" ON "public"."finance_approval_cover_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "finance_approval_cover_requests"."request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



ALTER TABLE "public"."grade_levels" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "grade_levels_delete_admin" ON "public"."grade_levels" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "grade_levels_insert_admin" ON "public"."grade_levels" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "grade_levels_select_auth" ON "public"."grade_levels" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['ORG_ADMIN'::"text", 'ORG_VIEWER'::"text"]))))));



CREATE POLICY "grade_levels_update_admin" ON "public"."grade_levels" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



ALTER TABLE "public"."leave_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "leave_requests_insert" ON "public"."leave_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "leave_requests"."request_id") AND ("r"."requester_employee_id" = "public"."get_current_employee_id"())))));



CREATE POLICY "leave_requests_select" ON "public"."leave_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "leave_requests"."request_id") AND (("r"."requester_employee_id" = "public"."get_current_employee_id"()) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" = "public"."get_current_employee_id"())))) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))))))));



CREATE POLICY "leave_requests_update" ON "public"."leave_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "leave_requests"."request_id") AND ((("r"."requester_employee_id" = "public"."get_current_employee_id"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))) OR (EXISTS ( SELECT 1
           FROM ("public"."request_approvals" "ra"
             JOIN "public"."workflow_steps" "ws" ON (("ra"."workflow_step_id" = "ws"."id")))
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" = "public"."get_current_employee_id"()) AND ("ra"."status" = 'PENDING'::"public"."approval_status") AND ("r"."current_step" = "ws"."step_order") AND ("ws"."action_type" = 'FILL_AND_SIGN'::"text")))))))));



ALTER TABLE "public"."mukayese_items" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mukayese_items_delete" ON "public"."mukayese_items" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (("public"."mukayese_requests" "mr"
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("mr"."id" = "mukayese_items"."mukayese_request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



CREATE POLICY "mukayese_items_insert" ON "public"."mukayese_items" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."mukayese_requests" "mr"
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("mr"."id" = "mukayese_items"."mukayese_request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "mukayese_items_select" ON "public"."mukayese_items" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."mukayese_requests" "mr"
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
  WHERE (("mr"."id" = "mukayese_items"."mukayese_request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))))))));



CREATE POLICY "mukayese_items_update" ON "public"."mukayese_items" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."mukayese_requests" "mr"
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("mr"."id" = "mukayese_items"."mukayese_request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



ALTER TABLE "public"."mukayese_prices" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mukayese_prices_delete" ON "public"."mukayese_prices" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM ((("public"."mukayese_items" "mi"
     JOIN "public"."mukayese_requests" "mr" ON (("mr"."id" = "mi"."mukayese_request_id")))
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("mi"."id" = "mukayese_prices"."mukayese_item_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



CREATE POLICY "mukayese_prices_insert" ON "public"."mukayese_prices" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ((("public"."mukayese_items" "mi"
     JOIN "public"."mukayese_requests" "mr" ON (("mr"."id" = "mi"."mukayese_request_id")))
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("mi"."id" = "mukayese_prices"."mukayese_item_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "mukayese_prices_select" ON "public"."mukayese_prices" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM (("public"."mukayese_items" "mi"
     JOIN "public"."mukayese_requests" "mr" ON (("mr"."id" = "mi"."mukayese_request_id")))
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
  WHERE (("mi"."id" = "mukayese_prices"."mukayese_item_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))))))));



CREATE POLICY "mukayese_prices_update" ON "public"."mukayese_prices" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ((("public"."mukayese_items" "mi"
     JOIN "public"."mukayese_requests" "mr" ON (("mr"."id" = "mi"."mukayese_request_id")))
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("mi"."id" = "mukayese_prices"."mukayese_item_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



ALTER TABLE "public"."mukayese_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mukayese_requests_insert" ON "public"."mukayese_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "mukayese_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "mukayese_requests_select" ON "public"."mukayese_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "mukayese_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))))))));



CREATE POLICY "mukayese_requests_update" ON "public"."mukayese_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "mukayese_requests"."request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



ALTER TABLE "public"."mukayese_suppliers" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "mukayese_suppliers_delete" ON "public"."mukayese_suppliers" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM (("public"."mukayese_requests" "mr"
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("mr"."id" = "mukayese_suppliers"."mukayese_request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



CREATE POLICY "mukayese_suppliers_insert" ON "public"."mukayese_suppliers" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."mukayese_requests" "mr"
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("mr"."id" = "mukayese_suppliers"."mukayese_request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "mukayese_suppliers_select" ON "public"."mukayese_suppliers" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."mukayese_requests" "mr"
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
  WHERE (("mr"."id" = "mukayese_suppliers"."mukayese_request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))) OR (EXISTS ( SELECT 1
           FROM "public"."app_users" "au"
          WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))))))));



CREATE POLICY "mukayese_suppliers_update" ON "public"."mukayese_suppliers" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."mukayese_requests" "mr"
     JOIN "public"."requests" "r" ON (("r"."id" = "mr"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("mr"."id" = "mukayese_suppliers"."mukayese_request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



ALTER TABLE "public"."notifications" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "notifications_insert_anon" ON "public"."notifications" FOR INSERT TO "anon" WITH CHECK (true);



CREATE POLICY "notifications_insert_any" ON "public"."notifications" FOR INSERT TO "authenticated" WITH CHECK (true);



CREATE POLICY "notifications_select" ON "public"."notifications" FOR SELECT TO "authenticated" USING (("user_id" = "auth"."uid"()));



CREATE POLICY "notifications_update" ON "public"."notifications" FOR UPDATE TO "authenticated" USING (("user_id" = "auth"."uid"()));



ALTER TABLE "public"."onboarding_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "onboarding_requests_insert" ON "public"."onboarding_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "onboarding_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "onboarding_requests_select" ON "public"."onboarding_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "onboarding_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))))))));



CREATE POLICY "onboarding_requests_update" ON "public"."onboarding_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "onboarding_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"()))) AND ("ra"."status" = 'PENDING'::"public"."approval_status")))))))));



ALTER TABLE "public"."organizational_units" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "organizational_units_delete_admin" ON "public"."organizational_units" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "organizational_units_insert_admin" ON "public"."organizational_units" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "organizational_units_select_auth" ON "public"."organizational_units" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['ORG_ADMIN'::"text", 'ORG_VIEWER'::"text"]))))));



CREATE POLICY "organizational_units_update_admin" ON "public"."organizational_units" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



ALTER TABLE "public"."overtime_entries" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "overtime_entries_insert" ON "public"."overtime_entries" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."overtime_requests" "orq"
     JOIN "public"."requests" "r" ON (("r"."id" = "orq"."request_id")))
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("orq"."id" = "overtime_entries"."overtime_request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "overtime_entries_select" ON "public"."overtime_entries" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."overtime_requests" "orq"
     JOIN "public"."requests" "r" ON (("r"."id" = "orq"."request_id")))
  WHERE (("orq"."id" = "overtime_entries"."overtime_request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))))))));



ALTER TABLE "public"."overtime_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "overtime_requests_insert" ON "public"."overtime_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "overtime_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "overtime_requests_select" ON "public"."overtime_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "overtime_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))))))));



ALTER TABLE "public"."position_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "position_types_delete_admin" ON "public"."position_types" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "position_types_insert_admin" ON "public"."position_types" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "position_types_select_auth" ON "public"."position_types" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['ORG_ADMIN'::"text", 'ORG_VIEWER'::"text"]))))));



CREATE POLICY "position_types_update_admin" ON "public"."position_types" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



ALTER TABLE "public"."positions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "positions_delete_admin" ON "public"."positions" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "positions_insert_admin" ON "public"."positions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "positions_select_auth" ON "public"."positions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['ORG_ADMIN'::"text", 'ORG_VIEWER'::"text"]))))));



CREATE POLICY "positions_update_admin" ON "public"."positions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "ra_delete" ON "public"."request_attachments" FOR DELETE USING (("uploaded_by" IN ( SELECT "app_users"."employee_id"
   FROM "public"."app_users"
  WHERE ("app_users"."id" = "auth"."uid"()))));



CREATE POLICY "ra_insert" ON "public"."request_attachments" FOR INSERT WITH CHECK (("uploaded_by" IN ( SELECT "app_users"."employee_id"
   FROM "public"."app_users"
  WHERE ("app_users"."id" = "auth"."uid"()))));



CREATE POLICY "ra_select" ON "public"."request_attachments" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "request_attachments"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))))))));



ALTER TABLE "public"."request_approvals" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "request_approvals_insert" ON "public"."request_approvals" FOR INSERT WITH CHECK (((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))) OR (EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "request_approvals"."request_id") AND ("r"."requester_employee_id" = "public"."get_current_employee_id"()))))));



CREATE POLICY "request_approvals_select" ON "public"."request_approvals" FOR SELECT USING ((("approver_employee_id" = "public"."get_current_employee_id"()) OR (EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "request_approvals"."request_id") AND ("r"."requester_employee_id" = "public"."get_current_employee_id"())))) OR "public"."is_approver_for_same_request"("request_id") OR (EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))));



CREATE POLICY "request_approvals_update" ON "public"."request_approvals" FOR UPDATE USING ((("approver_employee_id" = "public"."get_current_employee_id"()) AND ("status" = 'PENDING'::"public"."approval_status"))) WITH CHECK ((("approver_employee_id" = "public"."get_current_employee_id"()) AND ("status" = ANY (ARRAY['APPROVED'::"public"."approval_status", 'REJECTED'::"public"."approval_status"]))));



ALTER TABLE "public"."request_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."request_form_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "request_form_requests_insert" ON "public"."request_form_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "request_form_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "request_form_requests_select" ON "public"."request_form_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "request_form_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))))))));



CREATE POLICY "request_form_requests_update" ON "public"."request_form_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "request_form_requests"."request_id") AND ("au"."id" = "auth"."uid"()) AND ("r"."status" = 'DRAFT'::"public"."request_status")))));



ALTER TABLE "public"."requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "requests_insert" ON "public"."requests" FOR INSERT WITH CHECK (("requester_employee_id" = "public"."get_current_employee_id"()));



CREATE POLICY "requests_select" ON "public"."requests" FOR SELECT USING ((("requester_employee_id" = "public"."get_current_employee_id"()) OR "public"."is_approver_for_request"("id") OR (EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))));



CREATE POLICY "requests_update" ON "public"."requests" FOR UPDATE USING ((("requester_employee_id" = "public"."get_current_employee_id"()) OR "public"."is_approver_for_request"("id") OR (EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))));



ALTER TABLE "public"."salary_advance_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "salary_advance_requests_insert" ON "public"."salary_advance_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "salary_advance_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "salary_advance_requests_select" ON "public"."salary_advance_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "salary_advance_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))))))));



CREATE POLICY "salary_advance_requests_update_approver" ON "public"."salary_advance_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."request_approvals" "ra"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "ra"."approver_employee_id")))
     JOIN "public"."requests" "r" ON (("r"."id" = "ra"."request_id")))
  WHERE (("r"."id" = "salary_advance_requests"."request_id") AND ("au"."id" = "auth"."uid"()) AND ("ra"."status" = 'PENDING'::"public"."approval_status"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."request_approvals" "ra"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "ra"."approver_employee_id")))
     JOIN "public"."requests" "r" ON (("r"."id" = "ra"."request_id")))
  WHERE (("r"."id" = "salary_advance_requests"."request_id") AND ("au"."id" = "auth"."uid"()) AND ("ra"."status" = 'PENDING'::"public"."approval_status")))));



ALTER TABLE "public"."separation_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "separation_requests_insert" ON "public"."separation_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "separation_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "separation_requests_select" ON "public"."separation_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "separation_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))))))));



CREATE POLICY "separation_requests_update" ON "public"."separation_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "separation_requests"."request_id") AND (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"()))))))))));



ALTER TABLE "public"."stamp_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stamp_requests_insert" ON "public"."stamp_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "stamp_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "stamp_requests_select" ON "public"."stamp_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "stamp_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))))))));



CREATE POLICY "stamp_requests_update" ON "public"."stamp_requests" FOR UPDATE USING (((EXISTS ( SELECT 1
   FROM (("public"."request_approvals" "ra"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "ra"."approver_employee_id")))
     JOIN "public"."requests" "r" ON (("r"."id" = "ra"."request_id")))
  WHERE (("r"."id" = "stamp_requests"."request_id") AND ("au"."id" = "auth"."uid"()) AND ("ra"."status" = 'PENDING'::"public"."approval_status")))) OR (EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))));



ALTER TABLE "public"."stamps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "stamps_insert_admin" ON "public"."stamps" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "stamps_select" ON "public"."stamps" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE ("au"."id" = "auth"."uid"()))));



CREATE POLICY "stamps_update_admin" ON "public"."stamps" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



ALTER TABLE "public"."travel_assignment_requests" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "travel_assignment_requests_insert" ON "public"."travel_assignment_requests" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM ("public"."requests" "r"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "r"."requester_employee_id")))
  WHERE (("r"."id" = "travel_assignment_requests"."request_id") AND ("au"."id" = "auth"."uid"())))));



CREATE POLICY "travel_assignment_requests_select" ON "public"."travel_assignment_requests" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."requests" "r"
  WHERE (("r"."id" = "travel_assignment_requests"."request_id") AND (("r"."requester_employee_id" IN ( SELECT "app_users"."employee_id"
           FROM "public"."app_users"
          WHERE ("app_users"."id" = "auth"."uid"()))) OR (EXISTS ( SELECT 1
           FROM "public"."request_approvals" "ra"
          WHERE (("ra"."request_id" = "r"."id") AND ("ra"."approver_employee_id" IN ( SELECT "app_users"."employee_id"
                   FROM "public"."app_users"
                  WHERE ("app_users"."id" = "auth"."uid"())))))))))));



CREATE POLICY "travel_assignment_requests_update_approver" ON "public"."travel_assignment_requests" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM (("public"."request_approvals" "ra"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "ra"."approver_employee_id")))
     JOIN "public"."requests" "r" ON (("r"."id" = "ra"."request_id")))
  WHERE (("r"."id" = "travel_assignment_requests"."request_id") AND ("au"."id" = "auth"."uid"()) AND ("ra"."status" = 'PENDING'::"public"."approval_status"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM (("public"."request_approvals" "ra"
     JOIN "public"."app_users" "au" ON (("au"."employee_id" = "ra"."approver_employee_id")))
     JOIN "public"."requests" "r" ON (("r"."id" = "ra"."request_id")))
  WHERE (("r"."id" = "travel_assignment_requests"."request_id") AND ("au"."id" = "auth"."uid"()) AND ("ra"."status" = 'PENDING'::"public"."approval_status")))));



ALTER TABLE "public"."unit_types" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "unit_types_delete_admin" ON "public"."unit_types" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "unit_types_insert_admin" ON "public"."unit_types" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "unit_types_select_auth" ON "public"."unit_types" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = ANY (ARRAY['ORG_ADMIN'::"text", 'ORG_VIEWER'::"text"]))))));



CREATE POLICY "unit_types_update_admin" ON "public"."unit_types" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text"))))) WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



ALTER TABLE "public"."user_ms_tokens" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_definitions" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_definitions_insert_admin" ON "public"."workflow_definitions" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "workflow_definitions_select" ON "public"."workflow_definitions" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE ("au"."id" = "auth"."uid"()))));



CREATE POLICY "workflow_definitions_update_admin" ON "public"."workflow_definitions" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



ALTER TABLE "public"."workflow_initiators" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_initiators_select_all" ON "public"."workflow_initiators" FOR SELECT USING (true);



ALTER TABLE "public"."workflow_step_attachments" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."workflow_steps" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "workflow_steps_insert_admin" ON "public"."workflow_steps" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "workflow_steps_select" ON "public"."workflow_steps" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE ("au"."id" = "auth"."uid"()))));



CREATE POLICY "workflow_steps_update_admin" ON "public"."workflow_steps" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."app_users" "au"
  WHERE (("au"."id" = "auth"."uid"()) AND ("au"."role" = 'ORG_ADMIN'::"text")))));



CREATE POLICY "wsa_select" ON "public"."workflow_step_attachments" FOR SELECT USING (true);



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



GRANT ALL ON FUNCTION "public"."create_mukayese_request"("p_workflow_definition_id" "uuid", "p_requester_employee_id" "uuid", "p_header" "jsonb", "p_items" "jsonb", "p_suppliers" "jsonb", "p_prices" "jsonb") TO "anon";
GRANT ALL ON FUNCTION "public"."create_mukayese_request"("p_workflow_definition_id" "uuid", "p_requester_employee_id" "uuid", "p_header" "jsonb", "p_items" "jsonb", "p_suppliers" "jsonb", "p_prices" "jsonb") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_mukayese_request"("p_workflow_definition_id" "uuid", "p_requester_employee_id" "uuid", "p_header" "jsonb", "p_items" "jsonb", "p_suppliers" "jsonb", "p_prices" "jsonb") TO "service_role";



GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text", "p_reference_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text", "p_reference_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."create_notification"("p_user_id" "uuid", "p_title" "text", "p_message" "text", "p_type" "text", "p_reference_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_current_employee_id"() TO "anon";
GRANT ALL ON FUNCTION "public"."get_current_employee_id"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_current_employee_id"() TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_auth_user_created"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_auth_user_created"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_auth_user_created"() TO "service_role";



GRANT ALL ON FUNCTION "public"."is_approver_for_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_approver_for_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_approver_for_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."is_approver_for_same_request"("p_request_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."is_approver_for_same_request"("p_request_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_approver_for_same_request"("p_request_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."set_updated_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."accounting_approval_cover_items" TO "anon";
GRANT ALL ON TABLE "public"."accounting_approval_cover_items" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_approval_cover_items" TO "service_role";



GRANT ALL ON TABLE "public"."accounting_approval_cover_requests" TO "anon";
GRANT ALL ON TABLE "public"."accounting_approval_cover_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."accounting_approval_cover_requests" TO "service_role";



GRANT ALL ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT ALL ON TABLE "public"."approval_letter_requests" TO "anon";
GRANT ALL ON TABLE "public"."approval_letter_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."approval_letter_requests" TO "service_role";



GRANT ALL ON TABLE "public"."companies" TO "anon";
GRANT ALL ON TABLE "public"."companies" TO "authenticated";
GRANT ALL ON TABLE "public"."companies" TO "service_role";



GRANT ALL ON TABLE "public"."employee_positions" TO "anon";
GRANT ALL ON TABLE "public"."employee_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_positions" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."expense_items" TO "anon";
GRANT ALL ON TABLE "public"."expense_items" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_items" TO "service_role";



GRANT ALL ON TABLE "public"."expense_requests" TO "anon";
GRANT ALL ON TABLE "public"."expense_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."expense_requests" TO "service_role";



GRANT ALL ON TABLE "public"."finance_approval_cover_items" TO "anon";
GRANT ALL ON TABLE "public"."finance_approval_cover_items" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_approval_cover_items" TO "service_role";



GRANT ALL ON TABLE "public"."finance_approval_cover_requests" TO "anon";
GRANT ALL ON TABLE "public"."finance_approval_cover_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."finance_approval_cover_requests" TO "service_role";



GRANT ALL ON TABLE "public"."grade_levels" TO "anon";
GRANT ALL ON TABLE "public"."grade_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."grade_levels" TO "service_role";



GRANT ALL ON TABLE "public"."leave_requests" TO "anon";
GRANT ALL ON TABLE "public"."leave_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_requests" TO "service_role";



GRANT ALL ON TABLE "public"."mukayese_items" TO "anon";
GRANT ALL ON TABLE "public"."mukayese_items" TO "authenticated";
GRANT ALL ON TABLE "public"."mukayese_items" TO "service_role";



GRANT ALL ON TABLE "public"."mukayese_prices" TO "anon";
GRANT ALL ON TABLE "public"."mukayese_prices" TO "authenticated";
GRANT ALL ON TABLE "public"."mukayese_prices" TO "service_role";



GRANT ALL ON TABLE "public"."mukayese_requests" TO "anon";
GRANT ALL ON TABLE "public"."mukayese_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."mukayese_requests" TO "service_role";



GRANT ALL ON TABLE "public"."mukayese_suppliers" TO "anon";
GRANT ALL ON TABLE "public"."mukayese_suppliers" TO "authenticated";
GRANT ALL ON TABLE "public"."mukayese_suppliers" TO "service_role";



GRANT ALL ON TABLE "public"."notifications" TO "anon";
GRANT ALL ON TABLE "public"."notifications" TO "authenticated";
GRANT ALL ON TABLE "public"."notifications" TO "service_role";



GRANT ALL ON TABLE "public"."onboarding_requests" TO "anon";
GRANT ALL ON TABLE "public"."onboarding_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."onboarding_requests" TO "service_role";



GRANT ALL ON TABLE "public"."organizational_units" TO "anon";
GRANT ALL ON TABLE "public"."organizational_units" TO "authenticated";
GRANT ALL ON TABLE "public"."organizational_units" TO "service_role";



GRANT ALL ON TABLE "public"."overtime_entries" TO "anon";
GRANT ALL ON TABLE "public"."overtime_entries" TO "authenticated";
GRANT ALL ON TABLE "public"."overtime_entries" TO "service_role";



GRANT ALL ON TABLE "public"."overtime_requests" TO "anon";
GRANT ALL ON TABLE "public"."overtime_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."overtime_requests" TO "service_role";



GRANT ALL ON TABLE "public"."position_types" TO "anon";
GRANT ALL ON TABLE "public"."position_types" TO "authenticated";
GRANT ALL ON TABLE "public"."position_types" TO "service_role";



GRANT ALL ON TABLE "public"."positions" TO "anon";
GRANT ALL ON TABLE "public"."positions" TO "authenticated";
GRANT ALL ON TABLE "public"."positions" TO "service_role";



GRANT ALL ON TABLE "public"."request_approvals" TO "anon";
GRANT ALL ON TABLE "public"."request_approvals" TO "authenticated";
GRANT ALL ON TABLE "public"."request_approvals" TO "service_role";



GRANT ALL ON TABLE "public"."request_attachments" TO "anon";
GRANT ALL ON TABLE "public"."request_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."request_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."request_form_requests" TO "anon";
GRANT ALL ON TABLE "public"."request_form_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."request_form_requests" TO "service_role";



GRANT ALL ON TABLE "public"."requests" TO "anon";
GRANT ALL ON TABLE "public"."requests" TO "authenticated";
GRANT ALL ON TABLE "public"."requests" TO "service_role";



GRANT ALL ON TABLE "public"."salary_advance_requests" TO "anon";
GRANT ALL ON TABLE "public"."salary_advance_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."salary_advance_requests" TO "service_role";



GRANT ALL ON TABLE "public"."separation_requests" TO "anon";
GRANT ALL ON TABLE "public"."separation_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."separation_requests" TO "service_role";



GRANT ALL ON TABLE "public"."stamp_requests" TO "anon";
GRANT ALL ON TABLE "public"."stamp_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."stamp_requests" TO "service_role";



GRANT ALL ON TABLE "public"."stamps" TO "anon";
GRANT ALL ON TABLE "public"."stamps" TO "authenticated";
GRANT ALL ON TABLE "public"."stamps" TO "service_role";



GRANT ALL ON TABLE "public"."travel_assignment_requests" TO "anon";
GRANT ALL ON TABLE "public"."travel_assignment_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."travel_assignment_requests" TO "service_role";



GRANT ALL ON TABLE "public"."unit_types" TO "anon";
GRANT ALL ON TABLE "public"."unit_types" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_types" TO "service_role";



GRANT ALL ON TABLE "public"."user_ms_tokens" TO "anon";
GRANT ALL ON TABLE "public"."user_ms_tokens" TO "authenticated";
GRANT ALL ON TABLE "public"."user_ms_tokens" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_definitions" TO "anon";
GRANT ALL ON TABLE "public"."workflow_definitions" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_definitions" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_initiators" TO "anon";
GRANT ALL ON TABLE "public"."workflow_initiators" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_initiators" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_step_attachments" TO "anon";
GRANT ALL ON TABLE "public"."workflow_step_attachments" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_step_attachments" TO "service_role";



GRANT ALL ON TABLE "public"."workflow_steps" TO "anon";
GRANT ALL ON TABLE "public"."workflow_steps" TO "authenticated";
GRANT ALL ON TABLE "public"."workflow_steps" TO "service_role";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";







