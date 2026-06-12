"use client";

/**
 * Muestra errores al usuario en español mexicano, humano y accionable.
 * Regla de oro: NUNCA mostrar err.message crudo, "HTTP 500", stderr ni rutas C:\.
 * El detalle técnico va a console.warn, no a la pantalla.
 *
 * Uso típico:
 *   catch (err) { toastError(err, "No se pudo guardar la configuración"); }
 *   catch (err) { toastError(err, "No se pudo crear tu video", { action: { label: "Reintentar", onClick: retry } }); }
 */

import { toast } from "sonner";
import { humanizeError } from "@/lib/humanize-error";

/** Errores de red/HTTP que humanize-error (pensado para stderr) no cubre. */
const CLIENT_RULES: { test: RegExp; message: string }[] = [
  {
    test: /failed to fetch|fetch failed|networkerror|load failed|ECONNREFUSED(?!.*11434)/i,
    message: "No hay conexión con la app. Revisa que siga abierta e intenta de nuevo.",
  },
  {
    test: /HTTP 5\d\d|status:? 5\d\d|internal server error/i,
    message: "Algo falló al procesar tu solicitud. Espera unos segundos e intenta de nuevo.",
  },
  {
    test: /HTTP 4\d\d|status:? 4\d\d/i,
    message: "La solicitud no se pudo completar. Recarga la pantalla e intenta de nuevo.",
  },
  {
    test: /abort(ed|error)?|timeout|timed out/i,
    message: "Tardó demasiado y se canceló. Intenta de nuevo; si sigue pasando, prueba con un video más corto.",
  },
  {
    test: /EPERM|EACCES|permission denied/i,
    message: "Windows bloqueó el acceso al archivo. Cierra otros programas que lo estén usando e intenta de nuevo.",
  },
];

function resolveMessage(raw: string, contexto?: string): string {
  for (const rule of CLIENT_RULES) {
    if (rule.test.test(raw)) return rule.message;
  }
  // humanize-error cubre stderr de ffmpeg/python/remotion y códigos de Node.
  const human = humanizeError(raw, contexto ?? undefined);
  return human.message;
}

export interface ToastErrorOpts {
  id?: string | number;
  action?: { label: string; onClick: () => void };
}

/**
 * @param err       lo que cayó en el catch (Error, string, data.error, unknown)
 * @param contexto  mensaje humano de la acción: "No se pudo guardar la configuración".
 *                  Se usa como título del toast; el mapeo de causas conocidas lo complementa.
 */
export function toastError(err: unknown, contexto: string, opts?: ToastErrorOpts): void {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err ?? "");
  const causa = resolveMessage(raw, contexto);
  // Si la causa mapeada es el propio contexto (no hubo match), mostramos solo el contexto.
  const esGenerico = causa === contexto;
  console.warn(`[detalle técnico] ${contexto}:`, raw);
  toast.error(contexto, {
    description: esGenerico ? undefined : causa,
    id: opts?.id,
    action: opts?.action,
  });
}

/** Para código server-side / rutas API: devuelve el par humano+técnico sin tocar toast. */
export function describeError(err: unknown, contexto: string): { message: string; technical: string } {
  const raw =
    err instanceof Error ? err.message : typeof err === "string" ? err : JSON.stringify(err ?? "");
  return { message: resolveMessage(raw, contexto), technical: raw.slice(-600) };
}
