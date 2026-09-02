# Busca no servidor

Data: 2026-09-02
Status: aprovado, aguardando plano de implementação

## Contexto

A home é uma página pré-renderizada que chama `getMedicines()` e passa a base inteira como propriedade para `PmcComparator`, um componente de cliente. Toda a busca e todos os filtros rodam no navegador, sobre as 26.001 apresentações em memória.

Isso tem duas consequências. A primeira é que a página pesa **19,98 MB** pré-renderizada — e a Vercel recusa respostas pré-renderizadas acima de 19,07 MB, com `FALLBACK_BODY_TOO_LARGE`. O deploy que traria as 3.913 apresentações de uso restrito hospitalar foi rejeitado por isso; o site segue no ar servindo o deploy anterior. A segunda é que cada visitante baixa **1,6 MB comprimidos** para fazer uma busca, o que num celular, em consultório, é caro.

Acrescentar as 3.913 linhas não criou o problema — apenas empurrou o número para além do teto. A causa é a arquitetura: a base inteira atravessa a rede a cada visita.

## Objetivo

Tirar a base do navegador. A busca passa a acontecer no servidor, e só os resultados trafegam.

## Não-objetivos

- Mudar o que a busca encontra. O resultado deve ser idêntico ao atual.
- Reescrever a busca em SQL. O índice de trigramas em `medicines.search_text` existe e continuará sem uso; usá-lo é uma opção futura, não parte deste trabalho.
- Mexer nos filtros de tipo, laboratório, forma, teto de preço, ordenação ou troca de alíquota.
- Busca de preço em farmácias.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Interação | Consulta 300 ms após a última tecla, sem exigir Enter |
| Fidelidade | Mesma lógica de casamento, movida para o servidor, não reescrita |
| Transporte | Rota `GET`, com parâmetros na URL |
| Divisão de trabalho | Servidor busca; navegador filtra, ordena e troca alíquota |
| Limite de tráfego | Até mil registros por consulta |

## O que é caro e o que não é

A distinção que orienta todo o desenho: a **busca** percorre 26.001 registros e é a única operação que justifica ir ao servidor. Os demais filtros operam sobre o que a busca devolveu — algumas centenas de itens — e continuam instantâneos no navegador.

Por isso apenas a digitação passa a viajar. Trocar de UF, alternar tipo, escolher laboratório, mexer no teto de preço e reordenar continuam sem rede, exatamente como hoje.

## Arquitetura

### A lógica de casamento sai do componente

As funções que hoje vivem em `src/components/pmc-comparator.tsx` — `normalize`, a tokenização, `matchesSearch`, `matchesRelatedIngredient` e a construção do conjunto de princípios ativos relacionados — passam para um módulo novo, `src/lib/busca.ts`, sem imports de runtime além de tipos.

A restrição de "sem imports de runtime" é a mesma que aplicamos a `src/lib/precos.ts`, e pelo mesmo motivo: é o que permite testar a lógica com o test runner do Node, já que o projeto não tem como testar componentes React.

O módulo expõe uma função de busca que recebe a base e a consulta e devolve os registros que casaram, incluindo a expansão por princípio ativo. Nada da lógica é reescrito — ela é movida.

### A rota

`GET /api/medicines/search`, com dois modos:

- `?q=<consulta>` — busca por texto. Devolve os registros que casaram.
- `?ids=<lista de GGREM>` — busca por código. Serve os favoritos, que hoje filtram a base em memória.

A resposta traz:

- os registros que casaram, separados nos dois grupos (com PMC e sem PMC), cada um limitado a mil;
- as contagens reais de cada grupo, antes do limite;
- as opções de laboratório e de forma presentes no conjunto encontrado, para alimentar os seletores;
- um indicador de que houve truncamento, quando a contagem real excede o limite.

Os registros vão completos, com todas as alíquotas de preço. Mil registros dão cerca de 80 KB comprimidos, contra 1,6 MB hoje — e é o que permite trocar de UF sem nova requisição.

O limite de mil vale **por grupo**, não somado.

