/**
 * Biblioteca de videos virales descargados (TikTok / IG Reels / YouTube Shorts).
 *
 * Store: JSON en C:\hermes-data\research-library.json
 * Archivos por item: C:\hermes-data\research\{itemId}\{itemId}.{mp4,jpg,info.json,transcript.json,metadata.json}
 *
 * El flow:
 *   1. POST /api/research/add con {url}
 *   2. createResearch({url, platform, status:"queued"}) → enqueue("research", ...)
 *   3. Worker llama python/research_download.py → yt-dlp + transcribe
 *   4. updateResearch va emitiendo status: queued → downloading → transcribing → ready (o failed)
 *   5. El usuario ve la card y puede mark userMarked / pedir adapt con Claude (F2)
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { DATA_ROOT } from "@/lib/paths";
import { writeJsonFileAtomic } from "@/lib/atomic-write";

const STORE_FILE = path.join(path.dirname(DATA_ROOT), "research-library.json");

/** Directorio donde se guardan los archivos de cada item (mp4/jpg/json) */
export const RESEARCH_DIR = path.join(path.dirname(DATA_ROOT), "research");

export type ResearchPlatform = "tiktok" | "instagram" | "youtube";

export type ResearchStatus =
  | "queued"
  | "downloading"
  | "transcribing"
  | "ready"
  | "failed";

/** Estado del usuario sobre el item — para kanban */
export type ResearchUserMark = "save" | "skip" | "ready_to_record" | "recorded";

export interface ResearchComment {
  author: string;
  text: string;
  likes: number;
  is_reply: boolean;
}

export interface ResearchMetadata {
  url: string;
  author: string;
  author_url?: string;
  title: string;
  caption: string;
  hashtags: string[];
  views: number;
  likes: number;
  comments_count: number;
  comments: ResearchComment[];
  duration: number;
  posted_at: string;
  thumbnail_url?: string;
  raw_extractor?: string;
}

export interface ResearchTranscript {
  words: { word: string; start: number; end: number; score?: number }[];
  duration: number;
  language?: string;
  model?: string;
  error?: string;
}

export interface ResearchItem {
  id: string;
  url: string;
  platform: ResearchPlatform;
  status: ResearchStatus;
  addedAt: number;
  downloadedAt?: number;
  transcribedAt?: number;
  /** Path absoluto al .mp4 descargado (cuando status="ready") */
  videoPath?: string;
  thumbnailPath?: string;
  metadata?: ResearchMetadata;
  transcript?: ResearchTranscript;
  /** Output del adapt con Claude (F2) */
  adaptedScript?: string;
  /** Hook curado por Claude (F2) */
  adaptedHook?: string;
  /** Hashtags sugeridos por Claude (F2) */
  suggestedHashtags?: string[];
  /** Análisis de la estructura del original (símil que usó Claude) */
  structureAnalysis?: string;
  /** Qué ángulo tenía el original */
  originalAngle?: string;
  /** Cómo se trasladó al nicho del creador */
  adaptedAngle?: string;
  /** Beats con función estructural — paralelos al original */
  adaptedBeats?: { label: string; function?: string; text: string; source?: string }[];
  /** Datos/citas usados en el guión — para verificación */
  adaptedSources?: { claim: string; source: string; confidence: string }[];
  /** Timestamp de la última adaptación con IA */
  adaptedAt?: number;
  /** Estado del usuario para el kanban */
  userMarked?: ResearchUserMark;
  /** Notas libres */
  notes?: string;
  /** Último error (cuando status="failed") */
  lastError?: string;
  /** Log capturado del Python worker (últimas N líneas) */
  log?: string[];
  updatedAt: number;
}

interface Store {
  items: ResearchItem[];
  version: number;
}

const EMPTY: Store = { items: [], version: 1 };

async function readStore(): Promise<Store> {
  try {
    const raw = await fs.readFile(STORE_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return {
      items: Array.isArray(parsed.items) ? parsed.items : [],
      version: parsed.version ?? 1,
    };
  } catch {
    return { ...EMPTY };
  }
}

async function writeStore(store: Store): Promise<void> {
  await writeJsonFileAtomic(STORE_FILE, store);
}

let writeLock: Promise<void> = Promise.resolve();
async function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const previous = writeLock;
  let release!: () => void;
  writeLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  try {
    await previous;
    return await fn();
  } finally {
    release();
  }
}

export async function listResearch(): Promise<ResearchItem[]> {
  const store = await readStore();
  return store.items.sort((a, b) => b.addedAt - a.addedAt);
}

export async function getResearch(id: string): Promise<ResearchItem | null> {
  const store = await readStore();
  return store.items.find((it) => it.id === id) ?? null;
}

export async function createResearch(
  item: Omit<ResearchItem, "id" | "status" | "addedAt" | "updatedAt">
): Promise<ResearchItem> {
  return withLock(async () => {
    const store = await readStore();
    const now = Date.now();
    const entry: ResearchItem = {
      ...item,
      id:
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? `r_${(crypto as { randomUUID(): string }).randomUUID().slice(0, 8)}_${now.toString(36)}`
          : `r_${now}_${Math.random().toString(36).slice(2, 8)}`,
      status: "queued",
      addedAt: now,
      updatedAt: now,
    };
    store.items.push(entry);
    await writeStore(store);
    return entry;
  });
}

export async function updateResearch(
  id: string,
  patch: Partial<ResearchItem>
): Promise<ResearchItem | null> {
  return withLock(async () => {
    const store = await readStore();
    const idx = store.items.findIndex((it) => it.id === id);
    if (idx < 0) return null;
    store.items[idx] = {
      ...store.items[idx],
      ...patch,
      updatedAt: Date.now(),
    };
    await writeStore(store);
    return store.items[idx];
  });
}

export async function deleteResearch(id: string): Promise<boolean> {
  return withLock(async () => {
    const store = await readStore();
    const before = store.items.length;
    store.items = store.items.filter((it) => it.id !== id);
    if (store.items.length !== before) {
      await writeStore(store);
      // Borrar archivos del item del disco (best-effort)
      try {
        await fs.rm(path.join(RESEARCH_DIR, id), { recursive: true, force: true });
      } catch {
        // ignore
      }
      return true;
    }
    return false;
  });
}

/** Append líneas al log del item (truncado a últimas 100 líneas). */
export async function appendResearchLog(id: string, chunk: string): Promise<void> {
  await withLock(async () => {
    const store = await readStore();
    const idx = store.items.findIndex((it) => it.id === id);
    if (idx < 0) return;
    const lines = chunk.split(/\r?\n/).filter((l) => l.trim());
    const existing = store.items[idx].log ?? [];
    const next = [...existing, ...lines];
    store.items[idx].log = next.length > 100 ? next.slice(-100) : next;
    store.items[idx].updatedAt = Date.now();
    await writeStore(store);
  });
}
