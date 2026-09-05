"use client";

// Admin → Vekaletler sayfası (Faz B / B3): tüm vekaletler + herkes adına tanımlama.

import { useCallback, useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DelegationSheet } from "@/components/delegations/delegation-sheet";
import { DelegationsTable } from "@/components/delegations/delegations-table";
import type { DelegationRow } from "@/components/delegations/delegation-types";

interface DelegationsAdminProps {
  viewerEmployeeId: string;
}

export function DelegationsAdmin({ viewerEmployeeId }: DelegationsAdminProps) {
  const [items, setItems] = useState<DelegationRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch("/api/delegations?scope=all");
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

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Vekaletler</h1>
          <p className="text-muted-foreground">
            Onaycılar izindeyken onlar adına işlem yapacak vekilleri yönetin (şimdilik yalnız Finans Onay Kapağı)
          </p>
        </div>
        <DelegationSheet
          mode="admin"
          onCreated={load}
          trigger={
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Vekalet Tanımla
            </Button>
          }
        />
      </div>

      {isLoading ? (
        <div className="flex h-32 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : (
        <DelegationsTable items={items} viewerEmployeeId={viewerEmployeeId} isAdmin onChanged={load} />
      )}
    </div>
  );
}
