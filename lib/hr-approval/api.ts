// İşe Giriş / İşten Çıkış ONAY formlarının API işleyicileri (sunucu).
// İki form aynı akışı izler; route dosyaları yalnız yapılandırmayı bağlar.
//
// Tüm okuma/yazma RLS'li client ile yapılır (görünürlük DB'de: can_view_workflow_requests).
// Talep oluşturma İK departmanına (workflow_initiators) ve ORG_ADMIN'e açık (canStartWorkflow).

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  resolveApprovalChain,
  insertApprovalChain,
  getWorkflowDefinitionByCode,
  notifyApprover,
  canStartWorkflow,
  canEditRequest,
  applyAuditStamp,
  type ResolvedApprovalChain,
} from "@/lib/workflow";
import { approvalChainErrorResponse, rollbackCreatedRequest } from "@/lib/workflow/request-creation";
import type { ParseResult } from "./forms";
import { listDepartmentRequests, listErrorBody, parseListPaging } from "@/lib/department-processes/list-requests";

export interface HrApprovalApiConfig<T extends object> {
  workflowCode: string;
  detailTable: "onboarding_approval_requests" | "separation_approval_requests";
  /** Select'teki ilişki adı (ör. "onboarding_approval_request") */
  relation: string;
  /** Liste uçlarında dönen detay kolonları — ücret/tutar YOK */
  listColumns: string;
  /** Log bağlamı */
  context: string;
  /** Gövde doğrulaması (POST ve PATCH aynı tam payload) */
  parse: (raw: unknown) => ParseResult<T>;
}

async function getAppUser(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const { data: appUser } = await supabase
    .from("app_users")
    .select("employee_id, role")
    .eq("id", user.id)
    .single();

  if (!appUser?.employee_id) {
    return { error: NextResponse.json({ error: "User not linked to employee" }, { status: 400 }) };
  }
  return { appUser: appUser as { employee_id: string; role: string } };
}

/**
 * GET /api/<form> — scope: "mine" (varsayılan) | "department"; status; page/page_size.
 * Departman listesi yalnız süreci başlatabilenlere (İK) açık; RLS ayrıca süzer.
 */
