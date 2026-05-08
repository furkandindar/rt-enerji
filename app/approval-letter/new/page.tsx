"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, FileText, Upload, X, Plus, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { SignaturePanel } from "@/components/signature-panel";
import { SignatureFont } from "@/lib/signature/types";

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
import { RichTextEditor } from "@/components/ui/rich-text-editor";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const approvalLetterSchema = z.object({
  letter_date: z.string().min(1, "Tarih gerekli"),
  company: z.string().min(1, "Firma gerekli"),
  project: z.string().min(1, "Proje gerekli"),
  subject: z.string().min(1, "Konu gerekli"),
  content: z.string().min(1, "Yazı içeriği gerekli"),
  has_payment_table: z.boolean(),
  comparison_approval_date: z.string().optional(),
  agreement_amount: z.string().optional(),
  has_contract: z.boolean().optional(),
  paid_amounts: z.array(z.object({ value: z.string() })).optional(),
  remaining_payment: z.string().optional(),
  requested_payment_amount: z.string().optional(),
  remaining_after_payment: z.string().optional(),
});

type ApprovalLetterFormValues = z.infer<typeof approvalLetterSchema>;

interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

interface Company {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

export default function NewApprovalLetterPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [signatureInfo, setSignatureInfo] = useState<SignatureInfo>({
    signatureText: null,
    signatureFont: null,
  });
  const [loadingSignature, setLoadingSignature] = useState(true);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companiesLoading, setCompaniesLoading] = useState(true);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentConfigId, setAttachmentConfigId] = useState<string | null>(null);
  const [attachmentLabel, setAttachmentLabel] = useState<string>("Ek Dosya");
  const [allowedMimeTypes, setAllowedMimeTypes] = useState<string[] | null>(null);
  const [maxFileSizeBytes, setMaxFileSizeBytes] = useState<number>(10485760);
  const [maxFiles, setMaxFiles] = useState<number>(5);
  const supabase = createClient();

  const form = useForm<ApprovalLetterFormValues>({
    resolver: zodResolver(approvalLetterSchema),
    defaultValues: {
      letter_date: new Date().toISOString().split("T")[0],
      company: "",
      project: "",
      subject: "",
      content: "",
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
    name: "paid_amounts",
  });

  const hasPaymentTable = form.watch("has_payment_table");

  // Kullanıcı imza bilgilerini yükle
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

  // Şirket listesini çek (sadece aktif olanlar)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/companies");
        if (!res.ok) return;
        const body = (await res.json()) as Company[];
        if (cancelled) return;
        const active = body.filter((c) => c.is_active);
        setCompanies(active);
      } catch (error) {
        console.error("Error loading companies:", error);
      } finally {
        if (!cancelled) setCompaniesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Attachment config yükle
  useEffect(() => {
    const loadAttachmentConfig = async () => {
      try {
        const { data: wfDef } = await supabase
          .from("workflow_definitions")
          .select("id")
          .eq("code", "APPROVAL_LETTER")
          .single();
        if (!wfDef) return;
        const { data: step } = await supabase
          .from("workflow_steps")
          .select("id")
          .eq("workflow_definition_id", wfDef.id)
          .eq("step_order", 1)
          .single();
        if (!step) return;
        const { data: configs } = await supabase
          .from("workflow_step_attachments")
          .select("id, label, allowed_mime_types, max_file_size_bytes, max_files")
          .eq("workflow_step_id", step.id);
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
    setPendingFiles((prev) => [...prev, ...validFiles].slice(0, maxFiles));
    e.target.value = "";
  };

  const removeFile = (index: number) => {
    setPendingFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);
  const canSubmit = hasValidSignature && signatureAccepted;

  const onSubmit = async (data: ApprovalLetterFormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/approval-letter", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          letter_date: data.letter_date,
          company: data.company,
          project: data.project,
          subject: data.subject,
          content: data.content,
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
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Talep oluşturulamadı");
      }

      const result = await response.json();
      const requestId: string = result.id;

      // Dosyaları yükle
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

      toast.success("Olur yazısı başarıyla oluşturuldu");
      router.push("/my-requests");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Yeni Olur Yazısı</h1>
        <p className="text-muted-foreground">Olur yazınızı doldurun ve gönderin</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Olur Yazısı Bilgileri
          </CardTitle>
          <CardDescription>Olur yazısı detaylarını girin</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Tarih */}
              <FormField
                control={form.control}
                name="letter_date"
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

              {/* Firma */}
              <FormField
                control={form.control}
                name="company"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Firma</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={companiesLoading || companies.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              companiesLoading
                                ? "Yükleniyor..."
                                : companies.length === 0
                                  ? "Tanımlı şirket yok"
                                  : "Şirket seçin"
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {companies.map((c) => (
                          <SelectItem key={c.id} value={c.name}>
                            {c.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Proje */}
              <FormField
                control={form.control}
                name="project"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Proje</FormLabel>
                    <FormControl>
                      <Input placeholder="Proje adı" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Konu */}
              <FormField
                control={form.control}
                name="subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Konu</FormLabel>
                    <FormControl>
                      <Input placeholder="Olur yazısı konusu" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Yazı İçeriği */}
              <FormField
                control={form.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Yazı</FormLabel>
                    <FormControl>
                      <RichTextEditor
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Olur yazısı içeriğini yazın..."
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Ödeme Tablosu Toggle */}
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

              {/* Ödeme Tablosu Alanları */}
              {hasPaymentTable && (
                <Card className="border-dashed">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Ödeme Tablosu</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* Karşılaştırma Onay Tarihi */}
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

                    {/* Anlaşma Tutarı */}
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

                    {/* Sözleşme Var/Yok */}
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

                    {/* Ödenen Tutarlar (Dinamik) */}
                    <div className="space-y-2">
                      <Label className="text-sm font-medium">Ödenen Tutarlar</Label>
                      {fields.map((field, index) => (
                        <div key={field.id} className="flex items-center gap-2">
                          <span className="text-sm text-muted-foreground w-20 shrink-0">
                            Ödenen ({index + 1}):
                          </span>
                          <Input
                            placeholder="Örn: 100.000 TL"
                            {...form.register(`paid_amounts.${index}.value`)}
                          />
                          {fields.length > 1 && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
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
                        onClick={() => append({ value: "" })}
                        className="mt-1"
                      >
                        <Plus className="h-4 w-4 mr-1" />
                        Ödeme Satırı Ekle
                      </Button>
                    </div>

                    {/* Kalan Ödeme */}
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

                    {/* Ödenmesi Talep Edilen Tutar */}
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

                    {/* Bu Ödeme Sonrası Kalan */}
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

              {/* Ek Dosyalar */}
              {attachmentConfigId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{attachmentLabel}</label>
                  </div>
                  {pendingFiles.length > 0 && (
                    <div className="space-y-1.5">
                      {pendingFiles.map((file, index) => (
                        <div
                          key={index}
                          className="flex items-center justify-between rounded-md border px-3 py-2 bg-muted/30"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="text-sm truncate">{file.name}</span>
                            <span className="text-xs text-muted-foreground shrink-0">
                              ({(file.size / 1024).toFixed(0)} KB)
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeFile(index)}
                            className="ml-2 shrink-0 text-muted-foreground hover:text-destructive"
                            disabled={isSubmitting}
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                  {pendingFiles.length < maxFiles && (
                    <label className={`flex items-center gap-2 w-full cursor-pointer rounded-md border border-dashed px-4 py-3 text-sm text-muted-foreground hover:bg-muted/30 transition-colors ${isSubmitting ? "opacity-50 pointer-events-none" : ""}`}>
                      <Upload className="h-4 w-4 shrink-0" />
                      <span>{allowedMimeTypes ? "Dosya seç" : "Dosya seç (Tüm dosya türleri)"} — maks {Math.round(maxFileSizeBytes / 1048576)} MB</span>
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept={allowedMimeTypes ? allowedMimeTypes.join(",") : undefined}
                        onChange={handleFileChange}
                        disabled={isSubmitting}
                      />
                    </label>
                  )}
                </div>
              )}

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
                <Button type="submit" disabled={isSubmitting || !canSubmit}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
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
