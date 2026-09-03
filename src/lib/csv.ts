/** Campo CSV comum: entre aspas, com aspas internas duplicadas. */
export function celulaTexto(valor: unknown) {
  return `"${String(valor).replaceAll('"', '""')}"`;
}

/**
 * Campo para código numérico longo — EAN de 13 dígitos, GGREM de 15.
 *
 * O Excel converte todo campo só de dígitos em número ao abrir um CSV, e nesses
 * comprimentos isso vira notação científica com perda de dígitos: 7898581710462
 * aparece como 7,89858E+12 e o código deixa de servir na farmácia.
 *
 * A forma `="..."` faz o Excel — e o LibreOffice e o Google Sheets — tratarem o
 * conteúdo como texto. Vai sem aspas externas de propósito: entre aspas, se o
 * Excel tratasse a fórmula como literal, a célula mostraria `="7898581710462"`
 * na cara do usuário. Sem aspas a receita vale nas duas interpretações, e é
 * segura aqui porque só dígitos entram — nada de `;`, aspa ou quebra de linha.
 *
 * O preço é que um leitor de CSV cru mostra a fórmula literal. Para código de
 * barras, abrir certo no Excel vale esse ruído.
 */
export function celulaDeCodigo(valor: string) {
  if (valor === "") return "";
  if (!/^\d+$/.test(valor)) return celulaTexto(valor);
  return `="${valor}"`;
}
