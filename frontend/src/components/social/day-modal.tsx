"use client";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CopyButton } from "@/components/shared/copy-button";
import { PhaseChip } from "@/components/shared/phase-chip";
import type { CalendarDay } from "@/data/calendar";
import { fallbackScript, scriptFor } from "@/data/scripts";
import { phaseFromDay } from "@/lib/phases";
import { PLATFORMS, type PlatformKey } from "@/lib/platforms";
import { HASHTAGS, weekFromDay } from "@/data/hashtags";

interface DayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  day: CalendarDay;
  platform: PlatformKey;
}

export function DayModal({ open, onOpenChange, day, platform }: DayModalProps) {
  const phase = phaseFromDay(day.day);
  const piece = day.platforms[platform];
  const script = scriptFor(day.day) ?? fallbackScript(day.day, day.theme, platform);
  const weekKey = weekFromDay(day.day);
  const hashtags = HASHTAGS[platform][weekKey];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono-tab text-xs text-muted-foreground">
              D{day.day.toString().padStart(2, "0")}
            </span>
            <PhaseChip phase={phase} />
            <span
              className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-mono-tab text-[10px] uppercase tracking-wider"
              style={{
                background: `${PLATFORMS[platform].color}22`,
                color: PLATFORMS[platform].color,
                border: `1px solid ${PLATFORMS[platform].color}55`,
              }}
            >
              {PLATFORMS[platform].label} · {piece.format}
            </span>
          </div>
          <DialogTitle className="text-2xl">{day.theme}</DialogTitle>
          <DialogDescription className="text-base text-foreground/80">
            {piece.hook}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="guion" className="mt-2">
          <TabsList>
            <TabsTrigger value="guion">Guion (5 tomas)</TabsTrigger>
            <TabsTrigger value="broll">B-roll</TabsTrigger>
            <TabsTrigger value="caption">Caption</TabsTrigger>
          </TabsList>

          <TabsContent value="guion" className="mt-4">
            <ScrollArea className="h-[440px] pr-4">
              <ol className="space-y-4">
                {script.takes.map((t, i) => (
                  <li
                    key={i}
                    className="rounded-md border border-border bg-muted/30 p-4"
                  >
                    <div className="mb-2 flex items-baseline justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tab text-xs text-muted-foreground">
                          {t.range}
                        </span>
                        <span className="font-medium text-sm">{t.intent}</span>
                      </div>
                      <CopyButton text={t.voiceover} />
                    </div>
                    <p className="text-sm leading-relaxed">{t.voiceover}</p>
                    {t.onscreen && (
                      <p className="mt-2 font-mono-tab text-[11px] uppercase tracking-wider text-muted-foreground">
                        en pantalla → {t.onscreen}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="broll" className="mt-4">
            <ScrollArea className="h-[440px] pr-4">
              <ul className="space-y-2">
                {script.bRoll.map((b, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3 text-sm"
                  >
                    <span className="font-mono-tab text-xs text-muted-foreground">
                      {(i + 1).toString().padStart(2, "0")}
                    </span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
              {piece.description && (
                <div className="mt-4 rounded-md border border-border bg-muted/30 p-3">
                  <p className="mb-1 font-mono-tab text-[11px] uppercase tracking-wider text-muted-foreground">
                    nota plataforma
                  </p>
                  <p className="text-sm">{piece.description}</p>
                </div>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="caption" className="mt-4">
            <div className="space-y-3">
              <div className="rounded-md border border-border bg-muted/30 p-4">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                  {script.caption}
                </pre>
              </div>
              <div className="flex items-center justify-between">
                <span className="font-mono-tab text-xs text-muted-foreground">
                  CTA · {piece.cta}
                </span>
                <CopyButton
                  text={script.caption}
                  label="Copiar caption completo"
                  size="md"
                  successMessage="Caption copiado"
                />
              </div>
              <div className="rounded-md border border-border bg-muted/30 p-3">
                <p className="mb-2 font-mono-tab text-[11px] uppercase tracking-wider text-muted-foreground">
                  hashtags · semana {weekKey.toUpperCase()}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {hashtags.map((h) => (
                    <CopyButton key={h} text={h} label={h} />
                  ))}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
