# Encaminhamento para consulta de preço em farmácias

Data: 2026-09-02
Status: aprovado, aguardando plano de implementação

## Contexto

O propósito original do comparador era permitir que, escolhida uma apresentação, a pessoa comparasse o preço regulado com o preço real praticado em farmácias próximas. Com o EAN agora presente em 100% das 26.001 apresentações e indexado no banco, a chave técnica existe.

O que não existe é o canal. A investigação encontrou três caminhos, e nenhum serve a um site de terceiros:

| Caminho | Situação |
|---|---|
| App **Menor Preço Brasil**, das secretarias estaduais de fazenda | Tem o dado, alimentado por NF-e e NFC-e, mas o acesso é por conta gov.br do próprio cidadão. Não há API anônima. |
| **SAE** da SEFAZ-SP | Serve o contribuinte a recuperar as **próprias** notas, mediante certificado e-CNPJ. Não é consulta de preços. |
| API do **Nota Paraná** | Pública, porém restrita a um estado e com vedação explícita a consultas automatizadas. |

Agregadores comerciais têm os dados e bloqueiam acesso automatizado — uma requisição ao Consulta Remédios retornou HTTP 403. Usá-los exigiria acordo comercial, que é decisão de negócio.

Um ponto de contexto que mudou a favor: a NFC-e passou a ser **obrigatória em São Paulo desde 1º de janeiro de 2026**, com o encerramento do SAT-CF-e. O dado de venda ao consumidor existe no estado onde estão os usuários; o que falta é permissão de acesso, não matéria-prima.

Esta constatação é o resultado de uma investigação, não uma prova de impossibilidade. Pode existir convênio ou programa de parceiros não encontrado. Se um surgir, o EAN e o índice já estarão prontos.

## Objetivo

Fechar a lacuna entre o que o site sabe e o que a pessoa precisa saber, encaminhando-a a quem tem o dado — sem que o site afirme conhecer preço de farmácia.

## Não-objetivos

- Consumir qualquer API de preço, oficial ou comercial.
- Raspar agregadores.
- Prometer preço por CEP, por raio ou por farmácia.
- Qualquer coisa que dependa de acordo comercial ainda inexistente.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Forma | Encaminhamento informativo, sem consumo de dados |
| Posição | Um bloco único abaixo das listas, não um controle por linha |
| Quando aparece | Somente quando a lista com PMC tem resultados — não basta haver resultados na tela |
| Código na linha | EAN em destaque, rotulado "Código de barras"; GGREM passa a secundário |
| Fricção do app | Declarada de saída: é aplicativo de celular e exige conta gov.br |

## O bloco

Aparece uma vez, abaixo das duas listas, e só quando a lista com PMC tem resultados — não quando qualquer uma das duas tem. Uma busca que só devolve apresentações de uso restrito hospitalar (Preço Fábrica, sem PMC) não mostra o bloco: o encaminhamento aponta para um aplicativo alimentado por vendas de varejo ao consumidor, e essas apresentações não circulam em farmácia de varejo. Mandar alguém instalar um aplicativo e criar conta gov.br para procurar um medicamento que não é vendido em farmácia é uma promessa que o site não pode cumprir. Com até 500 linhas em tela, um controle por linha seria ruído.

Texto, literal:

> **Quanto custa na farmácia?**
>
> Os valores desta página vêm da tabela da CMED e são preços de referência — o teto ao consumidor, ou o Preço Fábrica quando a CMED não fixa teto. Nenhum deles é necessariamente o que a farmácia cobra, e a diferença entre estabelecimentos costuma ser grande.
>
> Para conferir o preço real perto de você, o aplicativo **Menor Preço Brasil**, das secretarias estaduais de fazenda, mostra valores de vendas registradas em nota fiscal nos últimos dias. É um aplicativo de celular, para Android e iPhone, e exige conta gov.br.
>
> Leve o código de barras da apresentação escolhida — ele aparece nas linhas que trazem o código.

A primeira frase é redigida para valer nos dois grupos. Dizer "o valor acima é o teto" seria falso para as apresentações de uso restrito hospitalar, que exibem Preço Fábrica.

A menção à fricção do aplicativo — celular e conta gov.br — é deliberada. Descobrir isso depois de instalar é pior do que saber antes.

O bloco não leva link para loja de aplicativos. O site nomeia a ferramenta; instalar é escolha de quem lê, e um link para loja envelhece mal.

## O código na linha

Cada linha exibe hoje `GGREM 542726030005502`, um código de regulação sem utilidade para quem vai comprar. O EAN é o que está impresso na caixa e o que se digita ou escaneia no aplicativo.

A linha passa a mostrar o EAN em destaque, rotulado "Código de barras" — a linguagem de quem compra, não a técnica —, com o GGREM ao lado, em tipografia secundária e rótulo inalterado. O GGREM permanece porque é o identificador que amarra a apresentação à tabela oficial, útil para conferência.

Apresentações sem EAN não exibem o rótulo vazio; mostram apenas o GGREM, como hoje. Na edição de 11/08/2026 isso não ocorre — a cobertura é de 100% —, mas a interface não deve depender disso.

## Tratamento de erro

Não há. O bloco é texto estático e o EAN já vem no registro. Esta feature não faz requisição alguma, não tem estado de carregamento e não pode falhar — o que é precisamente a razão de ela ter sido escolhida em vez das alternativas.

## Testes

O grosso é conteúdo estático, que teste automatizado cobre mal. O que merece teste é a regra de exibição do código:

- apresentação com EAN mostra o EAN em destaque e o GGREM em seguida;
- apresentação sem EAN mostra apenas o GGREM, sem rótulo vazio nem traço solto.

Essa regra vira uma função pura num módulo novo, `src/lib/codigos.ts`, sem imports de runtime — o mesmo padrão de `src/lib/precos.ts` e `src/lib/busca.ts`, que é o que os torna carregáveis pelo runner do Node. Ela não cabe em `precos.ts`, cuja responsabilidade é preço, nem em `busca.ts`, cuja responsabilidade é casamento de texto.

É um módulo pequeno para uma regra pequena. Vale porque é a única lógica desta feature, e porque a alternativa — deixá-la embutida no componente — a tornaria inverificável, já que o projeto não tem como testar React.

A presença do bloco em si — aparece com resultados, some sem eles — é verificada no navegador.

## Riscos conhecidos

- **O texto é uma afirmação sobre o mercado.** Dizer que a diferença entre estabelecimentos costuma ser grande é verdadeiro no varejo comum, e a redação evita quantificar. Se vier a ser impreciso para alguma classe, é o texto que se ajusta.
- **O nome do aplicativo pode mudar.** Ele já absorveu apps estaduais anteriores. Como o bloco nomeia sem linkar, um nome desatualizado é corrigível numa linha.
- **A cobertura do aplicativo varia por estado.** São 15 estados e o DF. Para quem está fora dessa lista, o encaminhamento não ajuda — e o texto não promete que ajudará, apenas nomeia a ferramenta.
- **Isso não é a feature original.** É o que se pode entregar com integridade hoje. Se o acesso oficial aparecer, o trabalho de integração começa do EAN, que já está pronto.
