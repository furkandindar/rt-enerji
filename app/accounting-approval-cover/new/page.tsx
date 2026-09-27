"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Calculator, Plus, Trash2, Info } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SignaturePanel } from "@/components/signature-panel";
import { PendingAttachmentsField, showFailedUploadsToast } from "@/components/pending-attachments-field";
import { uploadPendingFiles } from "@/lib/attachments/upload-attachment";
import { SignatureFont } from "@/lib/signature/types";
import { UserMultiPicker, type UserMultiPickerEmployee } from "@/components/user-multi-picker";
import { sumItemsByCurrency, joinCurrencyTotals } from "@/lib/currency";
import { RevisionNoticeForRequest } from "@/components/my-requests/revision-notice";
import { RequestEditAttachments } from "@/components/my-requests/request-edit-attachments";

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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const CAPACITY_TYPE_OPTIONS = [
  { value: "KAPASITE", label: "Kapasite" },
  { value: "ANASAHA", label: "Ana Saha" },
  { value: "YEKA", label: "YEKA" },
] as const;

/** Sözlükteki şirket adı ("Kiraz Enerji") kalemde büyük harfle saklanır ("KİRAZ ENERJİ") —
 *  eski serbest metin kayıtları ve PDF görünümüyle tutarlı olsun diye. */
const toTrUpper = (s: string) => s.toLocaleUpperCase("tr-TR");

/** Detay API'sinden (GET /api/my-requests/[id]) gelen muhasebe kapağı kaydı. */
interface AccountingCoverEditData {
  subject: string | null;
  request_date: string | null;
  document_no: string | null;
  demirbas_registered: boolean | null;
  has_dispatch_note: boolean | null;
  has_delivery_info: boolean | null;
  has_invoice_record: boolean | null;
  has_accounting_prog_entry: boolean | null;
  has_arvento_record: boolean | null;
  paid_from_credit: boolean | null;
  items?: Array<{
    row_order: number;
    item_date: string;
    company_name: string;
    payee_name: string;
    item_subject: string;
    capacity_type: "KAPASITE" | "ANASAHA" | "YEKA";
    invoice_amount: number | string | null;
    payable_amount: number | string | null;
    currency: "TRY" | "USD" | "EUR";
  }>;
}

interface EditApprovalRow {
  sequence_order: number;
  workflow_step?: { approver_type?: string } | null;
  approver?: { id: string } | null;
}

interface CompanyOption {
  id: string;
  name: string;
}

const CURRENCY_OPTIONS = [
  { value: "TRY", label: "TL" },
  { value: "USD", label: "USD" },
  { value: "EUR", label: "EUR" },
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
  capacity_type: z.enum(["KAPASITE", "ANASAHA", "YEKA"], { message: "Kapasite tipi seçin" }),
  invoice_amount: amountString,
  payable_amount: amountString,
  currency: z.enum(["TRY", "USD", "EUR"], { message: "Para birimi seçin" }),
});

const accountingCoverSchema = z.object({
  subject: z.string().min(1, "Konu gerekli"),
  request_date: z.string().min(1, "Tarih gerekli"),
  document_no: z.string().min(1, "Sayı gerekli"),
  demirbas_registered: z.enum(["yes", "no"], { message: "Seçim yapın" }),
  has_dispatch_note: z.enum(["yes", "no"], { message: "Seçim yapın" }),
  has_delivery_info: z.enum(["yes", "no"], { message: "Seçim yapın" }),
  has_invoice_record: z.enum(["yes", "no"], { message: "Seçim yapın" }),
  has_accounting_prog_entry: z.enum(["yes", "no"], { message: "Seçim yapın" }),
  has_arvento_record: z.enum(["yes", "no"], { message: "Seçim yapın" }),
  paid_from_credit: z.enum(["yes", "no"], { message: "Seçim yapın" }),
  items: z.array(itemSchema).min(1, "En az bir ödeme satırı zorunludur"),
});

type AccountingCoverFormValues = z.infer<typeof accountingCoverSchema>;

interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

