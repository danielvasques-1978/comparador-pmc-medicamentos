# Comparador PMC Medicamentos

Aplicação Next.js para comparar PMC de apresentações de medicamentos por UF/ICMS, usando a planilha oficial da CMED/Anvisa. Apresentações de uso restrito hospitalar, para as quais a CMED não fixa PMC, aparecem em um bloco separado com o Preço Fábrica e um aviso de que não é o preço ao consumidor.

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
npm run update:cmed
npm run migrate:neon
npm run validate:critical
npm run build
```

`update:cmed` é o caminho normal: baixa a edição mais recente da CMED, roda as seis travas de sanidade e só publica (`src/data/medicines.json` e Neon) se todas passarem. Não existe publicação forçada.

Dois comandos adicionais existem para uso manual e **não passam por nenhuma trava**:

```powershell
npm run import:cmed -- caminho/planilha.xlsx src/data/medicines.json
npm run seed:neon
```

`import:cmed` sobrescreve `medicines.json` diretamente a partir de uma planilha, e `seed:neon` grava esse arquivo no banco — nenhum dos dois valida volume, preço, cobertura de EAN ou medicamentos críticos antes de escrever. Use-os só para depuração local; a base publicada deve vir sempre de `update:cmed`.

### Teste de ouro da busca

`tests/busca.test.ts` roda sobre uma base congelada (`tests/fixtures/busca-base.json`) e compara o resultado com uma referência (`tests/fixtures/busca-golden.json`). As duas são regeradas juntas por:

```powershell
node scripts/gerar_golden.mjs
```

Regerar é **ato deliberado**: faz-se quando o comportamento pretendido da busca muda, e a mudança de resultado que o script imprime é o que se revisa. Não é passo de rotina, e não é a resposta para um teste vermelho — a base do teste é congelada justamente para que a edição nova da CMED não mexa nele. Se o teste falhou sem que a busca tenha sido alterada, o certo é investigar a regressão, não regerar a referência.

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
- `NEXT_PUBLIC_BILLING_ENABLED=true` para mostrar botões Stripe
- `NEXT_PUBLIC_BILLING_REQUIRED=true` para exigir assinatura ativa nos resultados

Sem essas variáveis, o app continua funcionando no plano gratuito e não mostra botões de pagamento.

## Deploy

Produção atual:

https://comparador-pmc-medicamentos.vercel.app
