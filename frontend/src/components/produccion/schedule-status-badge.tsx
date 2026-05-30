/**
 * Pílula de status para schedules — muestra el estado del último schedule en una plataforma
 * (publicado / fallido / manual pendiente / subido / otros). Se renderiza dentro de cada botón
 * de bridge (TT/IG/LI) en la production-list.
 *
 * El círculo de color es el indicador visual; el span `sr-only` lleva el carácter ASCII de
 * respaldo para lectores de pantalla. El tooltip muestra el estado completo + fecha.
 */
export function ScheduleStatusBadge({
  state,
}: {
  state: { status: string; scheduledAt: number } | undefined;
}) {
  if (!state) return null;
  const { status, scheduledAt } = state;
  const dot =
    status === "published"
      ? "bg-emerald-400"
      : status === "failed"
        ? "bg-red-400"
        : status === "pending_manual"
          ? "bg-amber-400"
          : "bg-foreground/40";
  const short =
    status === "published"
      ? "✓"
      : status === "failed"
        ? "✗"
        : status === "pending_manual"
          ? "⌛"
          : status === "uploaded"
            ? "↑"
            : "•";
  const tooltip = `${status} · ${new Date(scheduledAt).toLocaleString("es")}`;
  return (
    <span
      title={tooltip}
      className="ml-1 inline-flex h-3 w-3 items-center justify-center rounded-full bg-foreground/10 text-[8px] text-foreground/80"
    >
      <span className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} aria-hidden />
      <span className="sr-only">{short}</span>
    </span>
  );
}
