import { NextResponse } from "next/server.js";

import criticalMedicines from "@/data/critical-medicines.json";
import { buscar, construirTokensEstritos } from "@/lib/busca";
import { getMedicinesCached } from "@/lib/medicines";
import { temPmc } from "@/lib/precos";
import type { Medicine } from "@/lib/types";

export const LIMITE_POR_GRUPO = 1000;
const MINIMO_DE_LETRAS = 2;

const estritos = construirTokensEstritos(criticalMedicines);

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

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const consulta = (params.get("q") ?? "").trim();
  const ids = (params.get("ids") ?? "").split(",").map((id) => id.trim()).filter(Boolean);

  if (!ids.length && consulta.length < MINIMO_DE_LETRAS) {
    return NextResponse.json(montarResposta([]));
  }

  try {
    const medicines = await getMedicinesCached();
    const encontrados = ids.length
      ? medicines.filter((item) => ids.includes(item.id))
      : buscar(medicines, consulta, estritos);
    return NextResponse.json(montarResposta(encontrados));
  } catch {
    // Responder vazio aqui seria indistinguível de "nada encontrado".
    return NextResponse.json({ erro: "Não foi possível consultar a base." }, { status: 503 });
  }
}
