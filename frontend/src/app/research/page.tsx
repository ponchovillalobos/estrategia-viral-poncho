import Link from "next/link";
import { ResearchWorkspace } from "@/components/research/research-workspace";

export const metadata = {
  title: "Inspiración — Viralito",
};

export default function ResearchPage() {
  return (
    <div className="space-y-4">
      {/* Esta sección vive fuera del menú — link explícito de regreso. */}
      <Link
        href="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        ← Inicio
      </Link>
      <ResearchWorkspace />
    </div>
  );
}
