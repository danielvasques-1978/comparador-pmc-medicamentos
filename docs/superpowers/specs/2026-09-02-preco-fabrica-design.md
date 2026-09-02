# Exibição de apresentações com Preço Fábrica e sem PMC

Data: 2026-09-02
Status: aprovado, aguardando plano de implementação

## Contexto

O comparador serve exclusivamente PMC — Preço Máximo ao Consumidor. O importador descarta qualquer linha da planilha CMED que não tenha nenhum valor de PMC preenchido.

O caso que expôs o problema: **LEQEMBI (lecanemabe)**, indicado em doença de Alzheimer. Ele consta da edição CMED de 11/08/2026 em duas apresentações, mas com todas as colunas de PMC vazias e apenas Preço Fábrica preenchido — R$ 1.582,23 e R$ 3.955,58. O site não o exibe, e não explica por quê: para quem consulta, o medicamento simplesmente não existe.

Levantamento sobre a edição de 11/08/2026:

- **3.913 apresentações** têm Preço Fábrica e não têm PMC.
- **3.913 de 3.913 têm `RESTRIÇÃO HOSPITALAR = Sim`.** Sem exceção — o rótulo "uso restrito hospitalar" é literalmente verdadeiro para todo o grupo.
- Dessas, 2.003 são comercializadas e 1.910 não. A base já inclui apresentações não comercializadas, então esse eixo não introduz nada novo.
- **Nenhuma linha** da planilha fica sem PF e sem PMC. O grupo descartado hoje é exatamente este.

A CMED não fixa PMC para produtos de uso restrito hospitalar porque eles não são vendidos em farmácia. O PF é o teto de venda a farmácias, hospitais e entes públicos.

## Objetivo

Deixar de silenciar essas apresentações, exibindo o Preço Fábrica de forma que não possa ser lido como preço ao consumidor.

## Não-objetivos

- PMVG e colunas de Área de Livre Comércio.
- Busca de preço em farmácias (feature separada, spec futuro).
- Qualquer mudança na lista principal de PMC além do filtro que a mantém homogênea.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Onde aparecem | Bloco próprio, abaixo da lista principal |
| Lista principal | Continua só com PMC, comparável entre si |
| Preço exibido | Preço Fábrica na mesma alíquota de ICMS selecionada |
| Rótulo | "Uso restrito hospitalar", verdadeiro para 100% do grupo |
| Aviso | Texto fixo, explicitando que PF não é preço final |

## Modelo de dados

O importador passa a aceitar linhas com PF e sem PMC. Cada apresentação ganha um campo `pf`, com a mesma estrutura por alíquota que `pmc` já usa: um objeto indexado por `17`, `18`, `19`, `19.5`, `20`, `20.5`, `22.5`, `23`.

O campo `pf` é gravado **apenas nas apresentações sem PMC**. A planilha traz PF para todas, mas armazená-lo nas que já têm PMC acrescentaria cerca de 5 MB ao `medicines.json` sem nenhum consumidor — e a home já entrega 1,6 MB comprimidos por visita, porque embarca a base inteira. Cada apresentação carrega, portanto, exatamente um dos dois conjuntos de preço.

A regra de descarte muda de "não tem nenhum PMC" para **"não tem nenhum PMC e não tem nenhum PF"**. Hoje essa regra não descarta linha alguma, e é justamente por isso que ela deve existir: protege contra uma linha vazia numa edição futura sem depender de o grupo hospitalar continuar existindo.

No banco entra uma coluna `pf jsonb`, alimentada pelo seed do mesmo modo que `pmc`.

## Separação em um único lugar

A distinção entre os dois grupos é feita por um predicado único, exportado de `src/lib/medicines.ts`:

```
temPmc(item) -> boolean
```

Verdadeiro quando o item tem ao menos um valor de PMC. Todo ponto do código que hoje assume a existência de PMC passa por ele. Um único predicado evita que os quatro pontos de quebra abaixo divirjam entre si.

## Os quatro pontos de quebra

Estes são os lugares onde o código atual assume que PMC sempre existe. Cada um produz um erro diferente se ignorado.

