// Helpers para cargar y copiar transcripts en la lista de producción.
//
// `loadTranscript` cachea por videoId (evita refetch). `copyTranscript` lee el cache local
// y dispara el toast/feedback. Ambas reciben los setters como callbacks para mantenerse
// puras y testeables.

import { toast } from "sonner";

export type TranscriptCache = Record<string, string>;

/**
 * Trae el transcript de un video y lo cachea. Si ya está cacheado (incluso como ""),
 * sale temprano para no pegarle a la API dos veces. Errores → quedan como "" en cache
 * para que la UI muestre el mensaje de "no hay transcripción".
 */
export async function loadTranscript(
  videoId: string,
  transcriptCache: TranscriptCache,
  setLoading: (v: boolean) => void,
  setCache: (updater: (prev: TranscriptCache) => TranscriptCache) => void
) {
  if (transcriptCache[videoId] !== undefined) return; // ya cargado
  setLoading(true);
  try {
    const res = await fetch(
      `/api/videos/transcribe?videoId=${encodeURIComponent(videoId)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const words = data.transcript?.words ?? [];
    const text = words.map((w: { word: string }) => w.word).join(" ").trim();
    setCache((prev) => ({ ...prev, [videoId]: text }));
  } catch {
    setCache((prev) => ({ ...prev, [videoId]: "" }));
  } finally {
    setLoading(false);
  }
}

/** Copia al portapapeles el transcript cacheado del video. Toast + reset de la pílula a 1.8s. */
export async function copyTranscript(
  videoId: string,
  transcriptCache: TranscriptCache,
  setCopied: (v: boolean) => void
) {
  const t = transcriptCache[videoId];
  if (!t) return;
  try {
    await navigator.clipboard.writeText(t);
    setCopied(true);
    toast.success("Transcript copiado");
    setTimeout(() => setCopied(false), 1800);
  } catch {
    toast.error("No se pudo copiar");
  }
}
