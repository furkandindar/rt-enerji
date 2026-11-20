import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { isDepartmentViewer, isUnitManagerViewer } from "@/lib/workflow/workflow-service";
import { getRequestContentAccess, RESTRICTED_CONTENT_MESSAGE } from "@/lib/workflow/content-access";
import { getUserAccess } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";

// PDF endpoint'lerinin (indir / önizle / anlık önizle) ortak yetki kontrolü.
// Kural: talep sahibi, onaycılardan biri, requests.view_all (Admin), kısıtlı
// workflow'larda departman görünürlüğü olan kullanıcı (isDepartmentViewer) veya
// Müdür (birimindeki çalışanın talebi — isUnitManagerViewer) erişebilir.
// Request satırı kullanıcının kendi client'ıyla okunur; RLS burada ikinci
// katman olarak çalışır (requests_select politikası da aynı grupları kapsar).
// İçerik kısıtlı süreçlerde (İşe Giriş / İşten Çıkış Onay) ayrıca içerik kuralı:
// yalnız talep sahibi, İK ve Genel Müdür — onaycı ve admin muafiyeti burada geçmez.

type RequestRow = Database["public"]["Tables"]["requests"]["Row"];

export interface PdfAuthRequestData {
  id: string;
  request_no: RequestRow["request_no"];
  status: RequestRow["status"];
  created_at: RequestRow["created_at"];
  pdf_path: RequestRow["pdf_path"];
  requester_employee_id: string;
  workflow_definition_id: string;
  workflow_definition: { code: string } | { code: string }[] | null;
  requester:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null;
  approvals: { approver_employee_id: string }[] | null;
}

export type PdfAuthResult =
  | { ok: true; requestData: PdfAuthRequestData }
  | { ok: false; status: 400 | 401 | 403 | 404; error: string };

export async function authorizePdfAccess(
  supabase: SupabaseClient,
  requestId: string
): Promise<PdfAuthResult> {
  // 1. Kullanıcı kontrolü
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  const appUser = await getUserAccess(supabase);
  if (!appUser) {
    return { ok: false, status: 401, error: "Unauthorized" };
  }

  // requests.view_all (Admin) employee bağı olmadan da PDF görebilmeli; diğer
  // kullanıcılar için employee bağı zorunlu (requester/approver eşleşmesi employee_id ile).
  const canViewAll = can(appUser, "requests.view_all");
  if (!appUser.employee_id && !canViewAll) {
    return { ok: false, status: 400, error: "User not linked to employee" };
  }

  // 2. Request'i getir (yetki kontrolü + dosya adı için gerekli alanlar)
  const { data: requestData, error: requestError } = await supabase
    .from("requests")
    .select(
      `
      id,
      request_no,
      status,
      created_at,
      pdf_path,
      requester_employee_id,
      workflow_definition_id,
      workflow_definition:workflow_definitions(code),
      requester:employees!requests_requester_employee_id_fkey(first_name, last_name),
      approvals:request_approvals(approver_employee_id)
    `
    )
    .eq("id", requestId)
    .single();

  if (requestError || !requestData) {
    return { ok: false, status: 404, error: "Request not found" };
  }

  // 3. Yetki kontrolü - Talep sahibi, onaylayanlar, Admin (requests.view_all),
  // kısıtlı workflow'da departman görünürlüğü olan kullanıcı veya Müdür görebilir
  const isRequester =
    requestData.requester_employee_id === appUser?.employee_id;
  const isApprover = requestData.approvals?.some(
    (approval: { approver_employee_id: string }) =>
      approval.approver_employee_id === appUser?.employee_id
  );

  if (!isRequester && !isApprover && !canViewAll) {
    const isDeptViewer =
      !!appUser?.employee_id &&
      (await isDepartmentViewer(
        supabase,
        appUser.employee_id,
        requestData.workflow_definition_id
      ));

    const isManagerViewer =
      !isDeptViewer && (await isUnitManagerViewer(supabase, appUser.is_unit_manager, requestId));

    if (!isDeptViewer && !isManagerViewer) {
      return { ok: false, status: 403, error: "Forbidden" };
    }
  }

  // 4. İçerik kısıtlı süreç: PDF içeriktir (lib/workflow/content-access.ts)
  const contentAccess = await getRequestContentAccess(supabase, requestId);
  if (!contentAccess.canView) {
    return { ok: false, status: 403, error: RESTRICTED_CONTENT_MESSAGE };
  }

  return { ok: true, requestData: requestData as PdfAuthRequestData };
}
