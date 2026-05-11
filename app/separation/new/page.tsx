"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarIcon, Loader2, UserMinus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SignaturePanel } from "@/components/signature-panel";
import { SignatureFont } from "@/lib/signature/types";
import { format } from "date-fns";
import { tr } from "date-fns/locale";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const separationSchema = z.object({
  employee_name: z.string().min(1, "Personelin adı zorunludur"),
  employee_title: z.string().min(1, "Unvan zorunludur"),
  department: z.string().min(1, "Departman zorunludur"),
  location: z.string().min(1, "Lokasyon zorunludur"),
  job_description: z.string().min(1, "İş tanımı zorunludur"),
  reporting_manager: z.string().min(1, "Bağlı olduğu yönetici zorunludur"),
  separation_date: z.date({ message: "Ayrılış tarihi zorunludur" }),
  separation_reason: z.string().min(1, "Ayrılış sebebi zorunludur"),
  employment_period: z.string().min(1, "Çalışma süresi zorunludur"),
  annual_leave_days: z.coerce.number().int().min(0),
  annual_leave_amount: z.coerce.number().min(0),
  severance_days: z.coerce.number().int().min(0),
  severance_amount: z.coerce.number().min(0),
  notice_weeks: z.coerce.number().int().min(0),
  notice_amount: z.coerce.number().min(0),
});

type SeparationFormValues = z.infer<typeof separationSchema>;

interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

