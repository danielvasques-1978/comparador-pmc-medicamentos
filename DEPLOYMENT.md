# Deploy: Comparador PMC Medicamentos

## Neon

1. No projeto Neon, copie a connection string do banco.
2. Crie um arquivo `.env.local` com:

```env
DATABASE_URL=
ADMIN_EMAILS=
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_BILLING_ENABLED=false
NEXT_PUBLIC_BILLING_REQUIRED=false
STRIPE_SECRET_KEY=
STRIPE_PRICE_ID=
STRIPE_WEBHOOK_SECRET=
```

3. Aplique a migração:

```powershell
npm run migrate:neon
```

O comando aplica todas as migrações em `neon/migrations`, incluindo a estrutura de medicamentos, perfis, login, trilha mínima de consentimento LGPD e campos de assinatura.

4. Carregue a base importada do PDF:

```powershell
npm run seed:neon
```

Os scripts leem `DATABASE_URL` de `.env.local`. Se o arquivo estiver dentro de `neon/.env.local`, eles também aceitam esse caminho, mas o Next.js local usa o `.env.local` da raiz.

## Atualização Automática

Um workflow do GitHub Actions (`.github/workflows/cmed-update.yml`) roda `npm run update:cmed` diariamente. Quando sai uma edição nova da CMED e ela passa nas travas de sanidade, o workflow publica sozinho: atualiza `src/data/medicines.json`, comita como `github-actions[bot]` e empurra para `main`, o que dispara o deploy na Vercel.

Quando uma trava reprova a edição, o passo de atualização falha, o passo de commit não roda, o GitHub Actions envia e-mail de falha, e nada é publicado. Os limites de cada trava (variação de volume, variação de preço, cobertura de EAN, perdas de medicamentos críticos, apresentações sem PMC sem restrição hospitalar) vivem em `scripts/cmed_limits.py`. Não existe publicação forçada: não há flag, variável de ambiente ou override que contorne uma trava reprovada — ajustar o limite no código é o único caminho previsto.

A trava `hospitalar` reprova a edição quando alguma apresentação sem PMC não tem `RESTRIÇÃO HOSPITALAR = Sim`, porque o aviso exibido ao usuário na seção "Sem preço máximo ao consumidor" afirma uso hospitalar para todo o grupo. O limite tolera zero exceções.

Publicar o código não faz esse grupo aparecer no site: a base só passa a contê-lo quando for regerada, seja pela próxima edição da CMED que o cron importa sozinho, seja rodando `npm run update:cmed -- --force` deliberadamente. Entre o deploy e essa regeração, o site continua sem exibir a seção de apresentações sem PMC. Antes dessa primeira regeração, a migração `neon/migrations/20260902000000_pf.sql` precisa estar aplicada (`npm run migrate:neon`) — sem ela a coluna `pf` não existe, o seed falha, o rollback dispara e a edição inteira é descartada.

No app publicado, abra `/admin` para conferir:

- total de apresentações carregadas;
- data da tabela vigente;
- se a última edição foi bloqueada, e por qual trava;
- se um seed anterior parou no meio do caminho (`status = 'partial'`), com o deslocamento do último lote aplicado;
- medicamentos críticos validados e ausentes naquela edição.

### Pré-requisitos operacionais (passos manuais, feitos uma vez)

Estes passos exigem acesso aos painéis da Vercel e do GitHub e não são feitos pelo pipeline:

0. Rodar `npm run migrate:neon` para aplicar a migração `neon/migrations/20260901000000_cmed_lifecycle.sql`. Ela precisa estar aplicada antes do primeiro `npm run seed:neon` (que grava as colunas `ean1`…`hospital_restricted` e o `status` de `price_imports`) e antes do primeiro carregamento de `/admin`, que seleciona `status`, `report` e `source_url` de `price_imports` fora de qualquer try/catch — sem a migração, essas colunas não existem e a página retorna 500.
1. Em Settings → Git do projeto na Vercel, conectar o repositório `danielvasques-1978/comparador-pmc-medicamentos` e definir `main` como branch de produção.
2. Em Settings → Secrets and variables → Actions do repositório, cadastrar o secret `DATABASE_URL` com a connection string do Neon.
3. Disparar manualmente o workflow `Atualização CMED` uma primeira vez (Actions → `workflow_dispatch`), para confirmar que o job termina verde e que o commit gerado dispara o deploy na Vercel.

## Vercel

1. Suba o repositório para GitHub.
2. Importe o projeto na Vercel como aplicação Next.js.
3. Em Environment Variables, configure:
   - `DATABASE_URL`
   - `ADMIN_EMAILS` com os e-mails autorizados a abrir `/admin`, separados por vírgula.
   - `NEXT_PUBLIC_APP_URL=https://comparador-pmc-medicamentos.vercel.app`
   - `NEXT_PUBLIC_BILLING_ENABLED=false` enquanto Stripe não estiver configurado; use `true` para mostrar pagamento.
   - `NEXT_PUBLIC_BILLING_REQUIRED=false` enquanto estiver testando; use `true` para exigir assinatura nos resultados.
   - `STRIPE_SECRET_KEY`
   - `STRIPE_PRICE_ID`
   - `STRIPE_WEBHOOK_SECRET`
4. Faça o deploy normalmente.
5. Crie uma conta no app usando um e-mail listado em `ADMIN_EMAILS`.
6. Após deploy, abra `/admin` no domínio publicado e confira se não há bloqueios.

## Conta e LGPD

O app mantém uso sem login. Quando o usuário cria conta, o sistema salva e-mail, senha com hash, datas de aceite de termos e privacidade, favoritos, histórico e preferências. A conta autenticada pode exportar dados em `/api/account/export` e excluir a conta em `/api/account/delete`.

Para uma operação comercial completa, ainda falta revisão jurídica formal, rotina de retenção, política de resposta a incidentes, recuperação de senha, verificação de e-mail e limitação de tentativas de login.

## Cobrança

A cobrança usa Stripe Billing:

- Checkout Sessions em modo `subscription` para contratar.
- Customer Portal para gerenciar cartão, recibos e cancelamento.
- Webhook `/api/billing/webhook` para sincronizar `plan_status`, `stripe_customer_id`, `stripe_subscription_id`, `stripe_price_id` e renovação.

No painel Stripe, configure o endpoint de webhook apontando para:

```text
https://comparador-pmc-medicamentos.vercel.app/api/billing/webhook
```

Eventos recomendados: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.paid` e `invoice.payment_failed`.

## Dados Persistidos

- `medicines`: apresentações importadas do PDF.
- `price_imports`: metadados da tabela importada.
- `app_profiles`: perfis locais criados por navegador.
- `user_favorites`: favoritos por perfil.
- `search_history`: histórico de busca por perfil.
- `user_settings`: configuração de ICMS por UF por perfil.
- `auth_users`: conta, consentimento, status de plano e identificadores Stripe.
- `auth_sessions`: sessões ativas.
