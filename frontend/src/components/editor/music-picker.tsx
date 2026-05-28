"use client";

import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
import { Music, Play, Pause, Check } from "lucide-react";

interface MusicTrack {
  name: string;
  filename: string;
  url: string;
}

interface Props {
  selected: string | null;
  volume: number;
  onSelect: (t: string | null) => void;
  onVolumeChange: (v: number) => void;
}

export function MusicPicker({ selected, volume, onSelect, onVolumeChange }: Props) {
  const [tracks, setTracks] = useState<MusicTrack[]>([]);
  const [playing, setPlaying] = useState<string | null>(null);
  const [audio, setAudio] = useState<HTMLAudioElement | null>(null);

  useEffect(() => {
    fetch("/api/music/list")
      .then((r) => r.json())
      .then((d) => setTracks(d.tracks ?? []))
      .catch(() => setTracks([]));
  }, []);

  function togglePlay(t: MusicTrack) {
    if (playing === t.filename) {
      audio?.pause();
      setPlaying(null);
      return;
    }
    audio?.pause();
    const a = new Audio(t.url);
    a.volume = 0.6;
    a.play();
    setAudio(a);
    setPlaying(t.filename);
    a.onended = () => setPlaying(null);
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label className="text-xs">Volumen relativo a voz · {Math.round(volume * 100)}%</Label>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-full"
        />
        <p className="text-[10px] text-muted-foreground">
          Recomendado 12–18% para que no tape la voz.
        </p>
      </div>

      <div className="space-y-2">
        <Label className="text-xs">Tracks disponibles ({tracks.length})</Label>
        {tracks.length === 0 ? (
          <div className="rounded-md border border-dashed border-border bg-card/50 p-4 text-xs text-muted-foreground">
            Sin tracks. Pegá MP3 en{" "}
            <span className="font-mono-tab">C:\viral-data\videos\assets\music\</span>
          </div>
        ) : (
          <ul className="space-y-1.5">
            <li>
              <button
                type="button"
                onClick={() => onSelect(null)}
                className={`flex w-full items-center justify-between rounded-md border p-2 text-xs ${
                  selected === null
                    ? "border-foreground/40 bg-muted"
                    : "border-border bg-card"
                }`}
              >
                <span className="text-muted-foreground">Sin música</span>
                {selected === null && <Check className="h-3.5 w-3.5" />}
              </button>
            </li>
            {tracks.map((t) => {
              const isSelected = selected === t.filename;
              const isPlaying = playing === t.filename;
              return (
                <li
                  key={t.filename}
                  className={`flex items-center gap-2 rounded-md border p-2 text-xs ${
                    isSelected ? "border-foreground/40 bg-muted" : "border-border bg-card"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => togglePlay(t)}
                    className="rounded p-1 hover:bg-muted"
                  >
                    {isPlaying ? (
                      <Pause className="h-3.5 w-3.5" />
                    ) : (
                      <Play className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelect(t.filename)}
                    className="flex-1 text-left"
                  >
                    <div className="flex items-center gap-2">
                      <Music className="h-3 w-3 text-muted-foreground" />
                      <span>{t.name}</span>
                    </div>
                  </button>
                  {isSelected && <Check className="h-3.5 w-3.5 text-emerald-400" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
