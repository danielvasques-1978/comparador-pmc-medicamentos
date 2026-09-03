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
  if (item.ean1) codigos.push({ rotulo: "Código de barras", valor: item.ean1 });

  codigos.push({ rotulo: "GGREM", valor: item.ggremCode ?? item.id });

  return codigos;
}

/**
 * Os mesmos códigos em colunas fixas, para exportação. Ao contrário da linha na
 * tela, o CSV precisa de posição estável: apresentação sem EAN traz a coluna
 * vazia em vez de deslocar o GGREM para a esquerda.
 */
export function codigosParaCsv(item: Identificavel) {
  return {
    ean: item.ean1 || "",
    ggrem: item.ggremCode ?? item.id,
  };
}
