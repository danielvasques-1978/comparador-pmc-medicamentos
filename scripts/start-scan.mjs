// Sobe o site em modo produção (next start) como ALVO DE VARREDURA, nunca como
// ambiente de uso. Duas regras, e é para isso que este arquivo existe:
//
// 1. O banco de produção fica fora. Se existir .env.scan com DATABASE_URL (por
//    exemplo, um branch descartável do Neon), ele é usado; senão DATABASE_URL vai
//    vazia e a busca cai no snapshot embutido. O .env.local nunca é consultado
//    para isso: o @next/env não sobrescreve variável já presente no processo.
// 2. As chaves do Stripe são apagadas. A varredura chama /api/billing/*, e uma
//    chave real criaria sessões de checkout de verdade.
//
// Uso: node scripts/start-scan.mjs   (porta 3200; sobrescreva com PORT)

import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const env = { ...process.env, DATABASE_URL: "" };

for (const chave of Object.keys(env)) {
  if (chave.startsWith("STRIPE_")) delete env[chave];
}

const arquivoScan = resolve(raiz, ".env.scan");
if (existsSync(arquivoScan)) {
  for (const linha of readFileSync(arquivoScan, "utf8").split(/\r?\n/)) {
    const m = linha.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !linha.trim().startsWith("#")) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const modo = env.DATABASE_URL ? "banco de .env.scan" : "sem banco (snapshot embutido)";
console.log(`[start-scan] alvo de varredura: ${modo}; Stripe desligado`);

const porta = env.PORT || "3200";
// Chama o binário do Next direto pelo node: sem npx, sem shell — e sem o aviso
// do Node sobre argumentos não escapados em shell:true no Windows.
const nextBin = resolve(raiz, "node_modules", "next", "dist", "bin", "next");
const filho = spawn(process.execPath, [nextBin, "start", "-p", porta], {
  cwd: raiz,
  env,
  stdio: "inherit",
});
filho.on("exit", (code) => process.exit(code ?? 0));
