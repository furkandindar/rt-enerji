"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ReceiptText, Plus, Trash2, Upload, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SignaturePanel } from "@/components/signature-panel";
import { SignatureFont } from "@/lib/signature/types";
import type { CreateExpenseFormInput } from "@/lib/workflow";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

const amountString = z
  .string()
  .min(1, "Tutar gerekli")
  .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, "Geçerli bir tutar girin");

const optionalAmountString = z
  .string()
  .optional()
  .refine(
    (v) => v === undefined || v === "" || (!isNaN(Number(v)) && Number(v) >= 0),
    "Geçerli bir tutar girin"
  );

const optionalPositiveIntString = z
  .string()
  .optional()
  .refine(
    (v) => v === undefined || v === "" || (Number.isInteger(Number(v)) && Number(v) > 0),
    "Geçerli bir kişi sayısı girin"
  );

const itemSchema = z.object({
  item_date: z.string().min(1, "Tarih gerekli"),
  document_no: z.string().optional(),
  description: z.string().min(1, "Açıklama gerekli"),
  amount: amountString,
});

const expenseFormSchema = z
  .object({
    request_date: z.string().min(1, "Tarih gerekli"),
    project_name: z.string().min(1, "Proje adı gerekli"),
    project_code: z.string().min(1, "Proje kodu gerekli"),
    is_travel: z.enum(["yes", "no"], { message: "Harcama tipi seçin" }),
    work_or_destination: z.string().min(1, "Bu alan gerekli"),
    travel_person_count: optionalPositiveIntString,
    travel_date: z.string().optional(),
    travel_duration: z.string().optional(),
    advance_amount: optionalAmountString,
    items: z.array(itemSchema).min(1, "En az bir harcama satırı zorunludur"),
  });

type ExpenseFormValues = z.infer<typeof expenseFormSchema>;

interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

interface RequesterInfo {
  full_name: string;
  position_title: string;
}

const formatTRY = (value: number) =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency: "TRY" }).format(value);

