import { HASHTAGS } from "@/data/hashtags";
import { PHASES } from "@/lib/phases";
import { CopyButton } from "@/components/shared/copy-button";
import type { PlatformKey } from "@/lib/platforms";

const WEEK_PHASE_MAP = {
  s1: PHASES.validacion,
  s2: PHASES.doble_down,
  s3: PHASES.amplificacion,
  s4: PHASES.conversion,
} as const;

interface HashtagsRotativosProps {
  platform: PlatformKey;
}

export function HashtagsRotativos({ platform }: HashtagsRotativosProps) {
  const weeks = HASHTAGS[platform];

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Hashtags · rotación 30/50/20</h3>
        <span className="font-mono-tab text-[10px] text-muted-foreground">
          click para copiar
        </span>
      </div>
      <div className="space-y-4">
        {(Object.entries(weeks) as [keyof typeof weeks, string[]][]).map(([weekKey, tags]) => {
          const phase = WEEK_PHASE_MAP[weekKey];
          return (
            <div key={weekKey}>
              <div className="mb-2 flex items-center gap-2">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ background: phase.color }}
                />
                <span className="font-mono-tab text-[11px] uppercase tracking-wider">
                  {weekKey.toUpperCase()} · {phase.label}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map((tag) => (
                  <CopyButton key={tag} text={tag} label={tag} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