export default function NewAccountingApprovalCoverPage() {
  const router = useRouter();
  const supabase = createClient();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingEditData, setLoadingEditData] = useState<boolean>(isEditMode);
  // Edit modunda "İlgili Kişiler" adımının id'si yüklenmeden gönderilirse resubmit
  // gövdesi boş gider ve sunucu önceki turun listesini kopyalar — bu yüzden beklenir.
  const [loadingWorkflowConfig, setLoadingWorkflowConfig] = useState(true);
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

  const form = useForm<AccountingCoverFormValues>({
    resolver: zodResolver(accountingCoverSchema),
    defaultValues: {
      subject: "",
      request_date: new Date().toISOString().split("T")[0],
      document_no: "",
      demirbas_registered: undefined,
      has_dispatch_note: undefined,
      has_delivery_info: undefined,
      has_invoice_record: undefined,
      has_accounting_prog_entry: undefined,
      has_arvento_record: undefined,
      paid_from_credit: undefined,
      items: [
        {
          item_date: new Date().toISOString().split("T")[0],
          company_name: "",
          payee_name: "",
          item_subject: "",
          capacity_type: undefined as unknown as "KAPASITE",
          invoice_amount: "0",
          payable_amount: "0",
          currency: "TRY",
        },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "items",
  });

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
          .eq("code", "ACCOUNTING_APPROVAL_COVER")
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
      } finally {
        setLoadingWorkflowConfig(false);
      }
    };
    loadWorkflowConfig();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Edit mode — ?edit=<id> ile gelirse mevcut talebi (revize/taslak) yükle
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
        const body = await res.json();
        const raw = body.accounting_approval_cover_request;
        const f = (Array.isArray(raw) ? raw[0] : raw) as AccountingCoverEditData | undefined;
        if (!f) {
          toast.error("Talep bulunamadı");
          return;
        }
        if (cancelled) return;

        const yesNo = (v: boolean | null | undefined) =>
          v === true ? "yes" : v === false ? "no" : undefined;
        const items = [...(f.items ?? [])].sort((a, b) => a.row_order - b.row_order);

        form.reset({
          subject: f.subject ?? "",
          request_date: f.request_date ?? new Date().toISOString().split("T")[0],
          document_no: f.document_no ?? "",
          demirbas_registered: yesNo(f.demirbas_registered),
          has_dispatch_note: yesNo(f.has_dispatch_note),
          has_delivery_info: yesNo(f.has_delivery_info),
          has_invoice_record: yesNo(f.has_invoice_record),
          has_accounting_prog_entry: yesNo(f.has_accounting_prog_entry),
          has_arvento_record: yesNo(f.has_arvento_record),
          paid_from_credit: yesNo(f.paid_from_credit),
          items: items.map((it) => ({
            item_date: it.item_date,
            company_name: it.company_name,
            payee_name: it.payee_name,
            item_subject: it.item_subject,
            capacity_type: it.capacity_type,
            invoice_amount: String(it.invoice_amount ?? 0),
            payable_amount: String(it.payable_amount ?? 0),
            currency: it.currency,
          })),
        });

        // İlgili Kişiler: aktif turdaki DYNAMIC_USER_LIST onaycıları (sıralı)
        const approvals = (body.approvals ?? []) as EditApprovalRow[];
        setRelatedPersonIds(
          approvals
            .filter((a) => a.workflow_step?.approver_type === "DYNAMIC_USER_LIST" && a.approver?.id)
            .sort((a, b) => a.sequence_order - b.sequence_order)
            .map((a) => a.approver!.id)
        );
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

  const addItemRow = () => {
    append({
      item_date: new Date().toISOString().split("T")[0],
      company_name: "",
      payee_name: "",
      item_subject: "",
      capacity_type: undefined as unknown as "KAPASITE",
      invoice_amount: "0",
      payable_amount: "0",
      currency: "TRY",
    });
  };

  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);
  const canSubmit = hasValidSignature && signatureAccepted && !isSubmitting;




  const onSubmit = async (data: AccountingCoverFormValues) => {
    if (!isEditMode && !signatureAccepted) {
      toast.error("Devam etmek için imzanızı onaylayın");
      return;
    }

    setIsSubmitting(true);
    try {
      const dynamic_approvers =
        dynamicStepId && relatedPersonIds.length > 0
          ? { [dynamicStepId]: relatedPersonIds }
          : undefined;

      const response = await fetch(
        isEditMode ? `/api/accounting-approval-cover/${editId}` : "/api/accounting-approval-cover",
        {
          method: isEditMode ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: data.subject,
            request_date: data.request_date,
            document_no: data.document_no,
            demirbas_registered: data.demirbas_registered === "yes",
            has_dispatch_note: data.has_dispatch_note === "yes",
            has_delivery_info: data.has_delivery_info === "yes",
            has_invoice_record: data.has_invoice_record === "yes",
            has_accounting_prog_entry: data.has_accounting_prog_entry === "yes",
            has_arvento_record: data.has_arvento_record === "yes",
            paid_from_credit: data.paid_from_credit === "yes",
            items: data.items.map((it) => ({
              item_date: it.item_date,
              company_name: it.company_name,
              payee_name: it.payee_name,
              item_subject: it.item_subject,
              capacity_type: it.capacity_type,
              invoice_amount: Number(it.invoice_amount),
              payable_amount: Number(it.payable_amount),
              currency: it.currency,
            })),
            dynamic_approvers,
          }),
        }
      );

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || (isEditMode ? "Talep güncellenemedi" : "Talep oluşturulamadı"));
      }

      if (isEditMode) {
        // Güncelleme sonrası yeni onay turu. İlgili Kişiler açıkça gönderilir:
        // boş liste = dinamik adım atlanır (resubmit'in önceki turdan kopyalamasını ezer).
        const resubmitRes = await fetch(`/api/requests/${editId}/resubmit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(
            dynamicStepId ? { dynamicApprovers: { [dynamicStepId]: relatedPersonIds } } : {}
          ),
        });
        if (!resubmitRes.ok) {
          const err = await resubmitRes.json().catch(() => ({}));
          throw new Error(err.error || "Talep güncellendi ama yeniden gönderilemedi");
        }
        toast.success("Talep güncellendi ve onaya gönderildi");
        router.push("/my-requests");
        return;
      }

      const result = await response.json();
      const requestId: string = result.id;

      if (requestId && pendingFiles.length > 0) {
        const failedUploads = await uploadPendingFiles(pendingFiles, requestId, attachmentConfigId);
        showFailedUploadsToast(failedUploads);
      }

      toast.success("Onay kapağı talebi başarıyla oluşturuldu");
      router.push("/my-requests");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loadingUser || loadingEditData || (isEditMode && loadingWorkflowConfig)) {
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
          {isEditMode ? "Onay Kapağını Güncelle (Muhasebe)" : "Yeni Onay Kapağı (Muhasebe)"}
        </h1>
        <p className="text-muted-foreground">
          {isEditMode
            ? "Onay kapağını düzenleyin ve yeniden onaya gönderin"
            : "Muhasebe onay kapağı talebini doldurun ve gönderin"}
        </p>
      </div>

      {isEditMode && (
        <div className="max-w-5xl empty:hidden">
          <RevisionNoticeForRequest requestId={editId} />
        </div>
      )}

      <Card className="max-w-5xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="h-5 w-5" />
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
                          <Input placeholder="Örn: MUH/ŞUBAT-01" {...field} />
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
                      <div className="space-y-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.item_date`}
                          render={({ field }) => (
                            <FormItem className="min-w-0 sm:max-w-[200px]">
                              <FormLabel className="text-xs">Tarih</FormLabel>
                              <FormControl>
                                <Input type="date" className="w-full" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                        <FormField
                          control={form.control}
                          name={`items.${index}.company_name`}
                          render={({ field }) => (
                            <FormItem className="min-w-0">
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
                                  {/* Edit: kayıtlı firma pasif/eski serbest metinse listede yok — boş görünmesin */}
                                  {field.value && !companies.some((c) => toTrUpper(c.name) === field.value) && (
                                    <SelectItem value={field.value}>{field.value}</SelectItem>
                                  )}
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
                            <FormItem className="min-w-0">
                              <FormLabel className="text-xs">Ödeme Yapılacak</FormLabel>
                              <FormControl>
                                <Input placeholder="Firma/Kurum" className="w-full" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.capacity_type`}
                          render={({ field }) => (
                            <FormItem className="min-w-0">
                              <FormLabel className="text-xs">Kapasite</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Seçiniz" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {CAPACITY_TYPE_OPTIONS.map((opt) => (
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
                          name={`items.${index}.invoice_amount`}
                          render={({ field }) => (
                            <FormItem className="min-w-0">
                              <FormLabel className="text-xs">Fatura Tutarı</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" min="0" className="w-full" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.payable_amount`}
                          render={({ field }) => (
                            <FormItem className="min-w-0">
                              <FormLabel className="text-xs">Ödenecek</FormLabel>
                              <FormControl>
                                <Input type="number" step="0.01" min="0" className="w-full" {...field} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        <FormField
                          control={form.control}
                          name={`items.${index}.currency`}
                          render={({ field }) => (
                            <FormItem className="min-w-0">
                              <FormLabel className="text-xs">Para Birimi</FormLabel>
                              <Select value={field.value} onValueChange={field.onChange}>
                                <FormControl>
                                  <SelectTrigger className="w-full">
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
              {/* Değerlendirme Alanları (7 boolean) */}
              <section className="space-y-4">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">Değerlendirme</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {([
                    { name: "demirbas_registered", label: "Demirbaş kaydı", yes: "Var", no: "Yok" },
                    { name: "has_dispatch_note", label: "İrsaliye", yes: "Var", no: "Yok" },
                    { name: "has_delivery_info", label: "Teslim alan / eden bilgisi", yes: "Var", no: "Yok" },
                    { name: "has_invoice_record", label: "Fatura kaydı – İcmal", yes: "Var", no: "Yok" },
                    { name: "has_accounting_prog_entry", label: "Muhasebe programına giriş", yes: "Yapıldı", no: "Yapılmadı" },
                    { name: "has_arvento_record", label: "Arvento kaydı", yes: "Var", no: "Yok" },
                    { name: "paid_from_credit", label: "Krediden mi ödeniyor?", yes: "Evet", no: "Hayır" },
                  ] as const).map((cfg) => (
                    <FormField
                      key={cfg.name}
                      control={form.control}
                      name={cfg.name}
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{cfg.label}</FormLabel>
                          <FormControl>
                            <RadioGroup value={field.value} onValueChange={field.onChange} className="flex gap-4">
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="yes" id={`${cfg.name}-yes`} />
                                <Label htmlFor={`${cfg.name}-yes`} className="font-normal cursor-pointer">{cfg.yes}</Label>
                              </div>
                              <div className="flex items-center space-x-2">
                                <RadioGroupItem value="no" id={`${cfg.name}-no`} />
                                <Label htmlFor={`${cfg.name}-no`} className="font-normal cursor-pointer">{cfg.no}</Label>
                              </div>
                            </RadioGroup>
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </section>

              {/* İlgili Kişiler */}
              <section className="space-y-3">
                <div>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">İlgili Kişiler</h2>
                  <p className="text-xs text-muted-foreground mt-1">
                    Opsiyonel — seçilen kişiler Muhasebe Müdürü onayından önce sırayla onay verirler. Boş bırakılabilir.
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
                        <li>İlgili fatura / e-fatura</li>
                        <li>İrsaliye (varsa)</li>
                        <li>Arvento kaydı (varsa)</li>
                        <li>Muhasebe programı ekran görüntüsü</li>
                        <li>Demirbaş kaydı belgesi (varsa)</li>
                      </ul>
                      <p className="text-xs text-blue-700 dark:text-blue-300 pt-1">
                        {isEditMode
                          ? "Ekler anında güncellenir: yüklediğiniz dosya hemen eklenir, sildiğiniz dosya hemen kaldırılır."
                          : "Tüm belgeler aşağıdaki alana yüklenebilir (opsiyonel)."}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dosya Yükleme — edit modunda mevcut ekler anında yüklenir/silinir */}
                {isEditMode && editId ? (
                  <RequestEditAttachments
                    requestId={editId}
                    workflowCode="ACCOUNTING_APPROVAL_COVER"
                    disabled={isSubmitting}
                  />
                ) : (
                  <PendingAttachmentsField
                    label={attachmentLabel}
                    files={pendingFiles}
                    onFilesChange={setPendingFiles}
                    rules={{ allowedMimeTypes, maxFileSizeBytes, maxFiles }}
                    disabled={isSubmitting}
                  />
                )}
              </section>

              {/* İmza Paneli — edit modunda imza zaten ilk gönderimde verildi */}
              {!isEditMode && (
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
                <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
                  İptal
                </Button>
                <Button type="submit" disabled={isSubmitting || (!isEditMode && !canSubmit)}>
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



