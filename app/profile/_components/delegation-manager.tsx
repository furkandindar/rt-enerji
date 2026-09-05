"use client";

// Profil → "Vekalet" kartı (Faz B / B3): kişinin verdiği ve aldığı vekaletler +
// yeni vekalet tanımlama (self-service, karar 4).

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DelegationSheet } from "@/components/delegations/delegation-sheet";
import { DelegationsTable } from "@/components/delegations/delegations-table";
import type { DelegationRow } from "@/components/delegations/delegation-types";

interface DelegationManagerProps {
  employeeId: string;
}

export function DelegationManager({ employeeId }: DelegationManagerProps) {
  const [items, setItems] = useState<DelegationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/delegations");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Vekaletler yüklenemedi");
      setItems(data.items || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Vekaletler yüklenemedi");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const given = items.filter((d) => d.delegator_employee_id === employeeId);
  const received = items.filter((d) => d.delegate_employee_id === employeeId);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          İzinli olduğunuz dönemde Finans Onay Kapağı süreçlerindeki onaylarınızı sizin adınıza
          işleyecek bir vekil tanımlayın. Vekil kendi imzasını atar; belgede &quot;vekaleten&quot; olarak görünür.
        </p>
        <DelegationSheet
          mode="self"
          onCreated={load}
          trigger={
            <Button size="sm">
              <Plus className="mr-2 h-4 w-4" />
              Vekalet Tanımla
            </Button>
          }
        />
      </div>

      {isLoading ? (
        <div className="flex h-24 items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Verdiğim vekaletler</h3>
            <DelegationsTable
              items={given}
              viewerEmployeeId={employeeId}
              isAdmin={false}
              onChanged={load}
              emptyText="Henüz vekalet tanımlamadınız"
            />
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">Bana verilen vekaletler</h3>
            <DelegationsTable
              items={received}
              viewerEmployeeId={employeeId}
              isAdmin={false}
              onChanged={load}
              emptyText="Size verilmiş vekalet yok"
            />
          </div>
        </>
      )}
    </div>
  );
}
