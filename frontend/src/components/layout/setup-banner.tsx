"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, Wrench, Download } from "lucide-react";

/**
 * Banner de PRIMERA VEZ / instalación rota. Consulta /api/doctor al montar:
 *  - Si falta el modelo de voz → botón «Preparar la app» (descarga única ~1.5 GB
 *    con progreso en vivo). Antes esto pasaba en silencio dentro de la primera
 *    transcripción y un timeout la mataba.
 *  - Si falta un componente crítico (python/ffmpeg/remotion/carpeta) → muestra
 *    QUÉ falta y cómo repararlo, en español.
 * Cuando todo está bien no renderiza nada (cero ruido para el 99% de sesiones).
 */
interface DoctorCheck {
  id: string;
  label: string;
  ok: boolean;
  fix?: string;
  detail?: string;
  /** El backend marca cuáles son críticos; solo esos disparan la alarma. */
  critical?: boolean;
}

export function SetupBanner() {
  const [doctor, setDoctor] = useState<{ ok: boolean; modelReady: boolean; checks: DoctorCheck[] } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [progressLine, setProgressLine] = useState("");
  const [dismissed, setDismissed] = useState(false);

  async function loadDoctor() {
    try {
      const r = await fetch("/api/doctor", { cache: "no-store" });
      if (r.ok) setDoctor(await r.json());
    } catch {
      /* el server recién arranca; sin banner */
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadDoctor();
  }, []);

  async function prepare() {
    setPreparing(true);
    setProgressLine("Iniciando descarga…");
    try {
      await fetch("/api/doctor/prepare", { method: "POST" });
      // Poll del progreso cada 2s hasta que termine.
      const poll = async (): Promise<void> => {
        const r = await fetch("/api/doctor/prepare", { cache: "no-store" });
        const s = (await r.json()) as { running: boolean; done: boolean; ok: boolean; lastLine: string };
        setProgressLine(s.lastLine || "Descargando…");
        if (s.running) {
          await new Promise((res) => setTimeout(res, 2000));
          return poll();
        }
        setPreparing(false);
        if (s.ok) {
          setProgressLine("");
          await loadDoctor();
        } else {
          setProgressLine(`No se pudo descargar: ${s.lastLine}`);
        }
      };
      await poll();
    } catch {
      setPreparing(false);
      setProgressLine("Error de conexión durante la descarga — reintenta.");
    }
  }

  if (!doctor || dismissed) return null;
  // Solo los checks CRÍTICOS disparan la alarma "necesita un arreglo". Los
  // opcionales (IA local / Ollama) e informativos (modelo de voz) NO — el
  // backend ya los marca con critical:false. Antes el banner solo excluía
  // whisper-model, así que la ausencia de Ollama (opcional) mostraba una falsa
  // alarma de "instalación rota".
  const broken = doctor.checks.filter((c) => !c.ok && c.critical);
  const needsModel = !doctor.modelReady;
  if (broken.length === 0 && !needsModel) return null;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pt-4">
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
        {broken.length > 0 ? (
          <>
            <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
              <Wrench className="h-4 w-4" />
              La instalación necesita un arreglo antes de poder editar videos
            </p>
            <ul className="mt-2 space-y-1 text-xs text-amber-100/90">
              {broken.map((c) => (
                <li key={c.id}>
                  · <strong>{c.label}</strong>: {c.fix ?? "componente faltante"}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
              <Download className="h-4 w-4" />
              Un paso más: descargar el modelo de voz (una sola vez, ~1.5 GB)
            </p>
            <button
              type="button"
              onClick={prepare}
              disabled={preparing}
              className="rounded-md bg-amber-400 px-4 py-1.5 text-sm font-semibold text-black hover:bg-amber-300 disabled:opacity-60"
            >
              {preparing ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" /> Preparando…
                </span>
              ) : (
                "Preparar la app"
              )}
            </button>
            {!preparing && (
              <button
                type="button"
                onClick={() => setDismissed(true)}
                className="text-xs text-amber-200/70 underline hover:text-amber-100"
              >
                Dejarlo para después (tu primer video tardará más porque la descarga
                arrancará en ese momento)
              </button>
            )}
            {progressLine && (
              <p className="w-full truncate font-mono-tab text-[11px] text-amber-100/80">{progressLine}</p>
            )}
          </div>
        )}
        {broken.length === 0 && !needsModel && (
          <p className="flex items-center gap-2 text-sm text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Todo listo
          </p>
        )}
      </div>
    </div>
  );
}
