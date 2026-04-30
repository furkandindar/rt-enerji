import { createClient } from "@/lib/supabase/server";
import { deleteTask, updateTask, type TodoStatus } from "@/lib/msgraph/todo";
import {
  MsReconsentRequiredError,
  MsTokenNotFoundError,
} from "@/lib/msgraph/user-client";
import { NextRequest, NextResponse } from "next/server";

const VALID_STATUSES: TodoStatus[] = [
  "notStarted",
  "inProgress",
  "completed",
  "waitingOnOthers",
  "deferred",
];

// PATCH /api/todo/tasks/[taskId] { title?, body?, status? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const payload = (await request.json().catch(() => null)) as {
      title?: unknown;
      body?: unknown;
      status?: unknown;
    } | null;

    if (!payload) {
      return NextResponse.json({ error: "body gerekli" }, { status: 400 });
    }

    const patch: { title?: string; body?: string | null; status?: TodoStatus } = {};

    if (typeof payload.title === "string") {
      const t = payload.title.trim();
      if (!t) {
        return NextResponse.json({ error: "title boş olamaz" }, { status: 400 });
      }
      patch.title = t;
    }

    if (payload.body !== undefined) {
      if (payload.body === null) {
        patch.body = null;
      } else if (typeof payload.body === "string") {
        const b = payload.body.trim();
        patch.body = b === "" ? null : b;
      } else {
        return NextResponse.json({ error: "body string|null olmalı" }, { status: 400 });
      }
    }

    if (payload.status !== undefined) {
      if (
        typeof payload.status !== "string" ||
        !VALID_STATUSES.includes(payload.status as TodoStatus)
      ) {
        return NextResponse.json({ error: "geçersiz status" }, { status: 400 });
      }
      patch.status = payload.status as TodoStatus;
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "güncellenecek alan yok" }, { status: 400 });
    }

    const task = await updateTask(user.id, taskId, patch);
    return NextResponse.json({ task });
  } catch (error) {
    return handleError(error, "PATCH");
  }
}

// DELETE /api/todo/tasks/[taskId]
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ taskId: string }> }
) {
  const { taskId } = await params;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await deleteTask(user.id, taskId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return handleError(error, "DELETE");
  }
}

function handleError(error: unknown, method: string) {
  if (error instanceof MsTokenNotFoundError) {
    return NextResponse.json(
      {
        error: "reauth_required",
        message: "Microsoft hesabı bağlantısı yok. Lütfen tekrar giriş yapın.",
      },
      { status: 412 }
    );
  }
  if (error instanceof MsReconsentRequiredError) {
    return NextResponse.json(
      {
        error: "reconsent_required",
        message: "Microsoft oturumu yenilenmeli. Lütfen çıkış yapıp tekrar giriş yapın.",
      },
      { status: 412 }
    );
  }
  console.error(`[api/todo/tasks/[taskId] ${method}] error:`, error);
  return NextResponse.json(
    {
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 }
  );
}
