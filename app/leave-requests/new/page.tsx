"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { CalendarIcon, Loader2 } from "lucide-react";
import { format, eachDayOfInterval } from "date-fns";
import { tr } from "date-fns/locale";

// Hafta sonu kontrolü (Cumartesi = 6, Pazar = 0)
const isWeekendDay = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

// Saat string'ini dakikaya çevir (09:00 -> 540)
const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// Tam iş günü = 8 saat (09:00 - 17:00 arası = 480 dakika)
const WORK_DAY_START = timeToMinutes("09:00"); // 540
const WORK_DAY_END = timeToMinutes("17:00");   // 1020
const WORK_DAY_MINUTES = WORK_DAY_END - WORK_DAY_START; // 480 dakika = 8 saat

// İş günü ve saatlerini hesapla
const calculateBusinessTime = (
  startDate: Date | undefined,
  endDate: Date | undefined,
  startTime: string,
  endTime: string
): { days: number; hours: number } => {
  if (!startDate || !endDate) return { days: 0, hours: 0 };
  if (startDate > endDate) return { days: 0, hours: 0 };

  const startMinutes = timeToMinutes(startTime);
  const endMinutes = timeToMinutes(endTime);

  // Aynı gün ise
  if (startDate.toDateString() === endDate.toDateString()) {
    const minutes = Math.max(0, endMinutes - startMinutes);
    const hours = minutes / 60;
    const days = minutes / WORK_DAY_MINUTES;
    return { days: Math.round(days * 10) / 10, hours: Math.round(hours * 10) / 10 };
  }

  // Farklı günler ise
  const allDays = eachDayOfInterval({ start: startDate, end: endDate });
  const businessDays = allDays.filter(day => !isWeekendDay(day));

  if (businessDays.length === 0) return { days: 0, hours: 0 };

  let totalMinutes = 0;

  businessDays.forEach((day, index) => {
    const isFirstDay = index === 0;
    const isLastDay = index === businessDays.length - 1;

    if (isFirstDay && isLastDay) {
      // Tek gün (aynı gün - yukarıda handle edildi ama yine de)
      totalMinutes += Math.max(0, endMinutes - startMinutes);
    } else if (isFirstDay) {
      // İlk gün: startTime'dan 17:00'ye kadar
      totalMinutes += Math.max(0, WORK_DAY_END - startMinutes);
    } else if (isLastDay) {
      // Son gün: 09:00'dan endTime'a kadar
      totalMinutes += Math.max(0, endMinutes - WORK_DAY_START);
    } else {
      // Ara günler: tam iş günü
      totalMinutes += WORK_DAY_MINUTES;
    }
  });

  const hours = totalMinutes / 60;
  const days = totalMinutes / WORK_DAY_MINUTES;

  return {
    days: Math.round(days * 10) / 10,
    hours: Math.round(hours * 10) / 10
  };
};

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

const leaveRequestSchema = z.object({
  workflow_code: z.enum(["ANNUAL_LEAVE", "SHORT_LEAVE"]),
  leave_type: z.enum(["ANNUAL_LEAVE", "SHORT_LEAVE"]),
  start_date: z.date({ error: "Başlangıç tarihi gerekli" }),
  start_time: z.string({ error: "Başlangıç saati gerekli" }),
  end_date: z.date({ error: "Bitiş tarihi gerekli" }),
  end_time: z.string({ error: "Bitiş saati gerekli" }),
  address_during_leave: z.string().optional(),
  reason: z.string().optional(),
  overtime_amount: z.number().optional(),
}).refine((data) => data.end_date >= data.start_date, {
  message: "Bitiş tarihi başlangıç tarihinden önce olamaz",
  path: ["end_date"],
});

type LeaveRequestFormValues = z.infer<typeof leaveRequestSchema>;

// Saat seçenekleri (08:00 - 18:00 arası, 30 dakika aralıklı)
const timeOptions = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00"
];

