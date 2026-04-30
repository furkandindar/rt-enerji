// Microsoft To Do (Microsoft Graph delegated) helpers.
// Server-only. user-client üzerinden /me/todo/* uçlarını kullanır.

import { graphUserFetch } from "./user-client";

// ============================================================================
// Config
// ============================================================================

/** Widget'ın tüm task'ları yazdığı list. Yoksa otomatik oluşturulur. */
export const RT_ENERJI_LIST_NAME = "RT Enerji";

/**
 * userId → listId in-memory cache. List ID'leri stabil; kullanıcı listeyi manuel
 * silerse Graph 404 döner, üst katmanda cache invalidate edip yeniden oluştururuz.
 */
const listIdCache = new Map<string, string>();

// ============================================================================
// Types
// ============================================================================

export type TodoStatus =
  | "notStarted"
  | "inProgress"
  | "completed"
  | "waitingOnOthers"
  | "deferred";

export interface TodoTask {
  id: string;
  title: string;
  body: string | null;
  status: TodoStatus;
  isCompleted: boolean;
  createdAtUtc: string;
  lastModifiedUtc: string;
}

interface GraphTaskResponse {
  id: string;
  title: string | null;
  body: { content: string | null; contentType: string } | null;
  status: TodoStatus;
  createdDateTime: string;
  lastModifiedDateTime: string;
}

interface GraphListResponse {
  value: Array<{
    id: string;
    displayName: string;
    wellknownListName?: string;
  }>;
}

// ============================================================================
// List helpers
// ============================================================================

/** "RT Enerji" listesini bulur, yoksa oluşturur ve ID'sini cache'ler. */
export async function getOrCreateRtEnerjiListId(userId: string): Promise<string> {
  const cached = listIdCache.get(userId);
  if (cached) return cached;

  // displayName eq filter
  const filter = encodeURIComponent(`displayName eq '${RT_ENERJI_LIST_NAME}'`);
  const findRes = await graphUserFetch(
    userId,
    `/me/todo/lists?$filter=${filter}`.replace(/%24/g, "$")
  );

  if (!findRes.ok) {
    const text = await findRes.text();
    throw new Error(`[MsTodo] list lookup failed: ${findRes.status} ${text}`);
  }

  const found = (await findRes.json()) as GraphListResponse;
  if (found.value.length > 0) {
    const id = found.value[0].id;
    listIdCache.set(userId, id);
    return id;
  }

  const createRes = await graphUserFetch(userId, "/me/todo/lists", {
    method: "POST",
    body: { displayName: RT_ENERJI_LIST_NAME },
  });

  if (!createRes.ok) {
    const text = await createRes.text();
    throw new Error(`[MsTodo] list create failed: ${createRes.status} ${text}`);
  }

  const created = (await createRes.json()) as { id: string };
  listIdCache.set(userId, created.id);
  return created.id;
}

/** Cache'i invalidate eder (404 vb. durumda yeniden lookup yapılır). */
export function invalidateListIdCache(userId: string): void {
  listIdCache.delete(userId);
}

// ============================================================================
// Task CRUD
// ============================================================================

export async function listTasks(userId: string): Promise<TodoTask[]> {
  const listId = await getOrCreateRtEnerjiListId(userId);

  const params = new URLSearchParams({
    $top: "200",
    $orderby: "createdDateTime desc",
  });
  const query = params.toString().replace(/%24/g, "$");

  const res = await graphUserFetch(userId, `/me/todo/lists/${listId}/tasks?${query}`);

  if (res.status === 404) {
    invalidateListIdCache(userId);
    return listTasks(userId);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[MsTodo] listTasks failed: ${res.status} ${text}`);
  }

  const data = (await res.json()) as { value: GraphTaskResponse[] };
  return data.value.map(toTodoTask);
}

export async function createTask(
  userId: string,
  input: { title: string; body?: string | null }
): Promise<TodoTask> {
  const listId = await getOrCreateRtEnerjiListId(userId);

  const payload: Record<string, unknown> = { title: input.title };
  if (input.body) {
    payload.body = { content: input.body, contentType: "text" };
  }

  const res = await graphUserFetch(userId, `/me/todo/lists/${listId}/tasks`, {
    method: "POST",
    body: payload,
  });

  if (res.status === 404) {
    invalidateListIdCache(userId);
    return createTask(userId, input);
  }
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[MsTodo] createTask failed: ${res.status} ${text}`);
  }

  return toTodoTask((await res.json()) as GraphTaskResponse);
}

export async function updateTask(
  userId: string,
  taskId: string,
  patch: { title?: string; body?: string | null; status?: TodoStatus }
): Promise<TodoTask> {
  const listId = await getOrCreateRtEnerjiListId(userId);

  const payload: Record<string, unknown> = {};
  if (patch.title !== undefined) payload.title = patch.title;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.body !== undefined) {
    payload.body = patch.body
      ? { content: patch.body, contentType: "text" }
      : { content: "", contentType: "text" };
  }

  const res = await graphUserFetch(userId, `/me/todo/lists/${listId}/tasks/${taskId}`, {
    method: "PATCH",
    body: payload,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`[MsTodo] updateTask failed: ${res.status} ${text}`);
  }

  return toTodoTask((await res.json()) as GraphTaskResponse);
}

export async function deleteTask(userId: string, taskId: string): Promise<void> {
  const listId = await getOrCreateRtEnerjiListId(userId);

  const res = await graphUserFetch(userId, `/me/todo/lists/${listId}/tasks/${taskId}`, {
    method: "DELETE",
  });

  if (!res.ok && res.status !== 404) {
    const text = await res.text();
    throw new Error(`[MsTodo] deleteTask failed: ${res.status} ${text}`);
  }
}

// ============================================================================
// Mappers
// ============================================================================

function toTodoTask(t: GraphTaskResponse): TodoTask {
  return {
    id: t.id,
    title: t.title ?? "(başlıksız)",
    body: t.body?.content?.trim() ? t.body.content : null,
    status: t.status,
    isCompleted: t.status === "completed",
    createdAtUtc: t.createdDateTime,
    lastModifiedUtc: t.lastModifiedDateTime,
  };
}
