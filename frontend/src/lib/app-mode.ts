/**
 * MODO DE LA APP — preparación para la versión de escritorio descargable.
 *
 * La versión pública/escritorio es el EDITOR puro: shorts, largos,
 * transcripción, estilos, animaciones, copys por red (copiar y pegar).
 * La publicación automática y el cronograma quedan FUERA del producto
 * (decisión del dueño 2026-06): dependen de OAuth/apps aprobadas por cada
 * red y complican la experiencia. `PUBLISHING_ENABLED=true` (env
 * NEXT_PUBLIC_VIRAL_PUBLISHING=1) las re-enciende para uso personal.
 */
export const PUBLISHING_ENABLED =
  process.env.NEXT_PUBLIC_VIRAL_PUBLISHING === "1";
