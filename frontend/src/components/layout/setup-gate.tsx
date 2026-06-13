"use client";

/**
 * Gate de PRIMER ARRANQUE (y vigilante permanente): la app NO es usable hasta
 * verificar que TODO está instalado y configurado. Antes la app abría, el usuario
 * intentaba transcribir sin los modelos listos y fallaba sin entender por qué.
 *
 * Ahora usa el diagnóstico estructurado GET /api/doctor/diagnose (creado en T3),
 * que reporta CADA pieza por separado (ffmpeg, ffprobe, python, dataRoot, modelos
 * de voz/alineación, ollama, torch y cada librería de assets):
 *
 *   - Si ok:true → entra (renderiza la UI principal) y guarda el timestamp.
 *   - Si falla algo REPARABLE (modelos de voz, assets, ollama) → corre
 *     POST /api/setup/full y muestra el overlay "Configurando…" con la lista de
 *     STAGES en vivo (polling cada 2s). Al terminar, re-diagnostica y entra.
 *   - Si falla algo NO-REPARABLE (ffmpeg/ffprobe/python/dataRoot) → pantalla de
 *     error clara que invita a reinstalar; NO muestra la UI.
 *   - Escape manual "Entrar ahora" (link discreto) para no encerrar al usuario si
 *     una descarga falla en loop — desviación intencional del spec por seguridad.
 *   - RE-VALIDACIÓN periódica (cada 10 min) en silencio: si pasó de ok→no-ok
 *     (p.ej. borraron una carpeta), dispara un toast con "Reparar ahora" SIN
 *     bloquear la UI.
 */
