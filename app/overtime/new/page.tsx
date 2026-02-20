"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Clock, Plus, Trash2 } from "lucide-react";
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
  previous_shift: z.string().min(1, "Önceki mesai saati gerekli"),
  next_shift: z.string().min(1, "Sonraki mesai saati gerekli"),
  work_reason: z.string().min(1, "Çalışma nedeni gerekli"),
});

// Staff shortage schema
const staffShortageSchema = baseSchema.extend({
  overtime_type: z.literal("STAFF_SHORTAGE"),
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [signatureAccepted, setSignatureAccepted] = useState(false);
  const [signatureInfo, setSignatureInfo] = useState<SignatureInfo>({
    signatureText: null,
    signatureFont: null,
  });
  const [loadingSignature, setLoadingSignature] = useState(true);
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

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      overtime_type: "EMERGENCY",
      month: currentMonth,
      year: currentYear,
      reason_category: "",
      reason_detail: "",
      hr_note: "",
      work_location: "",
      work_start_date: "",
      work_end_date: "",
      previous_shift: "",
      next_shift: "",
      work_reason: "",
    } as FormValues,
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "entries" as never,
  });

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
        append({ role_title: "", overtime_hours: 0, overtime_pay: 0 });
      }
    }
  };

  const onSubmit = async (data: FormValues) => {
    setIsSubmitting(true);
    try {
      const response = await fetch("/api/overtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Talep oluşturulamadı");
      }

      toast.success("Fazla mesai talebi başarıyla oluşturuldu");
      router.push("/my-requests");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const reasonOptions = overtimeType === "EMERGENCY" ? EMERGENCY_REASONS : STAFF_SHORTAGE_REASONS;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Yeni Fazla Mesai Formu</h1>
        <p className="text-muted-foreground">Fazla mesai onay formu oluşturun</p>
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
              {/* Fazla Mesai Tipi */}
              <FormField
                control={form.control}
                name="overtime_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Fazla Mesai Tipi</FormLabel>
                    <Select onValueChange={handleTypeChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Tip seçin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="EMERGENCY">Acil Durum / Talep Üzerine</SelectItem>
                        <SelectItem value="STAFF_SHORTAGE">Personel Eksikliği / Raporlama</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Ay ve Yıl */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="month"
                  render={({ field }) => (
                    <FormItem>
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
                    <FormItem>
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

              {/* Neden Kategorisi */}
              <FormField
                control={form.control}
                name="reason_category"
                render={({ field }) => (
                  <FormItem>
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

                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="previous_shift"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Önceki Mesai Saati</FormLabel>
                          <FormControl>
                            <Input placeholder="Örn: 08:00 - 17:00" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="next_shift"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Sonraki Mesai Saati</FormLabel>
                          <FormControl>
                            <Input placeholder="Örn: 08:00 - 17:00" {...field} value={field.value || ""} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
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
                  <div className="flex items-center justify-between">
                    <FormLabel>Çalışan Listesi</FormLabel>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => append({ role_title: "", overtime_hours: 0, overtime_pay: 0 })}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Satır Ekle
                    </Button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
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
                        <TableCell className="font-semibold">TOPLAM</TableCell>
                        <TableCell className="font-semibold">{totalHours.toFixed(1)} saat</TableCell>
                        <TableCell className="font-semibold">{totalPay.toFixed(2)} TL</TableCell>
                        <TableCell></TableCell>
                      </TableRow>
                    </TableFooter>
                  </Table>
                </div>
              )}

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

