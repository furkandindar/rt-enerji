import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

// PDF endpoint'lerinin (indir / önizle / anlık önizle) ortak yetki kontrolü.
// Kural: talep sahibi, onaycılardan biri veya ORG_ADMIN erişebilir.
// Request satırı kullanıcının kendi client'ıyla okunur; RLS burada ikinci
// katman olarak çalışır (requests_select politikası da bu üç grubu kapsar).

type RequestRow = Database["public"]["Tables"]["requests"]["Row"];

export interface PdfAuthRequestData {
  id: string;
  request_no: RequestRow["request_no"];
  status: RequestRow["status"];
  created_at: RequestRow["created_at"];
  pdf_path: RequestRow["pdf_path"];
  requester_employee_id: string;
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

  const { data: appUser } = await supabase
    .from("app_users")
    .select("employee_id, role")
    .eq("id", user.id)
    .single();

  // ORG_ADMIN employee bağı olmadan da PDF görebilmeli; diğer kullanıcılar
  // için employee bağı zorunlu (requester/approver eşleşmesi employee_id ile).
  const isOrgAdmin = appUser?.role === "ORG_ADMIN";
  if (!appUser?.employee_id && !isOrgAdmin) {
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

  // 3. Yetki kontrolü - Talep sahibi, onaylayanlar veya ORG_ADMIN görebilir
  const isRequester =
    requestData.requester_employee_id === appUser?.employee_id;
  const isApprover = requestData.approvals?.some(
    (approval: { approver_employee_id: string }) =>
      approval.approver_employee_id === appUser?.employee_id
  );

  if (!isRequester && !isApprover && !isOrgAdmin) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  return { ok: true, requestData: requestData as PdfAuthRequestData };
}
