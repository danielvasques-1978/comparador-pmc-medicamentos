import type { Medicine } from "@/lib/types";

export type Codigo = {
  rotulo: string;
  valor: string;
};

type Identificavel = Pick<Medicine, "ean1" | "ggremCode" | "id">;

export function codigosDaLinha(item: Identificavel): Codigo[] {
  const codigos: Codigo[] = [];

  // O EAN é o código impresso na caixa e o que se digita ou escaneia no
  // aplicativo de preços. Vem primeiro porque é o que serve a quem compra.
  if (item.ean1) codigos.push({ rotulo: "EAN", valor: item.ean1 });

  codigos.push({ rotulo: "GGREM", valor: item.ggremCode ?? item.id });

  return codigos;
}
