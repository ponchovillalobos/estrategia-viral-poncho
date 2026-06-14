import { z } from "zod";

/**
 * Schema del GLOBO editorial (Ola 7), EXTRAÍDO a un archivo SIN dependencias pesadas.
 *
 * Por qué: editorial-globe.tsx importa d3-geo + topojson-client + world-atlas
 * (~8MB de mapa) en el tope del módulo. ViralVideo necesita SOLO el schema (zod) para
 * validar props, pero importarlo desde editorial-globe.tsx arrastraba TODO ese peso al
 * bundle inicial de CADA render/preview — aunque el proyecto no use el globo.
 *
 * Ahora el schema vive acá (cero deps) y el COMPONENTE se carga lazy
 * (editorial-globe-lazy.tsx) sólo cuando hay un editorialMap activo.
 */
export const editorialMapSchema = z.object({
  at: z.number(),
  duration: z.number().default(5),
  lat: z.number(),
  lon: z.number(),
  label: z.string().default(""),
});
export type EditorialMap = z.infer<typeof editorialMapSchema>;
