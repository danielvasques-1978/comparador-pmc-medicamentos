import { NextResponse } from "next/server";

// Envolve um handler de rota que lê corpo JSON e escreve no banco. Sem isso, um
// corpo malformado ou um erro do driver (violação de chave estrangeira, overflow
// de inteiro, banco fora do ar) sobe sem tratamento e o Next devolve um 500 que
// pode vazar detalhe do erro — foi o que a varredura DAST apontou como
// "Application Error Disclosure". Aqui: JSON inválido vira 400; qualquer outra
// falha vira um 500 limpo, com o motivo no log do servidor e nunca no corpo.
export async function comGuarda(
  nome: string,
  handler: () => Promise<NextResponse>,
): Promise<NextResponse> {
  try {
    return await handler();
  } catch (erro) {
    if (erro instanceof SyntaxError) {
      return NextResponse.json({ error: "Corpo JSON inválido." }, { status: 400 });
    }
    console.error(`${nome}: falha ao processar a requisição`, erro);
    return NextResponse.json({ error: "Não foi possível processar a requisição." }, { status: 500 });
  }
}

// A coluna result_count é integer no Postgres; um valor fora de 0..2147483647
// derruba o insert. Coage qualquer entrada a um inteiro não-negativo dentro do
// teto — a varredura mandou um número de 44 dígitos e o insert estourava.
const MAX_INT4 = 2_147_483_647;
export function toResultCount(valor: unknown): number {
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(Math.floor(n), MAX_INT4);
}
