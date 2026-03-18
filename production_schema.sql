


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



CREATE TYPE "public"."approval_status" AS ENUM (
    'PENDING',
    'APPROVED',
    'REJECTED'
);


ALTER TYPE "public"."approval_status" OWNER TO "postgres";


CREATE TYPE "public"."approver_type" AS ENUM (
    'REQUESTER',
    'UNIT_HEAD',
    'STATIC_POSITION'
);


ALTER TYPE "public"."approver_type" OWNER TO "postgres";


CREATE TYPE "public"."checklist_status" AS ENUM (
    'DONE',
    'NOT_DONE',
    'NA'
);


ALTER TYPE "public"."checklist_status" OWNER TO "postgres";


CREATE TYPE "public"."leave_type" AS ENUM (
    'ANNUAL_LEAVE',
    'SHORT_LEAVE'
);


ALTER TYPE "public"."leave_type" OWNER TO "postgres";


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
    'CANCELLED'
);


ALTER TYPE "public"."request_status" OWNER TO "postgres";


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
begin
  -- Email varsa, employees tablosunda eşleşen çalışanı bulmaya çalış
  if new.email is not null then
    select e.id
      into v_employee_id
      from public.employees e
     where lower(e.email) = lower(new.email)
     limit 1;
  end if;

  -- app_users kaydını aç (varsayılan rol: ORG_VIEWER)
  insert into public.app_users (id, email, employee_id, role)
  values (new.id, new.email, v_employee_id, 'ORG_VIEWER')
  on conflict do nothing;  -- Herhangi bir çatışma durumunda sessizce geç

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


CREATE TABLE IF NOT EXISTS "public"."app_users" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "employee_id" "uuid",
    "role" "text" DEFAULT 'ORG_VIEWER'::"text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."app_users" OWNER TO "postgres";


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
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
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
    "pdf_path" "text"
);


ALTER TABLE "public"."requests" OWNER TO "postgres";


COMMENT ON TABLE "public"."requests" IS 'Tüm talepler - workflow_definition_id ile süreç tipine bağlanır';



COMMENT ON COLUMN "public"."requests"."current_step" IS 'Şu an bekleyen adım numarası (workflow_steps.step_order)';



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
    CONSTRAINT "workflow_steps_action_type_check" CHECK (("action_type" = ANY (ARRAY['FILL_AND_SIGN'::"text", 'SIGN_ONLY'::"text"])))
);


ALTER TABLE "public"."workflow_steps" OWNER TO "postgres";


COMMENT ON TABLE "public"."workflow_steps" IS 'Her sürecin sıralı onay adımları';



COMMENT ON COLUMN "public"."workflow_steps"."approver_type" IS 'REQUESTER: Talep eden, UNIT_HEAD: Birim müdürü, STATIC_POSITION: Sabit pozisyon';



COMMENT ON COLUMN "public"."workflow_steps"."static_position_id" IS 'Sadece STATIC_POSITION tipi için gerekli';



COMMENT ON COLUMN "public"."workflow_steps"."action_type" IS 'FILL_AND_SIGN: Form bölümü doldur + imzala, SIGN_ONLY: Sadece imzala';



COMMENT ON COLUMN "public"."workflow_steps"."form_section_key" IS 'FILL_AND_SIGN adımları için hangi form bölümünün doldurulacağı';



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employee_positions"
    ADD CONSTRAINT "employee_positions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_email_key" UNIQUE ("email");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_employee_no_key" UNIQUE ("employee_no");



ALTER TABLE ONLY "public"."employees"
    ADD CONSTRAINT "employees_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."grade_levels"
    ADD CONSTRAINT "grade_levels_pkey" PRIMARY KEY ("band");



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_request_id_key" UNIQUE ("request_id");



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
    ADD CONSTRAINT "request_approvals_request_id_workflow_step_id_key" UNIQUE ("request_id", "workflow_step_id");



ALTER TABLE ONLY "public"."request_attachments"
    ADD CONSTRAINT "request_attachments_pkey" PRIMARY KEY ("id");



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



ALTER TABLE ONLY "public"."unit_types"
    ADD CONSTRAINT "unit_types_code_key" UNIQUE ("code");



ALTER TABLE ONLY "public"."unit_types"
    ADD CONSTRAINT "unit_types_pkey" PRIMARY KEY ("id");



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



CREATE INDEX "idx_employee_positions_employee" ON "public"."employee_positions" USING "btree" ("employee_id");



