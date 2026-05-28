import type { Phase } from "@/lib/phases";
import { cn } from "@/lib/utils";

interface PhaseChipProps {
  phase: Phase;
  className?: string;
}

export function PhaseChip({ phase, className }: PhaseChipProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono-tab text-[10px] uppercase tracking-wider",
        className
      )}
      style={{
        background: `${phase.color}22`,
        color: phase.color,
        border: `1px solid ${phase.color}55`,
      }}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: phase.color }} />
      S{phase.week} · {phase.label}
    </span>
  );
}
