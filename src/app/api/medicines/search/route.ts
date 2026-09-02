import { NextResponse } from "next/server";

import criticalMedicines from "@/data/critical-medicines.json";
import { buscar, construirTokensEstritos } from "@/lib/busca";
import { getMedicinesCached } from "@/lib/medicines";
import { montarResposta } from "@/lib/resposta-busca";

const MINIMO_DE_LETRAS = 2;

const estritos = construirTokensEstritos(criticalMedicines);

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