export default function NewExpenseFormPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [signatureInfo, setSignatureInfo] = useState<SignatureInfo>({
    signatureText: null,
    signatureFont: null,
  });
  const [requesterInfo, setRequesterInfo] = useState<RequesterInfo>({
    full_name: "",
    position_title: "",
  });
  const [loadingUser, setLoadingUser] = useState(true);

  // Ek dosya
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentConfigId, setAttachmentConfigId] = useState<string | null>(null);
  const [attachmentLabel, setAttachmentLabel] = useState<string>("Ek Dosyalar");
  const [allowedMimeTypes, setAllowedMimeTypes] = useState<string[] | null>(null);
  const [maxFileSizeBytes, setMaxFileSizeBytes] = useState<number>(10485760);
  const [maxFiles, setMaxFiles] = useState<number>(20);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(expenseFormSchema),
    defaultValues: {
      request_date: new Date().toISOString().split("T")[0],
      project_name: "",
      project_code: "",
      is_travel: "no",
      work_or_destination: "",
      travel_person_count: "",
      travel_date: "",
      travel_duration: "",
      advance_amount: "",
      items: [
        {
          item_date: new Date().toISOString().split("T")[0],
          document_no: "",
          description: "",
          amount: "0",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchedItems = useWatch({ control: form.control, name: "items" });
  const watchedAdvance = useWatch({ control: form.control, name: "advance_amount" });
  const watchedIsTravel = useWatch({ control: form.control, name: "is_travel" });

  const totalExpenses = useMemo(
    () => (watchedItems || []).reduce((sum, it) => sum + (Number(it?.amount) || 0), 0),
    [watchedItems]
  );
  const advanceNumber = Number(watchedAdvance) || 0;
  const balance = advanceNumber - totalExpenses;


  // Kullanıcı bilgileri + imza yükle
  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: appUser } = await supabase
          .from("app_users")
          .select("employee_id")
          .eq("id", user.id)
          .single();

        if (appUser?.employee_id) {
          const { data: employee } = await supabase
            .from("employees")
            .select(`
              first_name,
              last_name,
              signature_text,
              signature_font,
              employee_positions(
                is_primary,
                end_date,
                position:positions(title)
              )
            `)
            .eq("id", appUser.employee_id)
            .single();

          if (employee) {
            setSignatureInfo({
              signatureText: employee.signature_text,
              signatureFont: employee.signature_font as SignatureFont | null,
            });

            const primary = (employee.employee_positions as unknown as Array<{
              is_primary: boolean;
              end_date: string | null;
              position: { title: string } | null;
            }> | null)?.find((ep) => ep.is_primary && !ep.end_date);

            setRequesterInfo({
              full_name: `${employee.first_name} ${employee.last_name}`,
              position_title: primary?.position?.title || "",
            });
          }
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setLoadingUser(false);
      }
    };

    loadUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Attachment config (1. adım — opsiyonel)
  useEffect(() => {
    const loadAttachmentConfig = async () => {
      try {
        const { data: wfDef } = await supabase
          .from("workflow_definitions")
          .select("id")
          .eq("code", "EXPENSE_FORM")
          .single();
        if (!wfDef) return;

        const { data: steps } = await supabase
          .from("workflow_steps")
          .select("id, step_order")
          .eq("workflow_definition_id", wfDef.id)
          .order("step_order", { ascending: true });

        const firstStep = steps?.find((s) => s.step_order === 1);
        if (!firstStep) return;

        const { data: configs } = await supabase
          .from("workflow_step_attachments")
          .select("id, label, allowed_mime_types, max_file_size_bytes, max_files")
          .eq("workflow_step_id", firstStep.id);

        if (configs && configs.length > 0) {
          const config = configs[0];
          setAttachmentConfigId(config.id);
          setAttachmentLabel(config.label);
          setAllowedMimeTypes(config.allowed_mime_types);
          setMaxFileSizeBytes(config.max_file_size_bytes);
          setMaxFiles(config.max_files);
        }
      } catch (error) {
        console.error("Error loading attachment config:", error);
      }
    };
    loadAttachmentConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      if (allowedMimeTypes && !allowedMimeTypes.includes(file.type)) {
        toast.error(`${file.name}: Desteklenmeyen dosya türü`);
        return false;
      }
      if (file.size > maxFileSizeBytes) {
        toast.error(`${file.name}: Dosya boyutu çok büyük (maks ${Math.round(maxFileSizeBytes / 1048576)} MB)`);
        return false;
      }
      return true;
    });
    setPendingFiles((prev) => {
      const combined = [...prev, ...validFiles];
      return combined.slice(0, maxFiles);
    });
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const addItemRow = () => {
    append({
      item_date: new Date().toISOString().split("T")[0],
      document_no: "",
      description: "",
      amount: "0",
    });
  };

  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);
  const canSubmit = hasValidSignature && signatureAccepted && !isSubmitting;


  const onSubmit = async (data: ExpenseFormValues) => {
    if (!signatureAccepted) {
      toast.error("Devam etmek için imzanızı onaylayın");
      return;
    }

    setIsSubmitting(true);
    try {
      const isTravelBool = data.is_travel === "yes";
      const payload: CreateExpenseFormInput = {
        request_date: data.request_date,
        project_name: data.project_name,
        project_code: data.project_code,
        is_travel: isTravelBool,
        work_or_destination: data.work_or_destination,
        travel_person_count:
          isTravelBool && data.travel_person_count
            ? Number(data.travel_person_count)
            : null,
        travel_date: isTravelBool && data.travel_date ? data.travel_date : null,
        travel_duration:
          isTravelBool && data.travel_duration ? data.travel_duration : null,
        advance_amount:
          data.advance_amount && data.advance_amount !== ""
            ? Number(data.advance_amount)
            : null,
        items: data.items.map((it) => ({
          item_date: it.item_date,
          document_no: it.document_no?.trim() ? it.document_no.trim() : null,
          description: it.description,
          amount: Number(it.amount),
        })),
      };

      const response = await fetch("/api/expense-form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Talep oluşturulamadı");
      }

      const result = await response.json();
      const requestId: string = result.id;

      if (requestId && pendingFiles.length > 0) {
        for (const file of pendingFiles) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("request_id", requestId);
          if (attachmentConfigId) {
            formData.append("step_attachment_config_id", attachmentConfigId);
          }
          const uploadRes = await fetch("/api/attachments/upload", {
            method: "POST",
            body: formData,
          });
          if (!uploadRes.ok) {
            console.error("Dosya yüklenemedi:", file.name);
            toast.warning(`${file.name} yüklenemedi, talep yine de oluşturuldu`);
          }
        }
      }

      toast.success("Harcama formu talebi başarıyla oluşturuldu");
      router.push("/my-requests");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingUser) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const isTravel = watchedIsTravel === "yes";

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Yeni Harcama Formu</h1>
        <p className="text-muted-foreground">Harcamaları kalem kalem doldurun ve onaya gönderin</p>
      </div>

      <Card className="max-w-5xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ReceiptText className="h-5 w-5" />
            Harcama Formu Bilgileri
          </CardTitle>
          <CardDescription>Başlık, harcama kalemleri ve avans bilgilerini eksiksiz doldurun</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Talep Eden */}
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Talep Eden</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Adı Soyadı</Label>
                    <p className="text-sm font-medium">{requesterInfo.full_name || "-"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Unvanı</Label>
                    <p className="text-sm font-medium">{requesterInfo.position_title || "-"}</p>
                  </div>
                </div>
              </section>

              {/* Başlık Alanları */}
              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Genel Bilgiler</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="request_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tarih</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="project_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Proje Adı</FormLabel>
                        <FormControl>
                          <Input placeholder="Proje adı" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="project_code"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Proje Kodu</FormLabel>
                        <FormControl>
                          <Input placeholder="Proje kodu" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>


              {/* Harcama Tipi */}
              <section className="space-y-4">
                <FormField
                  control={form.control}
                  name="is_travel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Harcama Tipi</FormLabel>
                      <FormControl>
                        <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4">
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="no" id="type-work" />
                            <Label htmlFor="type-work" className="font-normal cursor-pointer">İş Harcaması</Label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <RadioGroupItem value="yes" id="type-travel" />
                            <Label htmlFor="type-travel" className="font-normal cursor-pointer">Seyahat Harcaması</Label>
                          </div>
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="work_or_destination"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{isTravel ? "Seyahat Yapılan Yer" : "İşin Adı"}</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={isTravel ? "Örn: Ankara" : "Yapılan işin adı"}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {isTravel && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="travel_person_count"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Seyahat Eden Kişi Sayısı</FormLabel>
                          <FormControl>
                            <Input type="number" min="1" step="1" placeholder="Örn: 2" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="travel_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Seyahat Tarihi</FormLabel>
                          <FormControl>
                            <Input type="date" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="travel_duration"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Seyahat Süresi</FormLabel>
                          <FormControl>
                            <Input placeholder="Örn: 3 gün" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </section>

              {/* Harcama Kalemleri */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Harcama Kalemleri</h2>
                  <Button type="button" variant="outline" size="sm" onClick={addItemRow}>
                    <Plus className="mr-2 h-4 w-4" /> Satır Ekle
                  </Button>
                </div>
                <div className="space-y-4">
                  {fields.map((fieldRow, index) => (
                    <div key={fieldRow.id} className="rounded-lg border p-4 space-y-3 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Sıra No: {index + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive hover:text-destructive"
                          onClick={() => remove(index)}
                          disabled={fields.length === 1}
                          aria-label="Satırı sil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.item_date`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel className="text-xs">Tarih</FormLabel>
                              <FormControl>
                                <Input type="date" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.document_no`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel className="text-xs">Evrak No</FormLabel>
                              <FormControl>
                                <Input placeholder="Opsiyonel" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.description`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-6">
                              <FormLabel className="text-xs">Açıklama</FormLabel>
                              <FormControl>
                                <Input placeholder="Harcamanın açıklaması" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />

                        <FormField
                          control={form.control}
                          name={`items.${index}.amount`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-2">
                              <FormLabel className="text-xs">Tutar (TL)</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" min="0" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end pt-2 text-sm border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Toplam Tutar:</span>
                    <span className="font-semibold">{formatTRY(totalExpenses)}</span>
                  </div>
                </div>
                {form.formState.errors.items && !Array.isArray(form.formState.errors.items) && (
                  <p className="text-sm text-destructive">{form.formState.errors.items.message}</p>
                )}
              </section>

              {/* Avans / Bakiye */}
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Avans ve Bakiye</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="advance_amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Avans Tutarı (a)</FormLabel>
                        <FormControl>
                          <Input type="number" step="0.01" min="0" placeholder="Opsiyonel" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Harcamalar Toplamı (b)</Label>
                    <p className="text-sm font-semibold pt-1.5">{formatTRY(totalExpenses)}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Bakiye Tutar (a-b)</Label>
                    <p className={`text-sm font-semibold pt-1.5 ${balance < 0 ? "text-destructive" : ""}`}>
                      {formatTRY(balance)}
                    </p>
                  </div>
                </div>
              </section>

              {/* Ek Dosyalar (opsiyonel) */}
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ekler</h2>
                <div className="space-y-2">
                  <Label className="text-sm">{attachmentLabel} <span className="text-xs text-muted-foreground font-normal">(Opsiyonel)</span></Label>
                  {pendingFiles.length > 0 && (
                    <ul className="space-y-1">
                      {pendingFiles.map((file, index) => (
                        <li
                          key={`${file.name}-${index}`}
                          className="flex items-center gap-2 rounded-md border bg-muted/30 px-2 py-1.5 text-sm"
                        >
                          <span className="flex-1 truncate">{file.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {Math.round(file.size / 1024)} KB
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => removeFile(index)}
                            disabled={isSubmitting}
                            aria-label="Dosyayı kaldır"
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {pendingFiles.length < maxFiles && (
                    <div>
                      <input
                        id="expense-file-input"
                        type="file"
                        multiple
                        accept={allowedMimeTypes && allowedMimeTypes.length > 0 ? allowedMimeTypes.join(",") : undefined}
                        className="hidden"
                        onChange={handleFileChange}
                        disabled={isSubmitting}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => document.getElementById("expense-file-input")?.click()}
                        disabled={isSubmitting}
                      >
                        <Upload className="mr-2 h-4 w-4" />
                        Dosya Seç
                      </Button>
                      <p className="text-xs text-muted-foreground mt-1">
                        Maksimum {maxFiles} dosya, her biri en fazla {Math.round(maxFileSizeBytes / 1048576)} MB.
                      </p>
                    </div>
                  )}
                </div>
              </section>

              {/* İmza Paneli */}
              <SignaturePanel
                signatureText={signatureInfo.signatureText}
                signatureFont={signatureInfo.signatureFont}
                isAccepted={signatureAccepted}
                onAcceptChange={setSignatureAccepted}
                title="TALEP İMZASI"
                description="Bu talebi imzanızla onaylayacaksınız:"
                disabled={isSubmitting}
              />

              {/* Butonlar */}
              <div className="flex gap-4">
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                  İptal
                </Button>
                <Button type="submit" disabled={!canSubmit}>
                  {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  İmzala ve Talebi Gönder
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
