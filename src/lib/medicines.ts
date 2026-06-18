import fallbackMedicines from "@/data/medicines.json";
import manualCriticalMedicines from "@/data/manual-critical-medicines.json";
import manualMedicines from "@/data/manual-medicines.json";
import { getSql } from "@/lib/neon";
import type { IcmsZone, Medicine } from "@/lib/types";

type MedicineRow = {
  id: string;
  name: string;
  active_ingredient: string;
  laboratory: string;
  kind: Medicine["kind"];
  presentation: string;
  pmc: Record<IcmsZone, number>;
  source_page: number;
  source: string;
  table_date: string;
};

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function cleanMedicine(medicine: Medicine) {
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

function cleanMedicines(medicines: Medicine[]) {
  const supplements = [...(manualCriticalMedicines as Medicine[]), ...(manualMedicines as Medicine[])];
  const manualIds = new Set(supplements.map((medicine) => medicine.id));
  const cleaned = medicines.flatMap((medicine) => {
    if (manualIds.has(medicine.id)) return [];
    const cleaned = cleanMedicine(medicine);
    return cleaned ? [cleaned] : [];
  });
  return [...cleaned, ...supplements];
}

export async function getMedicines() {
  const sql = getSql();
  if (!sql) return cleanMedicines(fallbackMedicines as Medicine[]);

  try {
    const rows = await sql`
      select
        id,
        name,
        active_ingredient,
        laboratory,
        kind,
        presentation,
        pmc,
        source_page,
        source,
        table_date
      from medicines
      order by laboratory, name, presentation
    `;

    if (rows.length === 0) return cleanMedicines(fallbackMedicines as Medicine[]);

    return cleanMedicines((rows as MedicineRow[]).map((row) => ({
      id: row.id,
      name: row.name,
      activeIngredient: row.active_ingredient,
      laboratory: row.laboratory,
      kind: row.kind,
      presentation: row.presentation,
      pmc: row.pmc,
      sourcePage: row.source_page,
      source: row.source,
      tableDate: row.table_date,
    })));
  } catch {
    return cleanMedicines(fallbackMedicines as Medicine[]);
  }
}
