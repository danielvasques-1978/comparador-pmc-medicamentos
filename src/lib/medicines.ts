import fallbackMedicines from "@/data/medicines.json";
import { getSql } from "@/lib/neon";
import type { Medicine } from "@/lib/types";

type MedicineRow = {
  id: string;
  name: string;
  active_ingredient: string;
  laboratory: string;
  kind: Medicine["kind"];
  product_type: string | null;
  presentation: string;
  pmc: Medicine["pmc"];
  pf: Medicine["pf"] | null;
  ggrem_code: string | null;
  registration: string | null;
  commercialized: boolean | null;
  ean1: string | null;
  ean2: string | null;
  ean3: string | null;
  therapeutic_class: string | null;
  tarja: string | null;
  hospital_restricted: boolean | null;
  source_page: number;
  source: string;
  table_date: string;
};

export async function getMedicines() {
  const sql = getSql();
  if (!sql) return fallbackMedicines as Medicine[];

  try {
    const rows = await sql`
      select
        id,
        name,
        active_ingredient,
        laboratory,
        kind,
        product_type,
        presentation,
        pmc,
        pf,
        ggrem_code,
        registration,
        commercialized,
        ean1,
        ean2,
        ean3,
        therapeutic_class,
        tarja,
        hospital_restricted,
        source_page,
        source,
        table_date
      from medicines
      where delisted_at is null
      order by laboratory, name, presentation
    `;

    if (rows.length === 0) return fallbackMedicines as Medicine[];

    return (rows as MedicineRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      activeIngredient: row.active_ingredient,
      laboratory: row.laboratory,
      kind: row.kind,
      productType: row.product_type ?? row.kind,
      presentation: row.presentation,
      pmc: row.pmc,
      pf: row.pf ?? undefined,
      ggremCode: row.ggrem_code ?? row.id,
      registration: row.registration ?? undefined,
      commercialized: row.commercialized ?? undefined,
      ean1: row.ean1 ?? undefined,
      ean2: row.ean2 ?? undefined,
      ean3: row.ean3 ?? undefined,
      therapeuticClass: row.therapeutic_class ?? undefined,
      tarja: row.tarja ?? undefined,
      hospitalRestricted: row.hospital_restricted ?? undefined,
      sourcePage: row.source_page,
      source: row.source,
      tableDate: row.table_date,
    }));
  } catch {
    return fallbackMedicines as Medicine[];
  }
}

const CACHE_MS = 15 * 60 * 1000;

let cache: { at: number; medicines: Medicine[] } | null = null;
let emVoo: Promise<Medicine[]> | null = null;

export async function getMedicinesCached() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.medicines;
  // Sem esta guarda, várias requisições simultâneas numa instância fria
  // disparariam a mesma consulta ao banco em paralelo.
  if (!emVoo) {
    emVoo = getMedicines()
      .then((medicines) => {
        cache = { at: Date.now(), medicines };
        return medicines;
      })
      .finally(() => {
        emVoo = null;
      });
  }
  return emVoo;
}
