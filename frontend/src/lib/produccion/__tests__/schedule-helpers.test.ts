import { describe, it, expect, beforeEach, vi } from "vitest";
import { loadSchedule } from "../schedule-helpers";

describe("loadSchedule", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("agrupa uploads por projectId y plataforma", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        uploads: [
          { projectId: "p1", platform: "tiktok", status: "published", scheduledAt: 1000 },
          { projectId: "p1", platform: "linkedin", status: "failed", scheduledAt: 2000 },
          { projectId: "p2", platform: "instagram_bridge", status: "pending_manual", scheduledAt: 3000 },
        ],
      }),
    }) as unknown as typeof fetch;

    const setter = vi.fn();
    await loadSchedule(setter);

    expect(setter).toHaveBeenCalledOnce();
    const map = setter.mock.calls[0][0];
    expect(map.p1).toEqual({
      tiktok: { status: "published", scheduledAt: 1000 },
      linkedin: { status: "failed", scheduledAt: 2000 },
    });
    expect(map.p2).toEqual({
      instagram_bridge: { status: "pending_manual", scheduledAt: 3000 },
    });
  });

  it("último gana cuando hay duplicados projectId+platform", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        uploads: [
          { projectId: "p1", platform: "tiktok", status: "uploaded", scheduledAt: 1000 },
          { projectId: "p1", platform: "tiktok", status: "published", scheduledAt: 2500 },
        ],
      }),
    }) as unknown as typeof fetch;

    const setter = vi.fn();
    await loadSchedule(setter);

    const map = setter.mock.calls[0][0];
    expect(map.p1.tiktok.status).toBe("published");
    expect(map.p1.tiktok.scheduledAt).toBe(2500);
  });

  it("default a tiktok cuando platform falta", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        uploads: [{ projectId: "p1", status: "uploaded", scheduledAt: 500 }],
      }),
    }) as unknown as typeof fetch;

    const setter = vi.fn();
    await loadSchedule(setter);

    expect(setter.mock.calls[0][0].p1.tiktok).toEqual({
      status: "uploaded",
      scheduledAt: 500,
    });
  });

  it("no llama setter si el fetch tira", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("network down")) as unknown as typeof fetch;

    const setter = vi.fn();
    await loadSchedule(setter);
    expect(setter).not.toHaveBeenCalled();
  });

  it("uploads vacíos → mapa vacío", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ uploads: [] }),
    }) as unknown as typeof fetch;

    const setter = vi.fn();
    await loadSchedule(setter);
    expect(setter).toHaveBeenCalledWith({});
  });
});
