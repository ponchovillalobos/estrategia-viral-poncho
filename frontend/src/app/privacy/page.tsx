import path from "node:path";
import { DATA_ROOT, RAW_DIR } from "@/lib/paths";

export const metadata = {
  title: "Política de privacidad — Estrategia Viral Poncho",
};

// Server component dinámico a propósito: las rutas se resuelven en runtime con
// el resolver real (lib/paths.ts), no se hornean en build. Así la página dice
// la carpeta VERDADERA de esta instalación (viral-data, hermes-data o
// %USERPROFILE%\ViralStudio) en vez de un "C:\hermes-data" hardcodeado.
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  // La carpeta "base" de datos (un nivel arriba de .../videos), donde también
  // vive user-settings.json — mismo cálculo que lib/user-settings.ts.
  const baseDir = path.dirname(DATA_ROOT);
  const settingsFile = path.join(baseDir, "user-settings.json");

  return (
    <div className="prose prose-invert max-w-2xl space-y-4 py-6 text-sm">
      <h1 className="text-2xl font-semibold">Política de privacidad</h1>
      <p className="text-muted-foreground">
        Estrategia Viral Poncho es una herramienta personal de uso individual. Esta
        política describe qué datos se procesan localmente en tu PC.
      </p>

      <h2 className="text-lg font-medium">Datos que se procesan</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Videos MP4 que colocas en tu carpeta local (<code>{RAW_DIR}</code>)</li>
        <li>Transcripciones generadas localmente con WhisperX (no salen de tu PC)</li>
        <li>Captions y hashtags generados con Claude/Codex/Ollama — el contenido del transcript se envía al proveedor que tú elijas</li>
        <li>Tokens OAuth de TikTok (si conectas tu cuenta) almacenados localmente en{" "}
          <code>{settingsFile}</code>
        </li>
      </ul>

      <h2 className="text-lg font-medium">Qué se publica en TikTok</h2>
      <p>
        Cuando tú disparas manualmente una publicación o programación: el video MP4, el
        caption en texto plano, la elección de privacidad, y los flags de duet/stitch/
        comentarios. Nada más.
      </p>

      <h2 className="text-lg font-medium">No se comparten datos con terceros</h2>
      <p>
        La app no envía analíticas, no rastrea uso, no monetiza tu data. Es software
        local de un solo usuario.
      </p>

      <h2 className="text-lg font-medium">Eliminación de datos</h2>
      <p>
        Para borrar todos tus datos: elimina la carpeta <code>{baseDir}</code>{" "}
        y la carpeta del proyecto. Para revocar acceso de TikTok: desconecta desde
        Settings o revoca la app en{" "}
        <a href="https://www.tiktok.com/setting/connected-apps" className="text-emerald-400">
          tiktok.com/setting/connected-apps
        </a>
        .
      </p>

      <h2 className="text-lg font-medium">Contacto</h2>
      <p>
        Esta app es de uso personal. Para preguntas sobre tu instancia: poncho.robles.villalobos@gmail.com
      </p>

      <p className="text-xs text-muted-foreground pt-6">
        Última actualización: junio 2026
      </p>
    </div>
  );
}
