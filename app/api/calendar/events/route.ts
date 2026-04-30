import { createClient } from "@/lib/supabase/server";
import { getEventsInRange } from "@/lib/msgraph/calendar";
import {
  MsReconsentRequiredError,
  MsTokenNotFoundError,
} from "@/lib/msgraph/user-client";
import { NextRequest, NextResponse } from "next/server";

// GET /api/calendar/events?from=ISO&to=ISO
// Giriş yapmış kullanıcının Outlook calendar event'lerini döndürür.
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    if (!from || !to) {
      return NextResponse.json(
        { error: "Missing 'from' or 'to' query parameter (ISO 8601 expected)" },
        { status: 400 }
      );
    }

    const fromDate = new Date(from);
    const toDate = new Date(to);
    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json(
        { error: "Invalid date format for 'from' or 'to'" },
        { status: 400 }
      );
    }
    if (fromDate >= toDate) {
      return NextResponse.json(
        { error: "'from' must be before 'to'" },
        { status: 400 }
      );
    }

    const events = await getEventsInRange(
      user.id,
      fromDate.toISOString(),
      toDate.toISOString()
    );

    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof MsTokenNotFoundError) {
      return NextResponse.json(
        { error: "reauth_required", message: "Microsoft hesabı bağlantısı yok. Lütfen tekrar giriş yapın." },
        { status: 412 }
      );
    }
    if (error instanceof MsReconsentRequiredError) {
      return NextResponse.json(
        { error: "reconsent_required", message: "Microsoft oturumu yenilenmeli. Lütfen çıkış yapıp tekrar giriş yapın." },
        { status: 412 }
      );
    }
    console.error("[api/calendar/events] error:", error);
    return NextResponse.json(
      { error: "internal_error", message: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
