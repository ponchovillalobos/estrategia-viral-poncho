"use client";

import { useState } from "react";
import { phaseFromDay } from "@/lib/phases";
import type { CalendarDay } from "@/data/calendar";
import type { PlatformKey } from "@/lib/platforms";
import { PHASES } from "@/lib/phases";
import { PhaseChip } from "@/components/shared/phase-chip";
import { CopyButton } from "@/components/shared/copy-button";
import { DayModal } from "@/components/social/day-modal";
import { cn } from "@/lib/utils";

interface DayCardProps {
  day: CalendarDay;
  platform: PlatformKey;
}

export function DayCard({ day, platform }: DayCardProps) {
  const phase = phaseFromDay(day.day);
  const piece = day.platforms[platform];
  const [open, setOpen] = useState(false);

  const accent = PHASES[day.phase].color;

  function handleKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  }

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={() => setOpen(true)}
        onKeyDown={handleKey}
        className={cn(
          "group flex w-full cursor-pointer flex-col gap-3 rounded-lg border border-border bg-card p-4 text-left transition-all hover:border-foreground/30 hover:scale-[1.01]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        )}
      >
        <div
          className="relative flex h-32 items-center justify-center overflow-hidden rounded-md"
          style={{
            background: `linear-gradient(135deg, ${accent}26, ${accent}08)`,
            border: `1px solid ${accent}33`,
          }}
        >
          <span
            className="font-mono-tab text-5xl font-light tracking-tight"
            style={{ color: accent }}
          >
            D{day.day.toString().padStart(2, "0")}
          </span>
          <span
            className="absolute right-2 top-2 font-mono-tab text-[10px] uppercase tracking-wider"
            style={{ color: accent }}
          >
            {piece.format}
          </span>
        </div>

        <div className="flex items-center justify-between gap-2">
          <PhaseChip phase={phase} />
        </div>

        <h3 className="text-sm font-medium leading-tight">{day.theme}</h3>

        <p className="line-clamp-3 text-xs text-muted-foreground">
          {piece.hook}
        </p>

        <div className="mt-auto flex items-center justify-between gap-2 pt-2">
          <span className="font-mono-tab text-[10px] text-muted-foreground line-clamp-1">
            {piece.cta}
          </span>
          <CopyButton text={piece.hook} label="Hook" />
        </div>
      </div>

      <DayModal
        open={open}
        onOpenChange={setOpen}
        day={day}
        platform={platform}
      />
    </>
  );
}
