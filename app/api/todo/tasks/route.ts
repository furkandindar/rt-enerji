import { createClient } from "@/lib/supabase/server";
import { createTask, listTasks } from "@/lib/msgraph/todo";
import {
  MsReconsentRequiredError,
  MsTokenNotFoundError,
} from "@/lib/msgraph/user-client";
import { NextRequest, NextResponse } from "next/server";

// GET /api/todo/tasks → kullanıcının "RT Enerji" listesindeki tüm task'lar
export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tasks = await listTasks(user.id);
    return NextResponse.json({ tasks });
  } catch (error) {
    return handleError(error, "GET");
  }
}

// POST /api/todo/tasks { title, body? } → yeni task oluştur
export async function POST(request: NextRequest) {
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
    } | null;

    const title = typeof payload?.title === "string" ? payload.title.trim() : "";
    if (!title) {
      return NextResponse.json({ error: "title gerekli" }, { status: 400 });
    }
    const body =
      typeof payload?.body === "string" && payload.body.trim() !== ""
        ? payload.body.trim()
        : null;

    const task = await createTask(user.id, { title, body });
    return NextResponse.json({ task }, { status: 201 });
  } catch (error) {
    return handleError(error, "POST");
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
  console.error(`[api/todo/tasks ${method}] error:`, error);
  return NextResponse.json(
    {
      error: "internal_error",
      message: error instanceof Error ? error.message : "Unknown error",
    },
    { status: 500 }
  );
}
