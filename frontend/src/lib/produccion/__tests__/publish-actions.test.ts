import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  publishToLinkedIn,
  publishToInstagram,
  postToTikTok,
  regenerate,
  copyCaption,
} from "../publish-actions";
import type { ProjectExt } from "@/components/produccion/produccion-types";

function makeProject(overrides: Partial<ProjectExt> = {}): ProjectExt {
  return {
    id: "test-id",
    videoId: "v1",
    status: "borrador",
    platforms: ["tiktok"],
    caption: "caption legacy",
    captions: {
      tiktok: { caption: "TT text", hashtags: ["foo"] },
      linkedin: { caption: "LI text", hashtags: ["bar"] },
      instagram: { caption: "IG text", hashtags: ["baz"] },
    },
    ...overrides,
  } as ProjectExt;
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("copyCaption", () => {
  it("copia el caption legacy y dispara setCopiedId + reset por timeout", async () => {
    vi.useFakeTimers();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(global.navigator, { clipboard: { writeText } });
    const setCopiedId = vi.fn();

    await copyCaption(makeProject({ id: "p1", caption: "hola" }), setCopiedId);

    expect(writeText).toHaveBeenCalledWith("hola");
    expect(setCopiedId).toHaveBeenCalledWith("p1");

    vi.advanceTimersByTime(2000);
    expect(setCopiedId).toHaveBeenLastCalledWith(null);
    vi.useRealTimers();
  });

  it("error de clipboard → no rompe", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.assign(global.navigator, { clipboard: { writeText } });
    const setCopiedId = vi.fn();
    await expect(copyCaption(makeProject(), setCopiedId)).resolves.toBeUndefined();
    expect(setCopiedId).not.toHaveBeenCalled();
  });
});

describe("publishToLinkedIn", () => {
  it("éxito: POST a /api/linkedin/publish con caption por plataforma y setBusy off al final", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const setBusy = vi.fn();
    await publishToLinkedIn(makeProject({ id: "p1" }), setBusy);

    expect(setBusy).toHaveBeenNthCalledWith(1, "p1");
    expect(setBusy).toHaveBeenLastCalledWith(null);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/linkedin/publish");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.projectId).toBe("p1");
    expect(body.caption).toContain("LI text");
    expect(body.caption).toContain("#bar");
  });

  it("HTTP error → setBusy null y no tira", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "boom" }),
    }) as unknown as typeof fetch;

    const setBusy = vi.fn();
    await expect(publishToLinkedIn(makeProject(), setBusy)).resolves.toBeUndefined();
    expect(setBusy).toHaveBeenLastCalledWith(null);
  });
});

describe("publishToInstagram", () => {
  it("éxito: caption por IG y setBusy ciclado", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    const setBusy = vi.fn();
    await publishToInstagram(makeProject({ id: "p2" }), setBusy);

    expect(setBusy).toHaveBeenNthCalledWith(1, "p2");
    expect(setBusy).toHaveBeenLastCalledWith(null);

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.caption).toContain("IG text");
    expect(body.caption).toContain("#baz");
  });
});

describe("postToTikTok", () => {
  it("aborta temprano si no hay caption", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as unknown as typeof fetch;
    const setBusy = vi.fn();

    await postToTikTok(makeProject({ caption: undefined }), setBusy, "handle");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(setBusy).not.toHaveBeenCalled();
  });

  it("happy path: clipboard + reveal + abre tiktok.com/upload", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const openSpy = vi.fn();
    vi.stubGlobal("window", { open: openSpy });

    const setBusy = vi.fn();
    await postToTikTok(makeProject({ id: "p3" }), setBusy, "@yo");

    expect(fetchSpy).toHaveBeenCalledTimes(2);
    expect(fetchSpy.mock.calls[0][0]).toContain("/copy-file-to-clipboard");
    expect(fetchSpy.mock.calls[1][0]).toContain("/reveal-render");
    expect(openSpy).toHaveBeenCalledWith(
      "https://www.tiktok.com/upload",
      "_blank",
      "noopener,noreferrer"
    );
    expect(setBusy).toHaveBeenLastCalledWith(null);
  });

  it("clipboard fail → setBusy null + no abre TikTok", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({ error: "no clip" }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;
    const openSpy = vi.fn();
    vi.stubGlobal("window", { open: openSpy });

    const setBusy = vi.fn();
    await postToTikTok(makeProject(), setBusy, null);

    expect(openSpy).not.toHaveBeenCalled();
    expect(setBusy).toHaveBeenLastCalledWith(null);
  });
});

describe("regenerate", () => {
  it("éxito: llama API con provider y dispara reload", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ copy: { _provider: "ollama", _model: "llama3" } }),
    }) as unknown as typeof fetch;

    const setBusy = vi.fn();
    const reload = vi.fn();
    await regenerate(makeProject({ id: "p4" }), setBusy, reload, "ollama");

    expect(setBusy).toHaveBeenNthCalledWith(1, "p4");
    expect(setBusy).toHaveBeenLastCalledWith(null);
    expect(reload).toHaveBeenCalledOnce();
  });

  it("error API → no llama reload, setBusy null", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: "bad" }),
    }) as unknown as typeof fetch;

    const setBusy = vi.fn();
    const reload = vi.fn();
    await regenerate(makeProject(), setBusy, reload);
    expect(reload).not.toHaveBeenCalled();
    expect(setBusy).toHaveBeenLastCalledWith(null);
  });

  it("provider default = auto", async () => {
    const fetchSpy = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ copy: {} }),
    });
    global.fetch = fetchSpy as unknown as typeof fetch;

    await regenerate(makeProject({ id: "p5" }), vi.fn(), vi.fn());
    expect(fetchSpy.mock.calls[0][0]).toContain("provider=auto");
  });
});
