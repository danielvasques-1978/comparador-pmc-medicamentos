import { temPmc } from "./precos.ts";
import type { Medicine } from "./types";

export const LIMITE_POR_GRUPO = 1000;

export type RespostaBusca = {
  comPmc: Medicine[];
  semPmc: Medicine[];
  totalComPmc: number;
  totalSemPmc: number;
  truncado: boolean;
  laboratorios: string[];
};

export function montarResposta(encontrados: Medicine[]): RespostaBusca {
  const comPmc = encontrados.filter(temPmc);
  const semPmc = encontrados.filter((item) => !temPmc(item));
  const laboratorios = Array.from(new Set(encontrados.map((item) => item.laboratory))).sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );

  return {
    comPmc: comPmc.slice(0, LIMITE_POR_GRUPO),
    semPmc: semPmc.slice(0, LIMITE_POR_GRUPO),
    totalComPmc: comPmc.length,
    totalSemPmc: semPmc.length,
    truncado: comPmc.length > LIMITE_POR_GRUPO || semPmc.length > LIMITE_POR_GRUPO,
    laboratorios,
  };
}
