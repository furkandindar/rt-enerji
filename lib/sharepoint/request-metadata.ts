// Talep metadata'sını okuyup PDF dosya adı + SharePoint klasör yolu üretir.
// enqueue-sync ve retry-worker ortak kullanır — single source of truth.

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { buildPdfFileName } from "@/lib/pdf/file-naming";
import { buildSharePointPath } from "./folder-mapper";
import type { Database } from "@/lib/database.types";

type RequestStatus = Database["public"]["Enums"]["request_status"];

// ============================================================================
// Types
// ============================================================================

export interface RequestUploadContext {
  requestNo: string;
  workflowCode: string | null;
  status: RequestStatus;
  createdAt: string;
  requesterFirstName: string | null;
  requesterLastName: string | null;
}

// ============================================================================
// Public API
// ============================================================================

/**
 * requests + workflow_definitions + employees join'i ile upload için gereken
 * metadata'yı toplar. Talep yoksa null döner.
 */
export async function fetchRequestUploadContext(
  requestId: string
): Promise<RequestUploadContext | null> {
  const supabaseAdmin = createServiceRoleClient();

  const { data, error } = await supabaseAdmin
    .from("requests")
    .select(`
      request_no,
      status,
      created_at,
      workflow_definition:workflow_definitions(code),
      requester:employees!requester_employee_id(first_name, last_name)
    `)
    .eq("id", requestId)
    .single();

  if (error || !data) return null;

  const requester = pickRequester(data.requester);

  return {
    requestNo: data.request_no,
    workflowCode: pickWorkflowCode(data.workflow_definition),
    status: data.status as RequestStatus,
    createdAt: data.created_at,
    requesterFirstName: requester.first_name,
    requesterLastName: requester.last_name,
  };
}

/** Context'ten PDF dosya adını türetir (file-naming.ts kullanır). */
export function deriveFileName(ctx: RequestUploadContext): string {
  return buildPdfFileName({
    request_no: ctx.requestNo,
    workflow_code: ctx.workflowCode,
    requester_first_name: ctx.requesterFirstName,
    requester_last_name: ctx.requesterLastName,
    status: ctx.status,
    created_at: ctx.createdAt,
  });
}

/** Context'ten SharePoint folder yolunu türetir (folder-mapper kullanır). */
export function deriveFolderPath(ctx: RequestUploadContext): string {
  const rootFolder = process.env.SHAREPOINT_ROOT_FOLDER ?? "Talepler";
  return buildSharePointPath(
    ctx.workflowCode,
    new Date(ctx.createdAt),
    rootFolder
  );
}

// ============================================================================
// Helpers — Supabase JS join sonuçları bazen array, bazen obje
// ============================================================================

function pickWorkflowCode(
  rel: { code: string | null } | { code: string | null }[] | null
): string | null {
  if (!rel) return null;
  const obj = Array.isArray(rel) ? rel[0] : rel;
  return obj?.code ?? null;
}

function pickRequester(
  rel:
    | { first_name: string | null; last_name: string | null }
    | { first_name: string | null; last_name: string | null }[]
    | null
): { first_name: string | null; last_name: string | null } {
  if (!rel) return { first_name: null, last_name: null };
  const obj = Array.isArray(rel) ? rel[0] : rel;
  return {
    first_name: obj?.first_name ?? null,
    last_name: obj?.last_name ?? null,
  };
}
