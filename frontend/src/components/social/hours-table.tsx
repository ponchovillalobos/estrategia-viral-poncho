import { HOURS, WEEKDAY_LABELS, type Weekday } from "@/data/hours";
import type { PlatformKey } from "@/lib/platforms";

const DAYS_ORDER: Weekday[] = ["lun", "mar", "mie", "jue", "vie", "sab", "dom"];

interface HoursTableProps {
  platform: PlatformKey;
}

export function HoursTable({ platform }: HoursTableProps) {
  const data = HOURS[platform];

  return (
    <div className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-baseline justify-between">
        <h3 className="text-sm font-medium">Horarios óptimos · CDMX</h3>
        <span className="font-mono-tab text-[10px] text-muted-foreground">
          America/Mexico_City
        </span>
      </div>
      <ul className="divide-y divide-border">
        {DAYS_ORDER.map((d) => {
          const slots = data.schedule[d];
          const empty = slots.length === 0;
          return (
            <li
              key={d}
              className="flex items-center justify-between gap-3 py-2 text-sm"
            >
              <span
                className={`font-mono-tab text-xs uppercase tracking-wider ${
                  empty ? "text-muted-foreground/50" : "text-muted-foreground"
                }`}
              >
                {WEEKDAY_LABELS[d]}
              </span>
              {empty ? (
                <span className="font-mono-tab text-xs text-muted-foreground/50">
                  —
                </span>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {slots.map((s) => (
                    <span
                      key={s}
                      className="rounded-md bg-muted/50 px-2 py-0.5 font-mono-tab text-xs"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        Tip · {data.tip}
      </p>
    </div>
  );
}
