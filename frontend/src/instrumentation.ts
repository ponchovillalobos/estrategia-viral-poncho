/**
 * F4 (auditoría) — Hook de arranque de Next.js: corre UNA vez cuando el server
 * levanta. Antes, el scheduler de publicaciones programadas sólo arrancaba si
 * alguien visitaba /api/tiktok/schedule — si reiniciabas el server y no abrías
 * esa pantalla, los posts programados NUNCA se publicaban. Ahora arranca solo.
 * También dispara el barrido inicial de huérfanos/artefactos.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startSchedulerIfNeeded } = await import("@/lib/scheduled-uploads");
  startSchedulerIfNeeded();
  const { maybeSweepOrphans } = await import("@/lib/orphan-sweep");
  maybeSweepOrphans();

  // OLA 2 (#7) — PRE-CALENTADO del render-server: arrancar el proceso de larga
  // vida AHORA arma el bundle webpack (15-40s) al iniciar la app, no en el primer
  // render. Best-effort y sin await: si falla, el fallback al `npx remotion render`
  // sigue intacto. No debe bloquear ni romper el arranque de la app.
  try {
    const { warmup } = await import("@/lib/render-server-client");
    warmup();
  } catch {
    /* el pre-calentado es opcional: nunca rompe el boot */
  }
}
