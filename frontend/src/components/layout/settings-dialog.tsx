"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Music2,
  Camera,
  Briefcase,
  ThumbsUp,
  Settings as SettingsIcon,
  Loader2,
  CheckCircle2,
  Key,
  LogIn,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { toastError } from "@/lib/toast-error";
import { PUBLISHING_ENABLED } from "@/lib/app-mode";

interface Handles {
  tiktok: string;
  instagram: string;
  linkedin: string;
  facebook: string;
}

interface SettingsResponse {
  handles: Handles;
  tiktok: {
    clientKey: string;
    hasClientSecret: boolean;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    accessTokenExpiresAt: number;
    openId: string;
    connectedUsername: string;
  };
  linkedin: {
    clientId: string;
    hasClientSecret: boolean;
    hasAccessToken: boolean;
    hasRefreshToken: boolean;
    accessTokenExpiresAt: number;
    personUrn: string;
    connectedName: string;
  };
  pixabay: {
    hasApiKey: boolean;
  };
}

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved?: (handles: Handles) => void;
}

export function SettingsDialog({ open, onOpenChange, onSaved }: SettingsDialogProps) {
  const [data, setData] = useState<SettingsResponse | null>(null);
  const [handles, setHandles] = useState<Handles>({
    tiktok: "",
    instagram: "",
    linkedin: "",
    facebook: "",
  });
  const [clientKey, setClientKey] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [liClientId, setLiClientId] = useState("");
  const [liClientSecret, setLiClientSecret] = useState("");
  /** API key de Pixabay para descargar SFX/música CC0 al modo cinematográfico.
   * El server nunca devuelve la key guardada (solo hasApiKey) — vacío = no cambiar. */
  const [pixabayKey, setPixabayKey] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  // Doctor: diagnóstico de la instalación (python, ffmpeg, modelos, carpeta).
  const [doctorChecks, setDoctorChecks] = useState<
    { id: string; label: string; ok: boolean; fix?: string }[] | null
  >(null);
  const [doctorLoading, setDoctorLoading] = useState(false);

  async function runDoctor() {
    setDoctorLoading(true);
    try {
      const r = await fetch("/api/doctor?deep=1", { cache: "no-store" });
      const d = await r.json();
      setDoctorChecks(d.checks ?? []);
    } catch {
      toast.error("No se pudo verificar la instalación");
    } finally {
      setDoctorLoading(false);
    }
  }

  // Cargar settings cuando se abre el diálogo. Patrón válido pero el lint quiere
  // `use(promise)` con Suspense; no migramos para no romper el flujo de error/finally.
  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch("/api/settings")
      .then((r) => r.json())
      .then((d: SettingsResponse) => {
        setData(d);
        setHandles(d.handles);
        setClientKey(d.tiktok.clientKey ?? "");
        setClientSecret("");
        setLiClientId(d.linkedin?.clientId ?? "");
        setLiClientSecret("");
        setPixabayKey("");
      })
      .catch((err) => toastError(err, "No se pudo cargar la configuración"))
      .finally(() => setLoading(false));
  }, [open]);

  async function save() {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          handles,
          tiktok: {
            clientKey: clientKey.trim(),
            clientSecret: clientSecret.trim(),
          },
          linkedin: {
            clientId: liClientId.trim(),
            clientSecret: liClientSecret.trim(),
          },
          // Vacío = "no cambiar" (el server preserva la key guardada)
          pixabay: { apiKey: pixabayKey.trim() },
        }),
      });
      const result: SettingsResponse = await res.json();
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(result);
      setClientSecret("");
      setLiClientSecret("");
      setPixabayKey("");
      onSaved?.(result.handles);
      toast.success("Configuración guardada");
    } catch (err) {
      toastError(err, "No se pudo guardar la configuración");
    } finally {
      setSaving(false);
    }
  }

  function startOAuth() {
    window.location.href = "/api/auth/tiktok/login";
  }

  function startLinkedInOAuth() {
    window.location.href = "/api/auth/linkedin/login";
  }

  async function disconnect() {
    if (!confirm("¿Desconectar tu cuenta de TikTok?\n\nPara volver a publicar tendrás que conectarla otra vez. Tus videos y tu configuración no se tocan.")) {
      return;
    }
    try {
      const res = await fetch("/api/auth/tiktok/disconnect", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: SettingsResponse = await res.json();
      setData(result);
      toast.success("Cuenta de TikTok desconectada");
    } catch (err) {
      toastError(err, "No se pudo desconectar la cuenta");
    }
  }

  async function disconnectLinkedIn() {
    if (!confirm("¿Desconectar tu cuenta de LinkedIn?\n\nPara volver a publicar tendrás que conectarla otra vez. Tus videos y tu configuración no se tocan.")) {
      return;
    }
    try {
      const res = await fetch("/api/auth/linkedin/disconnect", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result: SettingsResponse = await res.json();
      setData(result);
      toast.success("Cuenta de LinkedIn desconectada");
    } catch (err) {
      toastError(err, "No se pudo desconectar la cuenta");
    }
  }

  // Orden = prioridad de la firma: se usa el primero que tenga valor.
  const handleFields: { key: keyof Handles; label: string; icon: typeof Music2; color: string; placeholder: string }[] = [
    { key: "instagram", label: "Instagram", icon: Camera, color: "#f59e0b", placeholder: "@tu_usuario" },
    { key: "linkedin", label: "LinkedIn", icon: Briefcase, color: "#38bdf8", placeholder: "@tu_usuario" },
    { key: "tiktok", label: "TikTok", icon: Music2, color: "#ec4899", placeholder: "@tu_usuario" },
    { key: "facebook", label: "Facebook", icon: ThumbsUp, color: "#3b82f6", placeholder: "@tu_usuario" },
  ];

  const hasAppCreds = Boolean(clientKey && (clientSecret || data?.tiktok.hasClientSecret));
  const connected = Boolean(data?.tiktok.hasAccessToken);

  const hasLiAppCreds = Boolean(liClientId && (liClientSecret || data?.linkedin?.hasClientSecret));
  const liConnected = Boolean(data?.linkedin?.hasAccessToken);

  const hasPixabayKey = Boolean(data?.pixabay?.hasApiKey);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <SettingsIcon className="h-4 w-4" /> Configuración
          </DialogTitle>
          <DialogDescription>
            Configura tu marca y revisa que todo esté instalado. Lo básico funciona sin
            tocar nada.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" /> cargando…
          </div>
        ) : (
          <div className="space-y-6">
            {/* ── VERIFICAR INSTALACIÓN ──────────────────── */}
            <section className="space-y-2 rounded-md border border-border bg-muted/20 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
                  Estado de la instalación
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={runDoctor} disabled={doctorLoading}>
                  {doctorLoading ? (
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                  )}
                  {doctorLoading ? "Verificando…" : "Verificar instalación"}
                </Button>
              </div>
              {doctorChecks && (
                <ul className="space-y-1 text-xs">
                  {doctorChecks.map((c) => (
                    <li key={c.id} className={c.ok ? "text-emerald-300" : "text-amber-300"}>
                      {c.ok ? "✓" : "✗"} {c.label}
                      {!c.ok && c.fix && <span className="block pl-4 text-[11px] text-muted-foreground">{c.fix}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* ── TU FIRMA (handles) ────────────────────── */}
            <section className="space-y-3">
              <h3 className="font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
                Tu firma en los videos
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Tu @ aparece como marca de agua y como firma al final de cada video. Si
                llenas varios, se usa el primero: Instagram → LinkedIn → TikTok → Facebook.
              </p>
              {handleFields.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.key} className="space-y-1">
                    <Label className="flex items-center gap-1.5 text-xs">
                      <Icon className="h-3.5 w-3.5" style={{ color: f.color }} />
                      {f.label}
                    </Label>
                    <Input
                      type="text"
                      value={handles[f.key]}
                      onChange={(e) => setHandles((h) => ({ ...h, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                      className="font-mono-tab"
                    />
                  </div>
                );
              })}
            </section>

            {/* ── AVANZADO (colapsado): credenciales para publicar.
                Solo existe con PUBLISHING_ENABLED — la versión pública es editor puro. */}
            {PUBLISHING_ENABLED && (
            <details className="rounded-md border border-border bg-muted/20">
              <summary className="cursor-pointer select-none px-3 py-2.5 text-sm font-medium text-muted-foreground hover:text-foreground">
                Avanzado: publicar en redes desde la app (opcional)
              </summary>
              <div className="space-y-6 border-t border-border p-3">

            {/* ── TIKTOK API CREDENTIALS ─────────────────── */}
            <section className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
                  <Key className="h-3.5 w-3.5" /> TikTok Content Posting API
                </h3>
                {connected ? (
                  <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-emerald-400">
                    <CheckCircle2 className="h-2.5 w-2.5" /> conectado
                  </span>
                ) : hasAppCreds ? (
                  <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-amber-400">
                    <AlertCircle className="h-2.5 w-2.5" /> Falta conectar tu cuenta
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-muted-foreground">
                    sin credenciales
                  </span>
                )}
              </div>

              {!hasAppCreds && (
                <p className="text-[11px] text-muted-foreground">
                  Para publicar automático necesitas registrar una app en{" "}
                  <a
                    href="https://developers.tiktok.com/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-emerald-400 hover:underline"
                  >
                    developers.tiktok.com
                  </a>
                  . Te llevo paso a paso desde el botón &quot;Registrar app&quot; abajo.
                </p>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Client Key</Label>
                <Input
                  type="text"
                  value={clientKey}
                  onChange={(e) => setClientKey(e.target.value)}
                  placeholder="awzxxxxxxxxxxxxx"
                  className="font-mono-tab text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Client Secret
                  {data?.tiktok.hasClientSecret && (
                    <span className="ml-2 font-mono-tab text-[10px] text-emerald-400">
                      (guardado · déjalo vacío para no cambiarlo)
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={data?.tiktok.hasClientSecret ? "••••••••••" : "secret"}
                  className="font-mono-tab text-xs"
                  autoComplete="new-password"
                />
              </div>

              {connected && data?.tiktok.connectedUsername && (
                <p className="font-mono-tab text-[10px] text-muted-foreground">
                  Conectado como{" "}
                  <span className="text-pink-400">{data.tiktok.connectedUsername}</span>
                  {" · expira "}
                  {new Date(data.tiktok.accessTokenExpiresAt).toLocaleString("es")}
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {!hasAppCreds && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      window.location.href = "/setup/tiktok";
                    }}
                  >
                    Registrar app (guiado)
                  </Button>
                )}
                {hasAppCreds && !connected && (
                  <Button type="button" size="sm" onClick={startOAuth}>
                    <LogIn className="mr-1.5 h-3.5 w-3.5" />
                    Conectar TikTok
                  </Button>
                )}
                {connected && (
                  <Button type="button" variant="outline" size="sm" onClick={disconnect}>
                    Desconectar TikTok
                  </Button>
                )}
              </div>
            </section>

            {/* ── LINKEDIN API CREDENTIALS ─────────────────── */}
            <section className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
                  <Briefcase className="h-3.5 w-3.5 text-sky-400" /> LinkedIn Posts API
                </h3>
                {liConnected ? (
                  <span className="flex items-center gap-1 rounded bg-emerald-500/20 px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-emerald-400">
                    <CheckCircle2 className="h-2.5 w-2.5" /> conectado
                  </span>
                ) : hasLiAppCreds ? (
                  <span className="flex items-center gap-1 rounded bg-amber-500/20 px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-amber-400">
                    <AlertCircle className="h-2.5 w-2.5" /> Falta conectar tu cuenta
                  </span>
                ) : (
                  <span className="flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 font-mono-tab text-[9px] uppercase tracking-wider text-muted-foreground">
                    sin credenciales
                  </span>
                )}
              </div>

              {!hasLiAppCreds && (
                <p className="text-[11px] text-muted-foreground">
                  Registra una app en{" "}
                  <a
                    href="https://www.linkedin.com/developers/apps"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-400 hover:underline"
                  >
                    linkedin.com/developers
                  </a>
                  . El scope <code>w_member_social</code> es Open Permission — sin
                  approval. Te guío en /setup/linkedin.
                </p>
              )}

              <div className="space-y-1">
                <Label className="text-xs">Client ID</Label>
                <Input
                  type="text"
                  value={liClientId}
                  onChange={(e) => setLiClientId(e.target.value)}
                  placeholder="77abcdefghij1k"
                  className="font-mono-tab text-xs"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  Client Secret
                  {data?.linkedin?.hasClientSecret && (
                    <span className="ml-2 font-mono-tab text-[10px] text-emerald-400">
                      (guardado · déjalo vacío para no cambiarlo)
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  value={liClientSecret}
                  onChange={(e) => setLiClientSecret(e.target.value)}
                  placeholder={data?.linkedin?.hasClientSecret ? "••••••••••" : "secret"}
                  className="font-mono-tab text-xs"
                  autoComplete="new-password"
                />
              </div>

              {liConnected && data?.linkedin?.connectedName && (
                <p className="font-mono-tab text-[10px] text-muted-foreground">
                  Conectado como{" "}
                  <span className="text-sky-400">{data.linkedin.connectedName}</span>
                  {" · expira "}
                  {new Date(data.linkedin.accessTokenExpiresAt).toLocaleString("es")}
                </p>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {!hasLiAppCreds && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      onOpenChange(false);
                      window.location.href = "/setup/linkedin";
                    }}
                  >
                    Registrar app (guiado)
                  </Button>
                )}
                {hasLiAppCreds && !liConnected && (
                  <Button type="button" size="sm" onClick={startLinkedInOAuth} className="bg-sky-500 hover:bg-sky-400 text-white">
                    <LogIn className="mr-1.5 h-3.5 w-3.5" />
                    Conectar LinkedIn
                  </Button>
                )}
                {liConnected && (
                  <Button type="button" variant="outline" size="sm" onClick={disconnectLinkedIn}>
                    Desconectar LinkedIn
                  </Button>
                )}
              </div>
            </section>
              </div>
            </details>
            )}

            {/* ──────── Pixabay API (SFX + música para modo cinematográfico) ──────── */}
            <section className="space-y-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium flex items-center gap-1.5">
                  🎵 Pixabay API (audio CC0)
                </h3>
                <a
                  href="https://pixabay.com/accounts/register/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono-tab text-amber-300 hover:text-amber-200 underline"
                >
                  registrarse gratis →
                </a>
              </div>
              <p className="text-[11px] text-amber-200/70">
                <strong>Opcional</strong> — el sistema ya trae 54 pistas de música y 67
                sonidos gratis SIN ninguna key. Esto solo suma variedad extra: regístrate
                en Pixabay (gratis), pega tu API key y el modo cinematográfico descarga
                ~21 SFX + 7 pistas CC0 adicionales. Uso comercial OK.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  API key
                  {hasPixabayKey && (
                    <span className="ml-2 font-mono-tab text-[10px] text-emerald-400">
                      (guardada — déjala vacía para no cambiarla)
                    </span>
                  )}
                </Label>
                <Input
                  type="password"
                  placeholder={hasPixabayKey ? "••••••••" : "ej. 12345678-abcdef0123456789abcdef0123456789a"}
                  value={pixabayKey}
                  onChange={(e) => setPixabayKey(e.target.value)}
                  className="font-mono-tab text-xs"
                  autoComplete="new-password"
                />
                <p className="font-mono-tab text-[9px] text-muted-foreground">
                  La key aparece en{" "}
                  <a
                    href="https://pixabay.com/api/docs/"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-amber-300 underline"
                  >
                    pixabay.com/api/docs
                  </a>{" "}
                  después de iniciar sesión. Se guarda solo en tu compu.
                </p>
              </div>
              {(pixabayKey || hasPixabayKey) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="border-amber-500/40 text-amber-200 hover:bg-amber-500/10"
                  onClick={async () => {
                    toast.info("Descargando ~28 SFX + música de Pixabay (60-90s)...");
                    try {
                      const r = await fetch("/api/sfx/download-pixabay", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ kind: "both" }),
                      });
                      const d = await r.json();
                      if (!r.ok || !d.ok) throw new Error(d.error ?? `HTTP ${r.status}`);
                      toast.success(
                        `✓ ${d.totalDownloaded} archivos descargados (${d.totalFailed} fallaron)`
                      );
                    } catch (err) {
                      toastError(err, "No se pudo descargar el pack de audio");
                    }
                  }}
                >
                  Descargar pack inicial (SFX + música)
                </Button>
              )}
            </section>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={save} disabled={saving || loading}>
            {saving && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Guardar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
