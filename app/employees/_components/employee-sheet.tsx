"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CalendarIcon } from "lucide-react";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  first_name: z
    .string()
    .min(1, "Ad zorunludur")
    .max(50, "Ad en fazla 50 karakter olabilir")
    .transform((val) => val.trim()),
  last_name: z
    .string()
    .min(1, "Soyad zorunludur")
    .max(50, "Soyad en fazla 50 karakter olabilir")
    .transform((val) => val.trim()),
  employee_no: z
    .string()
    .max(20, "Sicil no en fazla 20 karakter olabilir")
    .transform((val) => val.trim() ? val.toUpperCase() : ""),
  email: z
    .string()
    .email("Geçerli bir email adresi girin")
    .max(100, "Email en fazla 100 karakter olabilir")
    .transform((val) => val.trim())
    .or(z.literal("")),
  phone: z
    .string()
    .max(20, "Telefon en fazla 20 karakter olabilir")
    .transform((val) => val.trim()),
  status: z.enum(["ACTIVE", "INACTIVE"]),
  hire_date: z.date().optional().nullable(),
  termination_date: z.date().optional().nullable(),
});

type FormValues = z.infer<typeof formSchema>;

interface EmployeeSheetProps {
  mode: "create" | "edit";
  employeeId?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function EmployeeSheet({
  mode,
  employeeId,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: EmployeeSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const router = useRouter();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      employee_no: "",
      email: "",
      phone: "",
      status: "ACTIVE",
      hire_date: null,
      termination_date: null,
    },
  });

  // Fetch employee data for edit mode
  useEffect(() => {
    if (open && mode === "edit" && employeeId) {
      setIsFetching(true);
      fetch(`/api/employees/${employeeId}`)
        .then((res) => res.json())
        .then((response) => {
          const employee = response.data;
          form.reset({
            first_name: employee.first_name || "",
            last_name: employee.last_name || "",
            employee_no: employee.employee_no || "",
            email: employee.email || "",
            phone: employee.phone || "",
            status: employee.status || "ACTIVE",
            hire_date: employee.hire_date ? new Date(employee.hire_date) : null,
            termination_date: employee.termination_date ? new Date(employee.termination_date) : null,
          });
        })
        .catch((error) => {
          console.error("Error fetching employee:", error);
          toast.error("Çalışan yüklenirken hata oluştu");
        })
        .finally(() => {
          setIsFetching(false);
        });
    } else if (open && mode === "create") {
      form.reset({
        first_name: "",
        last_name: "",
        employee_no: "",
        email: "",
        phone: "",
        status: "ACTIVE",
        hire_date: null,
        termination_date: null,
      });
    }
  }, [open, mode, employeeId, form]);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    try {
      const url = mode === "create" ? "/api/employees" : `/api/employees/${employeeId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          hire_date: values.hire_date ? format(values.hire_date, "yyyy-MM-dd") : null,
          termination_date: values.termination_date ? format(values.termination_date, "yyyy-MM-dd") : null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Bir hata oluştu");
      }

      toast.success(mode === "create" ? "Çalışan oluşturuldu" : "Çalışan güncellendi");
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Error submitting employee:", error);
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
            {mode === "create" ? "Yeni Çalışan Oluştur" : "Çalışan Düzenle"}
          </SheetTitle>
          <SheetDescription>
            {mode === "create"
              ? "Yeni bir çalışan oluşturmak için aşağıdaki formu doldurun."
              : "Çalışan bilgilerini güncellemek için aşağıdaki formu düzenleyin."}
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
                  name="first_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ad *</FormLabel>
                      <FormControl>
                        <Input placeholder="Örn: Ahmet" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="last_name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Soyad *</FormLabel>
                      <FormControl>
                        <Input placeholder="Örn: Yılmaz" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="employee_no"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Sicil No (Opsiyonel)</FormLabel>
                      <FormControl>
                        <Input placeholder="Örn: EMP-001" {...field} />
                      </FormControl>
                      <FormDescription>
                        Benzersiz sicil numarası (otomatik büyük harfe çevrilir)
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email (Opsiyonel)</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Örn: ahmet@rtenerji.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Telefon (Opsiyonel)</FormLabel>
                      <FormControl>
                        <Input placeholder="Örn: 0532 123 45 67" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Durum *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Durum seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="ACTIVE">Aktif</SelectItem>
                          <SelectItem value="INACTIVE">Pasif</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="hire_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>İşe Giriş Tarihi (Opsiyonel)</FormLabel>
                      <Popover>
                        <PopoverTrigger asChild>
                          <FormControl>
                            <Button
                              variant="outline"
                              className={cn(
                                "w-full pl-3 text-left font-normal",
                                !field.value && "text-muted-foreground"
                              )}
                            >
                              {field.value ? (
                                format(field.value, "PPP", { locale: tr })
                              ) : (
                                <span>Tarih seçin</span>
                              )}
                              <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                            </Button>
                          </FormControl>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0" align="start">
                          <Calendar
                            mode="single"
                            selected={field.value || undefined}
                            onSelect={field.onChange}
                            disabled={(date) =>
                              date > new Date() || date < new Date("1900-01-01")
                            }
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />


              </>
            )}

            <SheetFooter className="gap-2 pt-4 p-0">

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

