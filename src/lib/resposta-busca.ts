import { temPmc } from "./precos.ts";
import type { Medicine } from "./types";

export const LIMITE_POR_GRUPO = 1000;

export type RespostaBusca = {
  comPmc: Medicine[];
  semPmc: Medicine[];
  totalComPmc: number;
  totalSemPmc: number;
  truncado: boolean;
};

// Sem faceta de laboratório aqui de propósito: calculada sobre `encontrados`,
// ela descreveria registros que o corte por grupo não chega a enviar, e não
// haveria como estreitá-la por tipo e forma. O cliente a deriva do que recebeu.
export function montarResposta(encontrados: Medicine[]): RespostaBusca {
  const comPmc = encontrados.filter(temPmc);
  const semPmc = encontrados.filter((item) => !temPmc(item));

  return {
    comPmc: comPmc.slice(0, LIMITE_POR_GRUPO),
    semPmc: semPmc.slice(0, LIMITE_POR_GRUPO),
    totalComPmc: comPmc.length,
    totalSemPmc: semPmc.length,
    truncado: comPmc.length > LIMITE_POR_GRUPO || semPmc.length > LIMITE_POR_GRUPO,
  };
}
