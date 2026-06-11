"use client";

import { useEffect, useState } from "react";
import { PartyPopper, X } from "lucide-react";

/**
 * Banner de "hay versión nueva". Consulta /api/update-check al montar y cada
 * 6 horas (la app puede quedar abierta días). Si hay update muestra una barra
 * amigable con link directo a la release; el botón cerrar guarda la versión
 * descartada en localStorage para no volver a molestar con la MISMA versión
 * (pero sí avisar cuando salga una más nueva). Si no hay update, o el
 * endpoint falla, no renderiza nada: cero ruido.
 */
interface UpdateInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  url: string;
  notes: string;
}

// Clave de localStorage donde recordamos qué versión ya descartó el usuario.
const DISMISS_KEY = "update-banner-dismissed-version";
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000; // 6 horas

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        const r = await fetch("/api/update-check", { cache: "no-store" });
        if (!r.ok || cancelled) return;
        const data = (await r.json()) as UpdateInfo;
        if (cancelled) return;
        setInfo(data);
        // Si esta versión es distinta a la que el usuario cerró antes,
        // el banner vuelve a aparecer (es una release NUEVA).
        setDismissed(localStorage.getItem(DISMISS_KEY) === data.latest);
      } catch {
        /* sin red o server arrancando; sin banner, sin error */
      }
    }

    check();
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  function dismiss() {
    if (info) localStorage.setItem(DISMISS_KEY, info.latest);
    setDismissed(true);
  }

  if (!info || !info.hasUpdate || dismissed) return null;

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pt-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3">
        <p className="flex items-center gap-2 text-sm font-medium text-sky-200">
          <PartyPopper className="h-4 w-4" />
          🎉 Hay una versión nueva (v{info.latest}) con mejoras lista para ti
        </p>
        <a
          href={info.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-sky-400 px-4 py-1.5 text-sm font-semibold text-black hover:bg-sky-300"
        >
          Descargar
        </a>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Cerrar aviso de actualización"
          className="ml-auto rounded p-1 text-sky-200/70 hover:bg-sky-500/20 hover:text-sky-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
