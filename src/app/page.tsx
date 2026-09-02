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
  // A data da edição e a fonte são a credencial da página inteira, e precisam
  // aparecer antes da primeira busca: a resposta só as sobrescreve quando chega.
  const base = medicines[0];
  return (
    <PmcComparator
      formas={formas}
      tipos={tipos}
      tableDate={base?.tableDate ?? "Não informada"}
      source={base?.source ?? "Fonte importada"}
    />
  );
}
