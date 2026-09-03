# Home sem banco em tempo de build

Data: 2026-09-03
Status: implementado em 2026-09-03 (branch home-sem-banco)

## Contexto

A home é pré-renderizada e chama `getMedicinesCached()` para montar duas listas — Tipo e Forma — e para exibir a data da tabela e a fonte antes da primeira busca. Essa chamada vai ao Neon durante o `next build`.

Em 03/09/2026 a senha do banco foi rotacionada. Enquanto a variável na Vercel carregou a senha antiga, **todo deploy falhou** na pré-renderização da home com `password authentication failed`, inclusive um deploy que só acrescentava uma linha de log. A produção ficou presa num deploy anterior, que tinha a senha antiga embutida, e a busca respondeu 503 por cerca de uma hora.

A falha em si estava certa: `getMedicines()` propaga erro de consulta por decisão de projeto, para que banco fora do ar apareça em vez de virar silêncio. O que estava errado era a home depender do banco **para desenhar dois seletores**, numa etapa — o build — em que a base já está disponível no próprio repositório.

Três fatos sustentam a mudança:

- A home é a única página estática que toca o banco. `/admin` é `force-dynamic`; as rotas de API rodam sob demanda. Nenhuma delas entra no build.
- O cron diário commita `src/data/medicines.json` a cada edição nova, e esse commit dispara um deploy. O snapshot embutido tem, portanto, a mesma edição do Neon após cada execução bem-sucedida. Quando a gravação no Neon falha, o próprio `update_cmed.py` restaura o JSON — os dois nunca divergem por mais de uma execução.
- `medicines.ts` já carrega o snapshot (`embutida`), mas o mantém privado ao módulo.

## Objetivo

Fazer o build não depender de rede nem de credencial. Uma senha errada, um banco fora do ar ou uma queda de rede na Vercel não podem impedir a publicação de código.

## Não-objetivos

- Mudar o que a busca faz, de onde ela lê, ou como `getMedicines()` trata erro. A busca continua indo ao banco em tempo de execução e continua respondendo 503 quando ele falha.
- Introduzir fallback silencioso para o snapshot em caso de erro do banco. Isso é o oposto da decisão de projeto vigente.
- Tornar a home dinâmica. Consultar o banco a cada visita só para preencher dois seletores troca uma falha de build por uma falha de página.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Origem das facetas da home | Snapshot embutido, em tempo de build |
| Onde vive a derivação | Módulo puro novo, `src/lib/facetas.ts` |
| Fidelidade | Lógica movida da home, não reescrita |
| Acesso ao snapshot | `medicines.ts` passa a exportá-lo; continua o único ponto que importa o JSON |
| `revalidate = 3600` na home | Removido — a página não busca mais nada que mude entre builds |
| Prova principal | Build local com `DATABASE_URL` deliberadamente inválida tem que passar |
| Desvio registrado na execução | `inferForm` corrigido em commit próprio, por palavra inteira (COM/COMP, CAP/CAPS, CREM/CREME), com autorização explícita: a regra antiga classificava 32 comprimidos e 4 cápsulas em 26.001 linhas |

## Arquitetura

### O módulo

`src/lib/facetas.ts` segue o padrão de `precos.ts`, `busca.ts` e `codigos.ts`: sem imports de runtime além de módulos puros do próprio `src/lib`, com caminhos relativos, para que o test runner do Node o carregue.

```ts
import { inferForm } from "./busca";
import type { Medicine } from "./types";

export type Facetas = {
  tipos: string[];
  formas: string[];
  tableDate: string;
  source: string;
};

export function facetasDaBase(medicines: Medicine[]): Facetas;
```

O corpo é o que hoje está inline em `src/app/page.tsx`, movido sem alteração de comportamento:

- `tipos`: valores distintos de `kind`, ordenados com `localeCompare(…, "pt-BR")`;
- `formas`: valores distintos de `inferForm(presentation)`, mesma ordenação;
- `tableDate`: do primeiro registro, ou `"Não informada"` se a base estiver vazia;
- `source`: do primeiro registro, ou `"Fonte importada"` se a base estiver vazia.

