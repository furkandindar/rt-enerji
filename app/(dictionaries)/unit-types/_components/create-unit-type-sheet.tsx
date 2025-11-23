"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";

interface UnitTypeSheetProps {
  mode: "create" | "edit";
  unitTypeId?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

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
  description: z
    .string()
    .max(30, "Açıklama en fazla 30 karakter olabilir")
    .transform((val) => val.trim()),
  is_active: z.boolean(),
  display_order: z.number(),
});

type FormValues = z.infer<typeof formSchema>;

export function CreateUnitTypeSheet({
  mode,
  unitTypeId,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: UnitTypeSheetProps) {
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
      description: "",
      is_active: true,
      display_order: 0,
    },
  });

  // Fetch data when in edit mode and sheet opens
  useEffect(() => {
    if (mode === "edit" && unitTypeId && open) {
      setIsFetching(true);
      fetch(`/api/unit-types/${unitTypeId}`)
        .then((res) => res.json())
        .then((data) => {
          form.reset({
            code: data.code || "",
            name: data.name || "",
            description: data.description || "",
            is_active: data.is_active ?? true,
            display_order: data.display_order ?? 0,
          });
        })
        .catch((error) => {
          console.error("Failed to fetch unit type:", error);
          toast.error("Veri yüklenirken hata oluştu");
        })
        .finally(() => {
          setIsFetching(false);
        });
    }
  }, [mode, unitTypeId, open, form]);

  async function onSubmit(values: FormValues) {
    setIsLoading(true);

    try {
      const url =
        mode === "edit"
          ? `/api/unit-types/${unitTypeId}`
          : "/api/unit-types";
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
          ? "Birim tipi başarıyla güncellendi"
          : "Birim tipi başarıyla oluşturuldu"
      );
      setOpen(false);
      form.reset();
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : mode === "edit"
            ? "Birim tipi güncellenemedi"
            : "Birim tipi oluşturulamadı"
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
            {mode === "edit" ? "Birim Tipi Düzenle" : "Yeni Birim Tipi"}
          </SheetTitle>
          <SheetDescription>
            {mode === "edit"
              ? "Birim tipi bilgilerini güncelleyin."
              : "Yeni bir birim tipi oluşturun. Tüm alanları doldurun."}
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
                      placeholder="DIRECTORATE"
                      {...field}
                      onChange={(e) => {
                        field.onChange(e.target.value.toUpperCase());
                      }}
                    />
                  </FormControl>
                  <FormDescription>
                    Teknik kod (otomatik büyük harfe çevrilir)
                  </FormDescription>
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
                    <Input placeholder="Direktörlük" {...field} />
                  </FormControl>
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
                      placeholder="Birim tipi açıklaması"
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
                      Bu birim tipi kullanılabilir olsun mu?
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

