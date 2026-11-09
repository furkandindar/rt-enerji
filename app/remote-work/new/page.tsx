"use client";

// Uzaktan Çalışma Formu (REMOTE_WORK) — bireysel süreç.
// İzin altyapısını kullanır (leave_requests, /api/leave-requests, izin PDF şablonu)
// ama ayrı süreçtir: tür REMOTE_WORK'e sabittir, izin bakiyesine dokunmaz.
// Zincir: Talep Eden → İlgili Bölüm Müdürü → İnsan Kaynakları → Genel Koordinatör.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarIcon, Info, Laptop, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

import { createClient } from "@/lib/supabase/client";
import { SignaturePanel } from "@/components/signature-panel";
import type { SignatureFont } from "@/lib/signature/types";
import { RevisionNoticeForRequest } from "@/components/my-requests/revision-notice";
import { RevisionResponseField } from "@/components/my-requests/revision-response-field";
import { useRevisionResponse } from "@/hooks/use-revision-response";
import {
  calculateBusinessTime,
  combineDateAndTime,
  formatHourMinute,
  isWeekendDay,
  timeOptions,
} from "@/lib/leave/business-time";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

const REASON_MAX = 1000;

const schema = z
  .object({
    start_date: z.date({ error: "Başlangıç tarihi gerekli" }),
    start_time: z.string().min(1, "Başlangıç saati gerekli"),
    end_date: z.date({ error: "Bitiş tarihi gerekli" }),
    end_time: z.string().min(1, "Bitiş saati gerekli"),
    reason: z
      .string()
      .trim()
      .min(1, "Talep nedeni zorunludur")
      .max(REASON_MAX, `Talep nedeni en fazla ${REASON_MAX} karakter olabilir`),
  })
  .superRefine((v, ctx) => {
    if (!v.start_date || !v.end_date) return;
    const start = combineDateAndTime(v.start_date, v.start_time);
    const end = combineDateAndTime(v.end_date, v.end_time);
    if (end <= start) {
      ctx.addIssue({
        code: "custom",
        path: ["end_time"],
        message: "Bitiş, başlangıçtan sonra olmalıdır",
      });
    }
  });

type FormValues = z.infer<typeof schema>;

interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

interface LeaveEditRecord {
  leave_type?: string | null;
  start_datetime?: string | null;
  end_datetime?: string | null;
  reason?: string | null;
}

