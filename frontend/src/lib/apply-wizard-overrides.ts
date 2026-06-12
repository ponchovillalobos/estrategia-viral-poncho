/**
 * Overrides que el paso a paso aplica al project YA construido:
 *   - editorialTheme   → fuente serif / fondo del lienzo / sub-tema del estilo Editorial
 *   - motionBackground → "kind" del fondo animado de los estilos motion_*
 *   - fxIntensity      → "suave" recorta y "max" acentúa los FX de hype y supreme
 *
 * Compartido entre /api/editor/auto-build (el video final) y
 * /api/editor/style-preview (la vista previa): así la vista previa muestra
 * EXACTAMENTE lo mismo que va a salir en el video — preview honesta.
 */

export interface WizardOverrides {
  /** Tema del estilo Editorial elegido en el paso a paso. */
  editorialTheme?: { font?: string; background?: string; theme?: string };
  /** Fondo animado para los estilos motion_*. undefined = el propio del estilo. */
  motionBackground?: "aurora" | "mesh" | "grid";
  /** Intensidad de FX para hype/hype_max/hype_max_sfx/supreme. undefined = normal. */
  fxIntensity?: "suave" | "max";
}

/** Subconjunto estructural del project que estos overrides tocan (compatible
 *  con el ResolvedProject de auto-build y con el project del preview). */
export interface OverridableProject {
  styleId?: string;
  editorialLayout?: Record<string, unknown> | null;
  animatedBackground?: { kind: string } | null;
  enableJumpCuts?: boolean;
  zoomMarks?: unknown[];
  reactionZooms?: unknown[];
  stutterMarks?: unknown[];
  wordStickers?: unknown[];
  floatingEmojis?: unknown[];
  sfxMarks?: unknown[];
  particleBursts?: unknown[];
}

/** Estilos cuyos FX responden al override de intensidad. */
const FX_INTENSITY_STYLES = ["hype", "hype_max", "hype_max_sfx", "supreme"];

/**
 * Muta `project` aplicando los overrides del paso a paso. Cada override solo
 * actúa si el project trae el campo correspondiente (estilos que no lo usan
 * quedan idénticos). Lógica extraída 1:1 de auto-build/route.ts.
 */
export function applyWizardOverrides(
  project: OverridableProject,
  overrides: WizardOverrides
): void {
  // Tema editorial elegido en el wizard (fuente serif + fondo del lienzo).
  if (overrides.editorialTheme && project.editorialLayout) {
    Object.assign(project.editorialLayout, overrides.editorialTheme);
  }

  // Fondo animado elegido en el wizard (estilos motion_*): cambia solo el "kind"
  // del animatedBackground que el estilo ya trae (colores/opacidad/beat intactos).
  if (overrides.motionBackground && project.animatedBackground) {
    project.animatedBackground.kind = overrides.motionBackground;
  }

  // Intensidad de FX elegida en el wizard (estilos hype*/supreme). Opera sobre los
  // arrays que el estilo + enriquecedores YA generaron (zooms, stickers, SFX,
  // stutter): "suave" recorta, "max" acentúa. No inventa FX nuevos en el render.
  if (overrides.fxIntensity && FX_INTENSITY_STYLES.includes(project.styleId ?? "")) {
    const halve = (arr: unknown[]) => arr.filter((_, i) => i % 2 === 0);
    if (overrides.fxIntensity === "suave") {
      project.enableJumpCuts = false;
      if (project.zoomMarks) project.zoomMarks = halve(project.zoomMarks);
      if (project.reactionZooms?.length) project.reactionZooms = project.reactionZooms.slice(0, 1);
      if (project.stutterMarks?.length) project.stutterMarks = [];
      if (project.wordStickers) project.wordStickers = halve(project.wordStickers);
      if (project.floatingEmojis) project.floatingEmojis = halve(project.floatingEmojis);
      if (project.sfxMarks) project.sfxMarks = halve(project.sfxMarks);
      if (project.particleBursts?.length) project.particleBursts = project.particleBursts.slice(0, 1);
    } else if (overrides.fxIntensity === "max") {
      project.enableJumpCuts = true;
      if (project.zoomMarks) {
        project.zoomMarks = (project.zoomMarks as { scale?: number }[]).map((z) => ({
          ...z,
          scale: Math.min(1.25, (z.scale ?? 1.14) + 0.06),
        }));
      }
      if (project.reactionZooms) {
        project.reactionZooms = (project.reactionZooms as { intensity?: number }[]).map((r) => ({
          ...r,
          intensity: Math.min(1.65, (r.intensity ?? 1.42) + 0.18),
        }));
      }
    }
  }
}
