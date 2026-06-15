import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Escribe un JSON de forma ATÓMICA: primero a `${filePath}.tmp` (en el mismo directorio,
 * así el rename es atómico dentro del mismo filesystem) y luego `rename` encima del final.
 *
 * Por qué: un `writeFile` directo que se interrumpe a mitad (crash del server, corte de luz,
 * disco lleno) deja el JSON truncado/corrupto y se pierden TODOS los registros, no uno. Con
 * tmp+rename, o queda el archivo viejo intacto o el nuevo completo — nunca a medias. Crítico
 * para `user-settings.json` (tokens OAuth) y `metrics.json`, donde perder el archivo duele.
 */
export async function writeJsonFileAtomic(filePath: string, data: unknown): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });
  const tmp = `${filePath}.tmp`;
  const payload = JSON.stringify(data, null, 2) + "\n";
  await fs.writeFile(tmp, payload, "utf-8");

  // En Windows el rename sobre un archivo existente puede fallar con EPERM/EACCES/EBUSY de
  // forma transitoria (antivirus o un lector que tiene el destino abierto un instante).
  // Reintentamos con backoff corto; si sigue bloqueado, escribimos directo sobre el destino.
  for (let attempt = 0; attempt < 6; attempt++) {
    try {
      await fs.rename(tmp, filePath);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException)?.code;
      const transient = code === "EPERM" || code === "EACCES" || code === "EBUSY";
      if (!transient) {
        await fs.rm(tmp, { force: true }).catch(() => {});
        throw err;
      }
      if (attempt === 5) {
        await fs.writeFile(filePath, payload, "utf-8");
        await fs.rm(tmp, { force: true }).catch(() => {});
        return;
      }
      await new Promise((r) => setTimeout(r, 20 * (attempt + 1)));
    }
  }
}
