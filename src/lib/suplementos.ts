import { textTokens } from "./busca.ts";

export type Suplemento = {
  /** Nome exibido no aviso. Sempre no singular: o título e a frase que o
   *  acompanham são compartilhados e precisam concordar em número. */
  nome: string;
  /** Grafias que disparam o aviso. A primeira não precisa ser a canônica. */
  termos: string[];
  /** Ressalva específica desta substância, quando existir. */
  observacao?: string;
};

/**
 * Substâncias procuradas com frequência que a tabela da CMED nunca conterá,
 * porque não são medicamentos registrados no Brasil — são suplementos
 * alimentares, de preço livre.
 *
 * Entrar nesta lista exige que a busca do site não devolva nada para o termo:
 * tests/suplementos.test.ts verifica isso contra a base congelada. Se uma
 * substância daqui vier a ter registro de medicamento, o teste quebra e a
 * entrada sai da lista — o aviso jamais deve contradizer o que o site mostra.
 */
const SUPLEMENTOS: Suplemento[] = [
  {
    nome: "Melatonina",
    termos: ["melatonina", "melatonin"],
    observacao:
      "Também é manipulada sob prescrição, e farmácia de manipulação igualmente não tem preço tabelado pela CMED.",
  },
  { nome: "Colágeno", termos: ["colageno", "peptideos de colageno"] },
  { nome: "Whey protein", termos: ["whey protein", "whey", "proteina do soro do leite"] },
  { nome: "Coenzima Q10", termos: ["coenzima q10", "ubiquinona"] },
  { nome: "Espirulina", termos: ["espirulina", "spirulina"] },
  { nome: "Resveratrol", termos: ["resveratrol"] },
  { nome: "Picolinato de cromo", termos: ["picolinato de cromo", "picolinato"] },
  { nome: "Probiótico", termos: ["probiotico", "probioticos", "lactobacilo", "bifidobacterium"] },
];

/**
 * Mesma semântica de casamento da busca do site: cada token digitado precisa
 * ser prefixo de algum token da grafia. Assim "melato" encontra "melatonina",
 * como aconteceria na tabela.
 */
function grafiaCasa(consulta: string, grafia: string) {
  const tokensConsulta = textTokens(consulta).filter((token) => token.length >= 3);
  if (tokensConsulta.length === 0) return false;

  const tokensGrafia = textTokens(grafia);
  return tokensConsulta.every((token) => tokensGrafia.some((alvo) => alvo.startsWith(token)));
}

/**
 * Devolve o suplemento correspondente à consulta, ou null. Só faz sentido
 * chamar quando a busca não devolveu resultado: o aviso explica uma ausência.
 */
export function suplementoConsultado(consulta: string): Suplemento | null {
  return SUPLEMENTOS.find((item) => item.termos.some((grafia) => grafiaCasa(consulta, grafia))) ?? null;
}

export const suplementosConhecidos: readonly Suplemento[] = SUPLEMENTOS;
