import { PmcComparator } from "@/components/pmc-comparator";
import { getMedicinesCached } from "@/lib/medicines";
import { inferForm } from "@/lib/busca";

export const revalidate = 3600;

export default async function Home() {
  const medicines = await getMedicinesCached();
  const tipos = Array.from(new Set(medicines.map((item) => item.kind))).sort((a, b) => a.localeCompare(b, "pt-BR"));
  const formas = Array.from(new Set(medicines.map((item) => inferForm(item.presentation)))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
  return <PmcComparator formas={formas} tipos={tipos} />;
}
