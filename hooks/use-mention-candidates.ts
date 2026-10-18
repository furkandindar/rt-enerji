// useMentionCandidates Hook
// @mention adayları (GET /api/requests/[id]/mention-candidates): talebi zaten görebilen,
// aktif ve sistem hesabı bağlı çalışanlar. Yorum kutusu (öneri listesi) ve gönderim
// (anılanları çıkarma) aynı listeyi kullanır → talep başına tek istek, kısa süreli önbellek.
// Liste yalnız seçim kolaylığıdır; sunucu anmaları kaydederken kuralı yeniden uygular.

"use client";

import { useEffect, useState } from "react";
import { extractMentionedIds, type MentionCandidate } from "@/lib/workflow/mentions-shared";

const CACHE_TTL_MS = 5 * 60 * 1000;
const cache = new Map<string, { at: number; promise: Promise<MentionCandidate[]> }>();

function loadCandidates(requestId: string): Promise<MentionCandidate[]> {
  const hit = cache.get(requestId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.promise;

  const promise = fetch(`/api/requests/${encodeURIComponent(requestId)}/mention-candidates`).then(
    async (res) => {
      if (!res.ok) throw new Error("Kişi listesi yüklenemedi");
      return (await res.json()) as MentionCandidate[];
    }
  );
  cache.set(requestId, { at: Date.now(), promise });
  promise.catch(() => cache.delete(requestId)); // hata önbelleğe alınmaz, sonraki denemede tekrar
  return promise;
}

/**
 * Gönderim anı için: nottaki anılanların id'leri (aday listesi önbellekten / gerekirse
 * istekle). Liste alınamazsa boş döner — anma, kararı/gönderimi asla engellemez.
 */
export async function resolveMentionedIds(
  requestId: string | null | undefined,
  note: string
): Promise<string[]> {
  if (!requestId || !note.includes("@")) return [];
  try {
    return extractMentionedIds(note, await loadCandidates(requestId));
  } catch (err) {
    console.error("[mentions] candidates unavailable, sending without mentions:", err);
    return [];
  }
}

export function useMentionCandidates(requestId: string | null | undefined, enabled = true) {
  const [loaded, setLoaded] = useState<{ requestId: string; candidates: MentionCandidate[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = Boolean(requestId && enabled);

  useEffect(() => {
    if (!active || !requestId) return;
    let cancelled = false;
    loadCandidates(requestId)
      .then((candidates) => {
        if (!cancelled) {
          setLoaded({ requestId, candidates });
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Kişi listesi yüklenemedi");
      });
    return () => {
      cancelled = true;
    };
  }, [active, requestId]);

  const candidates = loaded && loaded.requestId === requestId ? loaded.candidates : [];
  return {
    candidates,
    loading: active && !error && (!loaded || loaded.requestId !== requestId),
    error,
  };
}
