"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Clock, Plus, Trash2, Upload, X, FileText } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// Ay seçenekleri
const MONTHS = [
  "Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"
];

// Neden kategorileri
const EMERGENCY_REASONS = [
  { value: "SHIFT_OUTSIDE", label: "Vardiya Dışı" },
  { value: "NON_CONTINUOUS", label: "Sürekli Olmayan" },
  { value: "EMERGENCY_CASE", label: "Acil Durumlar" },
  { value: "SUDDEN_DEVELOPMENT", label: "Ani Gelişen" },
  { value: "ON_REQUEST", label: "Talep Üzerine" },
];

const STAFF_SHORTAGE_REASONS = [
  { value: "STAFF_SHORTAGE", label: "Personel Eksikliği" },
  { value: "REPORTING", label: "Raporlama" },
  { value: "ENERGY_PRODUCTION", label: "7/24 Enerji Üretimi" },
];

// Entry schema
const entrySchema = z.object({
  full_name: z.string().min(1, "Ad Soyad gerekli"),
  role_title: z.string().min(1, "Rol/Unvan gerekli"),
  overtime_hours: z.number().min(0.5, "En az 0.5 saat"),
  overtime_pay: z.number().min(0, "Geçerli bir tutar girin"),
});

// Base schema
const baseSchema = z.object({
  overtime_type: z.enum(["EMERGENCY", "STAFF_SHORTAGE"]),
  month: z.string().min(1, "Ay seçin"),
  year: z.number().min(2020).max(2100),
  reason_category: z.string().min(1, "Neden kategorisi seçin"),
  reason_detail: z.string().min(1, "Açıklama gerekli"),
  hr_note: z.string().optional(),
});

// Emergency schema
const emergencySchema = baseSchema.extend({
  overtime_type: z.literal("EMERGENCY"),
  work_location: z.string().min(1, "Çalışma yeri gerekli"),
  work_start_date: z.string().min(1, "Başlangıç tarihi gerekli"),
  work_end_date: z.string().min(1, "Bitiş tarihi gerekli"),
  previous_shift_start_date: z.string().min(1, "Tarih gerekli"),
  previous_shift_start_time: z.string().min(1, "Saat gerekli"),
  previous_shift_end_date: z.string().min(1, "Tarih gerekli"),
  previous_shift_end_time: z.string().min(1, "Saat gerekli"),
  next_shift_start_date: z.string().min(1, "Tarih gerekli"),
  next_shift_start_time: z.string().min(1, "Saat gerekli"),
  next_shift_end_date: z.string().min(1, "Tarih gerekli"),
  next_shift_end_time: z.string().min(1, "Saat gerekli"),
  work_reason: z.string().min(1, "Çalışma nedeni gerekli"),
});

// Staff shortage schema
const staffShortageSchema = baseSchema.extend({
  overtime_type: z.literal("STAFF_SHORTAGE"),
  work_location: z.string().min(1, "Merkez/Şube/İşletme adı gerekli"),
  entries: z.array(entrySchema).min(1, "En az bir çalışan ekleyin"),
});

// Combined form schema
const formSchema = z.discriminatedUnion("overtime_type", [
  emergencySchema,
  staffShortageSchema,
]);

type FormValues = z.infer<typeof formSchema>;

interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

