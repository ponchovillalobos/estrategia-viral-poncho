import Link from "next/link";
import { VideoList } from "@/components/editor/video-list";
import { Wand2 } from "lucide-react";

export default function EditorIndexPage() {
  return (
    <div className="space-y-6">
      <header className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <p className="font-mono-tab text-xs uppercase tracking-wider text-muted-foreground">
            Editor · pipeline local
          </p>
          <h1 className="text-4xl font-semibold tracking-tight">Videos crudos</h1>
          <p className="max-w-2xl text-muted-foreground">
            Poné tus MP4 (o MOV) en{" "}
            <span className="font-mono-tab text-foreground">C:\viral-data\videos\raw\</span> y
            aparecen acá. Click en una card para editar manual, o usá el Wizard para edición automática.
          </p>
        </div>
        <Link
          href="/editor/wizard"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          <Wand2 className="h-4 w-4" />
          Wizard
        </Link>
      </header>

      <VideoList />
    </div>
  );
}
