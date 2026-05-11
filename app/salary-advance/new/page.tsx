"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Banknote } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SignaturePanel } from "@/components/signature-panel";
import { SignatureFont } from "@/lib/signature/types";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";


const salaryAdvanceSchema = z.object({
  amount: z.number({ message: "Avans miktarı gerekli" }).min(1, "Avans miktarı 0'dan büyük olmalı"),
  payment_method: z.enum(["CASH", "BANK_TRANSFER"], { message: "Ödeme şekli seçin" }),
});

type SalaryAdvanceFormValues = z.infer<typeof salaryAdvanceSchema>;

interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

export default function NewSalaryAdvancePage() {
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

  const form = useForm<SalaryAdvanceFormValues>({
    resolver: zodResolver(salaryAdvanceSchema),
    defaultValues: {
      amount: undefined,
      payment_method: "BANK_TRANSFER",
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
        const found = (body.requests as Array<{ id: string; salary_advance_request?: Record<string, unknown> }>)?.find(
          (r) => r.id === editId
        );
        if (!found || !found.salary_advance_request) {
          toast.error("Talep bulunamadı");
          return;
        }
        const f = found.salary_advance_request as {
          amount?: number;
          payment_method?: "CASH" | "BANK_TRANSFER";
        };
        if (cancelled) return;
        form.reset({
          amount: f.amount ?? undefined,
          payment_method: f.payment_method ?? "BANK_TRANSFER",
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

  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);
  const canSubmit = hasValidSignature && signatureAccepted;

  const onSubmit = async (data: SalaryAdvanceFormValues) => {
    setIsSubmitting(true);
    try {
      const payload = {
        amount: data.amount,
        payment_method: data.payment_method,
      };
      const url = isEditMode ? `/api/salary-advance/${editId}` : "/api/salary-advance";
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
        toast.success("Maaş avans talebi başarıyla oluşturuldu");
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
          {isEditMode ? "Talebi Güncelle" : "Yeni Maaş Avans Talebi"}
        </h1>
        <p className="text-muted-foreground">
          {isEditMode ? "Talep bilgilerini güncelleyin" : "Maaş avans talebinizi oluşturun"}
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Avans Bilgileri
          </CardTitle>
          <CardDescription>
            Talep etmek istediğiniz avans bilgilerini girin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Avans Miktarı */}
              <FormField
                control={form.control}
                name="amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Avans Miktarı (TL)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormDescription>
                      Nokta kullanmadan girin, kuruş için virgül kullanın (Örn: 10080 veya 10080,50)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Ödeme Şekli */}
              <FormField
                control={form.control}
                name="payment_method"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ödeme Şekli</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Ödeme şekli seçin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="BANK_TRANSFER">Banka Havalesi</SelectItem>
                        <SelectItem value="CASH">Nakit</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

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
                  {isEditMode ? "Talebi Güncelle ve Gönder" : "İmzala ve Talebi Gönder"}
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

