"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Circle, ArrowRight, Loader2 } from "lucide-react";
import { PUBLISHING_ENABLED } from "@/lib/app-mode";

/**
 * Checklist de primeros pasos para la home. Se tilda SOLO según el estado real:
 *   1. ¿Subiste un video?      → /api/videos/list activeCount > 0
 *   2. ¿Generaste un short?    → algún video con status.rendered
 *   3a. (publicación apagada)  → ¿pusiste tu @ para firmar? → /api/settings handles
 *   3b. (publicación prendida) → ¿conectaste una red? → linkedin/instagram con token
 * Orienta a un principiante sobre qué hacer y en qué orden, sin asumir que ya sabe el flujo.
 */
interface Step {
  done: boolean;
  title: string;
  desc: string;
  href: string;
  cta: string;
  /** Si es true, en vez de navegar abre el diálogo de Configuración (evento que escucha TabNav). */
  opensSettings?: boolean;
}

export function GettingStarted() {
  const [steps, setSteps] = useState<Step[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let hasVideo = false;
      let hasRender = false;
      let hasNetwork = false;
      let hasHandle = false;
      try {
        const [vRes, sRes] = await Promise.all([
          fetch("/api/videos/list").then((r) => r.json()).catch(() => null),
          fetch("/api/settings").then((r) => r.json()).catch(() => null),
        ]);
        if (vRes) {
          hasVideo = (vRes.activeCount ?? 0) > 0;
          hasRender = Array.isArray(vRes.videos) && vRes.videos.some((v: { status?: { rendered?: boolean } }) => v.status?.rendered);
        }
        if (sRes) {
          const h = sRes.handles ?? {};
          hasHandle = Boolean(h.instagram || h.tiktok || h.linkedin || h.facebook);
          // Tokens solo importan cuando la publicación automática está prendida.
          if (PUBLISHING_ENABLED) {
            hasNetwork = Boolean(
              sRes.linkedin?.hasAccessToken ||
                sRes.instagram?.hasAccessToken ||
                sRes.tiktok?.hasAccessToken
            );
          }
        }
      } catch {
        /* si falla, mostramos todo sin tildar — sigue siendo útil como guía */
      }
      if (cancelled) return;
      const thirdStep: Step = PUBLISHING_ENABLED
        ? {
            done: hasNetwork,
            title: "Conecta una red y publica",
            desc: "Conecta Instagram o LinkedIn una sola vez para publicar con un clic.",
            href: "/setup/linkedin",
            cta: "Conectar una red",
          }
        : {
            done: hasHandle,
            title: "Pon tu @ para firmar tus videos",
            desc: "Escribe tu usuario de Instagram o TikTok en Configuración y todos tus videos saldrán con tu firma.",
            href: "/",
            cta: "Poner mi @",
            opensSettings: true,
          };
      setSteps([
        {
          done: hasVideo,
          title: "Sube tu primer video",
          desc: "Desde tu computadora. Es el material que vamos a convertir en short.",
          href: "/editor",
          cta: "Subir un video",
        },
        {
          done: hasRender,
          title: "Genera tu primer short",
          desc: "Elige un estilo y deja que se arme solo. En minutos tienes el video listo.",
          href: "/editor",
          cta: "Crear un video",
        },
        thirdStep,
      ]);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!steps) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando tus primeros pasos…
      </div>
    );
  }

  const doneCount = steps.filter((s) => s.done).length;

  const rowClass =
    "group flex w-full items-center gap-3 rounded-lg border border-border/60 bg-background/40 p-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40";

  const rowContent = (s: Step, i: number) => (
    <>
      {s.done ? (
        <CheckCircle2 className="h-5 w-5 shrink-0 text-primary" />
      ) : (
        <Circle className="h-5 w-5 shrink-0 text-muted-foreground" />
      )}
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${s.done ? "text-muted-foreground line-through" : "text-foreground"}`}>
          {i + 1}. {s.title}
        </p>
        {!s.done && <p className="text-xs text-muted-foreground">{s.desc}</p>}
      </div>
      {!s.done && (
        <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity group-hover:opacity-100">
          {s.cta} <ArrowRight className="h-3.5 w-3.5" />
        </span>
      )}
    </>
  );

  return (
    <section className="rounded-xl border border-border bg-card p-6">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-lg font-semibold">Empieza aquí</h2>
        <span className="text-xs text-muted-foreground">{doneCount} de {steps.length} listo</span>
      </div>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i}>
            {s.opensSettings ? (
              <button
                type="button"
                onClick={() => window.dispatchEvent(new CustomEvent("open-settings"))}
                className={rowClass}
              >
                {rowContent(s, i)}
              </button>
            ) : (
              <Link href={s.href} className={rowClass}>
                {rowContent(s, i)}
              </Link>
            )}
          </li>
        ))}
      </ol>
    </section>
  );
}
