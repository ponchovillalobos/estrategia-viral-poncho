"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { useRealMetrics, type Store } from "@/hooks/use-real-metrics";
import { Download, Upload, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export function BackupActions() {
  const { store, importStore, clearAll } = useRealMetrics();
  const fileInput = useRef<HTMLInputElement>(null);

  function handleExport() {
    const blob = new Blob([JSON.stringify(store, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `viral-metricas-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup descargado");
  }

  function handleImportClick() {
    fileInput.current?.click();
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Store;
        if (!parsed.tiktok || !parsed.instagram) {
          throw new Error("Estructura inválida");
        }
        importStore(parsed);
        toast.success("Backup importado");
      } catch {
        toast.error("Archivo inválido");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="sm" onClick={handleExport}>
        <Download className="mr-1.5 h-3.5 w-3.5" />
        Exportar JSON
      </Button>
      <Button variant="outline" size="sm" onClick={handleImportClick}>
        <Upload className="mr-1.5 h-3.5 w-3.5" />
        Importar JSON
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json"
        onChange={handleFileChange}
        className="hidden"
      />
      <Button
        variant="ghost"
        size="sm"
        onClick={() => {
          if (
            confirm(
              "¿Borrar TODAS las métricas reales? Esta acción no se puede deshacer."
            )
          ) {
            clearAll();
            toast.success("Todas las métricas borradas");
          }
        }}
        className="text-muted-foreground hover:text-red-400"
      >
        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
        Borrar todo
      </Button>
    </div>
  );
}
