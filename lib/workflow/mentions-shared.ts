// @mention — client + server ortak kurallar (sunucu bağımlılığı yok).
//
// Notlar düz metindir. Arayüz kişiyi listeden seçince metne "@Ad Soyad" ekler ve
// seçilen kişilerin id'lerini ayrıca gönderir (mentionedEmployeeIds). Sunucu kimin
// anıldığını metinden TAHMİN ETMEZ; yalnız gelen id'leri doğrular ve her birinin
// "@Ad Soyad" metninin notta gerçekten göründüğünü kontrol eder — kimse görünmeyen
// bir anma için bildirim almaz. Elle yazılmış "@İsim" bildirim üretmez.

export const MAX_MENTIONS_PER_NOTE = 10;

/** DECISION: onay/red/revize notu · REVISION_RESPONSE: talep sahibinin Revize Açıklaması */
export type MentionSource = 'DECISION' | 'REVISION_RESPONSE';

/** Notta görünen anma metni — arayüz bu biçimde ekler, sunucu bu biçimi arar. */
export function formatMentionToken(firstName: string, lastName: string): string {
  return `@${`${firstName} ${lastName}`.replace(/\s+/g, ' ').trim()}`;
}

function normalizeForMatch(value: string): string {
  return value.replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Not, kişinin "@Ad Soyad" anma metnini içeriyor mu? Boşluk/büyük-küçük harf
 * duyarsız; ardından harf/rakam gelmemeli ("@Ali Kayalı" → "Ali Kaya" eşleşmez).
 */
export function noteContainsMention(note: string, firstName: string, lastName: string): boolean {
  const token = normalizeForMatch(formatMentionToken(firstName, lastName));
  return new RegExp(`${escapeRegExp(token)}(?![\\p{L}\\p{N}])`, 'u').test(normalizeForMatch(note));
}

export interface MentionCandidate {
  id: string;
  first_name: string;
  last_name: string;
  position_title?: string | null;
}

/**
 * Notta "@Ad Soyad" olarak görünen adayların id'leri. Arayüz gönderimde anılanları
 * buradan çıkarır (ayrı seçim state'i yok): metinden silinen anma kendiliğinden düşer.
 * Not: aynı ad-soyada sahip iki aktif kullanıcı ikisi de eşleşir (2026-10 prod'da yok).
 */
export function extractMentionedIds(note: string, candidates: MentionCandidate[]): string[] {
  if (!note.includes('@')) return [];
  return candidates
    .filter((c) => noteContainsMention(note, c.first_name, c.last_name))
    .map((c) => c.id);
}

/**
 * İmlecin hemen solunda yazılmakta olan "@sorgu" (ör. "@gö", "@gözde yi").
 * "@" satır başında ya da boşluktan sonra olmalı (e-posta adresi tetiklemez);
 * sorgu harf, boşluk (satır sonu değil), nokta, kesme ve tire içerebilir; en fazla
 * 2 kelime arası boşluk.
 */
export function findActiveMentionQuery(
  text: string,
  caret: number
): { start: number; query: string } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf('@');
  if (at < 0) return null;
  if (at > 0 && !/\s/.test(before[at - 1])) return null;
  const query = before.slice(at + 1);
  if (query.length > 40 || query.startsWith(' ') || query.includes('  ')) return null;
  if (!/^[\p{L} .'-]*$/u.test(query)) return null;
  if ((query.match(/ /g) ?? []).length > 2) return null;
  return { start: at, query };
}

/**
 * "@sorgu"ya uyan adaylar: ad-soyad başı, soyad başı veya herhangi bir kelime başı.
 * Sondaki boşluk korunur: "gözde " soyada geçerken eşleşmeye devam eder, seçimden
 * sonraki "@Gözde Yiğit " ise kimseyle eşleşmez (liste kapanır).
 */
export function filterMentionCandidates(
  candidates: MentionCandidate[],
  query: string,
  limit = 6
): MentionCandidate[] {
  const q = normalizeForMatch(query.replace(/^\s+/, ''));
  const scored: Array<{ c: MentionCandidate; score: number }> = [];
  for (const c of candidates) {
    const full = normalizeForMatch(`${c.first_name} ${c.last_name}`.trim());
    const last = normalizeForMatch(c.last_name);
    let score = -1;
    if (!q || full.startsWith(q)) score = 0;
    else if (last.startsWith(q)) score = 1;
    else if (full.includes(` ${q}`)) score = 2;
    if (score >= 0) scored.push({ c, score });
  }
  return scored
    .sort((a, b) => a.score - b.score)
    .slice(0, limit)
    .map((s) => s.c);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Body'deki mentionedEmployeeIds'i biçimce doğrular (uygunluk sunucuda ayrıca kontrol edilir). */
export function parseMentionIds(
  raw: unknown
): { ok: true; ids: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, ids: [] };
  if (!Array.isArray(raw) || raw.some((v) => typeof v !== 'string' || !UUID_RE.test(v))) {
    return { ok: false, error: 'Geçersiz anma listesi' };
  }
  const ids = Array.from(new Set(raw as string[]));
  if (ids.length > MAX_MENTIONS_PER_NOTE) {
    return { ok: false, error: `Bir notta en fazla ${MAX_MENTIONS_PER_NOTE} kişi anılabilir` };
  }
  return { ok: true, ids };
}

/** Bildirim metnindeki bağlam: "… talebindeki revize notunda sizden bahsetti". */
export function mentionContextLabel(source: MentionSource, decision?: string): string {
  if (source === 'REVISION_RESPONSE') return 'revize açıklamasında';
  if (decision === 'REJECTED') return 'red gerekçesinde';
  if (decision === 'REVISION_REQUESTED') return 'revize notunda';
  return 'onay notunda';
}
