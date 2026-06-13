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
4. Faça o deploy normalmente.
5. Após deploy, abra `/admin` no domínio publicado e confira se não há bloqueios.

## Perfil

O app já tem estrutura para perfil, favoritos, histórico e preferências. Nesta etapa, o perfil é identificado por uma chave local do navegador; o e-mail é apenas um rótulo opcional. Login real entre dispositivos pode entrar depois com Auth.js, Clerk, Neon Auth ou outro provedor.

## Dados Persistidos

- `medicines`: apresentações importadas do PDF.
- `price_imports`: metadados da tabela importada.
- `app_profiles`: perfis locais criados por navegador.
- `user_favorites`: favoritos por perfil.
- `search_history`: histórico de busca por perfil.
- `user_settings`: configuração de ICMS por UF por perfil.
