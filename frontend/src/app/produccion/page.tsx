import { ProductionList } from "@/components/produccion/production-list";
import { SectionHeader } from "@/components/ui/section-header";
import { SECTION_COLORS } from "@/lib/section-colors";

export default function ProduccionPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Tus shorts listos"
        title="Mis videos"
        description="Acá están todos tus videos ya editados. Desde cada uno podés generar su descripción, elegir en qué redes va y publicarlo."
        color={SECTION_COLORS.produccion}
      />

      <ProductionList />
    </div>
  );
}
