import { ProductionList } from "@/components/produccion/production-list";

export default function ProduccionPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
          Producción · proyectos editoriales
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Producción</h1>
        <p className="max-w-2xl text-muted-foreground">
          Cada proyecto del editor aparece acá. Asigná el día del calendario, las
          plataformas destino y el estado.
        </p>
      </header>

      <ProductionList />
    </div>
  );
}
