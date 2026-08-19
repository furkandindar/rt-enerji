// Talep metadata'sını okuyup arşiv dosya adı + SharePoint klasör yolu üretir.
// enqueue-sync ve retry-worker ortak kullanır — single source of truth.

import { createServiceRoleClient } from "@/lib/supabase/service-role";
import {
  buildArchiveFileName,
  isArchivableStatus,
} from "@/lib/pdf/file-naming";
import { buildArchiveFolderPath } from "./folder-mapper";
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
  completedAt: string | null;
  lastActionAt: string | null;
  requesterFirstName: string | null;
  requesterLastName: string | null;
  departmentCode: string | null;   // organizational_units.code (aktif primary pozisyon)
  departmentName: string | null;   // organizational_units.name
}

export interface ArchiveTarget {
  folderPath: string;
  fileName: string;
  fullPath: string;  // `${folderPath}/${fileName}` — kuyruğa dondurulan hedef
}

// ============================================================================
// Public API
// ============================================================================

/**
 * requests + workflow_definitions + employees (+ pozisyon → birim zinciri)
 * join'i ile upload için gereken metadata'yı toplar. Talep yoksa null döner.
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
      completed_at,
      last_action_at,
      workflow_definition:workflow_definitions(code),
      requester:employees!requester_employee_id(
        first_name,
        last_name,
        employee_positions(
          is_primary,
          end_date,
          position:positions(
            unit:organizational_units(code, name)
          )
        )
      )
    `)
    .eq("id", requestId)
    .single();

  if (error || !data) return null;

  const requester = pickRequester(data.requester);
  const department = pickDepartment(data.requester);

  return {
    requestNo: data.request_no,
    workflowCode: pickWorkflowCode(data.workflow_definition),
    status: data.status as RequestStatus,
    createdAt: data.created_at,
    completedAt: data.completed_at ?? null,
    lastActionAt: data.last_action_at ?? null,
    requesterFirstName: requester.first_name,
    requesterLastName: requester.last_name,
    departmentCode: department.code,
    departmentName: department.name,
  };
}

/**
 * Talebin kesin sonuca ulaştığı an. Terminal statü yazan her rota
 * completed_at'i doldurur; kalanlar salt defansif fallback.
 */
export function resolveFinalizedAt(ctx: RequestUploadContext): string {
  return ctx.completedAt ?? ctx.lastActionAt ?? ctx.createdAt;
}

/**
 * Context'ten arşiv hedefini (klasör + dosya adı) türetir.
 * Terminal olmayan statüler arşivlenmez → null.
 */
export function deriveArchiveTarget(
  ctx: RequestUploadContext
): ArchiveTarget | null {
  if (!isArchivableStatus(ctx.status)) return null;

  const rootFolder = process.env.SHAREPOINT_ROOT_FOLDER ?? "Talepler";
  const finalizedAt = resolveFinalizedAt(ctx);

  const folderPath = buildArchiveFolderPath({
    workflowCode: ctx.workflowCode,
    status: ctx.status,
    finalizedAt,
    rootFolder,
  });

  const fileName = buildArchiveFileName({
    request_no: ctx.requestNo,
    requester_first_name: ctx.requesterFirstName,
    requester_last_name: ctx.requesterLastName,
    finalized_at: finalizedAt,
    department_code: ctx.departmentCode,
    department_name: ctx.departmentName,
    status: ctx.status,
  });

  return { folderPath, fileName, fullPath: `${folderPath}/${fileName}` };
}

// ============================================================================
// Helpers — Supabase JS join sonuçları bazen array, bazen obje
// ============================================================================

function pickOne<T>(rel: T | T[] | null | undefined): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? rel[0] ?? null : rel;
}

function pickWorkflowCode(
  rel: { code: string | null } | { code: string | null }[] | null
): string | null {
  return pickOne(rel)?.code ?? null;
}

interface RequesterRel {
  first_name: string | null;
  last_name: string | null;
  employee_positions?: EmployeePositionRel | EmployeePositionRel[] | null;
}

interface EmployeePositionRel {
  is_primary: boolean | null;
  end_date: string | null;
  position: PositionRel | PositionRel[] | null;
}

interface PositionRel {
  unit: UnitRel | UnitRel[] | null;
}

interface UnitRel {
  code: string | null;
  name: string | null;
}

function pickRequester(
  rel: RequesterRel | RequesterRel[] | null
): { first_name: string | null; last_name: string | null } {
  const obj = pickOne(rel);
  return {
    first_name: obj?.first_name ?? null,
    last_name: obj?.last_name ?? null,
  };
}

/**
 * Talep edenin AKTİF PRIMARY pozisyonunun bağlı olduğu birimi çözer
 * (is_primary = true, end_date IS NULL — codebase'deki standart konvansiyon).
 */
function pickDepartment(
  rel: RequesterRel | RequesterRel[] | null
): { code: string | null; name: string | null } {
  const requester = pickOne(rel);
  const eps = requester?.employee_positions;
  const list: EmployeePositionRel[] = Array.isArray(eps)
    ? eps
    : eps
      ? [eps]
      : [];

  const active = list.find((ep) => ep.is_primary && !ep.end_date) ?? null;
  const unit = pickOne(pickOne(active?.position)?.unit);

  return { code: unit?.code ?? null, name: unit?.name ?? null };
}
