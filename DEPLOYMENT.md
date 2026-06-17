# Deploy: Comparador PMC Medicamentos

## Neon

1. No projeto Neon, copie a connection string do banco.
2. Crie um arquivo `.env.local` com:

```env
DATABASE_URL=
ADMIN_EMAILS=
NEXT_PUBLIC_APP_URL=
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

O seed aplica a base extraída do PDF, remove correções ruins conhecidas do parser e inclui os registros suplementares críticos de `src/data/manual-critical-medicines.json`.

## Revisão Mensal

Antes de publicar uma nova tabela:

```powershell
npm run validate:critical
```

No app local, abra `/admin` para conferir:

- total de apresentações carregadas;
- data da tabela;
- medicamentos críticos validados;
- medicamentos críticos ausentes naquela edição;
- quantidade de registros suplementares usados.

## Vercel

1. Suba o repositório para GitHub.
2. Importe o projeto na Vercel como aplicação Next.js.
3. Em Environment Variables, configure:
   - `DATABASE_URL`
   - `ADMIN_EMAILS` com os e-mails autorizados a abrir `/admin`, separados por vírgula.
   - `NEXT_PUBLIC_APP_URL=https://comparador-pmc-medicamentos.vercel.app`
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
