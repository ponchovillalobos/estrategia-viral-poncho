"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Cookie,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Camera,
  Music2,
  Tv,
  ChevronDown,
  ChevronUp,
  X,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { cn } from "@/lib/utils";

type Platform = "instagram" | "tiktok" | "youtube";

interface CookieStatus {
  platform: Platform;
  configured: boolean;
  uploadedAt?: string;
  sizeBytes?: number;
  estimatedExpiry?: string;
}

const PLATFORM_META: Record<Platform, { icon: typeof Cookie; label: string; color: string; required: boolean }> = {
  instagram: { icon: Camera, label: "Instagram", color: "#f59e0b", required: true },
  tiktok: { icon: Music2, label: "TikTok", color: "#ec4899", required: true },
  youtube: { icon: Tv, label: "YouTube", color: "#ef4444", required: false },
};

export function CookiesPanel() {
  const [statuses, setStatuses] = useState<CookieStatus[]>([]);
  const [expanded, setExpanded] = useState(false);
  const [uploadPlatform, setUploadPlatform] = useState<Platform | null>(null);
  const [cookieContent, setCookieContent] = useState("");
  const [saving, setSaving] = useState(false);

  async function refresh() {
    try {
      const r = await fetch("/api/research/cookies");
      const d = await r.json();
      setStatuses(d.statuses ?? []);
    } catch {
      // ignore
    }
  }

  // Load on mount: status de cookies por plataforma. No migramos a use(promise).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh();
  }, []);

  const igConfigured = statuses.find((s) => s.platform === "instagram")?.configured;
  const ttConfigured = statuses.find((s) => s.platform === "tiktok")?.configured;
  const anyRequiredMissing = !igConfigured || !ttConfigured;

  async function save(platform: Platform) {
    if (!cookieContent.trim()) {
      toast.error("Pega el contenido de cookies.txt");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/research/cookies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ platform, content: cookieContent }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? "no se pudo guardar");
      toast.success(`Cookies de ${platform} guardadas`);
      setUploadPlatform(null);
      setCookieContent("");
      refresh();
    } catch (err) {
      toastError(err, "No se pudieron guardar las cookies");
    } finally {
      setSaving(false);
    }
  }

  async function remove(platform: Platform) {
    if (!confirm(`¿Borrar cookies de ${platform}?`)) return;
    try {
      await fetch(`/api/research/cookies?platform=${platform}`, { method: "DELETE" });
      toast.success("Borradas");
      refresh();
    } catch (err) {
      toastError(err, "No se pudieron borrar las cookies");
    }
  }

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setCookieContent(text);
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => setExpanded((x) => !x)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left"
      >
        <div className="flex items-center gap-2">
          <Cookie className="h-4 w-4 text-amber-400" />
          <span className="text-sm font-medium">Cookies de Instagram / TikTok</span>
          {anyRequiredMissing ? (
            <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-amber-300">
              <AlertCircle className="h-2.5 w-2.5" />
              configurar para IG/TT
            </span>
          ) : (
            <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-emerald-300">
              <CheckCircle2 className="h-2.5 w-2.5" />
              configuradas
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border p-3">
          {/* Instrucciones */}
          <div className="rounded-md border border-sky-500/30 bg-sky-500/5 p-3 text-xs text-sky-100">
            <p className="mb-2 font-medium text-sky-200">Por qué necesitamos esto</p>
            <p className="mb-2 text-sky-200/80">
              Instagram y TikTok bloquean a yt-dlp sin login. En Windows hay bugs upstream que
              impiden leer las cookies de Edge/Chrome/Brave automáticamente. Solución 100%
              confiable: exportar tus cookies a un archivo.
            </p>
            <p className="mb-1 font-medium text-sky-200">Pasos (1 vez por plataforma, dura ~30 días):</p>
            <ol className="list-decimal space-y-0.5 pl-5 text-sky-200/80">
              <li>
                Instala la extensión{" "}
                <a
                  href="https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brand-pink underline hover:text-brand-pink/80"
                >
                  Get cookies.txt LOCALLY
                </a>{" "}
                en Edge/Chrome (~10 seg).
              </li>
              <li>Ve a instagram.com (o tiktok.com) e inicia sesión normal.</li>
              <li>Da clic en el ícono de la extensión → &quot;Export As&quot; → &quot;Netscape&quot; → descarga un .txt.</li>
              <li>Aquí abajo, &quot;Subir/pegar&quot; → selecciona el archivo o pega su contenido → Guardar.</li>
              <li>Listo. yt-dlp lo usa automáticamente la próxima vez que pegues una URL.</li>
            </ol>
          </div>

          {/* Status por plataforma */}
          <div className="space-y-2">
            {statuses.map((s) => {
              const meta = PLATFORM_META[s.platform];
              const Icon = meta.icon;
              return (
                <div
                  key={s.platform}
                  className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-2"
                >
                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4" style={{ color: meta.color }} />
                    <span className="text-sm font-medium">{meta.label}</span>
                    {!meta.required && (
                      <span className="font-mono-tab text-[9px] text-muted-foreground">
                        (opcional)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {s.configured ? (
                      <span
                        className="font-mono-tab text-[10px] text-emerald-300"
                        title={s.estimatedExpiry ? `Expiran: ${new Date(s.estimatedExpiry).toLocaleString("es")}` : ""}
                      >
                        ✓ {s.sizeBytes} bytes
                        {s.estimatedExpiry &&
                          ` · expira ${new Date(s.estimatedExpiry).toLocaleDateString("es")}`}
                      </span>
                    ) : (
                      <span className="font-mono-tab text-[10px] text-muted-foreground">
                        sin configurar
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setUploadPlatform(s.platform);
                        setCookieContent("");
                      }}
                      className="rounded border border-border bg-muted/30 px-2 py-0.5 font-mono-tab text-[10px] text-foreground hover:bg-muted"
                    >
                      {s.configured ? "actualizar" : "subir"}
                    </button>
                    {s.configured && (
                      <button
                        type="button"
                        onClick={() => remove(s.platform)}
                        className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-red-400"
                        title="Borrar"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Modal/sección de upload */}
          {uploadPlatform && (
            <div className="rounded-md border border-amber-500/40 bg-amber-500/5 p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="font-mono-tab text-[10px] uppercase tracking-wider text-amber-300">
                  Subiendo cookies para {PLATFORM_META[uploadPlatform].label}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setUploadPlatform(null);
                    setCookieContent("");
                  }}
                  className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="mb-2 flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1 font-mono-tab text-[10px] text-foreground hover:bg-muted">
                  <Upload className="h-3 w-3" />
                  Subir archivo .txt
                  <input
                    type="file"
                    accept=".txt"
                    onChange={handleFile}
                    className="hidden"
                  />
                </label>
                <span className="font-mono-tab text-[10px] text-muted-foreground">
                  o pega el contenido abajo:
                </span>
              </div>
              <textarea
                value={cookieContent}
                onChange={(e) => setCookieContent(e.target.value)}
                rows={6}
                placeholder="# Netscape HTTP Cookie File&#10;# This is a generated file! Do not edit.&#10;.instagram.com	TRUE	/	TRUE	1735689600	sessionid	..."
                className="w-full rounded-md border border-border bg-background/60 p-2 font-mono-tab text-[10px] text-foreground"
              />
              <div className="mt-2 flex justify-end gap-2">
                <Button
                  variant="ghost"
                  onClick={() => {
                    setUploadPlatform(null);
                    setCookieContent("");
                  }}
                  disabled={saving}
                >
                  Cancelar
                </Button>
                <Button
                  onClick={() => save(uploadPlatform)}
                  disabled={saving || !cookieContent.trim()}
                  className={cn(
                    "bg-amber-500 hover:bg-amber-400 text-black"
                  )}
                >
                  {saving ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                  Guardar cookies
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
