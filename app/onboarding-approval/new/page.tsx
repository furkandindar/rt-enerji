"use client";

// İşe Giriş Onay Formu (MİY-EK-03_11) — ücret içerir, formun tamamını İK doldurur.
// Alan sırası kağıt formu ve PDF'i izler. Onaycılar (GM → Asistan) yalnız paraflar;
// YKB'nin ıslak imzalı taramasını talep sahibi tamamlama adımında yükler.

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, UserPlus, Wallet } from "lucide-react";

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
  amountToInput,
  dateString,
  loadHrApprovalEditRecord,
  optionalAmount,
  optionalText,
  requiredAmount,
  requiredText,
  submitHrApprovalForm,
  toAmountOrNull,
  toTextOrNull,
} from "@/components/hr-approval/form-helpers";
import { ONBOARDING_APPROVAL_CODE } from "@/lib/hr-approval/forms";
import type { OnboardingApprovalRecord } from "@/lib/hr-approval/display";

const schema = z.object({
  company_name: requiredText("Şirket unvanı"),
  project_name: requiredText("Proje adı"),
  candidate_name: requiredText("Adayın adı soyadı"),
  candidate_title: requiredText("Görev unvanı"),
  start_date: dateString("İşe başlama tarihi"),
  request_reason: requiredText("Personel talep nedeni", LONG_TEXT_MAX),
  replaced_employee_name: optionalText("Ayrılan personelin adı soyadı"),
  replaced_employee_last_salary: optionalAmount(),
  candidate_last_salary: optionalAmount(),
  info_note: optionalText("Bilgi notu", LONG_TEXT_MAX),
  salary_scale_range: optionalText("Mevcut ücret skala aralığı"),
  proposed_net_salary: requiredAmount("Önerilen ücret (net)"),
  approved_salary: optionalAmount(),
});

type FormValues = z.infer<typeof schema>;

const EMPTY: FormValues = {
  company_name: "",
  project_name: "",
  candidate_name: "",
  candidate_title: "",
  start_date: "",
  request_reason: "",
  replaced_employee_name: "",
  replaced_employee_last_salary: "",
  candidate_last_salary: "",
  info_note: "",
  salary_scale_range: "",
  proposed_net_salary: "",
  approved_salary: "",
};

const API_PATH = "/api/onboarding-approval";