export function createListHandler<T extends object>(cfg: HrApprovalApiConfig<T>) {
  return async function GET(request: NextRequest) {
    try {
      const supabase = await createClient();
      const searchParams = request.nextUrl.searchParams;
      const scope = searchParams.get("scope") === "department" ? "department" : "mine";
      const status = searchParams.get("status");
      const paging = parseListPaging(searchParams);

      const auth = await getAppUser(supabase);
      if (auth.error) return auth.error;
      const { appUser } = auth;

      const workflowDef = await getWorkflowDefinitionByCode(supabase, cfg.workflowCode);
      if (!workflowDef) return NextResponse.json({ error: "Workflow not found" }, { status: 400 });
      if (scope === "department") {
        const allowed = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
        if (!allowed) {
          return NextResponse.json({ error: "Bu süreçleri görüntüleme yetkiniz yok" }, { status: 403 });
        }
      }

      // İki aşamalı, ölçeklenen liste sorgusu (lib/department-processes/list-requests.ts)
      const result = await listDepartmentRequests(supabase, {
        workflowDefinitionId: workflowDef.id,
        scope,
        employeeId: appUser.employee_id,
        status,
        paging,
        relationSelect: `${cfg.relation}:${cfg.detailTable}(${cfg.listColumns})`,
        context: `${cfg.context} GET`,
      });
      if (!result.ok) {
        const err = listErrorBody(result.timeout);
        return NextResponse.json(err.body, { status: err.status });
      }

      return paging.usePagination
        ? NextResponse.json({ items: result.items, total: result.total, page: paging.page, page_size: paging.pageSize })
        : NextResponse.json(result.items);
    } catch (err) {
      console.error(`[${cfg.context} GET] error:`, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

/** POST /api/<form> — yeni talep: zincir önce çözülür, sonra talep + detay + zincir yazılır. */
export function createCreateHandler<T extends object>(cfg: HrApprovalApiConfig<T>) {
  return async function POST(request: Request) {
    try {
      const supabase = await createClient();

      const auth = await getAppUser(supabase);
      if (auth.error) return auth.error;
      const { appUser } = auth;

      const parsed = cfg.parse(await request.json().catch(() => null));
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

      const workflowDef = await getWorkflowDefinitionByCode(supabase, cfg.workflowCode);
      if (!workflowDef) return NextResponse.json({ error: "Workflow not found" }, { status: 400 });

      const allowed = await canStartWorkflow(supabase, appUser.employee_id, workflowDef.id, appUser.role);
      if (!allowed) return NextResponse.json({ error: "Bu formu başlatma yetkiniz yok" }, { status: 403 });

      // Zincir talepten ÖNCE: onaycısı çözülemeyen adım varsa hiç kayıt oluşmaz
      let chain: ResolvedApprovalChain;
      try {
        chain = await resolveApprovalChain(supabase, workflowDef.id, appUser.employee_id);
      } catch (chainError) {
        return approvalChainErrorResponse(chainError, cfg.context);
      }

      const { data: newRequest, error: requestError } = await supabase
        .from("requests")
        .insert({
          workflow_definition_id: workflowDef.id,
          requester_employee_id: appUser.employee_id,
          status: "PENDING",
          current_step: 1,
          submitted_at: new Date().toISOString(),
        })
        .select("id, request_no, status, current_step, created_at")
        .single();

      if (requestError || !newRequest) {
        console.error(`[${cfg.context} POST] request insert failed:`, requestError);
        return NextResponse.json({ error: "Failed to create request" }, { status: 500 });
      }

      const { error: detailError } = await supabase
        .from(cfg.detailTable)
        .insert({ request_id: newRequest.id, ...parsed.data } as never);

      if (detailError) {
        await rollbackCreatedRequest(newRequest.id, cfg.context);
        console.error(`[${cfg.context} POST] detail insert failed:`, detailError);
        return NextResponse.json({ error: "Form kaydedilemedi" }, { status: 500 });
      }

      try {
        await insertApprovalChain(supabase, newRequest.id, chain);
      } catch (approvalError) {
        await rollbackCreatedRequest(newRequest.id, cfg.context);
        return approvalChainErrorResponse(approvalError, cfg.context);
      }

      // İlk bekleyen onaycıya bildirim (1. adım talep sahibinde oto-onaylı)
      try {
        const [{ data: requester }, { data: current }] = await Promise.all([
          supabase.from("employees").select("first_name, last_name").eq("id", appUser.employee_id).single(),
          supabase.from("requests").select("current_step").eq("id", newRequest.id).single(),
        ]);
        const { data: pending } = await supabase
          .from("request_approvals")
          .select("approver_employee_id")
          .eq("request_id", newRequest.id)
          .eq("status", "PENDING")
          .eq("sequence_order", current?.current_step ?? 1)
          .maybeSingle();
        if (pending) {
          await notifyApprover(
            supabase,
            pending.approver_employee_id,
            requester ? `${requester.first_name} ${requester.last_name}` : "Bir çalışan",
            newRequest.id,
            workflowDef.name
          );
        }
      } catch (notifyError) {
        console.error(`[${cfg.context} POST] notification failed:`, notifyError);
      }

      return NextResponse.json(newRequest, { status: 201 });
    } catch (err) {
      console.error(`[${cfg.context} POST] error:`, err);
      return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
  };
}

/**
 * PATCH /api/<form>/[id] — talep sahibi Taslak/Revize İstendi durumunda formun tamamını
 * günceller (tam payload; POST ile aynı doğrulama). Yeniden gönderim ayrı uçtan
 * (/api/requests/[id]/resubmit) yapılır.
 */
export function createUpdateHandler<T extends object>(cfg: HrApprovalApiConfig<T>) {
  return async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
    try {
      const supabase = await createClient();
      const { id: requestId } = await params;

      const auth = await getAppUser(supabase);
      if (auth.error) return auth.error;
      const { appUser } = auth;

      const parsed = cfg.parse(await request.json().catch(() => null));
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

      const { data: req } = await supabase
        .from("requests")
        .select("id, status, requester_employee_id")
        .eq("id", requestId)
        .single();
      if (!req) return NextResponse.json({ error: "Request not found" }, { status: 404 });

      if (!canEditRequest(req, { employeeId: appUser.employee_id, role: appUser.role })) {
        return NextResponse.json({ error: "Cannot edit in current state" }, { status: 403 });
      }

      const { data: updated, error: updateError } = await supabase
        .from(cfg.detailTable)
        .update({ ...parsed.data, updated_at: new Date().toISOString() } as never)
        .eq("request_id", requestId)
        .select("id");

      if (updateError) {
        console.error(`[${cfg.context} PATCH] update failed:`, updateError);
        return NextResponse.json({ error: "Failed to update" }, { status: 500 });
      }
      // 0 satır: talep bu süreçten değil ya da RLS güncellemeye izin vermedi
      if (!updated || updated.length !== 1) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }

      await applyAuditStamp(supabase, requestId, "EDITED", appUser.employee_id);
      return NextResponse.json({ success: true });
    } catch (err) {
      console.error(`[${cfg.context} PATCH] error:`, err);
      return NextResponse.json({ error: "Internal error" }, { status: 500 });
    }
  };
}