export default function NewRemoteWorkPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const revisionResponse = useRevisionResponse(editId);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingEditData, setLoadingEditData] = useState<boolean>(isEditMode);
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [signatureInfo, setSignatureInfo] = useState<SignatureInfo>({ signatureText: null, signatureFont: null });
  const [loadingSignature, setLoadingSignature] = useState(true);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { start_time: "09:00", end_time: "17:00", reason: "" },
  });

  // Talep sahibinin imza bilgisi
  useEffect(() => {
    const supabase = createClient();
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: appUser } = await supabase
          .from("app_users")
          .select("employee:employees(signature_text, signature_font)")
          .eq("id", user.id)
          .single();
        const employee = (appUser as { employee?: { signature_text: string | null; signature_font: string | null } | null } | null)
          ?.employee;
        if (employee) {
          setSignatureInfo({
            signatureText: employee.signature_text,
            signatureFont: employee.signature_font as SignatureFont | null,
          });
        }
      } catch (error) {
        console.error("Error loading signature:", error);
      } finally {
        setLoadingSignature(false);
      }
    })();
  }, []);

  // Düzenleme modu: ?edit=<id>
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/my-requests/${editId}`);
        const body = res.ok ? await res.json() : null;
        const raw = body?.leave_request as LeaveEditRecord | LeaveEditRecord[] | null | undefined;
        const r = Array.isArray(raw) ? raw[0] : raw;
        if (cancelled) return;
        if (!r || r.leave_type !== "REMOTE_WORK") {
          toast.error("Talep bulunamadı");
          return;
        }
        const start = r.start_datetime ? new Date(r.start_datetime) : undefined;
        const end = r.end_datetime ? new Date(r.end_datetime) : undefined;
        form.reset({
          start_date: start,
          start_time: start ? formatHourMinute(start) : "09:00",
          end_date: end,
          end_time: end ? formatHourMinute(end) : "17:00",
          reason: r.reason ?? "",
        });
      } catch (err) {
        console.error("Edit data load error:", err);
        toast.error("Talep yüklenirken hata oluştu");
      } finally {
        if (!cancelled) setLoadingEditData(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const watchStartDate = form.watch("start_date");
  const watchEndDate = form.watch("end_date");
  const watchStartTime = form.watch("start_time");
  const watchEndTime = form.watch("end_time");
  const { days: totalDays, hours: totalHours } = calculateBusinessTime(
    watchStartDate,
    watchEndDate,
    watchStartTime || "09:00",
    watchEndTime || "17:00"
  );

  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);
  const canSubmit = isEditMode || (hasValidSignature && signatureAccepted);

  const onSubmit = async (v: FormValues) => {
    setIsSubmitting(true);
    try {
      const payload: Record<string, unknown> = {
        start_datetime: combineDateAndTime(v.start_date, v.start_time).toISOString(),
        end_datetime: combineDateAndTime(v.end_date, v.end_time).toISOString(),
        total_days: totalDays,
        reason: v.reason.trim(),
      };
      if (!isEditMode) {
        payload.workflow_code = "REMOTE_WORK";
        payload.leave_type = "REMOTE_WORK";
      }

      const response = await fetch(isEditMode ? `/api/leave-requests/${editId}` : "/api/leave-requests", {
        method: isEditMode ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || (isEditMode ? "Talep güncellenemedi" : "Talep oluşturulamadı"));
      }

      if (isEditMode) {
        const resubmitRes = await fetch(`/api/requests/${editId}/resubmit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(revisionResponse.payload),
        });
        if (!resubmitRes.ok) {
          const err = await resubmitRes.json().catch(() => ({}));
          throw new Error(err.error || "Talep güncellendi ama yeniden gönderilemedi");
        }
        toast.success("Talep güncellendi ve onaya gönderildi");
      } else {
        toast.success("Uzaktan çalışma talebi onaya gönderildi");
      }
      router.push("/my-requests");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingEditData) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEditMode ? "Uzaktan Çalışma Talebini Güncelle" : "Uzaktan Çalışma Formu"}
        </h1>
        <p className="text-muted-foreground">
          {isEditMode ? "Talebi düzenleyin ve yeniden onaya gönderin" : "Uzaktan çalışma talebinizi oluşturun"}
        </p>
      </div>

      {isEditMode && (
        <div className="max-w-2xl empty:hidden">
          <RevisionNoticeForRequest requestId={editId} />
        </div>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Laptop className="h-5 w-5" />
            Uzaktan Çalışma Bilgileri
          </CardTitle>
          <CardDescription>
            Onay sırası: İlgili Bölüm Müdürü → İnsan Kaynakları → Genel Koordinatör
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Uzaktan çalışma talepleri hafta sonu ve resmi tatillerle birleştirilemez.</span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Başlangıç Tarihi</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "PPP", { locale: tr }) : <span>Tarih seçin</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < today || isWeekendDay(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="start_time"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Başlangıç Saati</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Saat seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {timeOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Bitiş Tarihi</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}
                            >
                              {field.value ? format(field.value, "PPP", { locale: tr }) : <span>Tarih seçin</span>}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => date < (watchStartDate || today) || isWeekendDay(date)}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="end_time"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Bitiş Saati</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Saat seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {timeOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {(totalDays > 0 || totalHours > 0) && (
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-sm text-muted-foreground">
                    Toplam <strong className="text-foreground">{totalDays}</strong> iş günü (
                    <strong className="text-foreground">{totalHours}</strong> saat) uzaktan çalışma
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">Hafta sonları hariç, 1 iş günü = 8 saat</p>
                </div>
              )}

              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Talep Nedeni</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Uzaktan çalışma talebinizin nedeni" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <RevisionResponseField state={revisionResponse} disabled={isSubmitting} />

              {!isEditMode && !loadingSignature && (
                <SignaturePanel
                  signatureText={signatureInfo.signatureText}
                  signatureFont={signatureInfo.signatureFont}
                  isAccepted={signatureAccepted}
                  onAcceptChange={setSignatureAccepted}
                  title="TALEP İMZASI"
                  description="Bu talebi imzanızla onaylayacaksınız:"
                  disabled={isSubmitting}
                />
              )}

              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                  İptal
                </Button>
                <Button type="submit" disabled={isSubmitting || !canSubmit}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isEditMode ? "Güncelle ve Gönder" : "İmzala ve Talebi Gönder"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
