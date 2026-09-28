"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  resolveExtraApproverTarget,
  type ExtraApproverStepLike,
} from "@/lib/workflow/extra-approvers-shared";

export interface LockedExtraApproverView {
  employee_id: string;
  employee_name: string | null;
  added_by_name: string | null;
  mode: "REVISION" | "DIRECT";
}

export interface ExtraApproverSetup {
  loading: boolean;
  /** Süreçte ek onaycı yapılandırması tam mı (bayraklı adım + öncesinde dinamik adım) */
  enabled: boolean;
  /** Seçimlerin yazıldığı DYNAMIC_USER_LIST adımı */
  dynamicStepId: string | null;
  /** Eklenenlerin önünde onay verdiği adımın adı (Olur'da "Genel Koordinatör") */
  managerStepName: string | null;
  /** Düzenleme modunda: yöneticinin eklediği, talep sahibinin çıkaramayacağı kişiler */
  locked: LockedExtraApproverView[];
}

const DISABLED: ExtraApproverSetup = {
  loading: false,
  enabled: false,
  dynamicStepId: null,
  managerStepName: null,
  locked: [],
};

/**
 * Talep formunun ek onaycı kurulumu.
 * - Düzenleme (requestId var): GET /api/requests/[id]/extra-approvers (kilitli kişiler dahil)
 * - Oluşturma: süreç adımları okunur (select('*') — bayrak kolonu adıyla seçilmez)
 * Yapılandırma yoksa enabled=false → form bölümü hiç gösterilmez.
 */
export function useExtraApproverSetup(workflowCode: string, requestId: string | null): ExtraApproverSetup {
  const [setup, setSetup] = useState<ExtraApproverSetup>({ ...DISABLED, loading: true });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        if (requestId) {
          const res = await fetch(`/api/requests/${encodeURIComponent(requestId)}/extra-approvers`);
          if (!res.ok) throw new Error("extra approver setup failed");
          const body = (await res.json()) as Omit<ExtraApproverSetup, "loading">;
          if (!cancelled) setSetup({ ...body, locked: body.locked ?? [], loading: false });
          return;
        }

        const supabase = createClient();
        const { data: wfDef } = await supabase
          .from("workflow_definitions")
          .select("id")
          .eq("code", workflowCode)
          .single();
        if (!wfDef) throw new Error("workflow not found");

        const { data: steps } = await supabase
          .from("workflow_steps")
          .select("*")
          .eq("workflow_definition_id", wfDef.id)
          .order("step_order", { ascending: true });

        const stepList = (steps ?? []) as ExtraApproverStepLike[];
        const managerStep = stepList.find(
          (s) => s.can_add_extra_approvers === true && resolveExtraApproverTarget(stepList, s.id) !== null
        );
        const target = managerStep ? resolveExtraApproverTarget(stepList, managerStep.id) : null;
        if (cancelled) return;
        setSetup(
          managerStep && target
            ? {
                loading: false,
                enabled: true,
                dynamicStepId: target.dynamicStepId,
                managerStepName: managerStep.name ?? null,
                locked: [],
              }
            : DISABLED
        );
      } catch (err) {
        // Kurulum okunamazsa bölüm gizlenir; talep ek onaycısız normal akışla gider
        console.error("Extra approver setup error:", err);
        if (!cancelled) setSetup(DISABLED);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [workflowCode, requestId]);

  return setup;
}
