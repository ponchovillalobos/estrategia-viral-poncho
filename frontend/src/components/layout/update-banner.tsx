"use client";

import { useEffect, useState } from "react";
import { CalendarClock, PartyPopper, X } from "lucide-react";

/**
 * Banner de "hay versión nueva". Consulta /api/update-check al montar y cada
 * 6 horas (la app puede quedar abierta días). Si hay update muestra una barra
 * amigable con link directo a la release; el botón cerrar guarda la versión
 * descartada en localStorage para no volver a molestar con la MISMA versión
 * (pero sí avisar cuando salga una más nueva). Si no hay update, o el
 * endpoint falla, no renderiza nada: cero ruido.
 *
 * Licencia: junto al update-check consultamos /api/license. Si la licencia
 * está activa pero su año de actualizaciones (updatesUntil) venció ANTES de
 * la fecha de publicación del release nuevo, en vez del botón de descarga
 * mostramos un aviso para renovar. OJO: esto solo aplica si el update-check
 * trae `publishedAt` (fecha ISO del release); si el campo no viene, el banner
 * se comporta normal — nunca bloqueamos la descarga por adivinar fechas.
 * Para trial / sin licencia: banner normal con descarga.
 */
interface UpdateInfo {
  current: string;
  latest: string;
  hasUpdate: boolean;
  url: string;
  notes: string;
  /** Link directo al instalador (.exe); si falta, usamos la página del release. */
  downloadUrl?: string;
  /** Fecha de publicación del release (ISO). Hoy el endpoint NO la devuelve;
   *  si algún día la trae, la lógica de "actualizaciones vencidas" se activa sola. */
  publishedAt?: string;
}

interface LicenseInfo {
  status: "trial" | "active" | "trial_expired";
  /** YYYY-MM-DD; año ≥ 2099 = de por vida. */
  updatesUntil?: string;
}

// Clave de localStorage donde recordamos qué versión ya descartó el usuario.
const DISMISS_KEY = "update-banner-dismissed-version";
const CHECK_EVERY_MS = 6 * 60 * 60 * 1000; // 6 horas

/** "2027-03-15" → Date local al FINAL de ese día (el derecho cubre el día completo).
 *  null si el formato no es YYYY-MM-DD o si es "de por vida" (año ≥ 2099). */
function parseUpdatesUntil(updatesUntil: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(updatesUntil.trim());
  if (!m) return null;
  const year = Number(m[1]);
  if (year >= 2099) return null; // de por vida: nunca vence
  return new Date(year, Number(m[2]) - 1, Number(m[3]), 23, 59, 59, 999);
}

/** Fecha legible es-MX para el aviso de renovación. */
function formatDateMx(updatesUntil: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(updatesUntil.trim());
  if (!m) return updatesUntil;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function UpdateBanner() {
  const [info, setInfo] = useState<UpdateInfo | null>(null);
  const [license, setLicense] = useState<LicenseInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function check() {
      try {
        // Update-check y licencia en paralelo. Si la licencia falla, seguimos
        // con el banner normal (allSettled: un fallo no tumba al otro).
        const [updateRes, licenseRes] = await Promise.allSettled([
          fetch("/api/update-check", { cache: "no-store" }),
          fetch("/api/license", { cache: "no-store" }),
        ]);
        if (cancelled) return;

        if (licenseRes.status === "fulfilled" && licenseRes.value.ok) {
          try {
            const lic = (await licenseRes.value.json()) as LicenseInfo;
            if (!cancelled) setLicense(lic);
          } catch {
            /* respuesta rara: sin licencia conocida, banner normal */
          }
        }

        if (updateRes.status !== "fulfilled" || !updateRes.value.ok || cancelled) return;
        const data = (await updateRes.value.json()) as UpdateInfo;
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

  // ¿Licencia activa con actualizaciones vencidas para ESTE release?
  // Requiere los TRES datos: licencia activa, updatesUntil con vencimiento
  // real, y publishedAt del release. Si falta cualquiera → banner normal.
  let expiredUntil: string | null = null;
  if (license?.status === "active" && license.updatesUntil && info.publishedAt) {
    const until = parseUpdatesUntil(license.updatesUntil);
    const published = new Date(info.publishedAt);
    if (until && !Number.isNaN(published.getTime()) && published > until) {
      expiredUntil = license.updatesUntil;
    }
  }

  if (expiredUntil) {
    return (
      <div className="mx-auto w-full max-w-7xl px-6 pt-4">
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-amber-200">
              <CalendarClock className="h-4 w-4" />
              Hay una versión nueva, pero tu año de actualizaciones terminó el{" "}
              {formatDateMx(expiredUntil)}. Escríbenos para renovarlo.
            </p>
            <p className="mt-0.5 text-xs text-amber-200/70">
              Tu app sigue funcionando normal con tu versión actual — nada se apaga.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Cerrar aviso de actualización"
            className="ml-auto rounded p-1 text-amber-200/70 hover:bg-amber-500/20 hover:text-amber-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-6 pt-4">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-sky-500/40 bg-sky-500/10 p-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-medium text-sky-200">
            <PartyPopper className="h-4 w-4" />
            🎉 Hay una versión nueva (v{info.latest}) con mejoras lista para ti
          </p>
          <p className="mt-0.5 text-xs text-sky-200/70">
            Tus videos no se tocan — quedan fuera de la app.
          </p>
        </div>
        <a
          href={info.downloadUrl || info.url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-sky-400 px-4 py-1.5 text-sm font-semibold text-black hover:bg-sky-300"
        >
          Bajar instalador
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
