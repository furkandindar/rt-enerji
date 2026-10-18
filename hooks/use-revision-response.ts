// useRevisionResponse Hook
// Düzenleme formlarında "Revize Açıklaması" alanının durumu: görünürlük + değer +
// resubmit body'sine eklenecek alan. Alan yalnız talep REVISION_REQUESTED iken ve
// görüntüleyen talep sahibiyken görünür (sunucu da yalnız talep sahibinden kabul eder).

"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useUser } from "@/lib/contexts/user-context";

export interface RevisionResponseState {
  visible: boolean;
  value: string;
  setValue: (value: string) => void;
  /** Resubmit body'sine yayılır; alan görünmüyorsa boş obje. */
  payload: { revisionResponse?: string };
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

  return {
    visible,
    value,
    setValue,
    payload: visible ? { revisionResponse: value } : {},
  };
}
