import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import { existsSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";
import { writeJsonFileAtomic } from "../atomic-write";

let dir: string;

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(tmpdir(), "atomic-write-test-"));
});

afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true });
});

describe("writeJsonFileAtomic", () => {
  it("crea el directorio padre si no existe", async () => {
    const nested = path.join(dir, "a", "b", "c", "data.json");
    await writeJsonFileAtomic(nested, { hello: "world" });
    expect(existsSync(nested)).toBe(true);
    const round = JSON.parse(await fs.readFile(nested, "utf-8"));
    expect(round).toEqual({ hello: "world" });
  });

  it("escribe el JSON con indent 2 + newline final", async () => {
    const f = path.join(dir, "x.json");
    await writeJsonFileAtomic(f, { a: 1, b: [2, 3] });
    const raw = await fs.readFile(f, "utf-8");
    expect(raw).toBe('{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}\n');
  });

  it("NO deja el .tmp si todo salió OK", async () => {
    const f = path.join(dir, "y.json");
    await writeJsonFileAtomic(f, { ok: true });
    expect(existsSync(f)).toBe(true);
    expect(existsSync(`${f}.tmp`)).toBe(false);
  });

  it("sobrescribe atómicamente: el archivo final siempre tiene el contenido nuevo o el viejo, nunca a medias", async () => {
    const f = path.join(dir, "settings.json");
    await writeJsonFileAtomic(f, { version: 1 });
    expect(JSON.parse(await fs.readFile(f, "utf-8")).version).toBe(1);

    // Sobrescribir varias veces — el archivo debe siempre tener contenido válido.
    for (let i = 2; i <= 10; i++) {
      await writeJsonFileAtomic(f, { version: i, payload: "x".repeat(1000) });
      const raw = await fs.readFile(f, "utf-8");
      const data = JSON.parse(raw); // SI no parsea, la atomicidad falló.
      expect(data.version).toBe(i);
      expect(data.payload).toHaveLength(1000);
    }
  });

  it("acepta cualquier tipo serializable (objects, arrays, primitives)", async () => {
    const f = path.join(dir, "z.json");
    await writeJsonFileAtomic(f, [{ a: 1 }, { b: 2 }]);
    expect(JSON.parse(await fs.readFile(f, "utf-8"))).toEqual([{ a: 1 }, { b: 2 }]);
    await writeJsonFileAtomic(f, 42);
    expect(JSON.parse(await fs.readFile(f, "utf-8"))).toBe(42);
    await writeJsonFileAtomic(f, "hello");
    expect(JSON.parse(await fs.readFile(f, "utf-8"))).toBe("hello");
    await writeJsonFileAtomic(f, null);
    expect(JSON.parse(await fs.readFile(f, "utf-8"))).toBeNull();
  });
});
