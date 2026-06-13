import { PmcComparator } from "@/components/pmc-comparator";
import { getMedicines } from "@/lib/medicines";

export const revalidate = 3600;

export default async function Home() {
  const medicines = await getMedicines();
  return <PmcComparator medicines={medicines} />;
}
