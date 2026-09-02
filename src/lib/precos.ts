import type { IcmsZone, Medicine } from "@/lib/types";

export type PrecoAplicavel = {
  valor: number | null;
  tipo: "PMC" | "PF";
};

function algumValor(mapa: Partial<Record<IcmsZone, number | null>> | undefined) {
  return Object.values(mapa ?? {}).some((valor) => typeof valor === "number");
}

export function temPmc(item: Pick<Medicine, "pmc">) {
  return algumValor(item.pmc);
}

export function precoAplicavel(
  item: Pick<Medicine, "pmc" | "pf">,
  zona: IcmsZone,
): PrecoAplicavel {
  if (temPmc(item)) {
    const valor = item.pmc?.[zona];
    return { valor: typeof valor === "number" ? valor : null, tipo: "PMC" };
  }
  const valor = item.pf?.[zona];
  return { valor: typeof valor === "number" ? valor : null, tipo: "PF" };
}
