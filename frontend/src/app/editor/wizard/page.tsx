import { WizardClient } from "@/components/editor/wizard/wizard-client";

export default function WizardPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
          Editor · wizard
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Editar video paso a paso</h1>
        <p className="max-w-2xl text-muted-foreground">
          4 pasos: elegí video, estilo(s), color y caption. El sistema genera el proyecto y renderiza
          automáticamente. Si elegís 2-3 estilos, te genera todos para que compares.
        </p>
      </header>

      <WizardClient />
    </div>
  );
}