export default function NewOnboardingApprovalPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");
  const isEditMode = !!editId;

  const setup = useHrApprovalFormSetup(ONBOARDING_APPROVAL_CODE);
  const revisionResponse = useRevisionResponse(editId);
  const [loadingEditData, setLoadingEditData] = useState<boolean>(isEditMode);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);

  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: EMPTY });

  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await loadHrApprovalEditRecord<OnboardingApprovalRecord>(editId, "onboarding_approval_request");
        if (cancelled) return;
        if (!r) {
          toast.error("Talep bulunamadı");
          return;
        }
        form.reset({
          company_name: r.company_name ?? "",
          project_name: r.project_name ?? "",
          candidate_name: r.candidate_name ?? "",
          candidate_title: r.candidate_title ?? "",
          start_date: r.start_date ?? "",
          request_reason: r.request_reason ?? "",
          replaced_employee_name: r.replaced_employee_name ?? "",
          replaced_employee_last_salary: amountToInput(r.replaced_employee_last_salary),
          candidate_last_salary: amountToInput(r.candidate_last_salary),
          info_note: r.info_note ?? "",
          salary_scale_range: r.salary_scale_range ?? "",
          proposed_net_salary: amountToInput(r.proposed_net_salary),
          approved_salary: amountToInput(r.approved_salary),
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

  const hasValidSignature = Boolean(setup.signatureInfo.signatureText && setup.signatureInfo.signatureFont);
  const canSubmit = isEditMode || (hasValidSignature && signatureAccepted);

  const onSubmit = async (v: FormValues) => {
    setIsSubmitting(true);
    try {
      const result = await submitHrApprovalForm({
        apiPath: API_PATH,
        editId,
        payload: {
          company_name: v.company_name,
          project_name: v.project_name,
          candidate_name: v.candidate_name,
          candidate_title: v.candidate_title,
          start_date: v.start_date,
          request_reason: v.request_reason,
          replaced_employee_name: toTextOrNull(v.replaced_employee_name),
          replaced_employee_last_salary: toAmountOrNull(v.replaced_employee_last_salary),
          candidate_last_salary: toAmountOrNull(v.candidate_last_salary),
          info_note: toTextOrNull(v.info_note),
          salary_scale_range: toTextOrNull(v.salary_scale_range),
          proposed_net_salary: toAmountOrNull(v.proposed_net_salary),
          approved_salary: toAmountOrNull(v.approved_salary),
        },
        revisionPayload: revisionResponse.payload,
        pendingFiles,
        attachmentConfigId: setup.attachment.configId,
      });
      toast.success(
        result === "updated" ? "Talep güncellendi ve onaya gönderildi" : "İşe giriş onay formu onaya gönderildi"
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

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          {isEditMode ? "İşe Giriş Onay Formunu Güncelle" : "İşe Giriş Onay Formu"}
        </h1>
        <p className="text-muted-foreground">
          {isEditMode
            ? "Formu düzenleyin ve yeniden onaya gönderin"
            : "Göreve başlatılması istenen aday için ücret onayı alın"}
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
                <UserPlus className="h-5 w-5" />
                Aday Bilgileri
              </CardTitle>
              <CardDescription>Şirket, proje ve göreve başlatılması istenen adayın bilgileri</CardDescription>
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
                      <FormDescription>Fiilen çalışacağı proje ve/veya ofis</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="candidate_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adayın Adı Soyadı</FormLabel>
                      <FormControl>
                        <Input placeholder="Ad Soyad" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="candidate_title"
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
                  name="start_date"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>İşe Başlama Tarihi</FormLabel>
                      <FormControl>
                        <Input type="date" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="candidate_last_salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Adayın Son Aldığı Ücret (₺)</FormLabel>
                      <FormControl>
                        <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Opsiyonel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="request_reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Personel Talep Nedeni</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Yeni pozisyon, ayrılan personelin yerine, iş yükü artışı vb." rows={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="replaced_employee_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ayrılan Personelin Adı Soyadı</FormLabel>
                      <FormControl>
                        <Input placeholder="Yerine alım yapılıyorsa" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="replaced_employee_last_salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ayrılan Personelin Son Ücreti (₺)</FormLabel>
                      <FormControl>
                        <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Opsiyonel" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="info_note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Bilgi Notu</FormLabel>
                    <FormControl>
                      <Textarea rows={3} placeholder="Opsiyonel" {...field} />
                    </FormControl>
                    <FormDescription>
                      Personel hakkında bilinmesi gereken olumlu veya olumsuz, özellikli bir durum
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet className="h-5 w-5" />
                Ücret Bilgisi
              </CardTitle>
              <CardDescription>Tutarlar Türk lirası; önerilen ücret net yazılır</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <FormField
                control={form.control}
                name="salary_scale_range"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mevcut Ücret Skala Aralığı</FormLabel>
                    <FormControl>
                      <Input placeholder="Örn: 45.000 – 55.000 TL" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="proposed_net_salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Önerilen Ücret (Net, ₺)</FormLabel>
                      <FormControl>
                        <Input type="number" inputMode="decimal" min="0" step="0.01" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="approved_salary"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Uygun Görülen Ücret (₺)</FormLabel>
                      <FormControl>
                        <Input type="number" inputMode="decimal" min="0" step="0.01" placeholder="Opsiyonel" {...field} />
                      </FormControl>
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
                  : "CV, ücret skalası gibi destekleyici belgeler (opsiyonel)"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {isEditMode && editId ? (
                <RequestEditAttachments
                  requestId={editId}
                  workflowCode={ONBOARDING_APPROVAL_CODE}
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
