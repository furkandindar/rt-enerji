// useRevisionResponse Hook
// Düzenleme formlarında "Revize Açıklaması" alanının durumu: görünürlük + değer +
// resubmit body'sine eklenecek alan. Alan yalnız talep REVISION_REQUESTED iken ve
// görüntüleyen talep sahibiyken görünür (sunucu da yalnız talep sahibinden kabul eder).

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/contexts/user-context";
import { useMentionCandidates } from "@/hooks/use-mention-candidates";
import { extractMentionedIds } from "@/lib/workflow/mentions-shared";

export interface RevisionResponseState {
  /** @mention aday listesi için */
  requestId: string | null;
  visible: boolean;
  value: string;
  setValue: (value: string) => void;
  /** Resubmit body'sine yayılır; alan görünmüyorsa boş obje. */
  payload: { revisionResponse?: string; mentionedEmployeeIds?: string[] };
}

export function useRevisionResponse(requestId: string | null): RevisionResponseState {
  const employeeId = useUser().user?.employeeId ?? null;
  const [request, setRequest] = useState<{ status: string; requesterId: string } | null>(null);
  const [value, setValue] = useState("");

  useEffect(() => {
    if (!requestId) return;
    let cancelled = false;
    (async () => {
      const { data } = await createClient()
        .from("requests")
        .select("status, requester_employee_id")
        .eq("id", requestId)
        .single();
      if (!cancelled && data) {
        setRequest({ status: data.status, requesterId: data.requester_employee_id });
      }
    })().catch((err) => console.error("[useRevisionResponse] load failed:", err));
    return () => {
      cancelled = true;
    };
  }, [requestId]);

  const visible =
    !!employeeId &&
    request?.status === "REVISION_REQUESTED" &&
    request.requesterId === employeeId;

  // @mention: açıklamadaki "@Ad Soyad"lar (aday listesi yalnız anma kullanılınca istenir)
  const { candidates } = useMentionCandidates(requestId, visible && value.includes("@"));
  const mentionedEmployeeIds = visible ? extractMentionedIds(value, candidates) : [];

  return {
    requestId,
    visible,
    value,
    setValue,
    payload: visible ? { revisionResponse: value, mentionedEmployeeIds } : {},
  };
}
