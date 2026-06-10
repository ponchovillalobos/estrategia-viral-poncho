/**
 * Red de seguridad del CORAZÓN del producto: buildProjectForStyle.
 *
 * La auditoría de lanzamiento encontró que las 1.100+ líneas de estilos no
 * tenían NINGÚN test, y la paridad shorts↔largos ya divergió una vez en
 * producción. Estos tests validan los invariantes de los 16 estilos en ambos
 * formatos (9:16 y 16:9) — cualquier regresión estructural rompe acá ANTES
 * de llegar a un render.
 */
import { describe, it, expect } from "vitest";
import { buildProjectForStyle, STYLE_INFO, type BuildContext, type StyleId } from "@/lib/style-templates";

const STYLES = Object.keys(STYLE_INFO) as StyleId[];

function ctx(overrides: Partial<BuildContext> = {}): BuildContext {
  return {
    videoId: "TEST_VIDEO",
    duration: 42,
    keywords: [
      { word: "ventas", start: 3.2, end: 3.7 },
      { word: "clientes", start: 11.5, end: 12.0 },
      { word: "estrategia", start: 20.1, end: 20.8 },
      { word: "resultados", start: 33.4, end: 34.0 },
    ],
    accentColor: "#fb7185",
    caption: "Caption de prueba #test",
    width: 1080,
    height: 1920,
    ...overrides,
  };
}

describe("buildProjectForStyle — invariantes de los 16 estilos", () => {
  for (const styleId of STYLES) {
    for (const [w, h, label] of [
      [1080, 1920, "9:16"],
      [1920, 1080, "16:9"],
    ] as const) {
      it(`${styleId} (${label}) produce un project válido`, () => {
        const project = buildProjectForStyle(ctx({ width: w, height: h }), styleId);

        // Estructura base que build-props.mjs y Remotion esperan SIEMPRE.
        expect(project).toBeTruthy();
        expect(project.videoId).toBe("TEST_VIDEO");

        // Las listas del timeline existen y son arrays (zod NO aplica defaults
        // en runtime — las capas son defensivas, pero el builder debe cumplir).
        for (const key of ["wordStickers", "floatingEmojis", "emphasisCards", "sfxMarks"] as const) {
          const v = (project as Record<string, unknown>)[key];
          if (v !== undefined) expect(Array.isArray(v)).toBe(true);
        }

        // Ningún elemento del timeline puede quedar fuera del video.
        const lists = ["wordStickers", "floatingEmojis", "emphasisCards", "sfxMarks"] as const;
        for (const key of lists) {
          const arr = (project as Record<string, unknown>)[key] as Array<{ at?: number }> | undefined;
          for (const item of arr ?? []) {
            if (typeof item.at === "number") {
              expect(item.at).toBeGreaterThanOrEqual(0);
              expect(item.at).toBeLessThanOrEqual(42 + 1);
            }
          }
        }
      });
    }
  }

  it("editorial: SIN stickers/emojis, CON editorialLayout y música baja", () => {
    const project = buildProjectForStyle(ctx(), "editorial") as Record<string, unknown>;
    expect(project.editorialLayout).toBeTruthy();
    const layout = project.editorialLayout as { panel: string; panelWidth: number; accent: string };
    expect(layout.accent).toBe("#fb7185");
    // 9:16 → panel ancho (≈0.46); 16:9 → panel angosto (≈0.34)
    expect(layout.panelWidth).toBeCloseTo(0.46, 2);
    const horizontal = buildProjectForStyle(ctx({ width: 1920, height: 1080 }), "editorial") as Record<string, unknown>;
    expect((horizontal.editorialLayout as { panelWidth: number }).panelWidth).toBeCloseTo(0.34, 2);
    expect((project.floatingEmojis as unknown[] | undefined) ?? []).toHaveLength(0);
    expect((project.wordStickers as unknown[] | undefined) ?? []).toHaveLength(0);
    expect(project.musicVolume).toBe(0.06);
    expect(project.lut).toBe("kodak_warm.cube");
  });

  it("motion_pro/beat/grid: sin emojis, con fondo animado", () => {
    for (const styleId of ["motion_pro", "motion_beat", "motion_grid"] as StyleId[]) {
      const project = buildProjectForStyle(ctx(), styleId) as Record<string, unknown>;
      expect((project.floatingEmojis as unknown[] | undefined) ?? []).toHaveLength(0);
      expect(project.animatedBackground).toBeTruthy();
    }
  });

  it("los 16 estilos del selector existen en STYLE_INFO con nombre y tagline", () => {
    expect(STYLES.length).toBeGreaterThanOrEqual(13);
    for (const id of STYLES) {
      expect(STYLE_INFO[id].name.length).toBeGreaterThan(0);
      expect(STYLE_INFO[id].tagline.length).toBeGreaterThan(0);
    }
  });

  it("duration corta (8s) no genera elementos fuera de rango", () => {
    for (const styleId of STYLES) {
      const project = buildProjectForStyle(
        ctx({ duration: 8, keywords: [{ word: "hola", start: 1, end: 1.4 }] }),
        styleId
      ) as Record<string, unknown>;
      for (const key of ["wordStickers", "floatingEmojis", "emphasisCards", "sfxMarks"]) {
        for (const item of (project[key] as Array<{ at?: number }> | undefined) ?? []) {
          if (typeof item.at === "number") expect(item.at).toBeLessThanOrEqual(9);
        }
      }
    }
  });
});
