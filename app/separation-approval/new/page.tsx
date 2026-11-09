"use client";

// İşten Çıkış Onay Formu (MİY-EK-03_10) — ücret içerir, formun tamamını İK doldurur.
// Hak tablosu satırları ve TOPLAM hesabı lib/hr-approval/separation-entitlements.ts'ten
// (PDF ve API ile aynı kaynak). TOPLAM otomatik hesaplanır; İK elle değiştirebilir
// (total_is_manual) ve tek tıkla otomatiğe dönebilir. Sunucu toplamı yeniden hesaplar.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Calculator, Loader2, RotateCcw, UserMinus } from "lucide-react";

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
import { Textarea } from "@/components/ui/textarea";
import { SignaturePanel } from "@/components/signature-panel";
import { PendingAttachmentsField } from "@/components/pending-attachments-field";
import { RequestEditAttachments } from "@/components/my-requests/request-edit-attachments";
import { RevisionNoticeForRequest } from "@/components/my-requests/revision-notice";
import { RevisionResponseField } from "@/components/my-requests/revision-response-field";
import { useRevisionResponse } from "@/hooks/use-revision-response";
import { SalaryVisibilityNote } from "@/components/hr-approval/hr-approval-summary";
import { useHrApprovalFormSetup } from "@/components/hr-approval/use-hr-approval-form-setup";
import {
  CompanySelect,
  LONG_TEXT_MAX,
  PERIOD_TEXT_MAX,
  amountToInput,
  dateString,
  loadHrApprovalEditRecord,
  optionalAmount,
  optionalText,
  requiredText,
  submitHrApprovalForm,
  toAmountOrNull,
  toTextOrNull,
} from "@/components/hr-approval/form-helpers";
import { SEPARATION_APPROVAL_CODE } from "@/lib/hr-approval/forms";
import {
  CREDITOR_HINT,
  SEPARATION_DEDUCTION_ROW,
  SEPARATION_ENTITLEMENT_ROWS,
  computeSeparationTotal,
  type EntitlementAmounts,
} from "@/lib/hr-approval/separation-entitlements";
import { formatTlOrDash, type SeparationApprovalRecord } from "@/lib/hr-approval/display";
import { cn } from "@/lib/utils";

const period = (label: string) => optionalText(`${label} (gün/ay/yıl)`, PERIOD_TEXT_MAX);
const right = () => optionalAmount({ allowNegative: true });

const schema = z
  .object({
    company_name: requiredText("Şirket unvanı"),
    project_name: requiredText("Proje adı"),
    employee_name: requiredText("Çalışanın adı soyadı"),
    employee_title: requiredText("Görev unvanı"),
    hire_date: dateString("İşe giriş tarihi"),
    separation_date: dateString("İşten çıkış tarihi"),
    separation_reason: requiredText("İşten çıkış sebebi", LONG_TEXT_MAX),
    last_salary: optionalAmount(),

    final_salary_period: period("Hakedilen son maaş"),
    final_salary_amount: right(),
    severance_period: period("Kıdem tazminatı"),
    severance_amount: right(),
    notice_period: period("İhbar"),
    notice_amount: right(),
    ugbt_period: period("UGBT"),
    ugbt_amount: right(),
    overtime_period: period("Fazla mesai"),
    overtime_amount: right(),
    weekend_work_period: period("Hafta sonu çalışması"),
    weekend_work_amount: right(),
    annual_leave_period: period("Yıllık izin"),
    annual_leave_amount: right(),
    deductions_period: period("Kesintiler"),
    deductions_amount: optionalAmount(),

    total_is_manual: z.boolean(),
    total_amount: z.string().trim(),
  })
  .superRefine((v, ctx) => {
    if (v.hire_date && v.separation_date && v.separation_date < v.hire_date) {
      ctx.addIssue({
        code: "custom",
        path: ["separation_date"],
        message: "İşten çıkış tarihi işe giriş tarihinden önce olamaz",
      });
    }
    if (v.total_is_manual) {
      const n = Number(v.total_amount);
      if (v.total_amount === "" || !Number.isFinite(n) || Math.abs(n) > 999_999_999_999.99) {
        ctx.addIssue({ code: "custom", path: ["total_amount"], message: "Geçerli bir toplam girin" });
      }
    }
  });

