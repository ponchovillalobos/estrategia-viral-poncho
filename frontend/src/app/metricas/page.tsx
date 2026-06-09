import { MetricsForm } from "@/components/metricas/metrics-form";
import { MetricsTable } from "@/components/metricas/metrics-table";
import { BackupActions } from "@/components/metricas/backup-actions";
import { MetricsInsights } from "@/components/metricas/metrics-insights";
import { LinkedInSyncButton } from "@/components/metricas/linkedin-sync-button";
import { SectionHeader } from "@/components/ui/section-header";
import { SECTION_COLORS } from "@/lib/section-colors";

export default function MetricasPage() {
  return (
    <div className="space-y-8">
      <SectionHeader
        eyebrow="Resultados de tus publicaciones"
        title="Mis resultados"
        description="Anotá acá cómo le fue a cada video que publicaste (vistas, likes, comentarios). Con eso el sistema aprende qué hooks y descripciones te funcionan mejor. Si publicaste en LinkedIn desde la app, el botón «Sincronizar LinkedIn» trae los números solo."
        color={SECTION_COLORS.metricas}
      >
        <LinkedInSyncButton />
      </SectionHeader>

      {/* Las instrucciones van PRIMERO: sin saber de dónde copiar los números,
          el formulario de abajo no se entiende. */}
      <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-5 text-sm">
        <p className="font-medium text-amber-200">
          📋 ¿De dónde saco los números? (1 minuto por video)
        </p>
        <ul className="mt-3 space-y-2 text-xs text-muted-foreground">
          <li>
            <span className="font-mono-tab text-foreground">TikTok</span> · App
            → tu video → ··· → Datos del video. Copiá vistas, likes, comentarios,
            compartidos, guardados. Para el tiempo de visualización → «Análisis» →
            «Tiempo promedio visualizado».
          </li>
          <li>
            <span className="font-mono-tab text-foreground">Instagram</span> ·
            App → tu reel → ver Insights. Anotá alcance (como vistas), likes,
            comentarios, guardados, compartidos. Tiempo → «Tiempo de reproducción promedio».
          </li>
          <li>
            <span className="font-mono-tab text-foreground">LinkedIn</span> ·
            Tu post → «ver analytics». Anotá impresiones (como vistas), reacciones
            (likes), comentarios, reposts (compartidos).
          </li>
          <li>
            <span className="font-mono-tab text-foreground">Facebook</span> ·
            Post → «ver insights». Vistas (alcance), likes, comentarios, compartidos.
          </li>
        </ul>
      </section>

      <MetricsForm />

      <MetricsInsights />

      <div className="flex items-center justify-between">
        <h2 className="text-lg font-medium">Historial</h2>
        <BackupActions />
      </div>

      <MetricsTable />
    </div>
  );
}
