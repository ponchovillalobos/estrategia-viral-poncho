"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PLATFORMS, PLATFORM_ORDER, type PlatformKey } from "@/lib/platforms";
import { useRealMetrics } from "@/hooks/use-real-metrics";
import { toast } from "sonner";

const todayISO = () => new Date().toISOString().slice(0, 10);

export function MetricsForm() {
  const { addEntry } = useRealMetrics();
  const [platform, setPlatform] = useState<PlatformKey>("tiktok");
  const [projectId, setProjectId] = useState("");
  const [day, setDay] = useState("1");
  const [date, setDate] = useState(todayISO());
  const [views, setViews] = useState("");
  const [likes, setLikes] = useState("");
  const [comments, setComments] = useState("");
  const [shares, setShares] = useState("");
  const [follows, setFollows] = useState("");
  const [saves, setSaves] = useState("");
  const [avgWatchTime, setAvgWatchTime] = useState("");
  const [duration, setDuration] = useState("");
  const [retention3s, setRetention3s] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setViews("");
    setLikes("");
    setComments("");
    setShares("");
    setFollows("");
    setSaves("");
    setAvgWatchTime("");
    setDuration("");
    setRetention3s("");
    setNotes("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const dayN = parseInt(day, 10);
    const viewsN = parseInt(views || "0", 10);
    if (!dayN || dayN < 1 || dayN > 60) {
      toast.error("Día debe estar entre 1 y 60");
      return;
    }
    if (!views) {
      toast.error("Views es obligatorio");
      return;
    }
    const num = (s: string) => (s ? parseFloat(s) : undefined);
    await addEntry({
      projectId: projectId.trim() || undefined,
      platform,
      day: dayN,
      date,
      postedAt: Date.parse(date) || undefined,
      views: viewsN,
      likes: parseInt(likes || "0", 10),
      comments: parseInt(comments || "0", 10),
      shares: parseInt(shares || "0", 10),
      follows: num(follows),
      saves: num(saves),
      avgWatchTime: num(avgWatchTime),
      duration: num(duration),
      retention3s: num(retention3s),
      notes: notes || undefined,
    });
    toast.success(`Métricas D${dayN.toString().padStart(2, "0")} guardadas`);
    reset();
    const next = (parseInt(day, 10) % 60) + 1;
    setDay(next.toString());
  }

  return (
    <Card className="border-border bg-card p-6">
      <h3 className="text-lg font-medium">Nueva entrada</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Pegá las métricas del post de un día específico. Los campos opcionales
        (watch time, retención, project ID) habilitan insights más profundos.
      </p>

      <form onSubmit={handleSubmit} className="mt-5 space-y-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="space-y-1.5">
            <Label htmlFor="platform">Red</Label>
            <Select
              value={platform}
              onValueChange={(v) => setPlatform(v as PlatformKey)}
            >
              <SelectTrigger id="platform">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PLATFORM_ORDER.map((k) => (
                  <SelectItem key={k} value={k}>
                    {PLATFORMS[k].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="day">Día (1–60)</Label>
            <Input
              id="day"
              type="number"
              min={1}
              max={60}
              value={day}
              onChange={(e) => setDay(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="date">Fecha publicación</Label>
            <Input
              id="date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="projectId">
            Project ID{" "}
            <span className="text-muted-foreground">(opcional, pero habilita ranking de hooks)</span>
          </Label>
          <Input
            id="projectId"
            type="text"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            placeholder="ej. VID-20260519-WA0029_hype"
            className="font-mono-tab"
          />
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="views">Views *</Label>
            <Input
              id="views"
              type="number"
              min={0}
              value={views}
              onChange={(e) => setViews(e.target.value)}
              placeholder="0"
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="likes">Likes</Label>
            <Input
              id="likes"
              type="number"
              min={0}
              value={likes}
              onChange={(e) => setLikes(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="comments">Comments</Label>
            <Input
              id="comments"
              type="number"
              min={0}
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="shares">Shares</Label>
            <Input
              id="shares"
              type="number"
              min={0}
              value={shares}
              onChange={(e) => setShares(e.target.value)}
              placeholder="0"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="space-y-1.5">
            <Label htmlFor="saves">Saves</Label>
            <Input
              id="saves"
              type="number"
              min={0}
              value={saves}
              onChange={(e) => setSaves(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="follows">Follows</Label>
            <Input
              id="follows"
              type="number"
              min={0}
              value={follows}
              onChange={(e) => setFollows(e.target.value)}
              placeholder="0"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="avgWatchTime">
              Avg watch time <span className="text-muted-foreground">(seg)</span>
            </Label>
            <Input
              id="avgWatchTime"
              type="number"
              min={0}
              step={0.1}
              value={avgWatchTime}
              onChange={(e) => setAvgWatchTime(e.target.value)}
              placeholder="ej. 14.6"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="duration">
              Duración <span className="text-muted-foreground">(seg)</span>
            </Label>
            <Input
              id="duration"
              type="number"
              min={0}
              step={0.1}
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="ej. 22"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="retention3s">
              Retención al segundo 3 <span className="text-muted-foreground">(%)</span>
            </Label>
            <Input
              id="retention3s"
              type="number"
              min={0}
              max={100}
              step={0.1}
              value={retention3s}
              onChange={(e) => setRetention3s(e.target.value)}
              placeholder="ej. 78 (= 78%)"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas</Label>
            <Input
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="ej: pico de comments"
            />
          </div>
        </div>

        <div className="flex items-center justify-end pt-2">
          <Button type="submit">Guardar entrada</Button>
        </div>
      </form>
    </Card>
  );
}
