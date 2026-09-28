"use client";

import { useEffect, useState } from "react";
import type { UserMultiPickerEmployee } from "@/components/user-multi-picker";

// Ek onaycı adayları: aktif + sistem hesabı bağlı çalışanlar (GET /api/approver-candidates).
// Sunucu aynı kuralı eklemede yeniden doğrular; bu liste yalnız seçim kolaylığı içindir.
export function useApproverCandidates(enabled: boolean) {
  const [candidates, setCandidates] = useState<UserMultiPickerEmployee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!enabled || loaded) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/approver-candidates");
        if (!res.ok) throw new Error("Aday listesi yüklenemedi");
        const body = (await res.json()) as UserMultiPickerEmployee[];
        if (cancelled) return;
        setCandidates(body);
        setLoaded(true);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Aday listesi yüklenemedi");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, loaded]);

  return { candidates, loading, error };
}
