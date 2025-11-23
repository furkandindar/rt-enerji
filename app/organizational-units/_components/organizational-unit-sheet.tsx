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
import { Loader2, Plus } from "lucide-react";

const formSchema = z.object({
  code: z
    .string()
    .max(20, "Kod en fazla 20 karakter olabilir")
    .transform((val) => val.trim() ? val.toUpperCase() : ""),
  name: z
    .string()
    .min(1, "Ad zorunludur")
    .max(50, "Ad en fazla 50 karakter olabilir")
    .transform((val) => val.trim()),
  unit_type_id: z.string().min(1, "Birim tipi zorunludur"),
  parent_id: z.string().transform((val) => val === "none" || !val ? "" : val),
  description: z
    .string()
    .max(30, "Açıklama en fazla 30 karakter olabilir")
    .transform((val) => val.trim()),
  is_active: z.boolean(),
  order_index: z.number(),
});

type FormValues = z.infer<typeof formSchema>;

interface UnitType {
  id: string;
  name: string;
  code: string;
}

interface OrganizationalUnit {
  id: string;
  name: string;
  code: string | null;
}

interface OrganizationalUnitSheetProps {
  mode: "create" | "edit";
  organizationalUnitId?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function OrganizationalUnitSheet({
  mode,
  organizationalUnitId,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: OrganizationalUnitSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isLoadingOptions, setIsLoadingOptions] = useState(false);
  const [unitTypes, setUnitTypes] = useState<UnitType[]>([]);
  const [organizationalUnits, setOrganizationalUnits] = useState<OrganizationalUnit[]>([]);
  const router = useRouter();

  // Controlled vs uncontrolled state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: "",
      name: "",
      unit_type_id: "",
      parent_id: "",
      description: "",
      is_active: true,
      order_index: 0,
    },
  });

  // Fetch dropdown options when sheet opens
  useEffect(() => {
    if (open) {
      setIsLoadingOptions(true);
      fetch("/api/organizational-units/options")
        .then((res) => res.json())
        .then((data) => {
          setUnitTypes(data.unitTypes || []);
          setOrganizationalUnits(data.organizationalUnits || []);
        })
        .catch((error) => {
          console.error("Failed to fetch options:", error);
          toast.error("Seçenekler yüklenirken hata oluştu");
        })
        .finally(() => {
          setIsLoadingOptions(false);
        });
    }
  }, [open]);

  // Fetch data when in edit mode
  useEffect(() => {
    if (mode === "edit" && organizationalUnitId && open && !isLoadingOptions) {
      setIsFetching(true);
      fetch(`/api/organizational-units/${organizationalUnitId}`)
        .then((res) => res.json())
        .then((data) => {
          form.reset({
            code: data.code || "",
            name: data.name || "",
            unit_type_id: data.unit_type_id || "",
            parent_id: data.parent_id || "",
            description: data.description || "",
            is_active: data.is_active ?? true,
            order_index: data.order_index ?? 0,
          });
        })
        .catch((error) => {
          console.error("Failed to fetch organizational unit:", error);
          toast.error("Veri yüklenirken hata oluştu");
        })
        .finally(() => {
          setIsFetching(false);
        });
    }
  }, [mode, organizationalUnitId, open, isLoadingOptions, form]);

  async function onSubmit(values: FormValues) {
    setIsLoading(true);

    try {
      const url =
        mode === "edit"
          ? `/api/organizational-units/${organizationalUnitId}`
          : "/api/organizational-units";
      const method = mode === "edit" ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(values),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Bir hata oluştu");
      }

      toast.success(
        mode === "edit"
          ? "Organizasyon birimi başarıyla güncellendi"
          : "Organizasyon birimi başarıyla oluşturuldu"
      );
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : mode === "edit"
            ? "Organizasyon birimi güncellenemedi"
            : "Organizasyon birimi oluşturulamadı"
      );
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      {!trigger && mode === "create" && (
        <SheetTrigger asChild>
          <Button className="hover:cursor-pointer">
            <Plus className="h-4 w-4" />
            Yeni Ekle
          </Button>
        </SheetTrigger>
      )}
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>
            {mode === "edit" ? "Organizasyon Birimi Düzenle" : "Yeni Organizasyon Birimi"}
          </SheetTitle>
          <SheetDescription>
            {mode === "edit"
              ? "Organizasyon birimi bilgilerini güncelleyin."
              : "Yeni bir organizasyon birimi oluşturun. Tüm alanları doldurun."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4">
            {isFetching || isLoadingOptions ? (
              <>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <Skeleton className="h-16 w-full" />
              </>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kod (Opsiyonel)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Örn: MAI"
                          {...field}
                          onChange={(e) =>
                            field.onChange(e.target.value.toUpperCase())
                          }
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ad</FormLabel>
                      <FormControl>
                        <Input placeholder="Örn: Mali İşler" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unit_type_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Birim Tipi</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Birim tipi seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {unitTypes.map((unitType) => (
                            <SelectItem key={unitType.id} value={unitType.id}>
                              {unitType.name}
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
                  name="parent_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Üst Birim (Opsiyonel)</FormLabel>
                      <Select
                        onValueChange={(value) => field.onChange(value === "none" ? "" : value)}
                        value={field.value || "none"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Üst birim seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">Yok (En üst seviye)</SelectItem>
                          {organizationalUnits
                            .filter((unit) => unit.id !== organizationalUnitId)
                            .map((unit) => (
                              <SelectItem key={unit.id} value={unit.id}>
                                {unit.code ? `${unit.code} - ${unit.name}` : unit.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        Bu birim hangi birimin altında yer alacak?
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Açıklama (Opsiyonel)</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Organizasyon birimi açıklaması..."
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Aktif</FormLabel>
                        <FormDescription>
                          Bu organizasyon birimi kullanımda mı?
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <SheetFooter className="mt-auto p-0">
                  <Button type="submit" disabled={isLoading || isFetching || isLoadingOptions} className="w-full">
                    {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {isLoading
                      ? mode === "edit"
                        ? "Güncelleniyor..."
                        : "Oluşturuluyor..."
                      : mode === "edit"
                        ? "Güncelle"
                        : "Oluştur"}
                  </Button>
                </SheetFooter>
              </>
            )}
          </form>
        </Form>
      </SheetContent>
    </Sheet>
  );
}

