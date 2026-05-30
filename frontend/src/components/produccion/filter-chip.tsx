import { cn } from "@/lib/utils";

/**
 * Botón tipo "chip" para los filtros de la lista de producción (status / plataforma).
 * Estado activo invierte el contraste; el hover sobre inactivo solo cambia el color del texto.
 * Tipografía mono-tab + tracking wider para que cambien de ancho lo mínimo posible al alternar.
 */
export function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider transition-colors",
        active
          ? "bg-foreground text-background"
          : "bg-muted text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );
}
