"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Props {
  currentId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  redirectAfterRename?: boolean;
  onRenamed?: (newId: string) => void;
}

const SUGGESTIONS = [
  { label: "D01 prompt $40K", value: "D01_prompt_40k" },
  { label: "D02 frase caro", value: "D02_frase_caro" },
  { label: "D03 Claude negocia", value: "D03_claude_negocia" },
  { label: "D04 está caro", value: "D04_objecion_caro" },
  { label: "D05 prompts WhatsApp", value: "D05_whatsapp_prompts" },
];

export function RenameDialog({
  currentId,
  open,
  onOpenChange,
  redirectAfterRename = false,
  onRenamed,
}: Props) {
  const router = useRouter();
  const [value, setValue] = useState(currentId);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setValue(currentId);
  }, [open, currentId]);

  async function submit() {
    const newId = value.trim();
    if (!newId || newId === currentId) {
      onOpenChange(false);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/videos/${encodeURIComponent(currentId)}/rename`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newId }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "rename failed");
      toast.success(`Renombrado a "${newId}"`);
      onOpenChange(false);
      onRenamed?.(newId);
      if (redirectAfterRename) {
        router.replace(`/editor/${encodeURIComponent(newId)}`);
      } else {
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renombrar archivo</DialogTitle>
          <DialogDescription>
            Sólo letras, números, guiones (-) y guiones bajos (_). Sin espacios
            ni acentos. La extensión se conserva.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="newId">Nuevo nombre</Label>
            <Input
              id="newId"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="D01_prompt_40k"
              autoFocus
            />
            <p className="font-mono-tab text-[10px] text-muted-foreground">
              Convención: D## + slug corto del tema. Ej: D01_prompt_40k
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Sugerencias del calendario</Label>
            <div className="flex flex-wrap gap-1.5">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setValue(s.value)}
                  className="rounded-md border border-border bg-card px-2 py-1 text-[11px] hover:border-foreground/30"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={busy || !value.trim()}>
            {busy ? "Renombrando…" : "Renombrar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
