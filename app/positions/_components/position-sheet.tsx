"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetFooter,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

const formSchema = z.object({
  title: z
    .string()
    .min(1, "Başlık zorunludur")
    .max(100, "Başlık en fazla 100 karakter olabilir")
    .transform((val) => val.trim()),
  job_code: z
    .string()
    .min(1, "Job code zorunludur")
    .max(50, "Job code en fazla 50 karakter olabilir")
    .transform((val) => val.trim().toUpperCase()),
  level_band: z.number().positive("Seviye bandı zorunludur"),
  unit_id: z.string().min(1, "Organizasyon birimi zorunludur"),
  position_type_id: z.string().transform((val) => val === "none" || !val ? "" : val),
  reports_to_position_id: z.string().transform((val) => val === "none" || !val ? "" : val),
  location: z
    .string()
    .max(100, "Lokasyon en fazla 100 karakter olabilir")
    .transform((val) => val.trim()),
  is_unit_head: z.boolean(),
  is_active: z.boolean(),
  order_index: z.number(),
});

type FormValues = z.infer<typeof formSchema>;

interface GradeLevel {
  band: number;
  name: string;
}

interface OrganizationalUnit {
  id: string;
  name: string;
  code: string | null;
}

interface PositionType {
  id: string;
  name: string;
  code: string;
  color: string | null;
}

interface Position {
  id: string;
  title: string;
  job_code: string;
}

interface PositionSheetProps {
  mode: "create" | "edit";
  positionId?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PositionSheet({
  mode,
  positionId,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: PositionSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [gradeLevels, setGradeLevels] = useState<GradeLevel[]>([]);
  const [organizationalUnits, setOrganizationalUnits] = useState<OrganizationalUnit[]>([]);
  const [positionTypes, setPositionTypes] = useState<PositionType[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const router = useRouter();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: "",
      job_code: "",
      level_band: 0,
      unit_id: "",
      position_type_id: "",
      reports_to_position_id: "",
      location: "",
      is_unit_head: false,
      is_active: true,
      order_index: 0,
    },
  });

  // Fetch dropdown options
  useEffect(() => {
    if (open) {
      fetch("/api/positions/options")
        .then((res) => res.json())
        .then((data) => {
          setGradeLevels(data.gradeLevels || []);
          setOrganizationalUnits(data.organizationalUnits || []);
          setPositionTypes(data.positionTypes || []);
          setPositions(data.positions || []);
        });
    }
  }, [open]);

  // Fetch position data for edit mode
  useEffect(() => {
    if (open && mode === "edit" && positionId) {
      setIsFetching(true);
      fetch(`/api/positions/${positionId}`)
        .then((res) => res.json())
        .then((response) => {
          const position = response.data;
          form.reset({
            title: position.title || "",
            job_code: position.job_code || "",
            level_band: position.level_band || 0,
            unit_id: position.unit_id || "",
            position_type_id: position.position_type_id || "",
            reports_to_position_id: position.reports_to_position_id || "",
            location: position.location || "",
            is_unit_head: position.is_unit_head ?? false,
            is_active: position.is_active ?? true,
            order_index: position.order_index ?? 0,
          });
        })
        .catch((error) => {
          console.error("Error fetching position:", error);
          toast.error("Pozisyon yüklenirken hata oluştu");
        })
        .finally(() => {
          setIsFetching(false);
        });
    } else if (open && mode === "create") {
      form.reset({
        title: "",
        job_code: "",
        level_band: 0,
        unit_id: "",
        position_type_id: "",
        reports_to_position_id: "",
        location: "",
        is_unit_head: false,
        is_active: true,
        order_index: 0,
      });
    }
  }, [open, mode, positionId, form]);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    try {
      const url = mode === "create" ? "/api/positions" : `/api/positions/${positionId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Bir hata oluştu");
      }

      toast.success(mode === "create" ? "Pozisyon oluşturuldu" : "Pozisyon güncellendi");
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Error submitting position:", error);
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent className="overflow-y-auto sm:max-w-[600px]">
        <SheetHeader>
          <SheetTitle>
            {mode === "create" ? "Yeni Pozisyon Oluştur" : "Pozisyon Düzenle"}
          </SheetTitle>
          <SheetDescription>
            {mode === "create"
              ? "Yeni bir pozisyon oluşturmak için aşağıdaki formu doldurun."
              : "Pozisyon bilgilerini güncellemek için aşağıdaki formu düzenleyin."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4">
            {isFetching ? (
              <>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-10 w-full" />
                </div>
              </>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="title"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Başlık *</FormLabel>
                      <FormControl>
                        <Input placeholder="Örn: Mali İşler Müdürü" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="job_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Job Code *</FormLabel>
                      <FormControl>
                        <Input placeholder="Örn: DIR-MAL-001" {...field} />
                      </FormControl>
                      <FormDescription>
                        Benzersiz pozisyon kodu (otomatik büyük harfe çevrilir)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="level_band"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Seviye Bandı *</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(Number(value))}
                        value={field.value ? String(field.value) : ""}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seviye bandı seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {gradeLevels.map((gl) => (
                            <SelectItem key={gl.band} value={String(gl.band)}>
                              {gl.band} - {gl.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unit_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Organizasyon Birimi *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Organizasyon birimi seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {organizationalUnits.map((unit) => (
                            <SelectItem key={unit.id} value={unit.id}>
                              {unit.code ? `${unit.code} - ${unit.name}` : unit.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="position_type_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pozisyon Tipi (Opsiyonel)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pozisyon tipi seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Yok</SelectItem>
                          {positionTypes.map((pt) => (
                            <SelectItem key={pt.id} value={pt.id}>
                              {pt.code ? `${pt.code} - ${pt.name}` : pt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="reports_to_position_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Rapor Verdiği Pozisyon (Opsiyonel)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Rapor verdiği pozisyon seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Yok</SelectItem>
                          {positions
                            .filter((p) => p.id !== positionId)
                            .map((p) => (
                              <SelectItem key={p.id} value={p.id}>
                                {p.job_code} - {p.title}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Lokasyon (Opsiyonel)</FormLabel>
                      <FormControl>
                        <Input placeholder="Örn: İstanbul" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_unit_head"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Birim Başkanı</FormLabel>
                        <FormDescription>
                          Bu pozisyon birim başkanı mı?
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Aktif</FormLabel>
                        <FormDescription>
                          Pozisyon aktif mi?
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </>
            )}

            <SheetFooter className="gap-2 pt-4">
              {/* <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={isSubmitting}
              >
                İptal
              </Button> */}
              <Button type="submit" disabled={isSubmitting || isFetching}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {mode === "create" ? "Oluştur" : "Güncelle"}
              </Button>
            </SheetFooter>
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

