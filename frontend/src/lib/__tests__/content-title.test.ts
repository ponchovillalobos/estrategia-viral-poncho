import { describe, it, expect } from "vitest";
import {
  pickTopKeywords,
  normForFreq,
  titleCaseWord,
  sanitizeForFilename,
  generateContentTitle,
  type TranscriptWord,
} from "../content-title";

function w(word: string, start = 0, end = 0): TranscriptWord {
  return { word, start, end };
}

describe("normForFreq", () => {
  it("quita acentos y baja a minúsculas, conserva ñ", () => {
    expect(normForFreq("Persuasión")).toBe("persuasion");
    expect(normForFreq("AÑO")).toBe("año");
    expect(normForFreq("MÁS")).toBe("mas");
  });
  it("quita caracteres no alfanuméricos", () => {
    expect(normForFreq("¿Cómo?")).toBe("como");
    expect(normForFreq("vender,")).toBe("vender");
  });
  it("string vacío → vacío", () => {
    expect(normForFreq("")).toBe("");
  });
});

describe("titleCaseWord", () => {
  it("capitaliza la primera letra", () => {
    expect(titleCaseWord("persuasion")).toBe("Persuasion");
    expect(titleCaseWord("PERSUASION")).toBe("Persuasion");
  });
  it("string vacío → vacío", () => {
    expect(titleCaseWord("")).toBe("");
  });
});

describe("sanitizeForFilename", () => {
  it("quita caracteres ilegales de Windows", () => {
    expect(sanitizeForFilename('he\\llo:wor*ld?<>"|/')).toBe("helloworld");
  });
  it("colapsa espacios", () => {
    expect(sanitizeForFilename("  hola     mundo  ")).toBe("hola mundo");
  });
  it("preserva acentos y ñ", () => {
    expect(sanitizeForFilename("Año Persuasión")).toBe("Año Persuasión");
  });
});

describe("pickTopKeywords", () => {
  it("devuelve todas si hay <= count tras filtrar", () => {
    const words = [w("hola"), w("comunicar"), w("vender")];
    const picks = pickTopKeywords(words, 7);
    // "hola" tiene 4 letras → se filtra; "comunicar" y "vender" pasan.
    expect(picks.map((p) => p.word)).toEqual(["comunicar", "vender"]);
  });
  it("descarta stopwords y palabras < 5 letras", () => {
    const words = [w("porque"), w("entre"), w("la"), w("comunicación")];
    expect(pickTopKeywords(words, 7).map((p) => p.word)).toEqual(["comunicación"]);
  });
  it("distribuye `count` picks a lo largo del array filtrado", () => {
    const words = Array.from({ length: 14 }, (_, i) => w(`palabra${i}`));
    const picks = pickTopKeywords(words, 7);
    expect(picks).toHaveLength(7);
    // Los picks deben venir de posiciones aproximadamente distribuidas (0, 2, 4, 6, 8, 10, 12).
    expect(picks.map((p) => p.word)).toEqual([
      "palabra0", "palabra2", "palabra4", "palabra6",
      "palabra8", "palabra10", "palabra12",
    ]);
  });
});

describe("generateContentTitle", () => {
  it("devuelve string vacío si no hay palabras válidas", () => {
    expect(generateContentTitle([])).toBe("");
    expect(generateContentTitle([w("la"), w("una"), w("muy")])).toBe("");
  });
  it("toma las 2 palabras MÁS frecuentes (con acentos)", () => {
    const words = [
      w("persuasión"), w("persuasión"), w("persuasión"),
      w("ventas"), w("ventas"),
      w("camino"),
    ];
    expect(generateContentTitle(words)).toBe("Persuasión Ventas");
  });
  it("agrupa palabras con/sin acento como la misma frecuencia", () => {
    const words = [w("persuasión"), w("PERSUASION"), w("persuasion")];
    // Las 3 son la misma palabra normalizada → frecuencia 3 → primera display.
    expect(generateContentTitle(words)).toBe("Persuasión");
  });
  it("ignora stopwords aunque sean frecuentes", () => {
    const words = [
      w("para"), w("para"), w("para"),
      w("vender"), w("vender"),
    ];
    expect(generateContentTitle(words)).toBe("Vender");
  });
});
