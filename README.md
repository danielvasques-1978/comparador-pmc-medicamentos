# Comparador PMC Medicamentos

Aplicação Next.js para comparar PMC de apresentações de medicamentos por UF/ICMS, usando dados importados mensalmente de PDF.

## Rotas

- `/`: comparador público.
- `/admin`: revisão da base importada e validação de medicamentos críticos, restrita por `ADMIN_EMAILS`.
- `/privacidade`: política de privacidade.
- `/termos`: termos de uso.
- `/api/account/export`: exportação dos dados da conta autenticada.
- `/api/account/delete`: exclusão da conta autenticada.
- `/api/billing/checkout`: cria sessão de assinatura Stripe.
- `/api/billing/portal`: abre portal de gerenciamento da assinatura.
- `/api/billing/webhook`: recebe eventos Stripe para sincronizar plano.

## Comandos

```powershell
npm run dev
npm run migrate:neon
npm run validate:critical
npm run seed:neon
npm run build
```

## Banco

O projeto usa Neon via `DATABASE_URL`. Configure `.env.local` localmente e a mesma variável no ambiente de produção da Vercel. Para liberar a rota administrativa, configure `ADMIN_EMAILS` com e-mails separados por vírgula.

## LGPD e Conta

O app tem cadastro e login opcionais com senha hash, sessão em cookie httpOnly, aceite de termos/privacidade, exportação de dados e exclusão de conta. A busca pública continua funcionando sem login.

## Assinatura

A cobrança usa Stripe Billing com Checkout para contratar e Customer Portal para gerenciar/cancelar. Configure:

- `STRIPE_SECRET_KEY`
- `STRIPE_PRICE_ID`
- `STRIPE_WEBHOOK_SECRET`
- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_BILLING_REQUIRED=true` para exigir assinatura ativa nos resultados

Sem essas variáveis, o app continua funcionando e mostra cobrança indisponível.

## Deploy

Produção atual:

https://comparador-pmc-medicamentos.vercel.app