export default function NewLeaveRequestPage() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<LeaveRequestFormValues>({
    resolver: zodResolver(leaveRequestSchema),
    defaultValues: {
      workflow_code: "ANNUAL_LEAVE",
      leave_type: "ANNUAL_LEAVE",
      start_time: "09:00",
      end_time: "17:00",
      address_during_leave: "",
      reason: "",
    },
  });

  const watchStartDate = form.watch("start_date");
  const watchEndDate = form.watch("end_date");
  const watchStartTime = form.watch("start_time");
  const watchEndTime = form.watch("end_time");
  const watchLeaveType = form.watch("leave_type");

  // İş günü ve saatini hesapla (hafta sonları hariç)
  const { days: totalDays, hours: totalHours } = calculateBusinessTime(
    watchStartDate,
    watchEndDate,
    watchStartTime || "09:00",
    watchEndTime || "17:00"
  );

  // Tarih ve saati birleştir
  const combineDateAndTime = (date: Date, time: string): Date => {
    const [hours, minutes] = time.split(":").map(Number);
    const combined = new Date(date);
    combined.setHours(hours, minutes, 0, 0);
    return combined;
  };

  const onSubmit = async (data: LeaveRequestFormValues) => {
    setIsSubmitting(true);
    try {
      // Tarih ve saati birleştir
      const startDatetime = combineDateAndTime(data.start_date, data.start_time);
      const endDatetime = combineDateAndTime(data.end_date, data.end_time);

      const response = await fetch("/api/leave-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workflow_code: data.workflow_code,
          leave_type: data.leave_type,
          start_datetime: startDatetime.toISOString(),
          end_datetime: endDatetime.toISOString(),
          total_days: totalDays,
          address_during_leave: data.address_during_leave,
          reason: data.reason,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Talep oluşturulamadı");
      }

      toast.success("İzin talebi başarıyla oluşturuldu");
      router.push("/leave-requests");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Bir hata oluştu");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleLeaveTypeChange = (value: "ANNUAL_LEAVE" | "SHORT_LEAVE") => {
    form.setValue("leave_type", value);
    form.setValue("workflow_code", value);
  };

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Yeni İzin Talebi</h1>
        <p className="text-muted-foreground">İzin talebi oluşturun</p>
      </div>

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>İzin Bilgileri</CardTitle>
          <CardDescription>
            İzin talebinizin detaylarını girin
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              {/* İzin Tipi */}
              <FormField
                control={form.control}
                name="leave_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>İzin Tipi</FormLabel>
                    <Select
                      onValueChange={handleLeaveTypeChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="İzin tipi seçin" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="ANNUAL_LEAVE">Yıllık İzin</SelectItem>
                        <SelectItem value="SHORT_LEAVE">Kısa Süreli İzin</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Başlangıç Tarihi ve Saati */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="start_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Başlangıç Tarihi</FormLabel>
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
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              const today = new Date();
                              today.setHours(0, 0, 0, 0);
                              return date < today || isWeekendDay(date);
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="start_time"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Başlangıç Saati</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Saat seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {timeOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Bitiş Tarihi ve Saati */}
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="end_date"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Bitiş Tarihi</FormLabel>
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
                            selected={field.value}
                            onSelect={field.onChange}
                            disabled={(date) => {
                              const minDate = watchStartDate || new Date();
                              return date < minDate || isWeekendDay(date);
                            }}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="end_time"
                  render={({ field }) => (
                    <FormItem className="flex flex-col">
                      <FormLabel>Bitiş Saati</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Saat seçin" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {timeOptions.map((time) => (
                            <SelectItem key={time} value={time}>
                              {time}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Toplam İş Günü Bilgisi */}
              {(totalDays > 0 || totalHours > 0) && (
                <div className="rounded-lg border bg-muted/50 p-3">
                  <p className="text-sm text-muted-foreground">
                    Toplam <strong className="text-foreground">{totalDays}</strong> iş günü
                    (<strong className="text-foreground">{totalHours}</strong> saat) izin
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Hafta sonları hariç, 1 iş günü = 8 saat
                  </p>
                </div>
              )}

              {/* İzin Sırasında Adres (Sadece yıllık izin için) */}
              {watchLeaveType === "ANNUAL_LEAVE" && (
                <FormField
                  control={form.control}
                  name="address_during_leave"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>İzin Sırasında Adres</FormLabel>
                      <FormControl>
                        <Input
                          placeholder="İzin süresince bulunacağınız adres"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Açıklama */}
              <FormField
                control={form.control}
                name="reason"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Açıklama (Opsiyonel)</FormLabel>
                    <FormControl>
                      <Input placeholder="İzin nedeni" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Butonlar */}
              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => router.back()}
                >
                  İptal
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}
                  Talep Oluştur
                </Button>
              </div>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

