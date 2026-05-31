import { cn } from "@/lib/utils";

/**
 * Header de sección "preciosa" con accent en el color de la tab.
 *
 * Layout:
 *   - Barra vertical de 3px a la izquierda del título (en el color del tono).
 *   - Eyebrow opcional (texto chico mono-tab, en el color, uppercase).
 *   - Título h1 grande con drop-shadow tintado al tono.
 *   - Descripción opcional debajo en muted.
 *   - Children a la derecha (botones de acción).
 *
 * Cada sección de la app pasa su color para que sea identificable de un vistazo
 * (matchea con el color del tab en la nav).
 */
export function SectionHeader({
  title,
  description,
  eyebrow,
  color,
  children,
  className,
}: {
  title: string;
  description?: string;
  eyebrow?: string;
  /** Hex color (matchea con la tab activa en TabNav). */
  color: string;
  /** Acciones a la derecha del título (botones, etc.). */
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "relative flex items-start justify-between gap-4 pl-4",
        className
      )}
    >
      {/* Barra vertical de color a la izquierda. */}
      <span
        aria-hidden
        className="absolute left-0 top-1 h-12 w-[3px] rounded-full"
        style={{ backgroundColor: color, boxShadow: `0 0 12px ${color}88` }}
      />

      <div className="space-y-2">
        {eyebrow && (
          <p
            className="font-mono-tab text-xs uppercase tracking-wider"
            style={{ color }}
          >
            {eyebrow}
          </p>
        )}
        <h1
          className="text-4xl font-semibold tracking-tight"
          style={{
            textShadow: `0 0 24px ${color}33`,
          }}
        >
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-muted-foreground">{description}</p>
        )}
      </div>

      {children && <div className="shrink-0">{children}</div>}
    </header>
  );
}
