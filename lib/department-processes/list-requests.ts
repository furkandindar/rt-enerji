// Departman süreç listeleri (DepartmentProcessListPage) için ortak, ölçeklenen sorgu.
//
// Neden iki aşama (2026-11-11, Finans Onay Kapağı listesi 8 sn timeout'u):
//   Tek PostgREST sorgusunda iç içe ilişkiler (kapak + tüm kalemleri) LIMIT'ten ÖNCE
//   bütün satırlar için hesaplanıyordu; her alt satır kendi RLS'inde üst talebin
//   görünürlüğünü yeniden kontrol ettiği için maliyet toplam kayıt sayısıyla büyüdü
//   (612 kapak + 1.572 kalem → 7,96 sn; authenticated statement_timeout = 8 sn).
//
//   1) Sayfa: yalnız `id` (+ toplam sayı) — workflow_definition_id, kapsam ve durum
//      filtreleriyle, sıralı ve aralıklı. Maliyet: talepler üzerindeki RLS, bir kez.
//   2) Detay: yalnız bu sayfanın id'leri için listenin GÖSTERDİĞİ alanlar.
//      Maliyet sayfa boyutuyla sınırlı (10–100), toplam kayıt sayısından bağımsız.
//
// Liste ekranı alt kalemleri (items/entries) hiç kullanmaz; burada çekilmez.
// Detay görünümü /api/my-requests/[id] ve /api/approvals/[id] üzerinden tam veriyi alır.

import type { SupabaseClient } from "@supabase/supabase-js";

export const LIST_PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_LIST_PAGE_SIZE = 10;

/** Listede gösterilen talep alanları (DepartmentProcessListPage ile birebir). */
const BASE_LIST_SELECT = `
  id,
  request_no,
  status,
  created_at,
  updated_at,
  workflow_definition:workflow_definitions(id, code, name),
  requester:employees!requester_employee_id(id, first_name, last_name, employee_no)
`;

export interface ListPaging {
  usePagination: boolean;
  page: number;
  pageSize: number;
}

/** URL'deki page / page_size parametrelerini güvenli değerlere çevirir. */
export function parseListPaging(searchParams: URLSearchParams): ListPaging {
  const pageParam = searchParams.get("page");
  const pageSizeParam = searchParams.get("page_size");
  const n = Number(pageSizeParam);
  const p = Number(pageParam);
  return {
    usePagination: pageParam !== null || pageSizeParam !== null,
    pageSize: (LIST_PAGE_SIZES as readonly number[]).includes(n) ? n : DEFAULT_LIST_PAGE_SIZE,
    page: Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1,
  };
}

export interface ListDepartmentRequestsOptions {
  workflowDefinitionId: string;
  /** "mine": yalnız bu çalışanın talepleri; "department": RLS'in gösterdiği tümü */
  scope: "mine" | "department";
  employeeId: string;
  status?: string | null;
  paging: ListPaging;
  /**
   * Listede gösterilen tipe özel alanlar, ör.
   * `finance_request:finance_approval_cover_requests(document_no)`.
   * Alt tablolar (items/entries) EKLENMEMELİ.
   */
  relationSelect?: string;
  /** Hata loglarında bağlam */
  context: string;
}

export type ListDepartmentRequestsResult =
  | { ok: true; items: Record<string, unknown>[]; total: number }
  | { ok: false; timeout: boolean };

const PG_STATEMENT_TIMEOUT = "57014";

export async function listDepartmentRequests(
  supabase: SupabaseClient,
  opts: ListDepartmentRequestsOptions
): Promise<ListDepartmentRequestsResult> {
  const { workflowDefinitionId, scope, employeeId, status, paging, relationSelect, context } = opts;

  // 1) Sayfa: id + toplam
  let pageQuery = supabase
    .from("requests")
    .select("id", paging.usePagination ? { count: "exact" } : {})
    .eq("workflow_definition_id", workflowDefinitionId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });

  if (scope === "mine") pageQuery = pageQuery.eq("requester_employee_id", employeeId);
  if (status) pageQuery = pageQuery.eq("status", status);
  if (paging.usePagination) {
    const from = (paging.page - 1) * paging.pageSize;
    pageQuery = pageQuery.range(from, from + paging.pageSize - 1);
  }

  const { data: pageRows, error: pageError, count } = await pageQuery;
  if (pageError) {
    console.error(`[${context}] list page query failed:`, pageError);
    return { ok: false, timeout: pageError.code === PG_STATEMENT_TIMEOUT };
  }

  const ids = (pageRows ?? []).map((r) => (r as { id: string }).id);
  const total = paging.usePagination ? (count ?? 0) : ids.length;
  if (ids.length === 0) return { ok: true, items: [], total };

  // 2) Detay: yalnız bu sayfa
  const select = relationSelect ? `${BASE_LIST_SELECT}, ${relationSelect}` : BASE_LIST_SELECT;
  const { data: detailRows, error: detailError } = await supabase
    .from("requests")
    .select(select)
    .in("id", ids);
  if (detailError) {
    console.error(`[${context}] list detail query failed:`, detailError);
    return { ok: false, timeout: detailError.code === PG_STATEMENT_TIMEOUT };
  }

  // 1. aşamanın sırası korunur (IN sırayı garanti etmez)
  const byId = new Map((detailRows ?? []).map((r) => [(r as unknown as { id: string }).id, r]));
  const items = ids
    .map((id) => byId.get(id))
    .filter((r): r is NonNullable<typeof r> => r != null) as unknown as Record<string, unknown>[];

  return { ok: true, items, total };
}

/** Liste hatasında kullanıcıya dönecek cevap gövdesi + durum kodu. */
export function listErrorBody(timeout: boolean): { body: { error: string }; status: number } {
  return timeout
    ? { body: { error: "Sorgu zaman aşımına uğradı, lütfen tekrar deneyin." }, status: 504 }
    : { body: { error: "Failed to fetch requests" }, status: 500 };
}
