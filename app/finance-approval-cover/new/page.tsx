"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Banknote, Plus, Trash2, Upload, X, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SignaturePanel } from "@/components/signature-panel";
import { SignatureFont } from "@/lib/signature/types";
import { UserMultiPicker, type UserMultiPickerEmployee } from "@/components/user-multi-picker";
import { sumItemsByCurrency, joinCurrencyTotals } from "@/lib/currency";

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
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const EXPENSE_AREA_OPTIONS = [
  { value: "ANA_SAHA", label: "Ana Saha" },
  { value: "ELEKTRIKSEL_KAPASITE_ARTISI", label: "Elektriksel Kapasite Artışı" },
  { value: "YEKA_1", label: "YEKA 1" },
  { value: "YEKA_2", label: "YEKA 2" },
] as const;

const FUNDING_SOURCE_OPTIONS = [
  { value: "KREDI", label: "Kredi" },
  { value: "OZ_KAYNAK", label: "Öz Kaynak" },
  { value: "NAKIT_FAZLASI", label: "Nakit Fazlası" },
  { value: "DIGER", label: "Diğer" },
] as const;

const amountString = z
  .string()
  .min(1, "Tutar gerekli")
  .refine((v) => !isNaN(Number(v)) && Number(v) >= 0, "Geçerli bir tutar girin");

const itemSchema = z.object({
  item_date: z.string().min(1, "Tarih gerekli"),
  company_name: z.string().min(1, "Firma seçimi gerekli"),
  payee_name: z.string().min(1, "Ödeme yapılacak firma/kurum gerekli"),
  item_subject: z.string().min(1, "Konu gerekli"),
  invoice_amount: amountString,
  payable_amount: amountString,
  currency: z.enum(["TRY", "USD", "EUR"], { message: "Para birimi seçin" }),
});

const financeCoverSchema = z.object({
  subject: z.string().min(1, "Konu gerekli"),
  request_date: z.string().min(1, "Tarih gerekli"),
  document_no: z.string().min(1, "Sayı gerekli"),
  account_available: z.enum(["yes", "no"], { message: "Seçim yapın" }),
  cash_flow_recorded: z.enum(["yes", "no"], { message: "Seçim yapın" }),
  has_rt_enerji_proforma: z.enum(["yes", "no"], { message: "Seçim yapın" }),
  expense_area: z.enum(["ANA_SAHA", "ELEKTRIKSEL_KAPASITE_ARTISI", "YEKA_1", "YEKA_2"], {
    message: "Harcama alanı seçin",
  }),
  funding_source: z.enum(["KREDI", "OZ_KAYNAK", "NAKIT_FAZLASI", "DIGER"], {
    message: "Niteliği seçin",
  }),
  items: z.array(itemSchema).min(1, "En az bir ödeme satırı zorunludur"),
  // Opsiyonel ödeme tablosu (olur yazısındaki blokla aynı)
  has_payment_table: z.boolean(),
  comparison_approval_date: z.string().optional(),
  agreement_amount: z.string().optional(),
  has_contract: z.boolean().optional(),
  paid_amounts: z.array(z.object({ value: z.string() })).optional(),
  remaining_payment: z.string().optional(),
  requested_payment_amount: z.string().optional(),
  remaining_after_payment: z.string().optional(),
});

type FinanceCoverFormValues = z.infer<typeof financeCoverSchema>;

interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

/** Sözlükteki şirket adı ("Kiraz Enerji") kalemde büyük harfle saklanır ("KİRAZ ENERJİ") —
 *  eski serbest metin kayıtları ve PDF görünümüyle tutarlı olsun diye. */
const toTrUpper = (s: string) => s.toLocaleUpperCase("tr-TR");

interface CompanyOption {
  id: string;
  name: string;
}

