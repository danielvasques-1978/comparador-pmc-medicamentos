import { inferForm } from "./busca.ts";
import type { Medicine } from "./types.ts";

export type FonteDeFacetas = Pick<Medicine, "kind" | "presentation" | "tableDate" | "source">;

export type Facetas = {
  tipos: string[];
  formas: string[];
  tableDate: string;
  source: string;
};

const porNomePtBr = (a: string, b: string) => a.localeCompare(b, "pt-BR");

/**
 * As facetas que a home entrega ao comparador antes da primeira busca. Vêm do
 * snapshot embutido, não do banco: o build não pode depender de rede nem de
 * credencial. São tão atuais quanto o último commit do cron, que grava
 * src/data/medicines.json a cada edição nova e dispara o deploy.
 */
export function facetasDaBase(medicines: FonteDeFacetas[]): Facetas {
  const tipos = Array.from(new Set(medicines.map((item) => item.kind))).sort(porNomePtBr);
  const formas = Array.from(new Set(medicines.map((item) => inferForm(item.presentation)))).sort(porNomePtBr);
  // A data e a fonte são uniformes na base — toda ela vem de uma única
  // edição —, então o primeiro registro responde pela página inteira.
  const base = medicines[0];
  return {
    tipos,
    formas,
    tableDate: base?.tableDate ?? "Não informada",
    source: base?.source ?? "Fonte importada",
  };
}
