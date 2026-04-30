"use client";

import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useState } from "react";

export function LoginForm({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleAzureLogin = async () => {
    const supabase = createClient();
    setIsLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "email offline_access Calendars.ReadWrite Tasks.ReadWrite",
        },
      });
      if (error) throw error;
    } catch (error: unknown) {
      setError(error instanceof Error ? error.message : "An error occurred");
      setIsLoading(false);
    }
  };

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card className="border-black/5 bg-white/70 shadow-xl backdrop-blur-md transition-all duration-300 hover:bg-white/80 hover:shadow-2xl dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10 dark:hover:shadow-white/5">
        <CardHeader className="items-center pb-2">
          <div className="mb-4 rounded-full bg-slate-100 p-4 ring-1 ring-slate-200 shadow-lg shadow-black/5 dark:bg-white/10 dark:ring-white/10 dark:shadow-black/20">
            {/* Using a placeholder for the logo if image fails or for cleaner look, but we can use the img tag too */}
            <img src="/logo.png" alt="Logo" className="h-12 w-12 object-contain drop-shadow-md dark:brightness-110 dark:invert" />
          </div>
          <CardTitle className="text-2xl font-bold tracking-tight text-slate-900 drop-shadow-sm dark:text-white">Hoş Geldiniz</CardTitle>
          <CardDescription className="text-center text-slate-600 dark:text-slate-300">
            RT Enerji Süreç Yönetim Sistemine<br />giriş yapmak için devam edin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-6 pt-4">
            {error && (
              <div className="rounded-md bg-red-50 p-3 text-sm font-medium text-red-600 ring-1 ring-red-500/20 text-center animate-in fade-in slide-in-from-top-1 dark:bg-red-500/10 dark:text-red-200">
                {error}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              className="group relative h-12 w-full overflow-hidden border-slate-200 bg-white text-base font-medium text-slate-900 transition-all hover:border-slate-300 hover:bg-slate-50 dark:border-white/20 dark:bg-white/5 dark:text-white dark:hover:border-white/40 dark:hover:bg-white/10"
              onClick={handleAzureLogin}
              disabled={isLoading}
            >
              <div className="absolute inset-0 bg-linear-to-r from-transparent via-black/5 to-transparent transition-transform duration-1000 group-hover:translate-x-full -translate-x-full dark:via-white/5" />
              <svg className="mr-2 h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 23 23">
                <path fill="#f35325" d="M1 1h10v10H1z" />
                <path fill="#81bc06" d="M12 1h10v10H12z" />
                <path fill="#05a6f0" d="M1 12h10v10H1z" />
                <path fill="#ffba08" d="M12 12h10v10H12z" />
              </svg>
              <span>Microsoft ile Giriş Yap</span>
            </Button>

            <div className="text-center">
              <p className="text-xs text-slate-500 font-medium tracking-wide opacity-60">
                RT ENERJİ &copy; 2026
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="text-center text-xs text-slate-400 opacity-0 animate-in fade-in delay-500 duration-1000 fill-mode-forwards">
        Güvenli • Hızlı • Verimli
      </div>
    </div>
  );
}
