import { describe, it, expect } from "vitest";
import { parseLastJsonLine } from "../run-process";

describe("parseLastJsonLine", () => {
  it("returns null para stdout vacío", () => {
    expect(parseLastJsonLine("")).toBeNull();
    expect(parseLastJsonLine("   \n  \n")).toBeNull();
  });

  it("ignora líneas que no empiezan con { y devuelve null si no hay JSON", () => {
    expect(parseLastJsonLine("hola\nmundo\nlog: foo")).toBeNull();
  });

  it("parsea el ÚLTIMO JSON cuando hay varios en stdout", () => {
    const stdout =
      "[info] arrancando\n" +
      '{"ok": false, "step": 1}\n' +
      "[info] siguiente\n" +
      '{"ok": true, "step": 2, "path": "/tmp/out.wav"}\n' +
      "[info] terminé\n";
    const parsed = parseLastJsonLine<{ ok: boolean; step: number; path?: string }>(stdout);
    expect(parsed).not.toBeNull();
    expect(parsed?.ok).toBe(true);
    expect(parsed?.step).toBe(2);
    expect(parsed?.path).toBe("/tmp/out.wav");
  });

  it("acepta JSON con leading whitespace y CRLF", () => {
    const stdout = "log\r\n  {\"ok\": true}\r\n";
    expect(parseLastJsonLine<{ ok: boolean }>(stdout)?.ok).toBe(true);
  });

  it("devuelve null si la 'última candidata' no es JSON parseable", () => {
    const stdout = '{"ok": true}\n{esto no es json válido';
    // La última que empieza con `{` es inválida → null (no debe pisar el JSON anterior;
    // semántica de "el JSON FINAL" → si está roto, no devolvemos algo viejo).
    expect(parseLastJsonLine(stdout)).toBeNull();
  });

  it("genera tipos correctos con generic", () => {
    const parsed = parseLastJsonLine<{ translated: string }>(
      '{"ok": true, "translated": "Hello world"}'
    );
    // TypeScript debería inferir `translated` como string (verificación en compile-time).
    expect(parsed?.translated).toBe("Hello world");
  });
});
