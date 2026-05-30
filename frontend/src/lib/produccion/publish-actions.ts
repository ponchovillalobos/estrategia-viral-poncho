// Acciones de publicación / regeneración invocadas desde la lista de producción.
//
// Cada función es async y autoexplicativa: toma el `ProjectExt` (más opts puntuales
// como provider o handle) y los setters de "busy" / "copied" como callbacks. De ese
// modo viven fuera del componente y son fáciles de testear sin renderizar React.
//
// Las toasts y el fetch se manejan acá dentro; el componente sólo provee los setters
// que controlan su estado visual y, en el caso de `regenerate`, un callback para
// recargar la lista.

import { toast } from "sonner";
import {
  pickCaptionForPlatform,
  type ProjectExt,
} from "@/components/produccion/produccion-types";

/** Copia el caption legacy del proyecto al portapapeles y dispara setCopiedId con timeout. */
export async function copyCaption(
  p: ProjectExt,
  setCopiedId: (id: string | null) => void
) {
  try {
    await navigator.clipboard.writeText(p.caption ?? "");
    setCopiedId(p.id);
    toast.success("Caption copiado");
    setTimeout(() => setCopiedId(null), 2000);
  } catch {
    toast.error("No se pudo copiar");
  }
}

/** Publica directamente a LinkedIn vía API (sin scheduling). Llama /api/linkedin/publish. */
export async function publishToLinkedIn(
  p: ProjectExt,
  setBusy: (id: string | null) => void
) {
  setBusy(p.id);
  const toastId = toast.loading(`Subiendo ${p.id} a LinkedIn…`);
  try {
    const res = await fetch("/api/linkedin/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: p.id,
        source: p.source ?? "short",
        caption: pickCaptionForPlatform(p, "linkedin"),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    toast.success("Publicado en LinkedIn ✓", { id: toastId });
  } catch (err) {
    toast.error(`LinkedIn falló: ${err instanceof Error ? err.message : String(err)}`, {
      id: toastId,
    });
  } finally {
    setBusy(null);
  }
}

/** Publica directamente a Instagram vía API. */
export async function publishToInstagram(
  p: ProjectExt,
  setBusy: (id: string | null) => void
) {
  setBusy(p.id);
  const toastId = toast.loading(`Publicando ${p.id} en Instagram…`);
  try {
    const res = await fetch("/api/instagram/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: p.id,
        source: p.source ?? "short",
        caption: pickCaptionForPlatform(p, "instagram"),
      }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
    toast.success("Publicado en Instagram ✓", { id: toastId });
  } catch (err) {
    toast.error(`Instagram falló: ${err instanceof Error ? err.message : String(err)}`, {
      id: toastId,
    });
  } finally {
    setBusy(null);
  }
}

/**
 * Bridge manual para subir a TikTok mientras esperamos approval del Content Posting API.
 *
 * Flujo:
 *   1. Copia el archivo de video (no texto, el binary) al portapapeles via PowerShell.
 *      TikTok acepta Ctrl+V en el file picker → video subido sin arrastrar.
 *   2. Abre Explorer con el archivo seleccionado por si preferís drag.
 *   3. Abre tiktok.com/upload en pestaña nueva.
 *   4. El caption queda esperando en el botón 📋 al lado del caption — lo copiás
 *      después de que cargue el video.
 */
export async function postToTikTok(
  p: ProjectExt,
  setBusy: (id: string | null) => void,
  tiktokHandle: string | null
) {
  if (!p.caption) {
    toast.error("Este proyecto no tiene caption. Generalo primero con ✨.");
    return;
  }
  setBusy(p.id);
  try {
    // 1. Archivo de video al portapapeles (vía PowerShell Set-Clipboard -Path)
    const clipRes = await fetch(
      `/api/projects/${encodeURIComponent(p.id)}/copy-file-to-clipboard`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: p.source ?? "short" }),
      }
    );
    if (!clipRes.ok) {
      const data = await clipRes.json().catch(() => ({}));
      throw new Error(data.error ?? `clipboard HTTP ${clipRes.status}`);
    }

    // 2. Abrir Explorer con el render seleccionado (fallback si Ctrl+V no funciona)
    await fetch(
      `/api/projects/${encodeURIComponent(p.id)}/reveal-render`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: p.source ?? "short" }),
      }
    );

    // 3. Abrir TikTok Upload
    window.open("https://www.tiktok.com/upload", "_blank", "noopener,noreferrer");

    const asAccount = tiktokHandle ? ` como ${tiktokHandle}` : "";
    toast.success(
      `Video copiado${asAccount}. En TikTok: click "Seleccionar video" → Ctrl+V. Luego volvé acá y tocá 📋 para copiar el caption.`,
      { duration: 9000 }
    );
  } catch (err) {
    toast.error(
      err instanceof Error ? err.message : "No se pudo preparar el upload"
    );
  } finally {
    setBusy(null);
  }
}

/** Regenera el caption con el provider dado y vuelve a cargar la lista al éxito. */
export async function regenerate(
  p: ProjectExt,
  setBusy: (id: string | null) => void,
  reload: () => void,
  provider: string = "auto"
) {
  setBusy(p.id);
  try {
    const res = await fetch(
      `/api/projects/${encodeURIComponent(p.id)}/generate-caption?provider=${provider}`,
      { method: "POST" }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? "regenerate failed");
    const usedProvider = data.copy?._provider ?? provider;
    const usedModel = data.copy?._model ?? "";
    toast.success(`Caption regenerado (${usedProvider} · ${usedModel})`);
    reload();
  } catch (err) {
    toast.error(err instanceof Error ? err.message : String(err));
  } finally {
    setBusy(null);
  }
}
