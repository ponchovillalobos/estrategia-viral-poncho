import { ProductionList } from "@/components/produccion/production-list";
import { SectionHeader } from "@/components/ui/section-header";
import { SECTION_COLORS } from "@/lib/section-colors";
import { PUBLISHING_ENABLED } from "@/lib/app-mode";

export default function ProduccionPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Tus videos listos"
        title="Mis videos"
        description={
          PUBLISHING_ENABLED
            ? "Aquí están todos tus videos ya editados. Desde cada uno puedes generar su descripción, elegir en qué redes va y publicarlo."
            : "Aquí están tus videos terminados: míralos, guarda el MP4 y copia su descripción para subirlo a tus redes."
        }
        color={SECTION_COLORS.produccion}
      />

      <ProductionList />
    </div>
  );
}
