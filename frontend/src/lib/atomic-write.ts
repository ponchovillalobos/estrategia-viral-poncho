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
  await fs.writeFile(tmp, JSON.stringify(data, null, 2) + "\n", "utf-8");
  await fs.rename(tmp, filePath);
}
