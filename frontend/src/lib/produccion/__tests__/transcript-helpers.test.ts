import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadTranscript, copyTranscript } from "../transcript-helpers";

describe("loadTranscript", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("sale temprano si el videoId ya está cacheado (incluso como '')", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;

    const setLoading = vi.fn();
    const setCache = vi.fn();

    await loadTranscript("v1", { v1: "ya tengo texto" }, setLoading, setCache);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setLoading).not.toHaveBeenCalled();

    await loadTranscript("v2", { v2: "" }, setLoading, setCache);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("ensambla el texto desde el array de words", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        transcript: { words: [{ word: "hola" }, { word: "que" }, { word: "tal" }] },
      }),
    }) as unknown as typeof fetch;

    const setLoading = vi.fn();
    const setCache = vi.fn();

    await loadTranscript("v1", {}, setLoading, setCache);

    expect(setLoading).toHaveBeenCalledWith(true);
    expect(setLoading).toHaveBeenLastCalledWith(false);
    expect(setCache).toHaveBeenCalledOnce();
    const updater = setCache.mock.calls[0][0];
    expect(updater({})).toEqual({ v1: "hola que tal" });
  });

  it("trim del texto resultante", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ transcript: { words: [{ word: " hola " }] } }),
    }) as unknown as typeof fetch;

    const setCache = vi.fn();
    await loadTranscript("v1", {}, vi.fn(), setCache);

    const updater = setCache.mock.calls[0][0];
    // El join con " " produce " hola " (con bordes) → trim() lo recorta.
    // pero el word interno " hola " quedaría como " hola " sin tocar — el trim es del join completo.
    expect(updater({}).v1.trim()).toBe(updater({}).v1);
  });

  it("HTTP error → guarda '' en cache (no rompe la UI)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
    }) as unknown as typeof fetch;

    const setCache = vi.fn();
    await loadTranscript("v1", {}, vi.fn(), setCache);

    expect(setCache).toHaveBeenCalledOnce();
    expect(setCache.mock.calls[0][0]({})).toEqual({ v1: "" });
  });

  it("network error → guarda '' en cache", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("down")) as unknown as typeof fetch;

    const setCache = vi.fn();
    await loadTranscript("v1", {}, vi.fn(), setCache);

    expect(setCache.mock.calls[0][0]({})).toEqual({ v1: "" });
  });

  it("setLoading siempre vuelve a false (finally)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("x")) as unknown as typeof fetch;
    const setLoading = vi.fn();

    await loadTranscript("v1", {}, setLoading, vi.fn());
    expect(setLoading).toHaveBeenLastCalledWith(false);
  });
});

describe("copyTranscript", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("no hace nada si el cache está vacío para ese videoId", async () => {
    const writeText = vi.fn();
    Object.assign(global.navigator, { clipboard: { writeText } });

    const setCopied = vi.fn();
    await copyTranscript("v1", {}, setCopied);
    expect(writeText).not.toHaveBeenCalled();
    expect(setCopied).not.toHaveBeenCalled();
  });

  it("copia el texto y dispara setCopied(true)", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(global.navigator, { clipboard: { writeText } });

    const setCopied = vi.fn();
    await copyTranscript("v1", { v1: "el texto" }, setCopied);

    expect(writeText).toHaveBeenCalledWith("el texto");
    expect(setCopied).toHaveBeenCalledWith(true);
  });
});
