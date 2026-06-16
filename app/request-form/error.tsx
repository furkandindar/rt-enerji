"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// /request-form/* segmentindeki render hatalarını yakalar. App shell (sidebar
// vb.) yerinde kalır; kullanıcı boş ekran yerine anlamlı bir mesaj + "Tekrar
// dene" görür. error.message gerçek hatayı açığa çıkarır.
export default function RequestFormError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[RequestFormError]", error.name, error.message, error.digest, error.stack);
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center gap-4 p-12 text-center">
      <AlertTriangle className="h-10 w-10 text-amber-500" />
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Talep formu yüklenemedi</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          {error.message || "Beklenmeyen bir hata oluştu."}
        </p>
        {error.digest && (
          <code className="text-xs text-muted-foreground">digest: {error.digest}</code>
        )}
      </div>
      <Button onClick={() => reset()}>Tekrar dene</Button>
    </div>
  );
}