export default function NewSeparationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingEditData, setLoadingEditData] = useState<boolean>(isEditMode);
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [signatureInfo, setSignatureInfo] = useState<SignatureInfo>({
    signatureText: null,
    signatureFont: null,
  });
  const [loadingSignature, setLoadingSignature] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    const loadSignatureInfo = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: appUser } = await supabase
          .from("app_users")
          .select(`employee:employees(signature_text, signature_font)`)
          .eq("id", user.id)
          .single();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const employee = appUser?.employee as any;
        if (employee) {
          setSignatureInfo({ signatureText: employee.signature_text, signatureFont: employee.signature_font });
        }
      } catch (error) {
        console.error("Error loading signature:", error);
      } finally {
        setLoadingSignature(false);
      }
    };
    loadSignatureInfo();
  }, [supabase]);

  const form = useForm<SeparationFormValues>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(separationSchema) as any,
    defaultValues: {
      employee_name: "", employee_title: "", department: "", location: "",
      job_description: "", reporting_manager: "", separation_reason: "", employment_period: "",
      annual_leave_days: 0, annual_leave_amount: 0,
      severance_days: 0, severance_amount: 0,
      notice_weeks: 0, notice_amount: 0,
    },
  });

  // V5: Edit mode — ?edit=<id> ile gelirse mevcut talebi yükle
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/my-requests`);
        if (!res.ok) {
          toast.error("Talep bulunamadı");
          return;
        }
        const body = await res.json();
        const found = (body.requests as Array<{ id: string; separation_request?: Record<string, unknown> }>)?.find(
          (r) => r.id === editId
        );
        if (!found || !found.separation_request) {
          toast.error("Talep bulunamadı");
          return;
        }
        const f = found.separation_request as {
          employee_name?: string;
          employee_title?: string;
          department?: string;
          location?: string;
          job_description?: string;
          reporting_manager?: string;
          separation_date?: string;
          separation_reason?: string;
          employment_period?: string;
          annual_leave_days?: number;
          annual_leave_amount?: number;
          severance_days?: number;
          severance_amount?: number;
          notice_weeks?: number;
          notice_amount?: number;
        };
        if (cancelled) return;
        form.reset({
          employee_name: f.employee_name ?? "",
          employee_title: f.employee_title ?? "",
          department: f.department ?? "",
          location: f.location ?? "",
          job_description: f.job_description ?? "",
          reporting_manager: f.reporting_manager ?? "",
          separation_date: f.separation_date ? new Date(f.separation_date) : undefined,
          separation_reason: f.separation_reason ?? "",
          employment_period: f.employment_period ?? "",
          annual_leave_days: f.annual_leave_days ?? 0,
          annual_leave_amount: f.annual_leave_amount ?? 0,
          severance_days: f.severance_days ?? 0,
          severance_amount: f.severance_amount ?? 0,
          notice_weeks: f.notice_weeks ?? 0,
          notice_amount: f.notice_amount ?? 0,
        } as SeparationFormValues);
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

  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);
  const canSubmit = hasValidSignature && signatureAccepted;

  const onSubmit = async (data: SeparationFormValues) => {
    setIsSubmitting(true);
    try {
      const payload = {
        ...data,
        separation_date: format(data.separation_date, "yyyy-MM-dd"),
      };
      const url = isEditMode ? `/api/separation/${editId}` : "/api/separation";
      const method = isEditMode ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || (isEditMode ? "Talep güncellenemedi" : "Talep oluşturulamadı"));
      }
      if (isEditMode) {
        // V5: Edit sonrası otomatik resubmit → talep onay akışına geri girer
        const resubmitRes = await fetch(`/api/requests/${editId}/resubmit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
        if (!resubmitRes.ok) {
          const err = await resubmitRes.json().catch(() => ({}));
          throw new Error(err.error || "Talep güncellendi ama yeniden gönderilemedi");
        }
        toast.success("Talep güncellendi ve onaya gönderildi");
      } else {
        toast.success("İşten çıkış takip formu başarıyla oluşturuldu");
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

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEditMode ? "Talebi Güncelle" : "İşten Çıkış Takip Formu"}
        </h1>
        <p className="text-muted-foreground">
          {isEditMode ? "Talep bilgilerini güncelleyin" : "Ayrılan personel için işten çıkış takip formu oluşturun"}
        </p>
      </div>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 max-w-2xl">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserMinus className="h-5 w-5" />
                Temel Bilgiler
              </CardTitle>
              <CardDescription>Ayrılan personelin bilgilerini girin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField control={form.control} name="employee_name" render={({ field }) => (
                <FormItem><FormLabel>Ayrılan Personel</FormLabel><FormControl><Input placeholder="Ad Soyad" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="employee_title" render={({ field }) => (
                <FormItem><FormLabel>Unvanı</FormLabel><FormControl><Input placeholder="Örn: Mühendis, Uzman" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="department" render={({ field }) => (
                  <FormItem><FormLabel>Departmanı</FormLabel><FormControl><Input placeholder="Departman" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="location" render={({ field }) => (
                  <FormItem><FormLabel>Lokasyonu</FormLabel><FormControl><Input placeholder="Lokasyon" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="job_description" render={({ field }) => (
                <FormItem><FormLabel>İş Tanımı / Kapsamı / Kodu</FormLabel><FormControl><Textarea placeholder="İş tanımı, kapsamı ve kodu" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <FormField control={form.control} name="reporting_manager" render={({ field }) => (
                <FormItem><FormLabel>Bağlı Olduğu Yönetici</FormLabel><FormControl><Input placeholder="Yönetici adı" {...field} /></FormControl><FormMessage /></FormItem>
              )} />
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="separation_date" render={({ field }) => (
                  <FormItem className="flex flex-col"><FormLabel>Ayrılış Tarihi</FormLabel>
                    <Popover><PopoverTrigger asChild><FormControl>
                      <Button variant="outline" className={cn("w-full pl-3 text-left font-normal", !field.value && "text-muted-foreground")}>
                        {field.value ? format(field.value, "PPP", { locale: tr }) : <span>Tarih seçin</span>}
                        <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                      </Button>
                    </FormControl></PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="start"><Calendar mode="single" selected={field.value} onSelect={field.onChange} initialFocus /></PopoverContent>
                    </Popover><FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="employment_period" render={({ field }) => (
                  <FormItem><FormLabel>Çalışma Süresi</FormLabel><FormControl><Input placeholder="Örn: 2 yıl 3 ay" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <FormField control={form.control} name="separation_reason" render={({ field }) => (
                <FormItem><FormLabel>Ayrılış Sebebi</FormLabel><FormControl><Textarea placeholder="İstifa, işten çıkarma, emeklilik, vb." {...field} /></FormControl><FormMessage /></FormItem>
              )} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mali Tablo</CardTitle>
              <CardDescription>Yıllık izin, kıdem ve ihbar tazminatı bilgilerini girin</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="annual_leave_days" render={({ field }) => (
                  <FormItem><FormLabel>Yıllık İzin (Gün)</FormLabel><FormControl><Input type="number" min="0" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="annual_leave_amount" render={({ field }) => (
                  <FormItem><FormLabel>Yıllık İzin Tutarı (₺)</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="severance_days" render={({ field }) => (
                  <FormItem><FormLabel>Kıdem Tazminatı (Gün)</FormLabel><FormControl><Input type="number" min="0" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="severance_amount" render={({ field }) => (
                  <FormItem><FormLabel>Kıdem Tazminatı Tutarı (₺)</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField control={form.control} name="notice_weeks" render={({ field }) => (
                  <FormItem><FormLabel>İhbar Tazminatı (Hafta)</FormLabel><FormControl><Input type="number" min="0" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="notice_amount" render={({ field }) => (
                  <FormItem><FormLabel>İhbar Tazminatı Tutarı (₺)</FormLabel><FormControl><Input type="number" min="0" step="0.01" {...field} /></FormControl><FormMessage /></FormItem>
                )} />
              </div>
            </CardContent>
          </Card>

          {!loadingSignature && (
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
            <Button type="button" variant="outline" onClick={() => router.back()}>İptal</Button>
            <Button type="submit" disabled={isSubmitting || (!isEditMode && !canSubmit)}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditMode ? "Talebi Güncelle ve Gönder" : "İmzala ve Formu Gönder"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}

