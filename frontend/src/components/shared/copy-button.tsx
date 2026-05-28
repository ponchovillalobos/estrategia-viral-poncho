"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CopyButtonProps {
  text: string;
  label?: string;
  className?: string;
  size?: "sm" | "md";
  successMessage?: string;
}

export function CopyButton({
  text,
  label,
  className,
  size = "sm",
  successMessage = "Copiado",
}: CopyButtonProps) {
  const [done, setDone] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      setDone(true);
      toast.success(successMessage);
      setTimeout(() => setDone(false), 1200);
    } catch {
      toast.error("No se pudo copiar");
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border border-border bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors",
        size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
        className
      )}
    >
      {done ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {label && <span>{label}</span>}
    </button>
  );
}
