"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
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
import { Loader2, CalendarIcon } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { cn } from "@/lib/utils";

const formSchema = z.object({
  employee_id: z.string().min(1, "Çalışan seçimi zorunludur"),
  position_id: z.string().min(1, "Pozisyon seçimi zorunludur"),
  start_date: z.date({ message: "Başlangıç tarihi zorunludur" }),
  end_date: z.date().optional().nullable(),
  is_primary: z.boolean(),
});

type FormValues = z.infer<typeof formSchema>;

interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  employee_no: string | null;
}

interface Position {
  id: string;
  title: string;
  job_code: string;
}

interface PositionAssignmentSheetProps {
  mode: "create" | "edit";
  assignmentId?: string;
  trigger?: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function PositionAssignmentSheet({
  mode,
  assignmentId,
  trigger,
  open: controlledOpen,
  onOpenChange: controlledOnOpenChange,
}: PositionAssignmentSheetProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [isFetching, setIsFetching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const router = useRouter();

  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : internalOpen;
  const setOpen = controlledOnOpenChange || setInternalOpen;

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      employee_id: "",
      position_id: "",
      start_date: new Date(),
      end_date: null,
      is_primary: true,
    },
  });

  // Fetch options (employees & positions)
  useEffect(() => {
    if (open) {
      fetch("/api/position-assignments/options")
        .then((res) => res.json())
        .then((response) => {
          setEmployees(response.employees || []);
          setPositions(response.positions || []);
        })
        .catch((error) => {
          console.error("Error fetching options:", error);
          toast.error("Seçenekler yüklenirken hata oluştu");
        });
    }
  }, [open]);

  // Fetch assignment data for edit mode
  useEffect(() => {
    if (open && mode === "edit" && assignmentId) {
      setIsFetching(true);
      fetch(`/api/position-assignments/${assignmentId}`)
        .then((res) => res.json())
        .then((response) => {
          const assignment = response.data;
          form.reset({
            employee_id: assignment.employee_id || "",
            position_id: assignment.position_id || "",
            start_date: assignment.start_date ? new Date(assignment.start_date) : new Date(),
            end_date: assignment.end_date ? new Date(assignment.end_date) : null,
            is_primary: assignment.is_primary ?? true,
          });
        })
        .catch((error) => {
          console.error("Error fetching assignment:", error);
          toast.error("Atama yüklenirken hata oluştu");
        })
        .finally(() => {
          setIsFetching(false);
        });
    } else if (open && mode === "create") {
      form.reset({
        employee_id: "",
        position_id: "",
        start_date: new Date(),
        end_date: null,
        is_primary: true,
      });
    }
  }, [open, mode, assignmentId, form]);

  const onSubmit = async (values: FormValues) => {
    setIsSubmitting(true);

    try {
      const url = mode === "create" ? "/api/position-assignments" : `/api/position-assignments/${assignmentId}`;
      const method = mode === "create" ? "POST" : "PATCH";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...values,
          start_date: format(values.start_date, "yyyy-MM-dd"),
          end_date: values.end_date ? format(values.end_date, "yyyy-MM-dd") : null,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Bir hata oluştu");
      }

      toast.success(mode === "create" ? "Atama oluşturuldu" : "Atama güncellendi");
      setOpen(false);
      router.refresh();
    } catch (error) {
      console.error("Error submitting assignment:", error);
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
      <SheetContent className="overflow-y-auto sm:max-w-[500px]">
        <SheetHeader>
          <SheetTitle>
            {mode === "create" ? "Yeni Pozisyon Ataması" : "Atama Düzenle"}
          </SheetTitle>
          <SheetDescription>
            {mode === "create"
              ? "Bir çalışanı pozisyona atamak için formu doldurun."
              : "Atama bilgilerini güncelleyin."}
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
              </>
            ) : (
              <>
                <FormField
                  control={form.control}
                  name="employee_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Çalışan *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Çalışan seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {employees.map((employee) => (
                            <SelectItem key={employee.id} value={employee.id}>
                              {employee.first_name} {employee.last_name}
                              {employee.employee_no && ` (${employee.employee_no})`}
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
                  name="position_id"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pozisyon *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Pozisyon seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {positions.map((position) => (
                            <SelectItem key={position.id} value={position.id}>
                              {position.job_code} - {position.title}
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
                  name="start_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Başlangıç Tarihi *</FormLabel>
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
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Bitiş Tarihi (Opsiyonel)</FormLabel>
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
                          />
                        </PopoverContent>
                      </Popover>
                      <FormDescription>
                        Boş bırakılırsa atama devam ediyor kabul edilir
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="is_primary"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={field.onChange}
                        />
                      </FormControl>
                      <div className="space-y-1 leading-none">
                        <FormLabel>Birincil Pozisyon</FormLabel>
                        <FormDescription>
                          Bu çalışanın ana pozisyonu olarak işaretle
                        </FormDescription>
                      </div>
                    </FormItem>
                  )}
                />
              </>
            )}

            <SheetFooter className="gap-2 p-0 pt-4">
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

