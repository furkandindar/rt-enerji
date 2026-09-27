"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarIcon, Loader2, UserPlus } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SignaturePanel } from "@/components/signature-panel";
import { SignatureFont } from "@/lib/signature/types";
import { RevisionNoticeForRequest } from "@/components/my-requests/revision-notice";
import { format, parseISO } from "date-fns";
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

const onboardingSchema = z.object({
  employee_name: z.string().min(1, "İşe başlayacak kişinin adı zorunludur"),
  employee_title: z.string().min(1, "Unvan zorunludur"),
  department: z.string().min(1, "Departman zorunludur"),
  location: z.string().min(1, "Lokasyon zorunludur"),
  job_description: z.string().min(1, "İş tanımı zorunludur"),
  reporting_manager: z.string().min(1, "Bağlı olduğu yönetici zorunludur"),
  start_date: z.date({ message: "İşe giriş tarihi zorunludur" }),
  employment_period: z.string().min(1, "Zaman aralığı zorunludur"),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

export default function NewOnboardingPage() {
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

  // Kullanıcının imza bilgilerini yükle
  useEffect(() => {
    const loadSignatureInfo = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: appUser } = await supabase
          .from("app_users")
          .select(`
            employee:employees(
              signature_text,
              signature_font
            )
          `)
          .eq("id", user.id)
          .single();

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const employee = appUser?.employee as any;
        if (employee) {
          setSignatureInfo({
            signatureText: employee.signature_text,
            signatureFont: employee.signature_font,
          });
        }
      } catch (error) {
        console.error("Error loading signature:", error);
      } finally {
        setLoadingSignature(false);
      }
    };

    loadSignatureInfo();
  }, [supabase]);

  const form = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      employee_name: "",
      employee_title: "",
      department: "",
      location: "",
      job_description: "",
      reporting_manager: "",
      employment_period: "",
    },
  });

  // V5: Edit mode — ?edit=<id> ile gelirse mevcut talebi yükle.
  // Sadece talep edenin 1. adımda doldurduğu (section 1) alanlar forma gelir;
  // onaycıların checklist alanları burada gösterilmez/gönderilmez.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/my-requests/${editId}`);
        if (!res.ok) {
          toast.error("Talep bulunamadı");
          return;
        }
        const body = (await res.json()) as { onboarding_request?: unknown };
        // PostgREST 1:1 ilişkide obje veya tek elemanlı dizi dönebilir
        const raw = Array.isArray(body.onboarding_request)
          ? body.onboarding_request[0]
          : body.onboarding_request;
        if (!raw) {
          toast.error("Talep bulunamadı");
          return;
        }
        const f = raw as {
          employee_name?: string | null;
          employee_title?: string | null;
          department?: string | null;
          location?: string | null;
          job_description?: string | null;
          reporting_manager?: string | null;
          start_date?: string | null;
          employment_period?: string | null;
        };
        if (cancelled) return;
        form.reset({
          employee_name: f.employee_name ?? "",
          employee_title: f.employee_title ?? "",
          department: f.department ?? "",
          location: f.location ?? "",
          job_description: f.job_description ?? "",
          reporting_manager: f.reporting_manager ?? "",
          // `date` kolonu: timezone dönüşümü yok; parseISO "yyyy-MM-dd"yi yerel gün olarak okur
          start_date: f.start_date ? parseISO(f.start_date) : undefined,
          employment_period: f.employment_period ?? "",
        } as OnboardingFormValues);
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

  const onSubmit = async (data: OnboardingFormValues) => {
    setIsSubmitting(true);
    try {
      const url = isEditMode ? `/api/onboarding/${editId}` : "/api/onboarding";
      const method = isEditMode ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_name: data.employee_name,
          employee_title: data.employee_title,
          department: data.department,
          location: data.location,
          job_description: data.job_description,
          reporting_manager: data.reporting_manager,
          start_date: format(data.start_date, "yyyy-MM-dd"),
          employment_period: data.employment_period,
        }),
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
        toast.success("İşe giriş takip formu başarıyla oluşturuldu");
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
          {isEditMode ? "Talebi Güncelle" : "İşe Giriş Takip Formu"}
        </h1>
        <p className="text-muted-foreground">
          {isEditMode ? "Talep bilgilerini güncelleyin" : "Yeni işe başlayacak personel için takip formu oluşturun"}
        </p>
      </div>

      {/* Revize bandı: yalnız talep REVISION_REQUESTED iken görünür (boşsa gizlenir) */}
      {isEditMode && (
        <div className="max-w-2xl empty:hidden">
          <RevisionNoticeForRequest requestId={editId} />
        </div>
      )}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Temel Bilgiler
          </CardTitle>
          <CardDescription>
            İşe başlayacak personelin bilgilerini girin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* İşe Başlayacak Kişi */}
              <FormField
                control={form.control}
                name="employee_name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>İşe Başlayacak Kişi</FormLabel>
                    <FormControl>
                      <Input placeholder="Ad Soyad" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Unvanı */}
              <FormField
                control={form.control}
                name="employee_title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unvanı</FormLabel>
                    <FormControl>
                      <Input placeholder="Örn: Mühendis, Uzman, Tekniker" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Departman ve Lokasyon */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="department"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Departmanı</FormLabel>
                      <FormControl>
                        <Input placeholder="Departman" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lokasyonu</FormLabel>
                      <FormControl>
                        <Input placeholder="Lokasyon" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* İş Tanımı */}
              <FormField
                control={form.control}
                name="job_description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>İş Tanımı / Kapsamı / Kodu</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="İş tanımı, kapsamı ve kodu"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Bağlı Olduğu Yönetici */}
              <FormField
                control={form.control}
                name="reporting_manager"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bağlı Olduğu Yönetici</FormLabel>
                    <FormControl>
                      <Input placeholder="Yönetici adı" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* İşe Giriş Tarihi ve Zaman Aralığı */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>İşe Giriş Tarihi</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP", { locale: tr })
                              ) : (
                                <span>Tarih seçin</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value}
                            onSelect={field.onChange}
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
                  name="employment_period"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Şirketimizde Bulunacağı Zaman Aralığı</FormLabel>
                      <FormControl>
                        <Input placeholder="Örn: 1 yıl, Belirsiz süreli" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* İmza Paneli */}
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

              {/* Butonlar */}
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  İptal
                </Button>
                <Button type="submit" disabled={isSubmitting || (!isEditMode && !canSubmit)}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  {isEditMode ? "Talebi Güncelle ve Gönder" : "İmzala ve Formu Gönder"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

