"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

export function SignatureReminder() {
  const [needsSignature, setNeedsSignature] = useState(false);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    checkSignature();
  }, []);

  const checkSignature = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // App user ve employee bilgisini al
      const { data: appUser } = await supabase
        .from("app_users")
        .select(`
          employee:employees(
            signature_path
          )
        `)
        .eq("id", user.id)
        .single();

      const employee = appUser?.employee as any;
      setNeedsSignature(!employee?.signature_path);
    } catch (error) {
      console.error("Error checking signature:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading || !needsSignature) {
    return null;
  }

  return (
    <Link
      href="/profile"
      className={cn(
        "flex items-center gap-2 rounded-md px-3 py-2 mx-2 mb-2",
        "bg-amber-50 dark:bg-amber-950/50",
        "border border-amber-200 dark:border-amber-800",
        "text-amber-800 dark:text-amber-200",
        "hover:bg-amber-100 dark:hover:bg-amber-900/50",
        "transition-colors text-sm"
      )}
    >
      <AlertTriangle className="h-4 w-4 flex-shrink-0" />
      <span className="group-data-[collapsible=icon]:hidden">
        İmzanızı oluşturun
      </span>
    </Link>
  );
}

