import Link from "next/link";
import { VideoList } from "@/components/editor/video-list";
import { SectionHeader } from "@/components/ui/section-header";
import { SECTION_COLORS } from "@/lib/section-colors";
import { Wand2 } from "lucide-react";

export default function EditorIndexPage() {
  return (
    <div className="space-y-6">
      <SectionHeader
        eyebrow="Editor de shorts"
        title="Crear un video corto"
        description="Tus videos subidos. Elige uno para convertirlo en un short viral, o sube otro desde tu compu. Para crear un short paso a paso, usa «Crear automático»."
        color={SECTION_COLORS.editor}
      >
        <Link
          href="/editor/wizard"
          className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
        >
          <Wand2 className="h-4 w-4" />
          Crear automático
        </Link>
      </SectionHeader>

      <VideoList />
    </div>
  );
}
