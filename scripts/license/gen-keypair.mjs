#!/usr/bin/env node
/**
 * Genera un par de llaves ed25519 para firmar licencias.
 * - La PRIVADA se guarda fuera del repo (default C:\hermes-data\secrets\).
 *   RESPÁLDALA: si se pierde, no puedes emitir más licencias.
 * - La PÚBLICA se imprime para pegarla en frontend/src/lib/license.ts
 *   (PUBLIC_KEY_PEM). Si rotas llaves, sube keyVersion en sign-license.mjs.
 *
 * Uso: node scripts/license/gen-keypair.mjs [--out C:/ruta/privada.pem]
 */

import { generateKeyPairSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const i = args.indexOf("--out");
const outPath = i >= 0 && args[i + 1] ? args[i + 1] : "C:/hermes-data/secrets/license-ed25519-private.pem";

if (fs.existsSync(outPath)) {
  console.error(`Ya existe ${outPath} — no lo voy a pisar. Usa --out para otra ruta.`);
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, privateKey.export({ type: "pkcs8", format: "pem" }), "utf8");

console.log("Llave privada guardada en:", outPath, "(¡respáldala!)");
console.log("\nLlave PÚBLICA — pégala en frontend/src/lib/license.ts:\n");
console.log(publicKey.export({ type: "spki", format: "pem" }));
