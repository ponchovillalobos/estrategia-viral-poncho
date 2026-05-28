import { ProductionList } from "@/components/produccion/production-list";

export default function ProduccionPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-4xl font-semibold tracking-tight">Mis videos</h1>
        <p className="max-w-2xl text-muted-foreground">
          Acá están todos tus videos ya editados. Desde cada uno podés generar su
          descripción, elegir en qué redes va y publicarlo.
        </p>
      </header>

      <ProductionList />
    </div>
  );
}
