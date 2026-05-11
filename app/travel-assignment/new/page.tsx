"use client";

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, MapPin } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const travelAssignmentSchema = z.object({
  company_id: z.string({ message: "Şirket seçimi gerekli" }).min(1, "Şirket seçimi gerekli"),
  assignment_subject: z.string({ message: "Görev konusu gerekli" }).min(1, "Görev konusu gerekli"),
  destination_city: z.string({ message: "Görev şehri gerekli" }).min(1, "Görev şehri gerekli"),
  destination_institution: z.string({ message: "Görev kurumu gerekli" }).min(1, "Görev kurumu gerekli"),
  estimated_departure_at: z.string({ message: "Tahmini çıkış tarihi gerekli" }).min(1, "Tahmini çıkış tarihi gerekli"),
  estimated_return_at: z.string({ message: "Tahmini dönüş tarihi gerekli" }).min(1, "Tahmini dönüş tarihi gerekli"),
  transportation_type: z.enum(["COMPANY_VEHICLE", "RENTAL_VEHICLE", "AIRPLANE", "OTHER"], {
    message: "Ulaşım aracı seçimi gerekli",
  }),
  transportation_cost: z.number().min(0),
  accommodation_needed: z.boolean(),
  accommodation_cost: z.number().min(0),
  advance_requested: z.boolean(),
  advance_amount: z.number().min(0).optional(),
  advance_subject: z.string().optional(),
  advance_content: z.string().optional(),
}).refine(
  (data) => !data.advance_requested || (data.advance_amount !== undefined && data.advance_amount > 0),
  { message: "Avans miktarı girilmelidir", path: ["advance_amount"] }
).refine(
  (data) => !data.advance_requested || (data.advance_subject !== undefined && data.advance_subject.trim().length > 0),
  { message: "Avans konusu girilmelidir", path: ["advance_subject"] }
).refine(
  (data) => !data.advance_requested || (data.advance_content !== undefined && data.advance_content.trim().length > 0),
  { message: "Avans açıklaması girilmelidir", path: ["advance_content"] }
);

type TravelAssignmentFormValues = z.infer<typeof travelAssignmentSchema>;

interface SignatureInfo {
  signatureText: string | null;
  signatureFont: SignatureFont | null;
}

interface Company {
  id: string;
  code: string;
  name: string;
}

