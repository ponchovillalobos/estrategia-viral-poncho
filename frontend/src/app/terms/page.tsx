export const metadata = {
  title: "Términos de servicio — Estrategia Viral Poncho",
};

export default function TermsPage() {
  return (
    <div className="prose prose-invert max-w-2xl space-y-4 py-6 text-sm">
      <h1 className="text-2xl font-semibold">Términos de servicio</h1>
      <p className="text-muted-foreground">
        Estrategia Viral Poncho es una herramienta personal sin garantías. Al usarla
        aceptás estos términos.
      </p>

      <h2 className="text-lg font-medium">Uso aceptable</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Solo para creación y publicación de contenido propio o autorizado</li>
        <li>No para spam, manipulación algorítmica masiva ni clickbait engañoso</li>
        <li>No para violar los términos de TikTok, Instagram, LinkedIn o Facebook</li>
        <li>Respetá la propiedad intelectual de B-roll, música y SFX</li>
      </ul>

      <h2 className="text-lg font-medium">Limitación de responsabilidad</h2>
      <p>
        Esta app se provee &quot;tal cual&quot;. El usuario es responsable por:
      </p>
      <ul className="list-disc pl-6 space-y-1">
        <li>Cualquier contenido publicado vía la app</li>
        <li>Cumplir con los términos de TikTok y demás redes</li>
        <li>El uso de las APIs de IA (Claude, Codex, Ollama) según sus respectivos términos</li>
        <li>Backups de su data (la app no respalda nada por vos)</li>
      </ul>

      <h2 className="text-lg font-medium">Cumplimiento con TikTok</h2>
      <p>
        La app respeta el TikTok Developer Terms of Service y solicita los scopes
        mínimos necesarios (<code>user.info.basic</code>, <code>video.upload</code>,
        <code>video.publish</code>). El usuario es responsable de cumplir con los
        Community Guidelines de TikTok en cada publicación.
      </p>

      <h2 className="text-lg font-medium">Modificaciones</h2>
      <p>
        Estos términos pueden cambiar. Al actualizar la app, revisa esta página.
      </p>

      <p className="text-xs text-muted-foreground pt-6">
        Última actualización: mayo 2026
      </p>
    </div>
  );
}