import { useEffect, useRef, useState } from "react";
import {
  CheckCircle2,
  AlertCircle,
  Download,
  Loader2,
  ShieldCheck,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import { toast } from "sonner";

// ── Shape de GET /api/doctor/diagnose (T3) ──────────────────────────────────────
interface CheckOk {
  ok: boolean;
  /** Solo ffmpeg/ffprobe/python: true = el binario EXISTE en disco. Distingue
   *  "falta → reinstalar" de "está pero no respondió → transitorio". */
  present?: boolean;
}
interface AssetsChecks {
  music: CheckOk;
  sfx: CheckOk;
  lottie: CheckOk;
  icons: CheckOk;
  fonts: CheckOk;
  luts: CheckOk;
}
interface DiagnoseChecks {
  dataRoot: CheckOk;
  ffmpeg: CheckOk;
  ffprobe: CheckOk;
  python: CheckOk;
  whisperModel: CheckOk;
  alignmentModel: CheckOk;
  ollama: CheckOk;
  torch: CheckOk;
  assets: AssetsChecks;
}
interface Diagnose {
  ok: boolean;
  checks: DiagnoseChecks;
}

// ── Shape de GET /api/setup/full (T4) ───────────────────────────────────────────
interface StageEvent {
  stage: string;
  status: string; // start | ok | skip | fail | fail_final
  ms?: number;
  error?: string;
}
interface SetupState {
  running: boolean;
  done: boolean;
  ok: boolean;
  lastLine: string;
  stages: StageEvent[];
}

const RELEASES_URL = "https://github.com/ponchovillalobos/viralito/releases/latest";
const LAST_OK_KEY = "viralito:lastDiagnoseOk";
const REVALIDATE_MS = 10 * 60 * 1000; // 10 minutos

/**
 * ¿Lo que falla se puede REPARAR descargando (setup_all.py)?
 * Reparable = SOLO faltan modelos de voz, assets, y/o ollama (ollama no bloquea
 * pero igual lo arregla setup). NO-reparable = falta una herramienta del sistema
 * (ffmpeg/ffprobe/python) o la carpeta de datos no se puede escribir → reinstalar.
 *
 * torch se considera reparable (setup_all reinstala torch/cuda); no es motivo de
 * "reinstala".
 */
function classify(d: Diagnose): "ok" | "repairable" | "fatal" {
  if (d.ok) return "ok";
  const c = d.checks;
  // FATAL solo si de verdad FALTA un binario del sistema (present===false) o la
  // carpeta de datos no se puede escribir. Si ffmpeg/python EXISTEN pero `-version`
  // falló (entorno enfermo, antivirus, DLL transitoria), NO encerramos al usuario en
  // "reinstala": es reparable/transitorio. Evita el falso "Necesitas reinstalar" en
  // una PC sana (riesgo de reembolso detectado en QA).
  const falta = (chk: CheckOk) => chk.present === false;
  if (!c.dataRoot.ok || falta(c.ffmpeg) || falta(c.ffprobe) || falta(c.python)) {
    return "fatal";
  }
  return "repairable";
}

export function SetupGate({ children }: { children: React.ReactNode }) {
  const [diag, setDiag] = useState<Diagnose | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const [setupLine, setSetupLine] = useState("");
  const [setupError, setSetupError] = useState("");
  const [stages, setStages] = useState<StageEvent[]>([]);
  const [bypass, setBypass] = useState(false); // escape manual si el usuario insiste
  const autoStarted = useRef(false);
  const passedGate = useRef(false); // ya entró → activa la re-validación periódica

  // ── Diagnóstico ────────────────────────────────────────────────────────────
  async function loadDiagnose(): Promise<Diagnose | null> {
    try {
      const r = await fetch("/api/doctor/diagnose", { cache: "no-store" });
      if (!r.ok) throw new Error("diagnose no ok");
      const d = (await r.json()) as Diagnose;
      setDiag(d);
      setApiDown(false);
      if (d.ok) {
        try {
          localStorage.setItem(LAST_OK_KEY, new Date().toISOString());
        } catch {}
      }
      return d;
    } catch {
      // El server recién arranca: reintenta en breve, no bloquees con error.
      setApiDown(true);
      return null;
    }
  }

  // Diagnóstico silencioso (re-validación periódica): no toca apiDown ni overlay.
  async function silentDiagnose(): Promise<Diagnose | null> {
    try {
      const r = await fetch("/api/doctor/diagnose", { cache: "no-store" });
      if (!r.ok) return null;
      const d = (await r.json()) as Diagnose;
      if (d.ok) {
        try {
          localStorage.setItem(LAST_OK_KEY, new Date().toISOString());
        } catch {}
      }
      return d;
    } catch {
      return null;
    }
  }

  // Carga inicial + reintento mientras el server arranca.
  useEffect(() => {
    let alive = true;
    (async () => {
      let d = await loadDiagnose();
      while (alive && !d) {
        await new Promise((res) => setTimeout(res, 1500));
        d = await loadDiagnose();
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const phase = diag ? classify(diag) : null;
  const ready = phase === "ok";

  // Auto-reparación cuando el diagnóstico falla por algo descargable.
  useEffect(() => {
    if (phase === "repairable" && !autoStarted.current) {
      autoStarted.current = true;
      void startSetup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── setup/full: arranca + poll de stages en vivo ─────────────────────────────
  async function startSetup() {
    setSetupError("");
    setSetupLine("Iniciando la configuración…");
    setStages([]);
    try {
      await fetch("/api/setup/full", { method: "POST" });
      const poll = async (): Promise<void> => {
        const r = await fetch("/api/setup/full", { cache: "no-store" });
        const s = (await r.json()) as SetupState;
        setSetupLine(s.lastLine || "Descargando…");
        setStages(s.stages ?? []);
        if (s.running) {
          await new Promise((res) => setTimeout(res, 2000));
          return poll();
        }
        if (s.ok) {
          setSetupLine("");
          // Re-diagnostica: si ahora ok:true → pasa el gate.
          const d = await loadDiagnose();
          if (d && !d.ok && classify(d) === "repairable") {
            // setup dijo ok pero diagnose sigue marcando reparable: permite reintentar.
            setSetupError("La configuración terminó pero aún falta algo. Puedes reintentar.");
          }
        } else {
          setSetupError(s.lastLine || "Algo falló en la configuración.");
        }
      };
      await poll();
    } catch {
      setSetupError("Error de conexión durante la configuración.");
    }
  }

  // ── RE-VALIDACIÓN periódica (silenciosa) una vez pasado el gate ──────────────
  useEffect(() => {
    if (!ready) return;
    passedGate.current = true;
    let alive = true;
    const id = setInterval(async () => {
      if (!alive) return;
      const d = await silentDiagnose();
      if (!d || d.ok) return; // sigue todo bien (o no se pudo verificar) → nada
      // Regresó a no-ok: avisa SIN bloquear. Si es fatal lo decimos distinto.
      const kind = classify(d);
      if (kind === "fatal") {
        toast.error("Viralito detectó un problema serio", {
          icon: <AlertTriangle className="h-4 w-4" />,
          description:
            "Falta un componente esencial (ffmpeg, Python o la carpeta de datos). Quizá necesites reinstalar.",
          duration: Infinity,
          action: {
            label: "Descargar",
            onClick: () => window.open(RELEASES_URL, "_blank"),
          },
        });
      } else {
        toast.warning("Algo se descompuso", {
          icon: <AlertTriangle className="h-4 w-4" />,
          description:
            "Faltan modelos o archivos que Viralito necesita. Puedo repararlo sin que pierdas tu trabajo.",
          duration: Infinity,
          action: {
            label: "Reparar ahora",
            onClick: () => {
              void fetch("/api/setup/full", { method: "POST" });
              toast.message("Reparando en segundo plano…", {
                description: "Puedes seguir trabajando; te avisamos si algo más falla.",
              });
            },
          },
        });
      }
    }, REVALIDATE_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [ready]);

  // ── Render ───────────────────────────────────────────────────────────────────
  if (ready || bypass) return <>{children}</>;

  // Pantalla NO-REPARABLE: hay que reinstalar.
  if (phase === "fatal") {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background p-4">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 -z-10"
          style={{ background: "radial-gradient(circle at 50% 35%, rgba(250,60,141,0.10), transparent 70%)" }}
        />
        <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-7 shadow-2xl">
          <div className="space-y-2 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10">
              <XCircle className="h-7 w-7 text-red-400" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">Necesitas reinstalar Viralito</h1>
            <p className="text-xs text-muted-foreground">
              Falta un componente esencial que no se puede descargar solo (como el
              motor de video o Python). Suele pasar si la instalación quedó
              incompleta o un antivirus borró archivos.
            </p>
          </div>

          <ul className="space-y-2 text-sm">
            {diag &&
              (
                [
                  ["dataRoot", "Carpeta de datos", diag.checks.dataRoot.ok],
                  ["ffmpeg", "Motor de video (ffmpeg)", diag.checks.ffmpeg.ok],
                  ["ffprobe", "Analizador de video (ffprobe)", diag.checks.ffprobe.ok],
                  ["python", "Python", diag.checks.python.ok],
                ] as const
              ).map(([id, label, ok]) => (
                <li key={id} className="flex items-center gap-2.5">
                  {ok ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  ) : (
                    <XCircle className="h-4 w-4 shrink-0 text-red-400" />
                  )}
                  <span className={ok ? "text-foreground" : "text-red-200"}>{label}</span>
                </li>
              ))}
          </ul>

          <button
            type="button"
            onClick={() => window.open(RELEASES_URL, "_blank")}
            className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Abrir página de descarga
          </button>

          <button
            type="button"
            onClick={() => setBypass(true)}
            className="w-full text-center text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Entrar de todos modos (puede fallar)
          </button>
        </div>
      </div>
    );
  }

  // Lista de assets para el desglose visual del overlay.
  const assetRows: { id: keyof AssetsChecks; label: string }[] = [
    { id: "music", label: "Música" },
    { id: "sfx", label: "Efectos de sonido" },
    { id: "lottie", label: "Animaciones" },
    { id: "icons", label: "Iconos" },
    { id: "fonts", label: "Fuentes" },
    { id: "luts", label: "Filtros de color" },
  ];

  // Pantalla "Preparando / Configurando" (carga inicial + reparable).
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background p-4">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{ background: "radial-gradient(circle at 50% 35%, rgba(250,60,141,0.12), transparent 70%)" }}
      />
      <div className="w-full max-w-md space-y-5 rounded-2xl border border-border bg-card p-7 shadow-2xl">
        <div className="space-y-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/brand/viralito-192.png"
            alt="Viralito"
            className="mx-auto h-14 w-14 rounded-2xl shadow-[0_0_28px_rgba(250,60,141,0.4)]"
          />
          <h1 className="text-xl font-semibold tracking-tight">
            Preparando <span className="text-brand-gradient">Viralito</span>
          </h1>
          <p className="text-xs text-muted-foreground">
            Verificamos que todo esté instalado y descargamos lo que falte. Una sola vez.
          </p>
        </div>

        {apiDown && !diag && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Arrancando el motor…
          </div>
        )}

        {diag && phase === "repairable" && (
          <>
            {/* Componentes descargables: modelos + assets */}
            <ul className="space-y-2">
              <li className="flex items-start gap-2.5 text-sm">
                {diag.checks.whisperModel.ok && diag.checks.alignmentModel.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <Download className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-brand-pink" />
                )}
                <span
                  className={
                    diag.checks.whisperModel.ok && diag.checks.alignmentModel.ok
                      ? "text-foreground"
                      : "text-brand-pink"
                  }
                >
                  Modelos de voz para transcribir
                </span>
              </li>
              {assetRows.map((row) => {
                const ok = diag.checks.assets[row.id]?.ok;
                return (
                  <li key={row.id} className="flex items-start gap-2.5 text-sm">
                    {ok ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                    ) : (
                      <Download className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-brand-pink" />
                    )}
                    <span className={ok ? "text-foreground" : "text-brand-pink"}>{row.label}</span>
                  </li>
                );
              })}
            </ul>

            {/* Barra + última línea + stages en vivo de setup/full */}
            <div className="space-y-2">
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                <span className="block h-full w-2/5 animate-pulse rounded-full bg-brand-gradient" />
              </span>
              <span className="block truncate font-mono-tab text-[11px] text-muted-foreground">
                {setupError || setupLine || "Preparando…"}
              </span>

              {stages.length > 0 && (
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/30 p-2">
                  {stages.map((s, i) => (
                    <li key={`${s.stage}-${i}`} className="flex items-center gap-2 text-[11px]">
                      {s.status === "ok" || s.status === "skip" ? (
                        <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-400" />
                      ) : s.status === "fail" || s.status === "fail_final" ? (
                        <AlertCircle className="h-3 w-3 shrink-0 text-red-400" />
                      ) : (
                        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-brand-pink" />
                      )}
                      <span className="truncate text-muted-foreground">
                        {s.stage}
                        {s.status === "skip" && " (ya estaba)"}
                        {(s.status === "fail" || s.status === "fail_final") && s.error
                          ? ` — ${s.error}`
                          : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <div className="flex items-start gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2.5 text-[11px] text-emerald-200">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>Todo ocurre en tu computadora. Puedes minimizar esta ventana mientras descarga.</span>
        </div>

        {setupError && (
          <button
            type="button"
            onClick={() => {
              autoStarted.current = false;
              void startSetup();
            }}
            className="h-10 w-full rounded-lg bg-primary text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            Reintentar la configuración
          </button>
        )}

        {/* Escape manual: no encerrar al usuario si una descarga falla en loop.
            Desviación intencional del spec por seguridad — link discreto. */}
        {phase === "repairable" && (
          <button
            type="button"
            onClick={() => setBypass(true)}
            className="w-full text-center text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Entrar ahora (algunas funciones esperarán a que termine la descarga)
          </button>
        )}
      </div>
    </div>
  );
}
