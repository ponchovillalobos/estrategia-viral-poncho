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
    message: "El disco está lleno. Liberá espacio (borrá videos viejos de la carpeta renders) y volvé a intentar.",
  },
  {
    test: /ENOENT.*(ffmpeg|ffprobe)|no existe el ejecutable "?ffmpeg/i,
    message: "Falta un componente de video (ffmpeg). Abrí Configuración → Verificar instalación para repararlo.",
  },
  {
    test: /ENOENT.*python|no existe el ejecutable "?.*python/i,
    message: "Falta el motor de procesamiento (Python). Abrí Configuración → Verificar instalación para repararlo.",
  },
  {
    test: /ModuleNotFoundError: No module named '(\w+)'/i,
    message: "La instalación está incompleta (falta un componente de IA). Abrí Configuración → Verificar instalación.",
  },
  {
    test: /CUDA out of memory|OutOfMemoryError|MemoryError/i,
    message: "La computadora se quedó sin memoria. Cerrá otros programas y probá con un video más corto o de a uno.",
  },
  {
    test: /TIMEOUT|IDLE TIMEOUT|timed out/i,
    message: "El proceso tardó demasiado y se canceló. Probá con un video más corto, o generá los videos de a uno.",
  },
  {
    test: /moov atom not found|Invalid data found when processing input|corrupt/i,
    message: "El video parece estar dañado o incompleto. Volvé a exportarlo desde tu cámara o teléfono y subilo de nuevo.",
  },
  {
    test: /does not contain any stream|no audio|audio stream/i,
    message: "El video no tiene pista de audio. Para editar con subtítulos, el video necesita tener voz.",
  },
  {
    test: /EBUSY|resource busy or locked|being used by another process/i,
    message: "Otro programa está usando el archivo (¿OneDrive sincronizando? ¿el video abierto en otro reproductor?). Cerralo y reintentá.",
  },
  {
    test: /EADDRINUSE/i,
    message: "El puerto de la app está ocupado por otro programa. Cerrá otras apps o reiniciá la computadora.",
  },
  {
    test: /ECONNREFUSED.*11434|ollama/i,
    message: "Ollama no está corriendo (es opcional). Los textos se generaron en modo automático sin IA local.",
  },
  {
    test: /ERR_NETWORK|ENETUNREACH|getaddrinfo|fetch failed/i,
    message: "Hubo un problema de conexión a internet. Si estabas descargando algo, reintentá cuando vuelva la conexión.",
  },
  {
    test: /delayRender.*timeout|Render timed out/i,
    message: "La generación del video se trabó. Reintentá — si vuelve a pasar, probá generar un solo estilo a la vez.",
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
      "Algo salió mal al procesar el video. Reintentá; si vuelve a pasar, probá con otro video o reiniciá la app.",
    technical,
  };
}

/** Mensaje compacto: humano + (detalle técnico al final, recortado). */
export function humanizeErrorLine(raw: string | undefined | null, fallback?: string): string {
  const { message, technical } = humanizeError(raw, fallback);
  return technical ? `${message}\n[detalle técnico] ${technical.slice(-200)}` : message;
}