Os dois padrões são os que a home já usa. A regra do "primeiro registro" também é a atual — a data e a fonte são uniformes na base, porque toda ela vem de uma única edição.

### O snapshot

`medicines.ts` exporta a constante que hoje se chama `embutida` com o nome `snapshotEmbutido`. Nada mais muda nesse módulo: `getMedicines()` e `getMedicinesCached()` continuam iguais, e o JSON continua importado num único lugar.

### A home

`src/app/page.tsx` deixa de ser assíncrona, deixa de importar `getMedicinesCached` e `inferForm`, e deixa de declarar `revalidate`. Passa a:

```tsx
const { tipos, formas, tableDate, source } = facetasDaBase(snapshotEmbutido);
```

e entrega os quatro valores ao `PmcComparator`, exatamente como hoje. O componente já prefere a data e a fonte que vêm na resposta da busca; os valores da home são apenas o estado inicial, e isso não muda.

Com isso a home passa a ser estática de verdade — o `next build` a marca como `○ (Static)` sem a anotação de revalidação.

## Frescor

As facetas da home são tão atuais quanto o último commit do cron. Esse é o invariante, e ele vale porque:

1. o cron só commita o JSON quando os gates passam **e** a gravação no Neon dá certo;
2. o commit dispara um deploy, que reconstrói a home com o JSON novo;
3. se o deploy falhar por outro motivo, a data exibida no cabeçalho fica um dia atrasada até o próximo build — mas a primeira busca do visitante a sobrescreve com a data que o banco devolveu.

Há uma assimetria a registrar: as **opções** de Tipo e Forma vêm do snapshot, mas o **filtro** roda sobre as linhas que o banco devolveu. Se a CMED criar um tipo novo e o banco o receber antes de o commit do JSON entrar no ar, esse tipo fica inselecionável por uma execução do cron — as linhas dele aparecem só em "Todos". Forma é um conjunto fechado de sete valores e não sofre disso.

Não há cenário em que a home mostre uma edição que o banco não tenha.

## Tratamento de erro

Não há. O módulo não faz I/O; recebe um array e devolve quatro valores. Uma base vazia produz listas vazias e os dois padrões de texto — o mesmo que a home faz hoje quando `medicines[0]` é `undefined`.

## Testes

**Unitários, em `tests/facetas.test.ts`**, com `node --test`, no padrão dos demais:

- deduplica `kind` e ordena em `pt-BR` (uma base com tipos repetidos e fora de ordem, incluindo acento — `Específico` antes de `Similar`, `Genérico` antes de `Novo`);
- deriva `formas` por `inferForm` e deduplica (duas apresentações que caem na mesma forma produzem uma entrada);
- `tableDate` e `source` vêm do primeiro registro;
- base vazia devolve listas vazias, `"Não informada"` e `"Fonte importada"`.

**Prova de independência do banco**, feita uma vez e registrada no plano: `npm run build` com `DATABASE_URL` apontando para uma senha inválida no host real do Neon. Hoje isso reproduz a falha de 03/09; depois da mudança tem que passar, e a home tem que aparecer como `○ (Static)` na tabela de rotas.

**Verificação no navegador**: os seletores Tipo e Forma exibem as mesmas opções de antes, e o cabeçalho mostra a data da tabela antes de qualquer busca.

## Riscos conhecidos

- **O snapshot pesa 17 MB no repositório e é importado no build.** Isso já acontece hoje — `medicines.ts` o importa desde sempre — e não muda com esta feature. O peso pré-renderizado da home continua na casa dos quilobytes, porque o JSON não vai para o cliente.
- **Se alguém um dia remover o commit do JSON do cron**, o invariante de frescor quebra silenciosamente: a home passaria a mostrar a edição do último commit manual. O plano deve deixar isso escrito como comentário no ponto de uso.
- **`revalidate` some.** Se no futuro a home voltar a precisar de dado de execução, a anotação volta junto. Hoje ela só serviria para regenerar uma página que não muda.
