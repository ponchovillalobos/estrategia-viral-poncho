"use client";

/**
 * Onboarding de primera vez ("tour de bienvenida").
 *
 * Cómo decide abrirse (sin estorbar jamás):
 *   - En el primer render revisa localStorage["viral.onboarding.v1"].
 *   - Si NO existe el flag → pide /api/videos/list; si hay 0 videos activos,
 *     abre el modal. Si el fetch falla por lo que sea, NO se abre.
 *   - Al cerrarse por CUALQUIER vía (X, "Saltar el tour", Escape, click en el
 *     fondo, "Explorar la app primero" o "Subir mi primer video") se guarda
 *     el flag "done" para no volver a aparecer solo.
 *
 * Re-apertura manual: el link "Ver el tour otra vez" (OnboardingTourLink, al
 * pie de la home) borra el flag y dispara el CustomEvent "open-onboarding",
 * que este modal escucha. Así la page puede seguir siendo server component.
 *
 * Accesibilidad: Escape cierra, el foco inicial cae en el botón principal de
 * cada pantalla y Tab queda atrapado dentro del modal mientras está abierto.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Wand2, Sparkles, ArrowRight, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

const STORAGE_KEY = "viral.onboarding.v1";
const OPEN_EVENT = "open-onboarding";
const TOTAL_STEPS = 3;

/* ------------------------------------------------------------------ */
/* Mini-tarjeta 9:16 puro CSS: simula un short con subtítulos kinéticos */
/* ------------------------------------------------------------------ */

