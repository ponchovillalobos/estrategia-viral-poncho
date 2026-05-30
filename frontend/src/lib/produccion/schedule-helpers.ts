// Helpers para cargar el estado de schedules (TikTok / LinkedIn / Instagram-bridge) por proyecto.
//
// Se llama desde production-list al montar y tras agendar un upload nuevo. Sólo lee — la API
// que escribe schedules vive en /api/tiktok/schedule (POST/PUT) y se invoca desde otros lugares.

export type ScheduleEntry = { status: string; scheduledAt: number };
export type ScheduleByPlatform = Partial<
  Record<"tiktok" | "linkedin" | "instagram_bridge", ScheduleEntry>
>;
export type ScheduleByProject = Record<string, ScheduleByPlatform>;

/**
 * Obtiene los uploads agendados y los agrupa por projectId. Si hay varios para el mismo
 * projectId+platform, el último gana (la API devuelve la lista ordenada asc por scheduledAt).
 *
 * El setter externo se invoca dentro de un try/catch — un fallo de red silencioso no rompe el
 * resto del montaje (los badges simplemente no aparecen hasta que se recargue).
 */
export async function loadSchedule(
  setScheduledByProjectId: (map: ScheduleByProject) => void
) {
  try {
    const r = await fetch("/api/tiktok/schedule");
    const d = await r.json();
    const map: ScheduleByProject = {};
    for (const u of d.uploads ?? []) {
      const platform = (u.platform ?? "tiktok") as
        | "tiktok"
        | "linkedin"
        | "instagram_bridge";
      const entry = map[u.projectId] ?? {};
      entry[platform] = { status: u.status, scheduledAt: u.scheduledAt };
      map[u.projectId] = entry;
    }
    setScheduledByProjectId(map);
  } catch {
    // ignore — fallo silencioso, los badges aparecen al próximo refresh
  }
}
