import Link from "next/link";
import { WizardClient } from "@/components/editor/wizard/wizard-client";
import { SectionHeader } from "@/components/ui/section-header";
import { SECTION_COLORS } from "@/lib/section-colors";
import { FolderKanban } from "lucide-react";

// "Crear video" = el flujo AUTOMÁTICO (el corazón de la app): eliges uno o varios
// videos (o subes), das Siguiente, y eliges formato (vertical/horizontal) + uno o
// VARIOS estilos con vista previa. Antes esto estaba detrás de un botón "Crear
// automático" y la página mostraba la lista que abría el editor manual básico — la
// gente no encontraba los 15 estilos. Ahora el wizard es la entrada directa. La
// edición manual de un video puntual sigue accesible desde "Mis videos".
export default function EditorIndexPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Crear video"
        title="Crea tu video paso a paso"
        description="Elige uno o varios videos, el formato (vertical u horizontal) y el estilo —puedes elegir varios estilos para comparar—. Cada selector tiene su vista previa y la app crea todo por ti."
        color={SECTION_COLORS.editor}
      >
        <Link
          href="/produccion"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md border border-border px-5 text-sm font-medium hover:bg-muted"
          title="Abrir un video para editarlo a mano (avanzado)"
        >
          <FolderKanban className="h-4 w-4" />
          Edición manual (Mis videos)
        </Link>
      </SectionHeader>

      <WizardClient />
    </div>
  );
}
