import { neon } from "@neondatabase/serverless";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { loadLocalEnv } from "./load_local_env.mjs";

const TABLE_DATE_PATTERN = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function toIsoDate(tableDate) {
  const match = typeof tableDate === "string" ? tableDate.match(TABLE_DATE_PATTERN) : null;
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month}-${day}`;
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
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

  // Checked up front, before anything is written: a bad table date would
  // otherwise only surface after every batch had already been seeded,
  // leaving the same partially-applied state the batch-failure handling
  // below exists to avoid.
  const tableDate = first?.tableDate ?? null;
  const isoTableDate = toIsoDate(tableDate);

  if (!isoTableDate) {
    throw new Error(`Data de tabela inesperada: ${tableDate}`);
  }

  const importRows = await sql`
    insert into price_imports (source_name, source_file, table_date, row_count, status)
    values (${first?.source ?? "CMED/Anvisa"}, ${"Lista de preços CMED.xlsx"}, ${first?.tableDate ?? "Não informada"}, ${medicines.length}, ${"pending"})
    returning id
  `;

  const importId = importRows[0].id;
  const batchSize = 150;
  const retryDelayMs = 1500;

  const wait = (ms) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });

  const runBatch = async (batch, index) => {
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
              table_date,
              ean1,
              ean2,
              ean3,
              therapeutic_class,
              tarja,
              hospital_restricted
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
              ${item.tableDate},
              ${item.ean1 ?? null},
              ${item.ean2 ?? null},
              ${item.ean3 ?? null},
              ${item.therapeuticClass ?? null},
              ${item.tarja ?? null},
              ${item.hospitalRestricted ?? null}
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
              table_date = excluded.table_date,
              ean1 = excluded.ean1,
              ean2 = excluded.ean2,
              ean3 = excluded.ean3,
              therapeutic_class = excluded.therapeutic_class,
              tarja = excluded.tarja,
              hospital_restricted = excluded.hospital_restricted
          `),
        );
        return;
      } catch (error) {
        if (attempt === 5) throw error;
        console.warn(`Batch ${index} failed on attempt ${attempt}; retrying...`);
        await wait(retryDelayMs * attempt);
      }
    }
  };

  let lastSuccessfulOffset = -1;

  try {
    for (let index = 0; index < medicines.length; index += batchSize) {
      const batch = medicines.slice(index, index + batchSize);
      await runBatch(batch, index);
      lastSuccessfulOffset = index;
      console.log(`Seeded ${Math.min(index + batch.length, medicines.length)} / ${medicines.length}`);
    }
  } catch (error) {
    // A batch that exhausts its retries here would otherwise leave the
    // price_imports row claiming (via the default/'pending' state) an
    // outcome that never happened, while the medicines table itself is
    // left mixed between the previous edition and however much of this
    // one made it in. Record that truthfully before rethrowing so /admin
    // can surface it instead of silently serving a blended table.
    await sql`
      update price_imports
         set status = 'partial',
             report = ${JSON.stringify({ lastSuccessfulOffset })}::jsonb
       where id = ${importId}
    `;
    throw error;
  }

  await sql`
    update medicines
       set delisted_at = ${isoTableDate}::date
     where import_id is distinct from ${importId}
       and delisted_at is null
  `;

  await sql`
    update medicines
       set delisted_at = null,
           last_seen_table_date = ${tableDate}
     where import_id = ${importId}
  `;

  await sql`
    update price_imports
       set status = 'applied'
     where id = ${importId}
  `;

  console.log("Neon seed complete.");
}