1. **Célula de preço** — `src/components/pmc-comparator.tsx` renderiza `currency.format(item.pmc[selectedZone] ?? 0)`. Uma apresentação sem PMC exibiria **R$ 0,00**: um medicamento de R$ 3.955 anunciado como gratuito. O `?? 0` sai; a célula passa a exibir PF ou PMC conforme o grupo, e nunca zero por ausência.
2. **Ordenação por preço** — usa `?? Number.POSITIVE_INFINITY`. Passa a ordenar dentro de cada grupo pelo preço aplicável àquele grupo, sem nunca comparar PF com PMC.
3. **Filtro de faixa de preço** — usa `?? 0`, o que colocaria todo o grupo hospitalar em qualquer faixa que inclua zero. Passa a operar sobre o preço aplicável.
4. **Exportação CSV** — grava a coluna de PMC. Ganha uma coluna `tipo_preco`, com valor `PMC` ou `PF`, para que a planilha exportada preserve a distinção.

## Interface

A lista principal filtra por `temPmc` e não muda em nada.

Abaixo dela, quando a busca corrente casar com apresentações sem PMC, aparece um bloco próprio com este texto:

> **Sem preço máximo ao consumidor**
>
> Uso restrito hospitalar. A CMED não fixa PMC para estes produtos; o valor abaixo é o **Preço Fábrica**, que é o teto de venda para farmácias, hospitais e órgãos públicos — **não** é o preço final ao consumidor, e o valor cobrado será maior.

Cada linha do bloco mostra `PF {UF} | ICMS {alíquota}` no lugar de `PMC {UF} | ICMS {alíquota}`, com um selo visível distinguindo a natureza do preço. O bloco respeita o mesmo limite de 250 resultados da lista principal e o mesmo controle de acesso por assinatura, para não abrir por vias transversas o que a lista principal restringe.

Quando a busca não casar com nenhuma apresentação sem PMC, o bloco não é renderizado.

## Consequência operacional

Publicar esta mudança **não** faz as 3.913 apresentações aparecerem. Elas entram apenas quando a base for regerada pelo importador já alterado. Duas formas: esperar a próxima edição da CMED, que o cron importa sozinho, ou rodar `npm run update:cmed -- --force` deliberadamente após o deploy.

Isso precisa constar do `DEPLOYMENT.md`, porque o intervalo entre o deploy e a regeração é uma janela em que o código novo está no ar e o problema do Leqembi continua visível.

## Efeito nas travas

A regeração acrescenta 3.913 apresentações de uma vez: a base vai de 22.088 para 26.001, um crescimento de **17,7%**. A trava de volume tolera até +50%, então passa — mas por uma margem que vale registrar, já que é um salto único e não recorrente.

A trava de EAN exige 90% de cobertura. É preciso verificar, durante a implementação, que o grupo hospitalar não derruba esse índice abaixo do limite; o Leqembi tem EAN, mas o grupo inteiro não foi medido.

Entra uma **sexta trava**, `hospitalar`: reprova a edição quando alguma apresentação sem PMC não tiver `RESTRIÇÃO HOSPITALAR = Sim`. Ela existe para proteger a redação do aviso, que afirma uso hospitalar para todo o grupo. Seu limite fica em `scripts/cmed_limits.py` junto com os demais, tolerando zero exceções.

## Testes

Fixture com três linhas, cobrindo os três destinos possíveis:

- linha com PMC preenchido, que entra no grupo normal;
- linha com PF e sem PMC, que entra no grupo hospitalar com o `pf` correto;
- linha sem PMC e sem PF, que continua sendo descartada.

Mais dois testes sobre o predicado `temPmc` e um teste de regressão garantindo que nenhuma apresentação sem PMC produz `R$ 0,00` em nenhum dos quatro pontos de quebra.

## Riscos conhecidos

- O texto do aviso é a única barreira entre o Preço Fábrica e alguém lendo-o como preço de balcão. Ele é fixo, não configurável, e sua redação foi validada com o autor do projeto.
- O aviso afirma "uso restrito hospitalar" para o grupo inteiro. Isso é verdade em 3.913 de 3.913 apresentações hoje, mas é uma característica dos dados, não uma garantia da CMED. Em vez de derivar o rótulo item a item — o que deixaria a afirmação silenciosamente enfraquecer sem ninguém notar — a implementação transforma a premissa em invariante verificada: uma nova trava reprova a importação quando alguma apresentação sem PMC não tiver `RESTRIÇÃO HOSPITALAR = Sim`. Se a CMED mudar esse padrão, a edição é barrada, o e-mail chega, e a redação do aviso é revista deliberadamente em vez de continuar no ar imprecisa.
