# Automação da atualização de preços CMED

Data: 2026-09-01
Status: aprovado, aguardando plano de implementação

## Contexto

O comparador serve PMC de apresentações de medicamentos por UF/ICMS. A base vigente em produção é a edição CMED de **10/06/2026**, com 21.546 apresentações, importada à mão a partir de uma planilha baixada do portal da Anvisa.

A Anvisa já publicou uma edição mais recente, de **11/08/2026**, com 26.001 linhas com código GGREM. O site está desatualizado porque a atualização depende de alguém lembrar de baixar, importar, semear o banco e publicar.

Oito registros da base atual vieram de um suplemento da base Kairos, que é paga. Foi verificado que **todos os oito já constam da edição de agosto da CMED**, com EAN: LIRIS, diclofenaco dietilamônio, SOTTO, CICLADOL e quatro apresentações de REPOFLOR. O overlay deixou de ser necessário.

## Objetivo

Automatizar o ciclo mensal: detectar edição nova da CMED, importar, validar e publicar sem intervenção, parando apenas quando algo estiver errado.

## Não-objetivos

- Busca de preços em farmácias próximas (feature separada, spec futuro).
- Preços PMVG e colunas de Área de Livre Comércio.
- Qualquer mudança na interface pública além de ocultar apresentações descontinuadas.
- Recuperação de senha, verificação de e-mail e demais pendências de LGPD.

## Decisões tomadas

| Decisão | Escolha |
|---|---|
| Publicação | Automática quando todas as travas passarem |
| Bloqueio | Job falha, GitHub envia e-mail, `/admin` mostra o relatório |
| Override manual | Não existe. Trava restritiva demais se corrige ajustando o limite |
| Revisão prévia | Sem pull request. As travas são o portão |
| Saídas de circulação | Somem da busca, permanecem no banco com data de saída |
| Fonte de verdade | Neon, com `medicines.json` regravado na mesma rodada |
| Runtime | GitHub Actions com cron diário, mais comando local equivalente |

## Pré-requisito

A Vercel **não está conectada ao repositório GitHub**. Os deploys atuais saíram do CLI: o último deploy e o último commit têm ambos 59 dias, e o deploy não carrega metadados de git.

Antes de qualquer coisa, conectar a integração Git do projeto na Vercel, para que um push na `main` dispare o deploy. Alternativa, caso a integração não seja desejável: o workflow chama `vercel deploy --prod` com um `VERCEL_TOKEN` guardado em secret. A integração é preferível — menos segredos, e dá preview deploys de graça.

## Fluxo

1. **Detectar.** Requisição à página de preços da Anvisa (`https://www.gov.br/anvisa/pt-br/assuntos/medicamentos/cmed/precos`), localizando o href que casa com `xls_conformidade_site_(\d{8})_(\d+)\.xlsx`. A data de publicação sai do próprio nome do arquivo.
2. **Comparar.** Confronta essa data com a última edição aplicada em `price_imports`. Se for igual, o job encerra com sucesso e sem ruído.
3. **Baixar.** Salva o `.xlsx` num diretório temporário.
4. **Importar.** Gera um JSON candidato, sem tocar em `src/data/medicines.json`.
5. **Comparar edições.** Produz um relatório com entradas, saídas, variações de preço e contagens.
6. **Validar.** Roda as cinco travas sobre o relatório e o candidato.
7. **Aplicar ou parar.**
   - Passando: substitui `medicines.json`, atualiza o Neon, registra a edição como aplicada, commita e faz push na `main`. A Vercel publica.
   - Falhando: registra a tentativa como bloqueada com o relatório em `jsonb`, e o job termina com erro, o que dispara o e-mail do GitHub.

## Travas

Todos os limites ficam num único módulo de configuração, versionado.

| Trava | Critério | Limite padrão |
|---|---|---|
| Estrutura | Colunas obrigatórias presentes; data de publicação parseável e mais recente que a vigente | — |
| Volume | Variação do total de apresentações com PMC | −5% a +50% |
| Críticos | Princípios ativos de `critical-medicines.json` que existiam na edição vigente e sumiram na nova | até 5 tolerados |
| Preço | Variação máxima do PMC 18% para apresentações presentes nas duas edições | ±30% |
| EAN | Proporção de linhas com `EAN 1` preenchido | ≥ 90% |

A trava de preço é a mais importante: ela detecta deslocamento de coluna, que é o modo de falha mais provável de um parser de planilha e o mais perigoso, porque produz números plausíveis em vez de erro.

A trava de críticos foi deliberadamente afrouxada. Exigir os 111 princípios ativos presentes barraria a publicação por uma única caducidade de registro, que é evento normal. O que ela precisa detectar é perda em massa — um deslocamento de coluna derruba os 111 de uma vez, não um. Por isso o limite é de até cinco sumiços tolerados: ausências isoladas entram no relatório e no `/admin`, mas não impedem a publicação.

Quando uma trava falha, o relatório nomeia qual, com os registros responsáveis — não apenas uma contagem.

## Estrutura da planilha CMED

Verificado na edição de 11/08/2026:

