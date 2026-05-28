import { MetricsForm } from "@/components/metricas/metrics-form";
import { MetricsTable } from "@/components/metricas/metrics-table";
import { BackupActions } from "@/components/metricas/backup-actions";
import { MetricsInsights } from "@/components/metricas/metrics-insights";
import { LinkedInSyncButton } from "@/components/metricas/linkedin-sync-button";

export default function MetricasPage() {
  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
              Métricas reales · server-persisted · insights cross-plataforma
            </p>
            <h1 className="text-4xl font-semibold tracking-tight">Mis métricas</h1>
          </div>
          <LinkedInSyncButton />
        </div>
        <p className="max-w-2xl text-muted-foreground">
          Pegá las métricas de tus posts (o usá <strong>Sincronizar LinkedIn</strong> para traer
          las reales de tus posts publicados desde la app). Los datos se guardan en{" "}
          <code>C:\hermes-data\metrics.json</code>. Si cargás <strong>project ID</strong> +{" "}
          <strong>avg watch time</strong> + <strong>duración</strong>, el dashboard rankea
          qué hooks y captions performaron mejor.
        </p>
      </header>

      <MetricsInsights />

      <MetricsForm />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Historial</h2>
        <BackupActions />
      </div>

      <MetricsTable />

      <section className="rounded-lg border border-dashed border-border bg-card/50 p-5 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Cómo sacar las métricas</p>
        <ul className="mt-3 space-y-2 text-xs">
          <li>
            <span className="font-mono-tab text-foreground">TikTok</span> · App
            → tu video → ··· → Datos del video. Copiá views, likes, comments,
            shares, saves. Para watch time → "Análisis" → "Tiempo promedio
            visualizado".
          </li>
          <li>
            <span className="font-mono-tab text-foreground">Instagram</span> ·
            App → tu reel → ver Insights. Anotá reach (como views), likes, comments, saves,
            shares. Watch time → "Tiempo de reproducción promedio".
          </li>
          <li>
            <span className="font-mono-tab text-foreground">LinkedIn</span> ·
            Tu post → "ver analytics". Anotá impresiones (como views), reacciones (likes),
            comments, reposts (shares). LinkedIn ahora muestra "tiempo de reproducción promedio".
          </li>
          <li>
            <span className="font-mono-tab text-foreground">Facebook</span> ·
            Post → "ver insights". Views (alcance), likes, comments, shares.
          </li>
        </ul>
      </section>
    </div>
  );
}
