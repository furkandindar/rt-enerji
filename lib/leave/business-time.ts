// İzin ve Uzaktan Çalışma formlarının ortak tarih/saat yardımcıları.
// İş günü: hafta sonları hariç, 09:00–17:00 (1 iş günü = 8 saat). Resmi tatil
// takvimi sistemde yok; tatiller hesaba katılmaz.

import { eachDayOfInterval } from "date-fns";

// Hafta sonu kontrolü (Cumartesi = 6, Pazar = 0)
export const isWeekendDay = (date: Date): boolean => {
  const day = date.getDay();
  return day === 0 || day === 6;
};

// Saat string'ini dakikaya çevir (09:00 -> 540)
export const timeToMinutes = (time: string): number => {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
};

// Tam iş günü = 8 saat (09:00 - 17:00 arası = 480 dakika)
const WORK_DAY_START = timeToMinutes("09:00"); // 540
const WORK_DAY_END = timeToMinutes("17:00");   // 1020
const WORK_DAY_MINUTES = WORK_DAY_END - WORK_DAY_START; // 480 dakika = 8 saat

// İş günü ve saatlerini hesapla
export const calculateBusinessTime = (
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

// Saat seçenekleri (08:00 - 18:00 arası, 30 dakika aralıklı)
export const timeOptions = [
  "08:00", "08:30", "09:00", "09:30", "10:00", "10:30",
  "11:00", "11:30", "12:00", "12:30", "13:00", "13:30",
  "14:00", "14:30", "15:00", "15:30", "16:00", "16:30",
  "17:00", "17:30", "18:00"
];

// Tarih ve saati birleştir (tarayıcının yerel saatine göre)
export const combineDateAndTime = (date: Date, time: string): Date => {
  const [hours, minutes] = time.split(":").map(Number);
  const combined = new Date(date);
  combined.setHours(hours, minutes, 0, 0);
  return combined;
};

// Date → "HH:mm"
export const formatHourMinute = (d: Date): string =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
