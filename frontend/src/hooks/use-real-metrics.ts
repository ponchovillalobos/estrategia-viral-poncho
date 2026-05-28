"use client";

import { useCallback, useEffect, useState } from "react";
import type { PlatformKey } from "@/lib/platforms";

/**
 * Hook que expone métricas reales del creador, persistidas en server
 * (C:\hermes-data\metrics.json vía /api/metrics).
 *
 * Migración one-shot desde localStorage: la primera vez que se hidrata, si
 * `viral_real_metrics_v1` existe en localStorage y el server está vacío,
 * empuja todo al server y borra la key local.
 */

const LEGACY_KEY = "viral_real_metrics_v1";
const LEGACY_KEY_OLDER = "hermes_real_metrics_v1";

export interface RealEntry {
  id: string;
  /** ID del proyecto editado (opcional — manual entries no lo tienen) */
  projectId?: string;
  platform: PlatformKey;
  day: number;
  date?: string;
  postedAt?: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  follows?: number;
  saves?: number;
  avgWatchTime?: number;
  duration?: number;
  retention3s?: number;
  notes?: string;
  createdAt: string;
}

export type Store = Record<PlatformKey, RealEntry[]>;

const EMPTY: Store = {
  tiktok: [],
  instagram: [],
  linkedin: [],
  facebook: [],
};

function emptyStore(): Store {
  return {
    tiktok: [],
    instagram: [],
    linkedin: [],
    facebook: [],
  };
}

function groupByPlatform(entries: RealEntry[]): Store {
  const next: Store = emptyStore();
  for (const e of entries) {
    next[e.platform].push(e);
  }
  for (const k of Object.keys(next) as PlatformKey[]) {
    next[k].sort((a, b) => a.day - b.day);
  }
  return next;
}

async function fetchAll(): Promise<RealEntry[]> {
  const res = await fetch("/api/metrics");
  if (!res.ok) return [];
  const data = await res.json();
  return (data.entries ?? []) as RealEntry[];
}

function readLegacy(): RealEntry[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw =
      window.localStorage.getItem(LEGACY_KEY) ??
      window.localStorage.getItem(LEGACY_KEY_OLDER);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Store>;
    const all: RealEntry[] = [
      ...(parsed.tiktok ?? []),
      ...(parsed.instagram ?? []),
      ...(parsed.linkedin ?? []),
      ...(parsed.facebook ?? []),
    ];
    return all;
  } catch {
    return null;
  }
}

function clearLegacy() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(LEGACY_KEY);
  window.localStorage.removeItem(LEGACY_KEY_OLDER);
}

export function useRealMetrics() {
  const [store, setStore] = useState<Store>(EMPTY);
  const [hydrated, setHydrated] = useState(false);

  const refresh = useCallback(async () => {
    const entries = await fetchAll();
    setStore(groupByPlatform(entries));
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const entries = await fetchAll();
      // Migración one-shot: si el server está vacío pero localStorage tiene datos
      if (entries.length === 0) {
        const legacy = readLegacy();
        if (legacy && legacy.length > 0) {
          try {
            await fetch("/api/metrics", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ bulk: legacy }),
            });
            clearLegacy();
            const reloaded = await fetchAll();
            if (!cancelled) {
              setStore(groupByPlatform(reloaded));
              setHydrated(true);
              return;
            }
          } catch {
            // si falla la migración, deja el localStorage por si lo intentamos de nuevo
          }
        }
      }
      if (!cancelled) {
        setStore(groupByPlatform(entries));
        setHydrated(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const addEntry = useCallback(
    async (entry: Omit<RealEntry, "id" | "createdAt">) => {
      try {
        const res = await fetch("/api/metrics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(entry),
        });
        if (res.ok) {
          await refresh();
        }
      } catch (err) {
        console.error("addEntry falló:", err);
      }
    },
    [refresh]
  );

  const removeEntry = useCallback(
    async (_platform: PlatformKey, id: string) => {
      try {
        await fetch(`/api/metrics/${encodeURIComponent(id)}`, { method: "DELETE" });
        await refresh();
      } catch (err) {
        console.error("removeEntry falló:", err);
      }
    },
    [refresh]
  );

  const clearPlatform = useCallback(
    async (platform: PlatformKey) => {
      const toDelete = store[platform];
      await Promise.all(
        toDelete.map((e) =>
          fetch(`/api/metrics/${encodeURIComponent(e.id)}`, { method: "DELETE" })
        )
      );
      await refresh();
    },
    [store, refresh]
  );

  const clearAll = useCallback(async () => {
    const all = Object.values(store).flat();
    await Promise.all(
      all.map((e) =>
        fetch(`/api/metrics/${encodeURIComponent(e.id)}`, { method: "DELETE" })
      )
    );
    await refresh();
  }, [store, refresh]);

  const importStore = useCallback(
    async (incoming: Store) => {
      const flat = Object.values(incoming).flat();
      await fetch("/api/metrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bulk: flat }),
      });
      await refresh();
    },
    [refresh]
  );

  return {
    store,
    hydrated,
    addEntry,
    removeEntry,
    clearPlatform,
    clearAll,
    importStore,
    refresh,
  };
}

export function hasRealData(store: Store, platform: PlatformKey): boolean {
  return store[platform].length > 0;
}