CREATE INDEX "idx_employee_positions_position" ON "public"."employee_positions" USING "btree" ("position_id");



CREATE INDEX "idx_leave_requests_request" ON "public"."leave_requests" USING "btree" ("request_id");



CREATE INDEX "idx_leave_requests_type" ON "public"."leave_requests" USING "btree" ("leave_type");



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



CREATE INDEX "idx_request_approvals_status" ON "public"."request_approvals" USING "btree" ("status");



CREATE INDEX "idx_requests_requester" ON "public"."requests" USING "btree" ("requester_employee_id");



CREATE INDEX "idx_requests_status" ON "public"."requests" USING "btree" ("status");



CREATE INDEX "idx_requests_workflow" ON "public"."requests" USING "btree" ("workflow_definition_id");



CREATE INDEX "idx_separation_requests_request_id" ON "public"."separation_requests" USING "btree" ("request_id");



CREATE INDEX "idx_workflow_steps_definition" ON "public"."workflow_steps" USING "btree" ("workflow_definition_id");



CREATE OR REPLACE TRIGGER "set_updated_at_leave_requests" BEFORE UPDATE ON "public"."leave_requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at_requests" BEFORE UPDATE ON "public"."requests" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



CREATE OR REPLACE TRIGGER "set_updated_at_workflow_definitions" BEFORE UPDATE ON "public"."workflow_definitions" FOR EACH ROW EXECUTE FUNCTION "public"."update_updated_at_column"();



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."app_users"
    ADD CONSTRAINT "app_users_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."employee_positions"
    ADD CONSTRAINT "employee_positions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."employee_positions"
    ADD CONSTRAINT "employee_positions_position_id_fkey" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id");



ALTER TABLE ONLY "public"."leave_requests"
    ADD CONSTRAINT "leave_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



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



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_requester_employee_id_fkey" FOREIGN KEY ("requester_employee_id") REFERENCES "public"."employees"("id");



ALTER TABLE ONLY "public"."requests"
    ADD CONSTRAINT "requests_workflow_definition_id_fkey" FOREIGN KEY ("workflow_definition_id") REFERENCES "public"."workflow_definitions"("id");



ALTER TABLE ONLY "public"."salary_advance_requests"
    ADD CONSTRAINT "salary_advance_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."separation_requests"
    ADD CONSTRAINT "separation_requests_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "public"."requests"("id") ON DELETE CASCADE;



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



ALTER TABLE "public"."app_users" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "app_users_select_all" ON "public"."app_users" FOR SELECT TO "authenticated" USING (true);



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



GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "anon";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."update_updated_at_column"() TO "service_role";



GRANT ALL ON TABLE "public"."app_users" TO "anon";
GRANT ALL ON TABLE "public"."app_users" TO "authenticated";
GRANT ALL ON TABLE "public"."app_users" TO "service_role";



GRANT ALL ON TABLE "public"."employee_positions" TO "anon";
GRANT ALL ON TABLE "public"."employee_positions" TO "authenticated";
GRANT ALL ON TABLE "public"."employee_positions" TO "service_role";



GRANT ALL ON TABLE "public"."employees" TO "anon";
GRANT ALL ON TABLE "public"."employees" TO "authenticated";
GRANT ALL ON TABLE "public"."employees" TO "service_role";



GRANT ALL ON TABLE "public"."grade_levels" TO "anon";
GRANT ALL ON TABLE "public"."grade_levels" TO "authenticated";
GRANT ALL ON TABLE "public"."grade_levels" TO "service_role";



GRANT ALL ON TABLE "public"."leave_requests" TO "anon";
GRANT ALL ON TABLE "public"."leave_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."leave_requests" TO "service_role";



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



GRANT ALL ON TABLE "public"."requests" TO "anon";
GRANT ALL ON TABLE "public"."requests" TO "authenticated";
GRANT ALL ON TABLE "public"."requests" TO "service_role";



GRANT ALL ON TABLE "public"."salary_advance_requests" TO "anon";
GRANT ALL ON TABLE "public"."salary_advance_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."salary_advance_requests" TO "service_role";



GRANT ALL ON TABLE "public"."separation_requests" TO "anon";
GRANT ALL ON TABLE "public"."separation_requests" TO "authenticated";
GRANT ALL ON TABLE "public"."separation_requests" TO "service_role";



GRANT ALL ON TABLE "public"."unit_types" TO "anon";
GRANT ALL ON TABLE "public"."unit_types" TO "authenticated";
GRANT ALL ON TABLE "public"."unit_types" TO "service_role";



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







