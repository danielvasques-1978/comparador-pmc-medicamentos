import fallbackMedicines from "@/data/medicines.json";
import { getSql } from "@/lib/neon";
import type { IcmsZone, Medicine } from "@/lib/types";

type MedicineRow = {
  id: string;
  name: string;
  active_ingredient: string;
  laboratory: string;
  kind: Medicine["kind"];
  product_type: string | null;
  presentation: string;
  pmc: Record<IcmsZone, number>;
  ggrem_code: string | null;
  registration: string | null;
  commercialized: boolean | null;
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
        ggrem_code,
        registration,
        commercialized,
        source_page,
        source,
        table_date
      from medicines
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
      ggremCode: row.ggrem_code ?? row.id,
      registration: row.registration ?? undefined,
      commercialized: row.commercialized ?? undefined,
      sourcePage: row.source_page,
      source: row.source,
      tableDate: row.table_date,
    }));
  } catch {
    return fallbackMedicines as Medicine[];
  }
}
