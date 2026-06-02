// Merkezi saat dilimi yardımcıları.
//
// Kural: Veritabanında her zaman GERÇEK UTC instant saklanır; formdan gelen
// datetime-local değerleri (kullanıcının gördüğü Türkiye duvar saati) sınırda
// UTC'ye çevrilir, ekrana/PDF'e basılırken tekrar Türkiye saatine çevrilir.
//
// Türkiye 2016'dan beri sabit UTC+3 (yaz saati yok). Depolama tarafında kod
// tabanının mevcut konvansiyonu olan sabit "+03:00" eklemesini kullanıyoruz;
// gösterim tarafında Intl ile Europe/Istanbul'a çeviriyoruz (DST'ye karşı da
// doğru kalır). Bir gün DST geri gelirse tek değiştirilecek yer burası.

export const APP_TZ = "Europe/Istanbul";
export const APP_UTC_OFFSET = "+03:00";

/** Bir UTC instant'ı Europe/Istanbul duvar-saati parçalarına böler. */
function partsInIstanbul(
  value: string | Date,
): { year: string; month: string; day: string; hour: string; minute: string } | null {
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return null;
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const o: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) o[p.type] = p.value;
  return { year: o.year, month: o.month, day: o.day, hour: o.hour, minute: o.minute };
}

/**
 * datetime-local girdisini ("YYYY-MM-DDTHH:mm", Türkiye duvar saati) Postgres
 * timestamptz olarak saklanacak offset'li string'e çevirir.
 * Örn: "2026-06-02T09:30" -> "2026-06-02T09:30:00+03:00" (= 06:30Z).
 * Boş/None girdide null döner.
 */
export function istanbulInputToTimestamptz(local?: string | null): string | null {
  if (!local) return null;
  const withSeconds = /T\d{2}:\d{2}$/.test(local) ? `${local}:00` : local;
  return `${withSeconds}${APP_UTC_OFFSET}`;
}

/**
 * Saklanan UTC instant'ı datetime-local input değerine ("YYYY-MM-DDTHH:mm",
 * Türkiye duvar saati) çevirir. Düzenleme (edit) formu prefill'i için.
 */
export function utcToIstanbulInput(value?: string | Date | null): string {
  if (!value) return "";
  const p = partsInIstanbul(value);
  if (!p) return "";
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

/**
 * Saklanan UTC instant'ı Türkiye saatiyle "dd/MM/yyyy HH:mm" olarak biçimlendirir.
 * (Sunucuda üretilen PDF'ler için — date-fns format'ın aksine runtime tz'ine bağlı değildir.)
 */
export function formatTrDateTime(value?: string | Date | null): string {
  if (!value) return "";
  const p = partsInIstanbul(value);
  if (!p) return "";
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

/**
 * Saklanan UTC instant'ı Türkiye saatiyle yalnızca tarih olarak biçimlendirir.
 * sep ile "dd/MM/yyyy" veya "dd.MM.yyyy" üretilir.
 * NOT: Yalnızca timestamptz alanlar için kullanın. Gerçek `date` kolonları
 * (saat bileşeni yok) zaten saat dilimsizdir; onları bu fonksiyondan geçirmeyin.
 */
export function formatTrDate(value?: string | Date | null, sep: "/" | "." = "/"): string {
  if (!value) return "";
  const p = partsInIstanbul(value);
  if (!p) return "";
  return `${p.day}${sep}${p.month}${sep}${p.year}`;
}