export default function NewTravelAssignmentPage() {
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
  const [companies, setCompanies] = useState<Company[]>([]);
  const supabase = createClient();

  // İmza bilgilerini ve şirketleri yükle
  useEffect(() => {
    const loadData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // İmza bilgilerini al
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

        // Şirket listesini al
        const { data: companiesData } = await supabase
          .from("companies")
          .select("id, code, name")
          .eq("is_active", true)
          .order("display_order", { ascending: true });

        if (companiesData) {
          setCompanies(companiesData);
        }
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoadingSignature(false);
      }
    };

    loadData();
  }, [supabase]);

  const form = useForm<TravelAssignmentFormValues>({
    resolver: zodResolver(travelAssignmentSchema),
    defaultValues: {
      company_id: "",
      assignment_subject: "",
      destination_city: "",
      destination_institution: "",
      estimated_departure_at: "",
      estimated_return_at: "",
      transportation_type: undefined,
      transportation_cost: 0,
      accommodation_needed: false,
      accommodation_cost: 0,
      advance_requested: false,
      advance_amount: undefined,
      advance_subject: undefined,
      advance_content: undefined,
    },
  });

  const hasValidSignature = Boolean(signatureInfo.signatureText && signatureInfo.signatureFont);
  const canSubmit = hasValidSignature && signatureAccepted;
  const accommodationNeeded = form.watch("accommodation_needed");
  const advanceRequested = form.watch("advance_requested");

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
        const found = (body.requests as Array<{ id: string; travel_assignment_request?: Record<string, unknown> }>)?.find(
          (r) => r.id === editId
        );
        if (!found || !found.travel_assignment_request) {
          toast.error("Talep bulunamadı");
          return;
        }
        const f = found.travel_assignment_request as {
          company_id?: string;
          assignment_subject?: string;
          destination_city?: string;
          destination_institution?: string;
          estimated_departure_at?: string;
          estimated_return_at?: string;
          transportation_type?: "COMPANY_VEHICLE" | "RENTAL_VEHICLE" | "AIRPLANE" | "OTHER";
          transportation_cost?: number;
          accommodation_needed?: boolean;
          accommodation_cost?: number;
          advance_requested?: boolean;
          advance_amount?: number | null;
          advance_subject?: string | null;
          advance_content?: string | null;
        };
        if (cancelled) return;
        const toDateTimeLocal = (iso: string | undefined): string =>
          iso ? iso.slice(0, 16) : "";
        form.reset({
          company_id: f.company_id ?? "",
          assignment_subject: f.assignment_subject ?? "",
          destination_city: f.destination_city ?? "",
          destination_institution: f.destination_institution ?? "",
          estimated_departure_at: toDateTimeLocal(f.estimated_departure_at),
          estimated_return_at: toDateTimeLocal(f.estimated_return_at),
          transportation_type: f.transportation_type,
          transportation_cost: f.transportation_cost ?? 0,
          accommodation_needed: f.accommodation_needed ?? false,
          accommodation_cost: f.accommodation_cost ?? 0,
          advance_requested: f.advance_requested ?? false,
          advance_amount: f.advance_amount ?? undefined,
          advance_subject: f.advance_subject ?? undefined,
          advance_content: f.advance_content ?? undefined,
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

  const onSubmit = async (data: TravelAssignmentFormValues) => {
    setIsSubmitting(true);
    try {
      const url = isEditMode ? `/api/travel-assignment/${editId}` : "/api/travel-assignment";
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
        toast.success("Görev formu başarıyla oluşturuldu");
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
          {isEditMode ? "Talebi Güncelle" : "Yeni Şehir İçi/Dışı Görev Formu"}
        </h1>
        <p className="text-muted-foreground">
          {isEditMode ? "Talep bilgilerini güncelleyin" : "Görev bilgilerinizi doldurun ve onaya gönderin"}
        </p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5" />
            Görev Bilgileri
          </CardTitle>
          <CardDescription>
            Görevlendirme talebinize ait bilgileri eksiksiz doldurun
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* Şirket */}
              <FormField
                control={form.control}
                name="company_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Şirket</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Şirket seçin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {companies.map((company) => (
                          <SelectItem key={company.id} value={company.id}>
                            {company.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Görev Konusu */}
              <FormField
                control={form.control}
                name="assignment_subject"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Görev Konusu</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Görev konusunu açıklayın"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Görev Şehri ve Kurumu */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="destination_city"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Görev Şehri</FormLabel>
                      <FormControl>
                        <Input placeholder="Şehir adı" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="destination_institution"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Görev Kurumu</FormLabel>
                      <FormControl>
                        <Input placeholder="Kurum adı" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Tahmini Çıkış ve Dönüş Tarihleri */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="estimated_departure_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tahmini Çıkış Tarihi/Saati</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="estimated_return_at"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tahmini Dönüş Tarihi/Saati</FormLabel>
                      <FormControl>
                        <Input type="datetime-local" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Ulaşım Aracı */}
              <FormField
                control={form.control}
                name="transportation_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ulaşım Aracı</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Ulaşım aracı seçin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="COMPANY_VEHICLE">Şirket Aracı</SelectItem>
                        <SelectItem value="RENTAL_VEHICLE">Kiralık Araç</SelectItem>
                        <SelectItem value="AIRPLANE">Uçak</SelectItem>
                        <SelectItem value="OTHER">Diğer</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Ulaşım Bedeli */}
              <FormField
                control={form.control}
                name="transportation_cost"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ulaşım Bedeli (TL)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="0.00"
                        {...field}
                        value={field.value ?? ""}
                        onChange={(e) => field.onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Konaklama */}
              <FormField
                control={form.control}
                name="accommodation_needed"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Konaklama</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Görev süresince konaklama ihtiyacınız var mı?
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Konaklama Bedeli - Sadece konaklama seçiliyse göster */}
              {accommodationNeeded && (
                <FormField
                  control={form.control}
                  name="accommodation_cost"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Konaklama Bedeli (TL)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          placeholder="0.00"
                          {...field}
                          value={field.value ?? ""}
                          onChange={(e) => field.onChange(e.target.value === "" ? 0 : parseFloat(e.target.value))}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Avans Talebi */}
              <FormField
                control={form.control}
                name="advance_requested"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">Avans Talebi</FormLabel>
                      <p className="text-sm text-muted-foreground">
                        Görev için avans talep etmek istiyor musunuz?
                      </p>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              {/* Avans Detayları - Sadece avans talebi varsa göster */}
              {advanceRequested && (
                <div className="space-y-4 rounded-lg border p-4">
                  <p className="text-sm font-medium text-muted-foreground">Avans Detayları</p>
                  <FormField
                    control={form.control}
                    name="advance_subject"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Avans Konusu</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Örn: Görev avansı"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="advance_content"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Avans Açıklaması</FormLabel>
                        <FormControl>
                          <Textarea
                            placeholder="Avans talebinin detaylarını yazın..."
                            className="min-h-[100px]"
                            {...field}
                            value={field.value ?? ""}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="advance_amount"
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
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