type FormValues = z.infer<typeof schema>;

const ROWS = [...SEPARATION_ENTITLEMENT_ROWS, SEPARATION_DEDUCTION_ROW] as const;
type RowKey = (typeof ROWS)[number]["key"];

const EMPTY: FormValues = {
  company_name: "",
  project_name: "",
  employee_name: "",
  employee_title: "",
  hire_date: "",
  separation_date: "",
  separation_reason: "",
  last_salary: "",
  final_salary_period: "",
  final_salary_amount: "",
  severance_period: "",
  severance_amount: "",
  notice_period: "",
  notice_amount: "",
  ugbt_period: "",
  ugbt_amount: "",
  overtime_period: "",
  overtime_amount: "",
  weekend_work_period: "",
  weekend_work_amount: "",
  annual_leave_period: "",
  annual_leave_amount: "",
  deductions_period: "",
  deductions_amount: "",
  total_is_manual: false,
  total_amount: "",
};

const API_PATH = "/api/separation-approval";

const isNegative = (v: string | undefined) => !!v && Number(v) < 0;

export default function NewSeparationApprovalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;

  const setup = useHrApprovalFormSetup(SEPARATION_APPROVAL_CODE);
  const revisionResponse = useRevisionResponse(editId);
  const [loadingEditData, setLoadingEditData] = useState<boolean>(isEditMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  const watched = useWatch({ control: form.control });
  const computedTotal = computeSeparationTotal(watched as EntitlementAmounts);
  const totalIsManual = watched.total_is_manual === true;
  const manualTotal = watched.total_amount ?? "";
  const effectiveTotal = totalIsManual && manualTotal !== "" && Number.isFinite(Number(manualTotal))
    ? Number(manualTotal)
    : computedTotal;

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await loadHrApprovalEditRecord<SeparationApprovalRecord>(editId, "separation_approval_request");
        if (cancelled) return;
        if (!r) {
          toast.error("Talep bulunamadı");
          return;
        }
        const values: FormValues = {
          ...EMPTY,
          company_name: r.company_name ?? "",
          project_name: r.project_name ?? "",
          employee_name: r.employee_name ?? "",
          employee_title: r.employee_title ?? "",
          hire_date: r.hire_date ?? "",
          separation_date: r.separation_date ?? "",
          separation_reason: r.separation_reason ?? "",
          last_salary: amountToInput(r.last_salary),
          total_is_manual: r.total_is_manual === true,
          total_amount: r.total_is_manual ? amountToInput(r.total_amount) : "",
        };
        for (const row of ROWS) {
          values[`${row.key}_period`] = (r[`${row.key}_period`] as string | null) ?? "";
          values[`${row.key}_amount`] = amountToInput(r[`${row.key}_amount`] as number | null);
        }
        form.reset(values);
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

  const setManualTotal = (value: string) => {
    form.setValue("total_is_manual", true, { shouldDirty: true });
    form.setValue("total_amount", value, { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  };

  const resetToAutomatic = () => {
    form.setValue("total_is_manual", false, { shouldDirty: true });
    form.setValue("total_amount", "", { shouldDirty: true });
    form.clearErrors("total_amount");
  };

  const hasValidSignature = Boolean(setup.signatureInfo.signatureText && setup.signatureInfo.signatureFont);
  const canSubmit = isEditMode || (hasValidSignature && signatureAccepted);

  const onSubmit = async (v: FormValues) => {
    setIsSubmitting(true);
    try {
      const rows: Record<string, string | number | null> = {};
      for (const row of ROWS) {
        rows[`${row.key}_period`] = toTextOrNull(v[`${row.key}_period`]);
        rows[`${row.key}_amount`] = toAmountOrNull(v[`${row.key}_amount`]);
      }
      const result = await submitHrApprovalForm({
        apiPath: API_PATH,
        editId,
        payload: {
          company_name: v.company_name,
          project_name: v.project_name,
          employee_name: v.employee_name,
          employee_title: v.employee_title,
          hire_date: v.hire_date,
          separation_date: v.separation_date,
          separation_reason: v.separation_reason,
          last_salary: toAmountOrNull(v.last_salary),
          ...rows,
          total_is_manual: v.total_is_manual,
          // Otomatikte sunucu zaten yeniden hesaplar; elle girildiyse girilen değer esas
          total_amount: v.total_is_manual ? Number(v.total_amount) : computedTotal,
        },
        revisionPayload: revisionResponse.payload,
        pendingFiles,
        attachmentConfigId: setup.attachment.configId,
      });
      toast.success(
        result === "updated" ? "Talep güncellendi ve onaya gönderildi" : "İşten çıkış onay formu onaya gönderildi"
      );
      router.push("/my-requests");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (setup.loading || loadingEditData) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const renderRow = (row: (typeof ROWS)[number]) => {
    const key: RowKey = row.key;
    const isDeduction = key === SEPARATION_DEDUCTION_ROW.key;
    const hint = "creditorHint" in row && row.creditorHint ? CREDITOR_HINT : isDeduction ? "Pozitif girin; toplamdan düşülür" : null;
    return (
      <div
        key={key}
        className={cn(
          "grid grid-cols-1 gap-2 border-b py-3 last:border-b-0 sm:grid-cols-[minmax(0,1fr)_9rem_11rem] sm:items-start sm:gap-3",
          isDeduction && "rounded-md bg-red-50/60 px-2 dark:bg-red-950/20"
        )}
      >
        <div className="pt-2">
          <p className="text-sm font-medium">{row.label}</p>
          {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        </div>
        <FormField
          control={form.control}
          name={`${key}_period`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs sm:sr-only">Gün/Ay/Yıl</FormLabel>
              <FormControl>
                <Input placeholder="Örn: 5 Gün" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name={`${key}_amount`}
          render={({ field }) => (
            <FormItem>
              <FormLabel className="text-xs sm:sr-only">TL Karşılığı</FormLabel>
              <FormControl>
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  min={isDeduction ? "0" : undefined}
                  className={cn("text-right tabular-nums", isNegative(field.value) && "font-semibold text-red-600")}
                  placeholder="0,00"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEditMode ? "İşten Çıkış Onay Formunu Güncelle" : "İşten Çıkış Onay Formu"}
        </h1>
        <p className="text-muted-foreground">
          {isEditMode
            ? "Formu düzenleyin ve yeniden onaya gönderin"
            : "İşten çıkışı istenen çalışan ve hak edişleri için onay alın"}
        </p>
      </div>

      <div className="max-w-3xl space-y-3">
        <SalaryVisibilityNote />
        {isEditMode && (
          <div className="empty:hidden">
            <RevisionNoticeForRequest requestId={editId} />
          </div>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UserMinus className="h-5 w-5" />
                Çalışan Bilgileri
              </CardTitle>
              <CardDescription>Şirket, proje ve işten çıkışı istenen çalışanın bilgileri</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="company_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Şirket Unvanı</FormLabel>
                      <CompanySelect
                        value={field.value}
                        onChange={field.onChange}
                        companies={setup.companies}
                        disabled={isSubmitting}
                      />
                      <FormDescription>SGK kaydı olan şirket</FormDescription>
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
                        <Input placeholder="Proje ve/veya ofis" {...field} />
                      </FormControl>
                      <FormDescription>Fiilen çalıştığı proje ve/veya ofis</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employee_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Çalışanın Adı Soyadı</FormLabel>
                      <FormControl>
                        <Input placeholder="Ad Soyad" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="employee_title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Görev Unvanı</FormLabel>
                      <FormControl>
                        <Input placeholder="Örn: Saha Mühendisi" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="hire_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>İşe Giriş Tarihi</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="separation_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>İşten Çıkış Tarihi</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <FormField
                control={form.control}
                name="separation_reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>İşten Çıkış Sebebi</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="İstifa, karşılıklı anlaşma, fesih, emeklilik vb." {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="last_salary"
                render={({ field }) => (
                  <FormItem className="sm:max-w-xs">
                    <FormLabel>Son Maaşı (₺)</FormLabel>
                    <FormControl>
                      <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Opsiyonel" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Hak Edişler
              </CardTitle>
              <CardDescription>
                Süreyi serbest metin yazın (ör. &quot;5 Gün&quot;, &quot;1 Yıl&quot;). Şirket alacaklıysa tutar eksi
                girilir ve kırmızı görünür.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="hidden border-b pb-2 text-xs font-medium text-muted-foreground sm:grid sm:grid-cols-[minmax(0,1fr)_9rem_11rem] sm:gap-3">
                <span>Kalem</span>
                <span>Gün/Ay/Yıl</span>
                <span className="text-right">TL Karşılığı</span>
              </div>
              {ROWS.map(renderRow)}

              <div className="mt-4 grid grid-cols-1 gap-2 rounded-md border bg-muted/30 p-3 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-start sm:gap-3">
                <div>
                  <p className="text-sm font-semibold">TOPLAM</p>
                  <p className="text-xs text-muted-foreground">
                    {totalIsManual
                      ? `Elle girildi · satırlardan hesaplanan: ${formatTlOrDash(computedTotal)}`
                      : "Satırlardan otomatik hesaplanır (haklar − kesintiler); gerekirse elle değiştirebilirsiniz."}
                  </p>
                  {totalIsManual && (
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0 text-xs"
                      onClick={resetToAutomatic}
                      disabled={isSubmitting}
                    >
                      <RotateCcw className="h-3 w-3" />
                      Otomatik hesaplamaya dön
                    </Button>
                  )}
                </div>
                <FormField
                  control={form.control}
                  name="total_amount"
                  render={() => (
                    <FormItem>
                      <FormLabel className="sr-only">Toplam</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          aria-label="Toplam (TL)"
                          className={cn(
                            "text-right font-bold tabular-nums",
                            effectiveTotal < 0 && "text-red-600",
                            totalIsManual && "border-amber-400 focus-visible:ring-amber-400"
                          )}
                          value={totalIsManual ? manualTotal : String(computedTotal)}
                          onChange={(e) => setManualTotal(e.target.value)}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <p className="text-right text-xs text-muted-foreground">{formatTlOrDash(effectiveTotal)}</p>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ekler</CardTitle>
              <CardDescription>
                {isEditMode
                  ? "Ekler anında güncellenir: yüklediğiniz dosya hemen eklenir, sildiğiniz dosya hemen kaldırılır."
                  : "İstifa dilekçesi, hesap tablosu gibi destekleyici belgeler (opsiyonel)"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isEditMode && editId ? (
                <RequestEditAttachments
                  requestId={editId}
                  workflowCode={SEPARATION_APPROVAL_CODE}
                  disabled={isSubmitting}
                />
              ) : (
                <PendingAttachmentsField
                  label={setup.attachment.label}
                  files={pendingFiles}
                  onFilesChange={setPendingFiles}
                  rules={setup.attachment.rules}
                  disabled={isSubmitting}
                />
              )}
            </CardContent>
          </Card>

          {revisionResponse.visible && (
            <Card>
              <CardContent className="pt-6">
                <RevisionResponseField state={revisionResponse} disabled={isSubmitting} />
              </CardContent>
            </Card>
          )}

          {!isEditMode && (
            <SignaturePanel
              signatureText={setup.signatureInfo.signatureText}
              signatureFont={setup.signatureInfo.signatureFont}
              isAccepted={signatureAccepted}
              onAcceptChange={setSignatureAccepted}
              title="TALEP İMZASI"
              description="Bu formu imzanızla onaya göndereceksiniz:"
              disabled={isSubmitting}
            />
          )}

          <div className="flex gap-4">
            <Button type="button" variant="outline" onClick={() => router.back()} disabled={isSubmitting}>
              İptal
            </Button>
            <Button type="submit" disabled={isSubmitting || !canSubmit}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditMode ? "Güncelle ve Gönder" : "İmzala ve Onaya Gönder"}
            </Button>
          </div>
        </form>
      </Form>
    </div>
  );
}