const CURRENCY_OPTIONS = [
  { value: "TRY", label: "TL" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
] as const;

export default function NewFinanceApprovalCoverPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [signatureInfo, setSignatureInfo] = useState<SignatureInfo>({
    signatureText: null,
    signatureFont: null,
  });
  const [loadingUser, setLoadingUser] = useState(true);
  const [currentEmployeeId, setCurrentEmployeeId] = useState<string | null>(null);

  // Dinamik onaycılar
  const [dynamicStepId, setDynamicStepId] = useState<string | null>(null);
  const [relatedPersonIds, setRelatedPersonIds] = useState<string[]>([]);
  const [employees, setEmployees] = useState<UserMultiPickerEmployee[]>([]);
  const [companies, setCompanies] = useState<CompanyOption[]>([]);

  // Ek dosya
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentConfigId, setAttachmentConfigId] = useState<string | null>(null);
  const [attachmentLabel, setAttachmentLabel] = useState<string>("Ek Dosyalar");
  const [allowedMimeTypes, setAllowedMimeTypes] = useState<string[] | null>(null);
  const [maxFileSizeBytes, setMaxFileSizeBytes] = useState<number>(10485760);
  const [maxFiles, setMaxFiles] = useState<number>(10);

  const form = useForm<FinanceCoverFormValues>({
    resolver: zodResolver(financeCoverSchema),
    defaultValues: {
      subject: "",
      request_date: new Date().toISOString().split("T")[0],
      document_no: "",
      account_available: undefined,
      cash_flow_recorded: undefined,
      has_rt_enerji_proforma: undefined,
      expense_area: undefined,
      funding_source: undefined,
      items: [
        {
          item_date: new Date().toISOString().split("T")[0],
          company_name: "",
          payee_name: "",
          item_subject: "",
          invoice_amount: "0",
          payable_amount: "0",
          currency: "TRY",
        },
      ],
      has_payment_table: false,
      comparison_approval_date: "",
      agreement_amount: "",
      has_contract: false,
      paid_amounts: [{ value: "" }],
      remaining_payment: "",
      requested_payment_amount: "",
      remaining_after_payment: "",
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const {
    fields: paidFields,
    append: appendPaid,
    remove: removePaid,
  } = useFieldArray({
    control: form.control,
    name: "paid_amounts",
  });

  const hasPaymentTable = form.watch("has_payment_table");

  const watchedItems = useWatch({ control: form.control, name: "items" });
  const totals = useMemo(
    () => sumItemsByCurrency(watchedItems || []),
    [watchedItems]
  );

  // Kullanıcı + imza + çalışan listesi yükle
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
          setCurrentEmployeeId(appUser.employee_id);
          const { data: employee } = await supabase
            .from("employees")
            .select("signature_text, signature_font")
            .eq("id", appUser.employee_id)
            .single();

          if (employee) {
            setSignatureInfo({
              signatureText: employee.signature_text,
              signatureFont: employee.signature_font as SignatureFont | null,
            });
          }
        }

        const { data: allEmployees } = await supabase
          .from("employees")
          .select("id, first_name, last_name, employee_no")
          .order("first_name", { ascending: true });

        if (allEmployees) {
          setEmployees(allEmployees as UserMultiPickerEmployee[]);
        }

        // Grup şirketleri (companies sözlüğü) — ödeme kalemi "Firma" seçimi
        const { data: companiesData } = await supabase
          .from("companies")
          .select("id, name")
          .eq("is_active", true)
          .order("display_order", { ascending: true })
          .order("name", { ascending: true });

        if (companiesData) {
          setCompanies(companiesData);
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

  // DYNAMIC_USER_LIST adımının id'sini ve attachment config'i yükle
  useEffect(() => {
    const loadWorkflowConfig = async () => {
      try {
        const { data: wfDef } = await supabase
          .from("workflow_definitions")
          .select("id")
          .eq("code", "FINANCE_APPROVAL_COVER")
          .single();
        if (!wfDef) return;

        const { data: steps } = await supabase
          .from("workflow_steps")
          .select("id, step_order, approver_type")
          .eq("workflow_definition_id", wfDef.id)
          .order("step_order", { ascending: true });

        if (steps) {
          const dynStep = steps.find((s) => s.approver_type === "DYNAMIC_USER_LIST");
          if (dynStep) setDynamicStepId(dynStep.id);

          const firstStep = steps.find((s) => s.step_order === 1);
          if (firstStep) {
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
          }
        }
      } catch (error) {
        console.error("Error loading workflow config:", error);
      }
    };
    loadWorkflowConfig();
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
      company_name: "",
      payee_name: "",
      item_subject: "",
      invoice_amount: "0",
      payable_amount: "0",
      currency: "TRY",
    });
  };

  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);
  const canSubmit = hasValidSignature && signatureAccepted && !isSubmitting;


  const onSubmit = async (data: FinanceCoverFormValues) => {
    if (!signatureAccepted) {
      toast.error("Devam etmek için imzanızı onaylayın");
      return;
    }

    setIsSubmitting(true);
    try {
      const dynamic_approvers =
        dynamicStepId && relatedPersonIds.length > 0
          ? { [dynamicStepId]: relatedPersonIds }
          : undefined;

      const response = await fetch("/api/finance-approval-cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: data.subject,
          request_date: data.request_date,
          document_no: data.document_no,
          account_available: data.account_available === "yes",
          cash_flow_recorded: data.cash_flow_recorded === "yes",
          has_rt_enerji_proforma: data.has_rt_enerji_proforma === "yes",
          expense_area: data.expense_area,
          funding_source: data.funding_source,
          items: data.items.map((it) => ({
            item_date: it.item_date,
            company_name: it.company_name,
            payee_name: it.payee_name,
            item_subject: it.item_subject,
            invoice_amount: Number(it.invoice_amount),
            payable_amount: Number(it.payable_amount),
            currency: it.currency,
          })),
          has_payment_table: data.has_payment_table,
          comparison_approval_date: data.has_payment_table ? data.comparison_approval_date || undefined : undefined,
          agreement_amount: data.has_payment_table ? data.agreement_amount || undefined : undefined,
          has_contract: data.has_payment_table ? data.has_contract : undefined,
          paid_amounts: data.has_payment_table
            ? (data.paid_amounts || []).map((p) => p.value).filter((v) => v.trim() !== "")
            : undefined,
          remaining_payment: data.has_payment_table ? data.remaining_payment || undefined : undefined,
          requested_payment_amount: data.has_payment_table ? data.requested_payment_amount || undefined : undefined,
          remaining_after_payment: data.has_payment_table ? data.remaining_after_payment || undefined : undefined,
          dynamic_approvers,
        }),
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

      toast.success("Onay kapağı talebi başarıyla oluşturuldu");
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


  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Yeni Onay Kapağı (Finans)</h1>
        <p className="text-muted-foreground">Ödeme onay kapağı talebini doldurun ve gönderin</p>
      </div>

      <Card className="max-w-5xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Banknote className="h-5 w-5" />
            Onay Kapağı Bilgileri
          </CardTitle>
          <CardDescription>Başlık, ödeme kalemleri ve değerlendirme alanlarını eksiksiz doldurun</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
              {/* Başlık Alanları */}
              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Başlık</h2>
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
                    name="document_no"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Sayı</FormLabel>
                        <FormControl>
                          <Input placeholder="Örn: FNS/ŞUBAT-01" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Konu</FormLabel>
                        <FormControl>
                          <Input placeholder="Onay kapağı konusu" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              {/* Ödeme Tablosu */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ödeme Kalemleri</h2>
                  <Button type="button" variant="outline" size="sm" onClick={addItemRow}>
                    <Plus className="mr-2 h-4 w-4" /> Satır Ekle
                  </Button>
                </div>
                <div className="space-y-4">
                  {fields.map((fieldRow, index) => (
                    <div key={fieldRow.id} className="rounded-lg border p-4 space-y-3 bg-muted/20">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-medium text-muted-foreground">Satır {index + 1}</span>
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
                      <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.item_date`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-1">
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
                          name={`items.${index}.company_name`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-1">
                              <FormLabel className="text-xs">Firma</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Firma seçiniz" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {companies.map((c) => (
                                    <SelectItem key={c.id} value={toTrUpper(c.name)}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.payee_name`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-1">
                              <FormLabel className="text-xs">Ödeme Yapılacak</FormLabel>
                              <FormControl>
                                <Input placeholder="Firma/Kurum" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.invoice_amount`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-1">
                              <FormLabel className="text-xs">Fatura Tutarı</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" min="0" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.payable_amount`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-1">
                              <FormLabel className="text-xs">Ödenecek</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" min="0" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.currency`}
                          render={({ field }) => (
                            <FormItem className="md:col-span-1">
                              <FormLabel className="text-xs">Para Birimi</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Seçiniz" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {CURRENCY_OPTIONS.map((opt) => (
                                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>
                      <FormField
                        control={form.control}
                        name={`items.${index}.item_subject`}
                        render={({ field }) => (
                          <FormItem className="mt-3">
                            <FormLabel className="text-xs">Konu</FormLabel>
                            <FormControl>
                              <Textarea
                                placeholder="Kalem konusu (ör. poliçe no, taksit, dönem, fatura açıklaması…)"
                                rows={2}
                                className="min-h-[60px] resize-y"
                                {...field}
                              />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </div>
                  ))}
                </div>
                <div className="flex justify-end gap-6 pt-2 text-sm border-t">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Toplam Fatura:</span>
                    <span className="font-semibold">{joinCurrencyTotals(totals, "invoice")}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">Toplam Ödenecek:</span>
                    <span className="font-semibold">{joinCurrencyTotals(totals, "payable")}</span>
                  </div>
                </div>
                {form.formState.errors.items && !Array.isArray(form.formState.errors.items) && (
                  <p className="text-sm text-destructive">{form.formState.errors.items.message}</p>
                )}
              </section>

              {/* Değerlendirme Alanları */}
              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Değerlendirme</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <FormField
                    control={form.control}
                    name="account_available"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Hesap müsait mi?</FormLabel>
                        <FormControl>
                          <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4">
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="yes" id="account-yes" />
                              <Label htmlFor="account-yes" className="font-normal cursor-pointer">Evet</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="no" id="account-no" />
                              <Label htmlFor="account-no" className="font-normal cursor-pointer">Hayır</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="cash_flow_recorded"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Nakit giriş/çıkış kaydı</FormLabel>
                        <FormControl>
                          <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4">
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="yes" id="cash-yes" />
                              <Label htmlFor="cash-yes" className="font-normal cursor-pointer">Yapıldı</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="no" id="cash-no" />
                              <Label htmlFor="cash-no" className="font-normal cursor-pointer">Yapılmadı</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="has_rt_enerji_proforma"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>RT Enerji proforma</FormLabel>
                        <FormControl>
                          <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4">
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="yes" id="proforma-yes" />
                              <Label htmlFor="proforma-yes" className="font-normal cursor-pointer">Var</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="no" id="proforma-no" />
                              <Label htmlFor="proforma-no" className="font-normal cursor-pointer">Yok</Label>
                            </div>
                          </RadioGroup>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="expense_area"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Harcama Alanı</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seçiniz" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {EXPENSE_AREA_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="funding_source"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Niteliği</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Seçiniz" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {FUNDING_SOURCE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </section>

              {/* Opsiyonel Ödeme Tablosu (olur yazısındaki blokla aynı) */}
              <section className="space-y-3">
                <div className="flex items-center gap-3 rounded-lg border p-4">
                  <Switch
                    id="has_payment_table"
                    checked={hasPaymentTable}
                    onCheckedChange={(checked) => form.setValue("has_payment_table", checked)}
                  />
                  <Label htmlFor="has_payment_table" className="text-sm font-medium cursor-pointer">
                    Ödeme Tablosu Ekle
                  </Label>
                </div>

                {hasPaymentTable && (
                  <Card className="border-dashed">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base">Ödeme Tablosu</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <FormField
                        control={form.control}
                        name="comparison_approval_date"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Karşılaştırma Onay Tarihi</FormLabel>
                            <FormControl>
                              <Input type="date" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="agreement_amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Anlaşma Tutarı</FormLabel>
                            <FormControl>
                              <Input placeholder="Örn: 500.000 TL" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <div className="flex items-center gap-3">
                        <Switch
                          id="has_contract"
                          checked={form.watch("has_contract") || false}
                          onCheckedChange={(checked) => form.setValue("has_contract", checked)}
                        />
                        <Label htmlFor="has_contract" className="text-sm font-medium cursor-pointer">
                          Sözleşme Var
                        </Label>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Ödenen Tutarlar</Label>
                        {paidFields.map((field, index) => (
                          <div key={field.id} className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-20 shrink-0">
                              Ödenen ({index + 1}):
                            </span>
                            <Input
                              placeholder="Örn: 100.000 TL"
                              {...form.register(`paid_amounts.${index}.value`)}
                            />
                            {paidFields.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => removePaid(index)}
                                className="shrink-0"
                              >
                                <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                              </Button>
                            )}
                          </div>
                        ))}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => appendPaid({ value: "" })}
                          className="mt-1"
                        >
                          <Plus className="h-4 w-4 mr-1" />
                          Ödeme Satırı Ekle
                        </Button>
                      </div>
                      <FormField
                        control={form.control}
                        name="remaining_payment"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Kalan Ödeme</FormLabel>
                            <FormControl>
                              <Input placeholder="Örn: 400.000 TL+KDV" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="requested_payment_amount"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Ödenmesi Talep Edilen Tutar</FormLabel>
                            <FormControl>
                              <Input placeholder="Örn: 33.515,93 TL" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={form.control}
                        name="remaining_after_payment"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Bu Ödeme Sonrası Kalan Ödeme</FormLabel>
                            <FormControl>
                              <Input placeholder="Örn: 400.000 TL+KDV" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    </CardContent>
                  </Card>
                )}
              </section>

              {/* İlgili Kişiler */}
              <section className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">İlgili Kişiler</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Opsiyonel — seçilen kişiler Finans Müdürü onayından önce sırayla onay verirler. Boş bırakılabilir.
                  </p>
                </div>
                <UserMultiPicker
                  value={relatedPersonIds}
                  onChange={setRelatedPersonIds}
                  employees={employees}
                  excludeEmployeeIds={currentEmployeeId ? [currentEmployeeId] : []}
                  disabled={isSubmitting}
                />
              </section>


              {/* EKLER Bilgilendirme */}
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Ekler</h2>
                <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900 dark:bg-blue-950/40 p-4">
                  <div className="flex items-start gap-3">
                    <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                    <div className="space-y-2 text-sm text-blue-900 dark:text-blue-100">
                      <p className="font-medium">Bu onay kapağına aşağıdaki belgelerin eklenmesi beklenir:</p>
                      <ul className="list-disc list-inside space-y-1 text-blue-800 dark:text-blue-200">
                        <li>Muhasebe onay kapağı</li>
                        <li>Cari döküm</li>
                        <li>Arvento kaydı (varsa)</li>
                        <li>İlgili fatura / proforma</li>
                        <li>Taşeron sözleşmesi (varsa)</li>
                      </ul>
                      <p className="text-xs text-blue-700 dark:text-blue-300 pt-1">
                        Tüm belgeler aşağıdaki alana yüklenebilir (opsiyonel).
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dosya Yükleme */}
                <div className="space-y-2">
                  <Label className="text-sm">{attachmentLabel}</Label>
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
                        id="finance-file-input"
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
                        onClick={() => document.getElementById("finance-file-input")?.click()}
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

