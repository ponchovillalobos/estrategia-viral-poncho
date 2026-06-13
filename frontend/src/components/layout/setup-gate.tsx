"use client";

/**
 * Gate de PRIMER ARRANQUE: la app NO es usable hasta verificar que todo está
 * instalado y configurado. Antes la app abría, el usuario intentaba transcribir
 * sin los modelos listos y fallaba sin entender por qué. Ahora:
 *   - Verifica /api/doctor (componentes críticos + modelos de voz).
 *   - Si faltan los modelos, los descarga SOLA (con progreso visible) vía /api/setup/full.
 *   - Bloquea TODO (pantalla completa) hasta que esté listo.
 *   - Solo deja entrar cuando los críticos están OK y los modelos descargados.
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Download, Loader2, ShieldCheck } from "lucide-react";

interface DoctorCheck {
  id: string;
  label: string;
  ok: boolean;
  critical?: boolean;
  fix?: string;
}
interface Doctor {
  ok: boolean;
  modelReady: boolean;
  checks: DoctorCheck[];
}
interface SetupState {
  running: boolean;
  done: boolean;
  ok: boolean;
  lastLine: string;
}

export function SetupGate({ children }: { children: React.ReactNode }) {
  const [doctor, setDoctor] = useState<Doctor | null>(null);
  const [apiDown, setApiDown] = useState(false);
  const [setupLine, setSetupLine] = useState("");
  const [setupError, setSetupError] = useState("");
  const [bypass, setBypass] = useState(false); // escape manual si el usuario insiste
  const autoStarted = useRef(false);

  async function loadDoctor(): Promise<Doctor | null> {
    try {
      const r = await fetch("/api/doctor", { cache: "no-store" });
      if (!r.ok) throw new Error("doctor no ok");
      const d = (await r.json()) as Doctor;
      setDoctor(d);
      setApiDown(false);
      return d;
    } catch {
      // El server recién arranca: reintenta en breve, no bloquees con error.
      setApiDown(true);
      return null;
    }
  }

  // Carga inicial + reintento mientras el server arranca.
  useEffect(() => {
    let alive = true;
    (async () => {
      let d = await loadDoctor();
      while (alive && !d) {
        await new Promise((res) => setTimeout(res, 1500));
        d = await loadDoctor();
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const criticalChecks = doctor?.checks.filter((c) => c.critical) ?? [];
  const criticalOk = criticalChecks.length > 0 && criticalChecks.every((c) => c.ok);
  const modelReady = doctor?.modelReady ?? false;
  const ready = criticalOk && modelReady;

  // Auto-descarga de modelos cuando los críticos están OK pero faltan modelos.
  useEffect(() => {
    if (doctor && criticalOk && !modelReady && !autoStarted.current) {
      autoStarted.current = true;
      void startSetup();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doctor, criticalOk, modelReady]);

  async function startSetup() {
    setSetupError("");
    setSetupLine("Iniciando la descarga de los modelos…");
    try {
      await fetch("/api/setup/full", { method: "POST" });
      const poll = async (): Promise<void> => {
        const r = await fetch("/api/setup/full", { cache: "no-store" });
        const s = (await r.json()) as SetupState;
        setSetupLine(s.lastLine || "Descargando…");
        if (s.running) {
          await new Promise((res) => setTimeout(res, 2000));
          return poll();
        }
        if (s.ok) {
          setSetupLine("");
          await loadDoctor(); // re-verifica → modelReady=true → pasa el gate
        } else {
          setSetupError(s.lastLine || "Algo falló en la descarga.");
        }
      };
      await poll();
    } catch {
      setSetupError("Error de conexión durante la descarga.");
    }
  }

  if (ready || bypass) return <>{children}</>;

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
            Es la primera vez: verificamos que todo esté instalado. Una sola vez.
          </p>
        </div>

        {apiDown && !doctor && (
          <div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Arrancando el motor…
          </div>
        )}

        {doctor && (
          <ul className="space-y-2">
            {criticalChecks.map((c) => (
              <li key={c.id} className="flex items-start gap-2.5 text-sm">
                {c.ok ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : (
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-amber-400" />
                )}
                <span className="min-w-0">
                  <span className={c.ok ? "text-foreground" : "text-amber-200"}>{c.label}</span>
                  {!c.ok && c.fix && (
                    <span className="block text-[11px] text-muted-foreground">{c.fix}</span>
                  )}
                </span>
              </li>
            ))}
            {/* Modelos de voz */}
            <li className="flex items-start gap-2.5 text-sm">
              {modelReady ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
              ) : (
                <Download className="mt-0.5 h-4 w-4 shrink-0 animate-pulse text-brand-pink" />
              )}
              <span className="min-w-0 flex-1">
                <span className={modelReady ? "text-foreground" : "text-brand-pink"}>
                  Modelos de voz para transcribir
                </span>
                {!modelReady && (
                  <span className="mt-1 block">
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-muted">
                      <span className="block h-full w-2/5 animate-pulse rounded-full bg-brand-gradient" />
                    </span>
                    <span className="mt-1 block truncate font-mono-tab text-[11px] text-muted-foreground">
                      {setupError || setupLine || "Preparando…"}
                    </span>
                  </span>
                )}
              </span>
            </li>
          </ul>
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
            Reintentar la descarga
          </button>
        )}

        {/* Escape: si los críticos están OK, deja entrar (la transcripción
            esperará a que terminen los modelos). No hard-lock. */}
        {criticalOk && !modelReady && (
          <button
            type="button"
            onClick={() => setBypass(true)}
            className="w-full text-center text-[11px] text-muted-foreground underline hover:text-foreground"
          >
            Entrar ahora (la transcripción esperará a que terminen los modelos)
          </button>
        )}
      </div>
    </div>
  );
}
