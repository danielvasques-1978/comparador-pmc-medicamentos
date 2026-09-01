import { Buffer } from "node:buffer";
import { neon } from "@neondatabase/serverless";
import { loadLocalEnv } from "./load_local_env.mjs";

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn("DATABASE_URL ausente; tentativa bloqueada não foi registrada.");
  process.exit(0);
}

const chunks = [];
for await (const chunk of process.stdin) chunks.push(chunk);
const report = JSON.parse(Buffer.concat(chunks).toString("utf8"));

const sql = neon(databaseUrl);

await sql`
  insert into price_imports (source_name, source_file, table_date, row_count, status, report, source_url)
  values (
    ${"CMED/Anvisa"},
    ${"Lista de preços CMED.xlsx"},
    ${report.candidateTableDate ?? "Não informada"},
    ${report.candidateCount ?? 0},
    ${"blocked"},
    ${JSON.stringify(report)}::jsonb,
    ${report.sourceUrl ?? null}
  )
`;

console.log("Tentativa bloqueada registrada.");
