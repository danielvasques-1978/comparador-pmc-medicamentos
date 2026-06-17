# Deploy: Comparador PMC Medicamentos

## Neon

1. No projeto Neon, copie a connection string do banco.
2. Crie um arquivo `.env.local` com:

```env
DATABASE_URL=
```

3. Aplique a migração:

```powershell
npm run migrate:neon
```

O comando aplica todas as migrações em `neon/migrations`, incluindo a estrutura de medicamentos, perfis, login e trilha mínima de consentimento LGPD.

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
4. Faça o deploy normalmente.
5. Crie uma conta no app usando um e-mail listado em `ADMIN_EMAILS`.
6. Após deploy, abra `/admin` no domínio publicado e confira se não há bloqueios.

## Conta e LGPD

O app mantém uso sem login. Quando o usuário cria conta, o sistema salva e-mail, senha com hash, datas de aceite de termos e privacidade, favoritos, histórico e preferências. A conta autenticada pode exportar dados em `/api/account/export` e excluir a conta em `/api/account/delete`.

Para uma operação comercial completa, ainda falta revisão jurídica formal, rotina de retenção, política de resposta a incidentes, recuperação de senha, verificação de e-mail, limitação de tentativas de login e integração de cobrança.

## Cobrança Futura

A tabela `auth_users` já tem `plan_status` e `stripe_customer_id` para assinatura futura. A próxima etapa deve criar Checkout, portal do cliente e webhooks do Stripe antes de bloquear recursos pagos.

## Dados Persistidos

- `medicines`: apresentações importadas do PDF.
- `price_imports`: metadados da tabela importada.
- `app_profiles`: perfis locais criados por navegador.
- `user_favorites`: favoritos por perfil.
- `search_history`: histórico de busca por perfil.
- `user_settings`: configuração de ICMS por UF por perfil.
