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
}