- Cabeçalho na linha 42, com 74 colunas.
- `SUBSTÂNCIA` (0), `LABORATÓRIO` (2), `CÓDIGO GGREM` (3), `REGISTRO` (4), `EAN 1/2/3` (5, 6, 7), `PRODUTO` (8), `APRESENTAÇÃO` (9), `CLASSE TERAPÊUTICA` (10), `TIPO DE PRODUTO` (11).
- Colunas `PMC <alíquota> %` e variantes `PMC <alíquota> % ALC`. Só as primeiras são usadas.
- `RESTRIÇÃO HOSPITALAR` (65), `COMERCIALIZAÇÃO 2025` (71), `TARJA` (72).
- Preços vêm como texto com vírgula decimal e podem trazer asterisco final, marcando isenção de ICMS.

## Componentes

### Novos

- `scripts/fetch_cmed.py` — descobre a edição publicada e baixa o arquivo. Usa regex sobre o HTML, sem dependência de parser de DOM. Se o padrão do nome mudar, falha explicitamente em vez de baixar coisa errada.
- `scripts/diff_cmed.py` — compara candidato contra vigente por código GGREM e emite o relatório em JSON. Reaproveita a normalização de texto já existente em `compare_medicine_imports.py`.
- `scripts/check_cmed.py` — aplica as travas e devolve código de saída diferente de zero quando alguma falha.
- `scripts/update_cmed.py` — orquestra os passos 1 a 6 e, passando as travas, aplica o resultado: regrava `medicines.json` e atualiza o Neon. **Não** mexe em git. O commit e o push são responsabilidade do workflow; localmente, de você. Isso mantém o script utilizável para inspecionar uma edição sem alterar o repositório.
- `.github/workflows/cmed-update.yml` — cron diário, permissão de escrita em conteúdo, secret `DATABASE_URL`.
- `requirements.txt` — `openpyxl`, `requests`, `pytest`, com versões fixadas. Hoje não existe, e o CI precisa de dependências determinísticas.
- `neon/migrations/20260901000000_cmed_lifecycle.sql`.

### Alterados

- `scripts/import_cmed_xlsx.py` — captura EAN 1/2/3, classe terapêutica, tarja e restrição hospitalar. A coluna de comercialização passa a ser localizada pelo padrão `COMERCIALIZAÇÃO \d{4}`, corrigindo a quebra que aconteceria quando a CMED renomear para 2026.
- `scripts/seed_neon_medicines.mjs` — o `delete from medicines where import_id is distinct from` vira um `update` que marca `delisted_at`. Registros que reaparecem numa edição posterior têm a marca limpa.
- `src/lib/medicines.ts` — filtra `delisted_at is null` e mapeia os campos novos.
- `src/lib/types.ts` — campos novos em `Medicine`.
- `src/app/admin/page.tsx` — exibe a última edição aplicada e, havendo, a tentativa bloqueada com o motivo e os registros responsáveis.

### Descontinuados

- `scripts/apply_kairos_overlay.py` e `src/data/manual-critical-medicines.json` saem do fluxo. Os arquivos permanecem no repositório como registro histórico, mas nada os invoca.

## Modelo de dados

Migration acrescenta a `medicines`:

- `ean1`, `ean2`, `ean3` (text), `therapeutic_class` (text), `tarja` (text), `hospital_restricted` (boolean).
- `delisted_at` (date) e `last_seen_table_date` (text).

`table_date` já existe como texto no formato `dd/mm/aaaa`, e `last_seen_table_date` segue essa convenção para não divergir do que a aplicação já lê. `delisted_at` é `date` de verdade, porque é usada em comparação e ordenação; a conversão de `dd/mm/aaaa` acontece no seed, num único ponto.
- Índice em `ean1`, que a feature de busca em farmácias vai consumir.

E a `price_imports`:

- `status` (text: `applied` ou `blocked`), `report` (jsonb), `source_url` (text).

## Tratamento de erro

- **Página da Anvisa fora do ar ou HTML alterado.** O passo 1 falha com mensagem específica. Nada é escrito. O job falha e avisa.
- **Trava reprovada.** Nada é escrito em `medicines`. A tentativa é gravada em `price_imports` com `status = blocked` e o relatório completo.
- **Falha no meio da escrita no Neon.** O seed já escreve em lotes com retry. A marcação de saída só ocorre depois de todos os lotes terem sido aplicados, de modo que uma interrupção deixa a base consistente com a edição anterior.
- **Reexecução.** O pipeline é idempotente: rodar duas vezes sobre a mesma edição não duplica registros nem gera commit vazio.

## Testes

`pytest` para o lado Python, que concentra o risco. Fixture: uma planilha pequena, montada à mão, reproduzindo o layout real da CMED e cobrindo preço com asterisco, preço vazio, EAN ausente e coluna de comercialização com outro ano.

- Importador: extração correta dos campos e dos casos da fixture.
- Diff: um par de fixtures que produz uma entrada, uma saída e uma variação.
- Travas: cada uma com um caso que passa e um que falha.
- Detecção: HTML de exemplo com o link esperado, e outro com o padrão alterado, que deve falhar.

## Riscos conhecidos

- A Anvisa pode mudar o padrão do nome do arquivo ou o layout da planilha. O desenho falha alto nesses casos, em vez de importar dado errado.
- Sem override manual, uma trava calibrada de forma restritiva demais exige mexer no código para destravar. Aceito conscientemente.
- O repositório cresce cerca de 10 MB por edição, por causa do `medicines.json` regravado. Aceito em troca de o fallback nunca ficar velho.
