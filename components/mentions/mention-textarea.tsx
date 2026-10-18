"use client";

import { useId, useMemo, useRef, useState, type ComponentProps, type KeyboardEvent } from "react";
import { AtSign, Bell } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useMentionCandidates } from "@/hooks/use-mention-candidates";
import {
  extractMentionedIds,
  filterMentionCandidates,
  findActiveMentionQuery,
  formatMentionToken,
  MAX_MENTIONS_PER_NOTE,
  type MentionCandidate,
} from "@/lib/workflow/mentions-shared";

// @mention'lı not kutusu: "@" yazınca bu talebi görebilen kişiler listelenir; seçilen
// kişi metne "@Ad Soyad" olarak eklenir. Düz metin kalır (PDF/e-posta/log düz metin).
// Kimin anıldığı gönderimde nottan çıkarılır (extractMentionedIds) — burada ayrı bir
// seçim state'i tutulmaz. Altında kime bildirim gideceği canlı gösterilir.

interface MentionTextareaProps
  extends Omit<ComponentProps<"textarea">, "value" | "onChange" | "defaultValue"> {
  value: string;
  onChange: (value: string) => void;
  requestId: string | null | undefined;
  /** false → düz not kutusu: öneri listesi yok, aday isteği atılmaz */
  mentionsEnabled?: boolean;
}

export function MentionTextarea({
  value,
  onChange,
  requestId,
  mentionsEnabled = true,
  className,
  onKeyDown,
  ...textareaProps
}: MentionTextareaProps) {
  const listId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [query, setQuery] = useState<{ start: number; query: string } | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Aday listesi yalnız anma kullanılınca istenir
  const { candidates, loading, error } = useMentionCandidates(
    requestId,
    mentionsEnabled && (query !== null || value.includes("@"))
  );

  const suggestions = useMemo(
    () => (query ? filterMentionCandidates(candidates, query.query) : []),
    [candidates, query]
  );

  const mentioned = useMemo(() => {
    if (!mentionsEnabled) return [];
    const ids = new Set(extractMentionedIds(value, candidates));
    return candidates.filter((c) => ids.has(c.id));
  }, [mentionsEnabled, value, candidates]);

  // Sorgu boşlukla bitiyor ve eşleşme yoksa (ör. seçimden hemen sonra) liste kapanır
  const showStatus =
    query !== null && suggestions.length === 0 && !query.query.endsWith(" ");
  const open = mentionsEnabled && query !== null && (suggestions.length > 0 || showStatus);

  function syncQuery(el: HTMLTextAreaElement) {
    if (!mentionsEnabled) return;
    const next = findActiveMentionQuery(el.value, el.selectionStart ?? el.value.length);
    setQuery((prev) => {
      if (prev?.start !== next?.start || prev?.query !== next?.query) setActiveIndex(0);
      return next;
    });
  }

  function select(candidate: MentionCandidate) {
    const el = textareaRef.current;
    if (!query || !el) return;
    const caret = el.selectionStart ?? value.length;
    const token = `${formatMentionToken(candidate.first_name, candidate.last_name)} `;
    const next = value.slice(0, query.start) + token + value.slice(caret);
    const position = query.start + token.length;
    onChange(next);
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(position, position);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (open && suggestions.length > 0) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const delta = e.key === "ArrowDown" ? 1 : -1;
        setActiveIndex((i) => (i + delta + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        select(suggestions[Math.min(activeIndex, suggestions.length - 1)]);
        return;
      }
    }
    if (open && e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation(); // pencere (Dialog) içindeyken yalnız liste kapansın
      setQuery(null);
      return;
    }
    onKeyDown?.(e);
  }

  const activeOptionId =
    open && suggestions.length > 0 ? `${listId}-option-${activeIndex}` : undefined;

  return (
    <div className="space-y-1.5">
      <Popover open={open} onOpenChange={(next) => !next && setQuery(null)}>
        <PopoverAnchor asChild>
          <div>
            <Textarea
              {...textareaProps}
              ref={textareaRef}
              value={value}
              onChange={(e) => {
                onChange(e.target.value);
                syncQuery(e.target);
              }}
              onKeyDown={handleKeyDown}
              onKeyUp={(e) => {
                if (e.key === "ArrowLeft" || e.key === "ArrowRight" || e.key === "Home" || e.key === "End") {
                  syncQuery(e.currentTarget);
                }
              }}
              onClick={(e) => syncQuery(e.currentTarget)}
              aria-autocomplete={mentionsEnabled ? "list" : undefined}
              aria-expanded={mentionsEnabled ? open : undefined}
              aria-controls={open ? listId : undefined}
              aria-activedescendant={activeOptionId}
              className={className}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          className="w-72 p-1"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
          onInteractOutside={(e) => {
            // Metin kutusuna tıklamak listeyi kapatmasın; imleç konumu yeniden değerlendirilir
            if (textareaRef.current?.contains(e.target as Node)) e.preventDefault();
          }}
        >
          {suggestions.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Anılacak kişi" className="max-h-64 overflow-y-auto">
              {suggestions.map((c, i) => (
                <li
                  key={c.id}
                  id={`${listId}-option-${i}`}
                  role="option"
                  aria-selected={i === activeIndex}
                  onMouseDown={(e) => {
                    e.preventDefault(); // odak metin kutusunda kalsın
                    select(c);
                  }}
                  onMouseEnter={() => setActiveIndex(i)}
                  className={cn(
                    "cursor-pointer rounded-sm px-2 py-1.5 text-sm",
                    i === activeIndex && "bg-accent text-accent-foreground"
                  )}
                >
                  <div className="font-medium">
                    {c.first_name} {c.last_name}
                  </div>
                  {c.position_title && (
                    <div className="truncate text-xs text-muted-foreground">{c.position_title}</div>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p id={listId} className="px-2 py-1.5 text-sm text-muted-foreground">
              {error
                ? error
                : loading
                  ? "Kişiler yükleniyor…"
                  : "Eşleşen kişi yok. Yalnız bu talebi görebilenler anılabilir."}
            </p>
          )}
        </PopoverContent>
      </Popover>

      {mentionsEnabled && (
        mentioned.length > 0 ? (
          <p
            className={cn(
              "flex items-start gap-1.5 text-xs",
              mentioned.length > MAX_MENTIONS_PER_NOTE ? "text-destructive" : "text-muted-foreground"
            )}
          >
            <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
            <span>
              {mentioned.length > MAX_MENTIONS_PER_NOTE
                ? `Bir notta en fazla ${MAX_MENTIONS_PER_NOTE} kişi anılabilir (${mentioned.length} kişi).`
                : `Bildirim gidecek: ${mentioned.map((c) => `${c.first_name} ${c.last_name}`).join(", ")}`}
            </span>
          </p>
        ) : (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <AtSign className="h-3.5 w-3.5 shrink-0" aria-hidden />
            Birini bilgilendirmek için @ yazıp listeden seçin.
          </p>
        )
      )}
    </div>
  );
}
