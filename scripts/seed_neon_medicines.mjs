import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";
import { loadLocalEnv } from "./load_local_env.mjs";

loadLocalEnv();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("Configure DATABASE_URL in .env.local before seeding Neon.");
}

const sql = neon(databaseUrl);
const dataPath = path.join(process.cwd(), "src", "data", "medicines.json");
const rawMedicines = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const medicines = rawMedicines;
const first = medicines[0];

const importRows = await sql`
  insert into price_imports (source_name, source_file, table_date, row_count)
  values (${first?.source ?? "CMED/Anvisa"}, ${"Lista de preços CMED.xlsx"}, ${first?.tableDate ?? "Não informada"}, ${medicines.length})
  returning id
`;

const importId = importRows[0].id;
const batchSize = 150;
const retryDelayMs = 1500;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function runBatch(batch, index) {
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      await sql.transaction(
        batch.map((item) => sql`
          insert into medicines (
            id,
            import_id,
            name,
            active_ingredient,
            laboratory,
            kind,
            product_type,
            presentation,
            pmc,
            ggrem_code,
            registration,
            commercialized,
            source_page,
            source,
            table_date
          )
          values (
            ${item.id},
            ${importId},
            ${item.name},
            ${item.activeIngredient},
            ${item.laboratory},
            ${item.kind},
            ${item.productType ?? item.kind},
            ${item.presentation},
            ${JSON.stringify(item.pmc)}::jsonb,
            ${item.ggremCode ?? item.id},
            ${item.registration ?? null},
            ${item.commercialized ?? null},
            ${item.sourcePage},
            ${item.source},
            ${item.tableDate}
          )
          on conflict (id) do update set
            import_id = excluded.import_id,
            name = excluded.name,
            active_ingredient = excluded.active_ingredient,
            laboratory = excluded.laboratory,
            kind = excluded.kind,
            product_type = excluded.product_type,
            presentation = excluded.presentation,
            pmc = excluded.pmc,
            ggrem_code = excluded.ggrem_code,
            registration = excluded.registration,
            commercialized = excluded.commercialized,
            source_page = excluded.source_page,
            source = excluded.source,
            table_date = excluded.table_date
        `),
      );
      return;
    } catch (error) {
      if (attempt === 5) throw error;
      console.warn(`Batch ${index} failed on attempt ${attempt}; retrying...`);
      await wait(retryDelayMs * attempt);
    }
  }
}

for (let index = 0; index < medicines.length; index += batchSize) {
  const batch = medicines.slice(index, index + batchSize);
  await runBatch(batch, index);
  console.log(`Seeded ${Math.min(index + batch.length, medicines.length)} / ${medicines.length}`);
}

await sql`delete from medicines where import_id is distinct from ${importId}`;

console.log("Neon seed complete.");
