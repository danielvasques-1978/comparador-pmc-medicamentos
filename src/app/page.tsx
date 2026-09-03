import { PmcComparator } from "@/components/pmc-comparator";
import { facetasDaBase } from "@/lib/facetas";
import { snapshotEmbutido } from "@/lib/medicines";

// As facetas saem do snapshot embutido, não do banco: o build não pode
// depender de rede nem de credencial. Elas são tão atuais quanto o último
// commit do cron, que grava src/data/medicines.json a cada edição nova e
// dispara o deploy — se esse commit um dia sair do workflow, a home passa a
// mostrar a edição do último commit manual, sem avisar.
export default function Home() {
  const { tipos, formas, tableDate, source } = facetasDaBase(snapshotEmbutido);
  return <PmcComparator formas={formas} tipos={tipos} tableDate={tableDate} source={source} />;
}
