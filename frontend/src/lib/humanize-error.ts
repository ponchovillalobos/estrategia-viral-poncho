/**
 * Traduce errores técnicos (stderr de ffmpeg/python/remotion, códigos de Node)
 * a mensajes EN ESPAÑOL accionables para usuarios no técnicos.
 *
 * Patrón: las rutas API guardan `humanizeError(stderr)` en el campo `error` que
 * la UI muestra; el detalle técnico va aparte (campo `technical`) por si hace
 * falta soporte. NUNCA mostrarle a un usuario un stack trace de Chromium.
 */

const RULES: { test: RegExp; message: string }[] = [
  {
    test: /ENOSPC|no space left|not enough space|espacio insuficiente/i,
    message: "El disco está lleno. Libera espacio (borra videos viejos de tu carpeta de videos generados) e intenta de nuevo.",
  },
  {
    test: /ENOENT.*(ffmpeg|ffprobe)|no existe el ejecutable "?ffmpeg/i,
    message: "Falta un componente de video (ffmpeg). Abre Configuración → Verificar instalación para repararlo.",
  },
  {
    test: /ENOENT.*python|no existe el ejecutable "?.*python/i,
    message: "Falta el motor de procesamiento (Python). Abre Configuración → Verificar instalación para repararlo.",
  },
  {
    test: /ModuleNotFoundError: No module named '(\w+)'/i,
    message: "La instalación está incompleta (falta un componente de IA). Abre Configuración → Verificar instalación.",
  },
  {
    test: /CUDA out of memory|OutOfMemoryError|MemoryError/i,
    message: "Tu compu se quedó sin memoria. Cierra otros programas y prueba con un video más corto o de uno en uno.",
  },
  {
    test: /TIMEOUT|IDLE TIMEOUT|timed out/i,
    message: "El proceso tardó demasiado y se canceló. Prueba con un video más corto, o genera los videos de uno en uno.",
  },
  {
    test: /moov atom not found|Invalid data found when processing input|corrupt/i,
    message: "El video parece estar dañado o incompleto. Vuelve a exportarlo desde tu cámara o teléfono y súbelo de nuevo.",
  },
  {
    test: /does not contain any stream|no audio|audio stream/i,
    message: "El video no tiene pista de audio. Para editar con subtítulos, el video necesita tener voz.",
  },
  {
    test: /EBUSY|resource busy or locked|being used by another process/i,
    message: "Otro programa está usando el archivo (¿OneDrive sincronizando? ¿el video abierto en otro reproductor?). Ciérralo e intenta de nuevo.",
  },
  {
    test: /EADDRINUSE/i,
    message: "El puerto de la app está ocupado por otro programa. Cierra otras apps o reinicia tu compu.",
  },
  {
    test: /ECONNREFUSED.*11434|ollama/i,
    message: "La IA local no está activa (es opcional). Los textos se generaron en modo automático sin ella.",
  },
  {
    test: /ERR_NETWORK|ENETUNREACH|getaddrinfo|fetch failed/i,
    message: "Hubo un problema de conexión a internet. Si estabas descargando algo, intenta de nuevo cuando vuelva la conexión.",
  },
  {
    test: /delayRender.*timeout|Render timed out/i,
    message: "La generación del video se trabó. Intenta de nuevo — si vuelve a pasar, prueba generar un solo estilo a la vez.",
  },
];

export interface HumanError {
  /** Mensaje en español para mostrar al usuario. */
  message: string;
  /** Cola del detalle técnico original (para soporte / detalle colapsable). */
  technical: string;
}

export function humanizeError(raw: string | undefined | null, fallback?: string): HumanError {
  const text = (raw ?? "").trim();
  const technical = text.slice(-600);
  for (const rule of RULES) {
    if (rule.test.test(text)) return { message: rule.message, technical };
  }
  return {
    message:
      fallback ??
      "Algo salió mal al procesar el video. Intenta de nuevo; si vuelve a pasar, prueba con otro video o reinicia la app.",
    technical,
  };
}

/** Mensaje compacto: humano + (detalle técnico al final, recortado). */
export function humanizeErrorLine(raw: string | undefined | null, fallback?: string): string {
  const { message, technical } = humanizeError(raw, fallback);
  return technical ? `${message}\n[detalle técnico] ${technical.slice(-200)}` : message;
}