function MiniShortCard({
  gradient,
  accent,
  delay,
}: {
  gradient: string;
  accent: string;
  delay: string;
}) {
  return (
    <div
      aria-hidden
      className={`relative aspect-[9/16] w-16 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-gradient-to-b shadow-lg sm:w-20 ${gradient}`}
    >
      {/* "Cara" del que habla: círculo difuminado arriba */}
      <div className="absolute left-1/2 top-3 h-5 w-5 -translate-x-1/2 rounded-full bg-white/15 blur-[1px]" />
      <div className="absolute left-1/2 top-7 h-4 w-8 -translate-x-1/2 rounded-t-full bg-white/10 blur-[1px]" />
      {/* Barritas que simulan subtítulos kinéticos (la del medio "salta") */}
      <div className="absolute inset-x-0 bottom-3 flex flex-col items-center gap-1 px-2">
        <span className="h-1.5 w-9 rounded-full bg-white/35" />
        <span
          className={`h-2 w-11 animate-pulse rounded-full shadow-sm ${accent}`}
          style={{ animationDelay: delay }}
        />
        <span className="h-1.5 w-7 rounded-full bg-white/25" />
      </div>
      {/* Brillito de "viral" en la esquina */}
      <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-white/60" style={{ animationDelay: delay }} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Pantallas                                                            */
/* ------------------------------------------------------------------ */

const STEPS_SCREEN_2 = [
  { icon: Upload, title: "1. Sube tu video hablado" },
  { icon: Wand2, title: "2. Elige un estilo" },
  {
    icon: Sparkles,
    title: "3. En minutos tienes tu short con subtítulos, música y descripción lista",
  },
] as const;

export function OnboardingModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  const primaryBtnRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, "done");
    } catch {
      /* localStorage bloqueado: ni modo, igual cerramos */
    }
    setOpen(false);
  }, []);

  // Apertura automática SOLO la primera vez y SOLO si no hay videos aún.
  useEffect(() => {
    let cancelled = false;
    try {
      if (localStorage.getItem(STORAGE_KEY) !== null) return;
    } catch {
      return; // sin localStorage no podemos recordar el cierre → no estorbar
    }
    fetch("/api/videos/list")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        const count = typeof data.activeCount === "number"
          ? data.activeCount
          : Array.isArray(data.videos)
            ? data.videos.length
            : null;
        if (count === 0) {
          setStep(0);
          setOpen(true);
        }
      })
      .catch(() => {
        /* si falla el fetch, nunca abrimos: el tour jamás debe estorbar */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-apertura manual vía CustomEvent (link "Ver el tour otra vez").
  useEffect(() => {
    const onOpen = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(OPEN_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_EVENT, onOpen);
  }, []);

  // Escape cierra + trampa de Tab dentro del modal.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "Tab" && panelRef.current) {
        const focusables = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], [tabindex]:not([tabindex="-1"])'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        const active = document.activeElement;
        if (e.shiftKey && (active === first || !panelRef.current.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKeyDown);
    // Bloquear el scroll del fondo mientras el tour está abierto.
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, close]);

  // Foco inicial en el botón principal de cada pantalla.
  useEffect(() => {
    if (open) primaryBtnRef.current?.focus();
  }, [open, step]);

  if (!open) return null;

  const goToWizard = () => {
    close();
    router.push("/editor/wizard");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      {/* Fondo oscurecido: click fuera = cerrar (nunca estorbar) */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={close}
        aria-hidden
      />

      <div
        ref={panelRef}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-2xl shadow-primary/10 sm:p-8"
      >
        {/* Resplandor sutil, mismo lenguaje visual que el hero de la home */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-48 w-72 -translate-x-1/2 rounded-full bg-primary/20 opacity-60 blur-3xl"
        />

        {/* X siempre visible */}
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar el tour"
          className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>

        {/* ---------- Pantalla 1: Bienvenida ---------- */}
        {step === 0 && (
          <div className="space-y-5 text-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/brand/viralito-192.png"
              alt="Viralito"
              className="mx-auto h-16 w-16 rounded-2xl shadow-[0_0_30px_rgba(250,60,141,0.35)]"
            />
            <h2 id="onboarding-title" className="text-2xl font-semibold tracking-tight">
              Bienvenido a <span className="text-brand-gradient">Viralito</span> 👋
            </h2>
            <p className="text-muted-foreground">
              Esta app convierte tus videos en shorts virales. Tú subes, ella edita.
            </p>
            <div className="flex items-end justify-center gap-3 py-2">
              <MiniShortCard
                gradient="from-violet-600/80 to-indigo-900/90"
                accent="bg-amber-300"
                delay="0s"
              />
              <MiniShortCard
                gradient="from-sky-600/80 to-blue-900/90"
                accent="bg-[#fa3c8d]"
                delay="0.3s"
              />
              <MiniShortCard
                gradient="from-rose-600/80 to-fuchsia-900/90"
                accent="bg-cyan-300"
                delay="0.6s"
              />
            </div>
          </div>
        )}

        {/* ---------- Pantalla 2: Así funciona ---------- */}
        {step === 1 && (
          <div className="space-y-5">
            <h2 id="onboarding-title" className="text-center text-2xl font-semibold tracking-tight">
              Así funciona
            </h2>
            <ul className="space-y-4">
              {STEPS_SCREEN_2.map(({ icon: Icon, title }) => (
                <li key={title} className="flex items-center gap-4">
                  <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/25 to-primary/5 text-primary ring-1 ring-primary/30">
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="text-sm font-medium">{title}</span>
                </li>
              ))}
            </ul>
            <p className="text-center text-xs text-muted-foreground">
              🔒 Todo pasa en tu compu. Nada se sube a internet.
            </p>
          </div>
        )}

        {/* ---------- Pantalla 3: ¡A crear! ---------- */}
        {step === 2 && (
          <div className="space-y-5 text-center">
            <h2 id="onboarding-title" className="text-2xl font-semibold tracking-tight">
              ¡Vamos a crear tu primer short!
            </h2>
            <p className="text-muted-foreground">
              En unos minutos vas a tener tu primer video listo para tus redes.
            </p>
            <div className="space-y-2 pt-1">
              <Button
                ref={primaryBtnRef}
                onClick={goToWizard}
                className="h-12 w-full text-base shadow-lg shadow-primary/25"
              >
                <Upload className="h-5 w-5" />
                Subir mi primer video
              </Button>
              <Button variant="ghost" onClick={close} className="h-10 w-full text-muted-foreground">
                Explorar la app primero
              </Button>
            </div>
          </div>
        )}

        {/* ---------- Pie: dots + Siguiente / Saltar ---------- */}
        <div className="mt-6 space-y-4">
          <div className="flex items-center justify-center gap-2" aria-hidden>
            {Array.from({ length: TOTAL_STEPS }, (_, i) => (
              <span
                key={i}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === step ? "w-6 bg-primary" : "w-2 bg-muted-foreground/30"
                }`}
              />
            ))}
          </div>
          <p className="sr-only">
            Pantalla {step + 1} de {TOTAL_STEPS}
          </p>

          {step < 2 && (
            <Button
              ref={primaryBtnRef}
              onClick={() => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))}
              className="h-12 w-full text-base shadow-lg shadow-primary/25"
            >
              Siguiente
              <ArrowRight className="h-5 w-5" />
            </Button>
          )}

          <div className="text-center">
            <button
              type="button"
              onClick={close}
              className="text-xs text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              Saltar el tour
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Link discreto "Ver el tour otra vez" (para el pie de la home)        */
/* ------------------------------------------------------------------ */

export function OnboardingTourLink() {
  const reopen = () => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* sin localStorage igual abrimos el tour */
    }
    window.dispatchEvent(new CustomEvent(OPEN_EVENT));
  };
  return (
    <button
      type="button"
      onClick={reopen}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/70 underline-offset-4 transition-colors hover:text-foreground hover:underline"
    >
      <RotateCcw className="h-3 w-3" />
      Ver el tour otra vez
    </button>
  );
}
