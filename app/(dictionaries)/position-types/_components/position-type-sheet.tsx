"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
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
    .min(1, "Kod zorunludur")
    .max(20, "Kod en fazla 20 karakter olabilir")
    .transform((val) => val.trim().toUpperCase()),
  name: z
    .string()
    .min(1, "Ad zorunludur")
    .max(50, "Ad en fazla 50 karakter olabilir")
    .transform((val) => val.trim()),
  color: z
    .string()
    .transform((val) => val.trim())
    .refine((val) => !val || /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(val), {
      message: "Geçerli bir hex renk kodu giriniz (#RRGGBB)",
    }),
  description: z
    .string()
    .max(30, "Açıklama en fazla 30 karakter olabilir")
    .transform((val) => val.trim()),
  is_active: z.boolean(),
  display_order: z.number(),
});

type FormValues = z.infer<typeof formSchema>;

interface PositionTypeSheetProps {
  mode: "create" | "edit";
  positionTypeId?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PositionTypeSheet({
  mode,
  positionTypeId,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: PositionTypeSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const router = useRouter();

  // Controlled vs uncontrolled state
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      code: "",
      name: "",
      color: "",
      description: "",
      is_active: true,
      display_order: 0,
    },
  });

  // Fetch data when in edit mode
  useEffect(() => {
    if (mode === "edit" && positionTypeId && open) {
      setIsFetching(true);
      fetch(`/api/position-types/${positionTypeId}`)
        .then((res) => res.json())
        .then((data) => {
          form.reset({
            code: data.code || "",
            name: data.name || "",
            color: data.color || "",
            description: data.description || "",
            is_active: data.is_active ?? true,
            display_order: data.display_order ?? 0,
          });
        })
        .catch((error) => {
          console.error("Failed to fetch position type:", error);
          toast.error("Veri yüklenirken hata oluştu");
        })
        .finally(() => {
          setIsFetching(false);
        });
    }
  }, [mode, positionTypeId, open, form]);

  async function onSubmit(values: FormValues) {
    setIsLoading(true);

    try {
      const url =
        mode === "edit"
          ? `/api/position-types/${positionTypeId}`
          : "/api/position-types";
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
          ? "Pozisyon tipi başarıyla güncellendi"
          : "Pozisyon tipi başarıyla oluşturuldu"
      );
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : mode === "edit"
            ? "Pozisyon tipi güncellenemedi"
            : "Pozisyon tipi oluşturulamadı"
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
            {mode === "edit" ? "Pozisyon Tipi Düzenle" : "Yeni Pozisyon Tipi"}
          </SheetTitle>
          <SheetDescription>
            {mode === "edit"
              ? "Pozisyon tipi bilgilerini güncelleyin."
              : "Yeni bir pozisyon tipi oluşturun. Tüm alanları doldurun."}
          </SheetDescription>
        </SheetHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4 p-4">
            {isFetching ? (
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
                  <Skeleton className="h-4 w-16" />
                  <Skeleton className="h-10 w-full" />
                </div>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-20 w-full" />
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
                      <FormLabel>Kod</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Örn: MANAGER"
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
                        <Input placeholder="Örn: Yönetici" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="color"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Renk (Opsiyonel)</FormLabel>
                      <FormControl>
                        <div className="flex gap-2">
                          <Input
                            type="color"
                            className="w-16 h-10 p-1 cursor-pointer"
                            {...field}
                          />
                          <Input
                            type="text"
                            placeholder="#FF5733"
                            className="flex-1"
                            {...field}
                          />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Hex renk kodu (örn: #FF5733)
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
                          placeholder="Pozisyon tipi açıklaması..."
                          className="resize-none"
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
                          Bu pozisyon tipi kullanımda mı?
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />

                <SheetFooter className="mt-auto p-0">
                  <Button type="submit" disabled={isLoading || isFetching} className="w-full">
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

