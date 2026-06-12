import Link from "next/link";
import { InstagramSetupClient } from "@/components/setup/instagram-setup-client";
import { PUBLISHING_ENABLED } from "@/lib/app-mode";

export const metadata = {
  title: "Conectar Instagram — Estrategia Viral Poncho",
};

export default function InstagramSetupPage() {
  if (!PUBLISHING_ENABLED) {
    return (
      <div className="mx-auto max-w-md space-y-4 rounded-xl border border-border bg-card p-8 text-center">
        <p className="text-lg font-medium">
          Esta función no viene incluida en esta versión de la app.
        </p>
        <p className="text-sm text-muted-foreground">
          Aquí puedes crear tus videos y copiarlos listos para subir a tus redes.
        </p>
        <Link href="/" className="inline-block text-sm font-medium text-primary hover:underline">
          ← Volver al inicio
        </Link>
      </div>
    );
  }
  return <InstagramSetupClient />;
}
