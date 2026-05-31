import { cn } from "@/lib/utils";

/**
 * Skeleton primitive: bloque animado con `animate-pulse` y el bg del muted.
 * Úsalo como placeholder mientras se carga la data real. Composé bloques
 * dentro de un layout que respete las dimensiones del contenido final.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-muted/60",
        className
      )}
      aria-hidden
    />
  );
}

/**
 * Skeleton específico para una tarjeta de la lista de producción (igual layout
 * que ProductionCard): thumb 140×9:16 a la izquierda + bloque de líneas a la
 * derecha. Devuelve la `Card` lista para mapear N veces.
 */
export function ProjectCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-lg border border-border/60 bg-card">
      <div className="grid grid-cols-[140px_1fr] gap-0">
        <Skeleton className="aspect-[9/16] rounded-none bg-zinc-900/80" />
        <div className="space-y-3 p-4">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <div className="flex gap-1.5 pt-1">
            <Skeleton className="h-5 w-12" />
            <Skeleton className="h-5 w-14" />
          </div>
          <div className="flex gap-2 pt-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
      </div>
    </div>
  );
}
