# Comparador PMC Medicamentos

Aplicação Next.js para comparar PMC de apresentações de medicamentos por UF/ICMS, usando dados importados mensalmente de PDF.

## Rotas

- `/`: comparador público.
- `/admin`: revisão da base importada e validação de medicamentos críticos.

## Comandos

```powershell
npm run dev
npm run validate:critical
npm run seed:neon
npm run build
```

## Banco

O projeto usa Neon via `DATABASE_URL`. Configure `.env.local` localmente e a mesma variável no ambiente de produção da Vercel.

## Deploy

Produção atual:

https://comparador-pmc-medicamentos.vercel.app
