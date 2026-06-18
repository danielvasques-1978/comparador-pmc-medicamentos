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
const manualDataPaths = [
  path.join(process.cwd(), "src", "data", "manual-critical-medicines.json"),
  path.join(process.cwd(), "src", "data", "manual-medicines.json"),
];
const rawMedicines = JSON.parse(fs.readFileSync(dataPath, "utf8"));
const manualMedicines = manualDataPaths.flatMap((filePath) => JSON.parse(fs.readFileSync(filePath, "utf8")));

function normalize(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanMedicine(medicine) {
  const name = normalize(medicine.name);
  const activeIngredient = normalize(medicine.activeIngredient);

  if (name.includes("prometazina") && name.includes("exp")) {
    return null;
  }

  if (name.includes("desvenlafaxina") && activeIngredient === "venlafaxina") {
    return { ...medicine, activeIngredient: "DESVENLAFAXINA" };
  }

  return medicine;
}

const manualIds = new Set(manualMedicines.map((item) => item.id));
const medicines = [
  ...rawMedicines.flatMap((item) => {
    if (manualIds.has(item.id)) return [];
    const cleaned = cleanMedicine(item);
    return cleaned ? [cleaned] : [];
  }),
  ...manualMedicines,
];
const first = medicines[0];

const importRows = await sql`
  insert into price_imports (source_name, source_file, table_date, row_count)
  values (${first?.source ?? "Fonte importada"}, ${"Suplemento-451.pdf"}, ${first?.tableDate ?? "Não informada"}, ${medicines.length})
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
            presentation,
            pmc,
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
            ${item.presentation},
            ${JSON.stringify(item.pmc)}::jsonb,
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
            presentation = excluded.presentation,
            pmc = excluded.pmc,
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

console.log("Neon seed complete.");
