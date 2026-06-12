#!/usr/bin/env node
/**
 * Firma una licencia de "Estrategia Viral Poncho" con tu llave privada ed25519.
 * La llave privada NUNCA va en el repo ni en la app — vive solo en tu PC.
 *
 * Uso:
 *   node scripts/license/sign-license.mjs --name "Juan Pérez" --tier personal --machines 1 --updates 2027-06-12 [--email juan@x.com]
 *
 * Llave privada: C:\hermes-data\secrets\license-ed25519-private.pem
 * (o pásala con --key <ruta>). Para generar un par nuevo: gen-keypair.mjs.
 *
 * Imprime la clave EVP1.xxx.yyy que el cliente pega en Configuración → Licencia.
 */

import { createPrivateKey, sign } from "node:crypto";
import fs from "node:fs";

const args = process.argv.slice(2);
function arg(flag, fallback) {
  const i = args.indexOf(flag);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
}

const name = arg("--name");
const tier = arg("--tier", "personal");
const machines = parseInt(arg("--machines", tier === "agencia" ? "5" : "1"), 10);
const updatesUntil = arg("--updates");
const email = arg("--email", undefined);
const keyPath = arg("--key", "C:/hermes-data/secrets/license-ed25519-private.pem");

if (!name || !updatesUntil || !/^\d{4}-\d{2}-\d{2}$/.test(updatesUntil) || !["personal", "agencia"].includes(tier)) {
  console.error('Uso: node sign-license.mjs --name "Nombre" --tier personal|agencia --updates YYYY-MM-DD [--machines N] [--email x@y.com]');
  process.exit(1);
}

const payload = { name, ...(email ? { email } : {}), tier, machines, updatesUntil, keyVersion: 1 };
const payloadBuf = Buffer.from(JSON.stringify(payload), "utf8");
const privateKey = createPrivateKey(fs.readFileSync(keyPath, "utf8"));
const sig = sign(null, payloadBuf, privateKey);

const b64url = (b) => b.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const license = `EVP1.${b64url(payloadBuf)}.${b64url(sig)}`;

console.log("\nLicencia para:", name, `(${tier}, ${machines} máquina(s), updates hasta ${updatesUntil})`);
console.log("\n" + license + "\n");