export default function NewOvertimePage() {
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
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [attachmentConfigId, setAttachmentConfigId] = useState<string | null>(null);
  const [attachmentLabel, setAttachmentLabel] = useState<string>("Ek Dosya");
  const [allowedMimeTypes, setAllowedMimeTypes] = useState<string[]>(["application/pdf", "image/jpeg", "image/png"]);
  const [maxFileSizeBytes, setMaxFileSizeBytes] = useState<number>(10485760);
  const [maxFiles, setMaxFiles] = useState<number>(5);
  const supabase = createClient();

  const currentYear = new Date().getFullYear();
  const currentMonth = MONTHS[new Date().getMonth()];

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

  // Overtime step 1 için attachment config'i yükle
  useEffect(() => {
    const loadAttachmentConfig = async () => {
      try {
        const { data: wfDef } = await supabase
          .from("workflow_definitions")
          .select("id")
          .eq("code", "OVERTIME")
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
  }, [supabase]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      overtime_type: "STAFF_SHORTAGE",
      month: currentMonth,
      year: currentYear,
      reason_category: "",
      reason_detail: "",
      hr_note: "",
      work_location: "",
      work_start_date: "",
      work_end_date: "",
      previous_shift_start_date: "",
      previous_shift_start_time: "",
      previous_shift_end_date: "",
      previous_shift_end_time: "",
      next_shift_start_date: "",
      next_shift_start_time: "",
      next_shift_end_date: "",
      next_shift_end_time: "",
      work_reason: "",
      entries: [{ full_name: "", role_title: "", overtime_hours: 0, overtime_pay: 0 }],
    } as FormValues,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "entries" as never,
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
        const found = (body.requests as Array<{ id: string; overtime_request?: Record<string, unknown> }>)?.find(
          (r) => r.id === editId
        );
        if (!found || !found.overtime_request) {
          toast.error("Talep bulunamadı");
          return;
        }
        const f = found.overtime_request as {
          overtime_type?: "EMERGENCY" | "STAFF_SHORTAGE";
          month?: string;
          year?: number;
          reason_category?: string;
          reason_detail?: string;
          hr_note?: string | null;
          work_location?: string | null;
          work_start_date?: string | null;
          work_end_date?: string | null;
          work_reason?: string | null;
          previous_shift_start?: string | null;
          previous_shift_end?: string | null;
          next_shift_start?: string | null;
          next_shift_end?: string | null;
          entries?: Array<{
            full_name?: string;
            role_title?: string;
            overtime_hours?: number;
            overtime_pay?: number;
          }>;
        };
        if (cancelled) return;

        // ISO timestamptz → datetime-local input ve date+time parça çıkarımı
        const toDateTimeLocal = (iso: string | null | undefined): string =>
          iso ? iso.slice(0, 16) : "";
        const splitDateTime = (iso: string | null | undefined): { date: string; time: string } => {
          if (!iso) return { date: "", time: "" };
          const d = new Date(iso);
          if (isNaN(d.getTime())) return { date: "", time: "" };
          const pad = (n: number) => String(n).padStart(2, "0");
          const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
          const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
          return { date, time };
        };

        const prevStart = splitDateTime(f.previous_shift_start);
        const prevEnd = splitDateTime(f.previous_shift_end);
        const nextStart = splitDateTime(f.next_shift_start);
        const nextEnd = splitDateTime(f.next_shift_end);

        if (f.overtime_type === "EMERGENCY") {
          form.reset({
            overtime_type: "EMERGENCY",
            month: f.month ?? currentMonth,
            year: f.year ?? currentYear,
            reason_category: f.reason_category ?? "",
            reason_detail: f.reason_detail ?? "",
            hr_note: f.hr_note ?? "",
            work_location: f.work_location ?? "",
            work_start_date: toDateTimeLocal(f.work_start_date),
            work_end_date: toDateTimeLocal(f.work_end_date),
            previous_shift_start_date: prevStart.date,
            previous_shift_start_time: prevStart.time,
            previous_shift_end_date: prevEnd.date,
            previous_shift_end_time: prevEnd.time,
            next_shift_start_date: nextStart.date,
            next_shift_start_time: nextStart.time,
            next_shift_end_date: nextEnd.date,
            next_shift_end_time: nextEnd.time,
            work_reason: f.work_reason ?? "",
          } as FormValues);
        } else {
          const entries = (f.entries ?? []).map((e) => ({
            full_name: e.full_name ?? "",
            role_title: e.role_title ?? "",
            overtime_hours: e.overtime_hours ?? 0,
            overtime_pay: e.overtime_pay ?? 0,
          }));
          form.reset({
            overtime_type: "STAFF_SHORTAGE",
            month: f.month ?? currentMonth,
            year: f.year ?? currentYear,
            reason_category: f.reason_category ?? "",
            reason_detail: f.reason_detail ?? "",
            hr_note: f.hr_note ?? "",
            work_location: f.work_location ?? "",
            entries:
              entries.length > 0
                ? entries
                : [{ full_name: "", role_title: "", overtime_hours: 0, overtime_pay: 0 }],
          } as FormValues);
        }
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

  const overtimeType = form.watch("overtime_type");
  const entries = form.watch("entries" as never) as unknown as Array<{ overtime_hours: number; overtime_pay: number }> | undefined;

  // Toplam hesaplama
  const totalHours = entries?.reduce((sum, e) => sum + (e?.overtime_hours || 0), 0) || 0;
  const totalPay = entries?.reduce((sum, e) => sum + (e?.overtime_pay || 0), 0) || 0;

  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);
  const canSubmit = hasValidSignature && signatureAccepted;

  // Tip değiştiğinde formu resetle
  const handleTypeChange = (value: "EMERGENCY" | "STAFF_SHORTAGE") => {
    form.setValue("overtime_type", value);
    form.setValue("reason_category", "");

    if (value === "STAFF_SHORTAGE") {
      // Entries için başlangıç değeri ekle
      if (!fields.length) {
        append({ full_name: "", role_title: "", overtime_hours: 0, overtime_pay: 0 });
      }
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const validFiles = files.filter((file) => {
      if (!allowedMimeTypes.includes(file.type)) {
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

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      const url = isEditMode ? `/api/overtime/${editId}` : "/api/overtime";
      const method = isEditMode ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
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
        const result = await response.json();
        const requestId: string = result.id;

        // Dosyaları yükle (talep oluşturulduktan sonra)
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
        toast.success("Fazla mesai talebi başarıyla oluşturuldu");
      }

      router.push("/my-requests");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const reasonOptions = overtimeType === "EMERGENCY" ? EMERGENCY_REASONS : STAFF_SHORTAGE_REASONS;

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
          {isEditMode ? "Talebi Güncelle" : "Yeni Fazla Mesai Formu"}
        </h1>
        <p className="text-muted-foreground">
          {isEditMode ? "Talep bilgilerini güncelleyin" : "Fazla mesai onay formu oluşturun"}
        </p>
      </div>

      <Card className="max-w-4xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Fazla Mesai Bilgileri
          </CardTitle>
          <CardDescription>
            Fazla mesai detaylarını girin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Fazla Mesai Tipi + Neden - yan yana */}
              <div className="flex gap-4">
                <FormField
                  control={form.control}
                  name="overtime_type"
                  render={({ field }) => (
                    <FormItem className="w-52">
                      <FormLabel>Fazla Mesai Tipi</FormLabel>
                      <Select onValueChange={handleTypeChange} value={field.value} disabled={isEditMode}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Tip seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="EMERGENCY">Olağan Dışı Durumlar</SelectItem>
                          <SelectItem value="STAFF_SHORTAGE">Olağan Durumlar</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reason_category"
                  render={({ field }) => (
                    <FormItem className="w-52">
                      <FormLabel>Fazla Mesai Nedeni</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Neden seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {reasonOptions.map((reason) => (
                            <SelectItem key={reason.value} value={reason.value}>
                              {reason.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Ay ve Yıl */}
              <div className="flex gap-4">
                <FormField
                  control={form.control}
                  name="month"
                  render={({ field }) => (
                    <FormItem className="w-40">
                      <FormLabel>Ay</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Ay seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {MONTHS.map((month) => (
                            <SelectItem key={month} value={month}>{month}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="year"
                  render={({ field }) => (
                    <FormItem className="w-28">
                      <FormLabel>Yıl</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* EMERGENCY Alanları */}
              {overtimeType === "EMERGENCY" && (
                <>
                  <FormField
                    control={form.control}
                    name="work_location"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Çalışma Yeri</FormLabel>
                        <FormControl>
                          <Input placeholder="Ofis veya işletme adı" {...field} value={field.value || ""} />
                        </FormControl>
                        <FormDescription>Fiziken çalışmanın gerçekleştiği yer</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="work_start_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Çalışma Başlangıç</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="work_end_date"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Çalışma Bitiş</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>

                  {/* Önceki Vardiya */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Önceki Vardiya</p>
                    <div className="flex items-start gap-6 pl-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Başlangıç</p>
                        <div className="flex gap-2">
                          <FormField
                            control={form.control}
                            name="previous_shift_start_date"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input type="date" className="w-40" {...field} value={field.value || ""} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="previous_shift_start_time"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input type="time" className="w-28" {...field} value={field.value || ""} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Bitiş</p>
                        <div className="flex gap-2">
                          <FormField
                            control={form.control}
                            name="previous_shift_end_date"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input type="date" className="w-40" {...field} value={field.value || ""} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="previous_shift_end_time"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input type="time" className="w-28" {...field} value={field.value || ""} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sonraki Vardiya */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium">Sonraki Vardiya</p>
                    <div className="flex items-start gap-6 pl-2">
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Başlangıç</p>
                        <div className="flex gap-2">
                          <FormField
                            control={form.control}
                            name="next_shift_start_date"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input type="date" className="w-40" {...field} value={field.value || ""} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="next_shift_start_time"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input type="time" className="w-28" {...field} value={field.value || ""} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">Bitiş</p>
                        <div className="flex gap-2">
                          <FormField
                            control={form.control}
                            name="next_shift_end_date"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input type="date" className="w-40" {...field} value={field.value || ""} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                          <FormField
                            control={form.control}
                            name="next_shift_end_time"
                            render={({ field }) => (
                              <FormItem>
                                <FormControl>
                                  <Input type="time" className="w-28" {...field} value={field.value || ""} />
                                </FormControl>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <FormField
                    control={form.control}
                    name="work_reason"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mesai Dışı Çalışma Nedeni</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Normal mesai saati dışında yapılmak zorunda olmasının nedeni..."
                            {...field}
                            value={field.value || ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              {/* STAFF_SHORTAGE Alanları - Dinamik Tablo */}
              {overtimeType === "STAFF_SHORTAGE" && (
                <div className="space-y-4">
                  {/* Merkez, Şube ve İşletmeler */}
                  <FormField
                    control={form.control}
                    name={"work_location" as never}
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Merkez, Şube ve İşletmeler</FormLabel>
                        <FormControl>
                          <Input placeholder="Merkez, şube veya işletme adını girin..." {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Çalışan Listesi */}
                  <div className="flex items-center justify-between">
                    <FormLabel>Çalışan Listesi</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ full_name: "", role_title: "", overtime_hours: 0, overtime_pay: 0 })}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Satır Ekle
                    </Button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Ad Soyad</TableHead>
                        <TableHead>Rol / Unvan</TableHead>
                        <TableHead className="w-32">FM Saati</TableHead>
                        <TableHead className="w-40">Ücret Karşılığı (TL)</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {fields.map((field, index) => (
                        <TableRow key={field.id}>
                          <TableCell>
                            <Input
                              placeholder="Ad Soyad..."
                              {...form.register(`entries.${index}.full_name` as const)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              placeholder="Mesul Teknisyen, Operatör..."
                              {...form.register(`entries.${index}.role_title` as const)}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.5"
                              placeholder="0"
                              {...form.register(`entries.${index}.overtime_hours` as const, {
                                valueAsNumber: true,
                              })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0.00"
                              {...form.register(`entries.${index}.overtime_pay` as const, {
                                valueAsNumber: true,
                              })}
                            />
                          </TableCell>
                          <TableCell>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => remove(index)}
                              disabled={fields.length <= 1}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                    <TableFooter>
                      <TableRow>
                        <TableCell className="font-semibold" colSpan={2}>TOPLAM</TableCell>
                        <TableCell className="font-semibold">{totalHours.toFixed(1)} saat</TableCell>
                        <TableCell className="font-semibold">{totalPay.toFixed(2)} TL</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}

              {/* Detay Açıklama */}
              <FormField
                control={form.control}
                name="reason_detail"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Çalışmayı Talep Eden Kişi veya Durum</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Açıklama yazın..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* İK Notu */}
              <FormField
                control={form.control}
                name="hr_note"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>İnsan Kaynakları Notu (Opsiyonel)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Eklemek istediğiniz notlar..."
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Ek Dosyalar */}
              {attachmentConfigId && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium">{attachmentLabel}</label>
                    {/* <span className="text-xs text-muted-foreground">
                      {pendingFiles.length}/{maxFiles} dosya
                    </span> */}
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
                      <span>Dosya seç (PDF, JPG, PNG — maks {Math.round(maxFileSizeBytes / 1048576)} MB)</span>
                      <input
                        type="file"
                        className="hidden"
                        multiple
                        accept={allowedMimeTypes.join(",")}
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