### Três números diferentes, e o que cada um significa

Como o servidor busca e o navegador filtra depois, existem três quantidades distintas, e confundi-las produziria um contador que promete linhas que a tela não mostra:

1. **Quantos casaram a busca**, contado no servidor antes de qualquer limite.
2. **Quantos sobraram** depois dos filtros de tipo, laboratório, forma e teto, aplicados no navegador.
3. **Quantos estão à vista**, depois do corte de 250 por grupo.

O contador ao lado da lista mostra o número 2 — o que o usuário obteria rolando a página. O aviso de truncamento aparece quando o número 1 excede mil, e diz que existem mais resultados do que os trazidos. Nenhum lugar da interface exibe o número 1 como se fosse o total disponível na tela.

### O servidor

A rota usa o `getMedicines()` que já existe, com sua preferência por Neon e queda para o JSON. A base é guardada em memória entre requisições da mesma instância, para que digitar não gere uma consulta ao banco por tecla.

### A home

`src/app/page.tsx` deixa de chamar `getMedicines()` e de passar a base. O componente passa a começar sem dados e a buscá-los pela rota. O peso pré-renderizado cai de 19,98 MB para alguns quilobytes.

## A prova de que o resultado é idêntico

Esta é a parte que sustenta a decisão de fidelidade, e não pode ser substituída por inspeção.

Antes de mover qualquer código, um script gera um arquivo de referência: para um conjunto de consultas, ele roda a lógica **atual** sobre a base real e grava os códigos GGREM que ela retorna, ordenados. As consultas são `clonazepam`, `leqembi`, `dipirona`, `escitalopram`, `insulina`, uma consulta de duas letras, uma sem resultado, e uma amostra de dez das 111 substâncias de `critical-medicines.json`.

Depois da mudança, um teste roda a lógica movida sobre a mesma base e compara conjunto a conjunto com o arquivo de referência. Divergência quebra o teste.

O arquivo de referência é versionado. Ele documenta o comportamento e, se um dia a busca mudar de propósito, é ele que precisa ser regerado deliberadamente.

## Tratamento de erro

- **A rota falha ou a rede cai.** O componente mostra que a busca não pôde ser feita e oferece tentar de novo. Não mostra lista vazia, que seria indistinguível de "nada encontrado".
- **Consulta com menos de duas letras.** A rota devolve conjunto vazio sem consultar a base, como o componente já faz hoje.
- **Requisições em voo sobrepostas.** Digitar rápido gera consultas que podem retornar fora de ordem. A resposta de uma consulta antiga nunca substitui a de uma mais recente.
- **A base não carrega no servidor.** A rota responde com erro explícito, e não com conjunto vazio.

## Testes

- **Fidelidade:** o teste de ouro descrito acima, sobre a base real.
- **Módulo de busca:** casos unitários para a tokenização, a lista de palavras ignoradas e a expansão por princípio ativo — movidos ou escritos onde hoje não existem, já que essa lógica nunca teve teste.
- **Rota:** consulta curta devolve vazio sem tocar a base; consulta com resultado devolve os dois grupos e as facetas; modo `ids` devolve exatamente os pedidos; truncamento é sinalizado quando a contagem excede mil.
- **Corrida:** uma resposta atrasada de consulta anterior não sobrescreve a atual.

## Riscos conhecidos

- **Primeira requisição após ociosidade.** A instância carrega a base antes de responder. Aceito: acontece uma vez por instância, não por usuário.
- **O limite de mil é novo.** Hoje o navegador tem tudo, mesmo exibindo 250. Buscas muito genéricas passarão a informar que existem mais resultados do que os trazidos. É uma mudança visível, e a mensagem precisa dizê-lo sem ambiguidade.
- **A busca deixa de funcionar sem JavaScript ativo.** Hoje também não funciona, porque o componente é de cliente — então não há regressão, mas o desenho não melhora isso.
- **O índice de trigramas continua sem uso.** Se a base crescer muito além de 26 mil, a busca em memória vira o gargalo e a reescrita em SQL volta à mesa. Não é o caso hoje.
