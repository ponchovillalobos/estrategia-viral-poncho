"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCcw } from "lucide-react";
import { toast } from "sonner";

/**
 * Trae métricas reales de LinkedIn (impresiones/reacciones/comentarios/reposts) de los
 * posts publicados desde la app y actualiza el store. Requiere analytics habilitado +
 * app aprobada por LinkedIn (ver /setup/linkedin). Recarga la página para reflejar los datos.
 */
export function LinkedInSyncButton() {
  const [syncing, setSyncing] = useState(false);

  async function sync() {
    setSyncing(true);
    const id = toast.loading("Sincronizando métricas de LinkedIn…");
    try {
      const res = await fetch("/api/linkedin/sync-metrics", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      if (data.synced > 0) {
        toast.success(`LinkedIn: ${data.synced} post(s) sincronizados ✓`, { id });
        setTimeout(() => window.location.reload(), 900);
      } else {
        toast.message(data.message ?? "Nada para sincronizar todavía", { id });
      }
    } catch (e) {
      toast.error(`Sync falló: ${e instanceof Error ? e.message : String(e)}`, { id });
    } finally {
      setSyncing(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={sync} disabled={syncing} title="Traer métricas reales de tus posts de LinkedIn">
      {syncing ? (
        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
      ) : (
        <RefreshCcw className="mr-1.5 h-3.5 w-3.5" />
      )}
      Sincronizar LinkedIn
    </Button>
  );
}
