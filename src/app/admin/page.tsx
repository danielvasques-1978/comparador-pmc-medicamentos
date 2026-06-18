import Link from "next/link";
import { cookies } from "next/headers";
import { AlertTriangle, ArrowLeft, CheckCircle2, Database, FileCheck2, UploadCloud } from "lucide-react";
import { getCurrentUserByToken, isAdminEmail, sessionCookieName } from "@/lib/auth-server";
import { validateCriticalMedicines } from "@/lib/critical-validation";
import { getMedicines } from "@/lib/medicines";
import { getSql } from "@/lib/neon";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const sql = getSql();
  const cookieStore = await cookies();
  const user = sql ? await getCurrentUserByToken(sql, cookieStore.get(sessionCookieName)?.value) : null;

  if (!user || !isAdminEmail(user.email)) {
    return (
      <main className="admin-shell">
        <header className="admin-header">
          <div>
            <p className="eyebrow">Administração</p>
            <h1>Acesso restrito</h1>
            <p className="admin-copy">
              Entre com uma conta autorizada para revisar a base importada. Configure `ADMIN_EMAILS` na Vercel para liberar esta área.
            </p>
          </div>
          <Link className="ghost-button" href="/">
            <ArrowLeft size={18} />
            <span>Voltar</span>
          </Link>
        </header>
      </main>
    );
  }

  const medicines = await getMedicines();
  const report = validateCriticalMedicines(medicines);
  const tableDate = medicines[0]?.tableDate ?? "Não informada";
  const commercialized = medicines.filter((item) => item.commercialized).length;
  const hasBlocker = report.invalid > 0;
  const absentItems = report.items.filter((item) => item.status === "absent");
  const invalidItems = report.items.filter((item) => item.status === "invalid");

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">Administração</p>
          <h1>Revisão da base PMC</h1>
          <p className="admin-copy">Use esta tela antes de publicar ou trocar a tabela mensal.</p>
        </div>
        <Link className="ghost-button" href="/">
          <ArrowLeft size={18} />
          <span>Voltar</span>
        </Link>
      </header>

      <section className="admin-grid">
        <div className="admin-card">
          <Database size={22} />
          <span>Apresentações</span>
          <strong>{medicines.length.toLocaleString("pt-BR")}</strong>
        </div>
        <div className="admin-card">
          <FileCheck2 size={22} />
          <span>Tabela</span>
          <strong>{tableDate}</strong>
        </div>
        <div className="admin-card">
          <CheckCircle2 size={22} />
          <span>Críticos OK</span>
          <strong>{report.ok}</strong>
        </div>
        <div className={hasBlocker ? "admin-card danger" : "admin-card"}>
          <AlertTriangle size={22} />
          <span>Bloqueios</span>
          <strong>{report.invalid}</strong>
        </div>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">
          <div>
            <p className="eyebrow">Importação mensal</p>
            <h2>Fluxo recomendado</h2>
          </div>
          <UploadCloud size={22} />
        </div>
        <ol className="admin-steps">
          <li>Baixar a planilha XLS da lista de preços no portal da CMED/Anvisa.</li>
          <li>Rodar a importação oficial para atualizar `src/data/medicines.json`.</li>
          <li>Executar `npm run validate:critical` antes de carregar o Neon.</li>
          <li>Se passar sem bloqueios, rodar `npm run seed:neon` e publicar na Vercel.</li>
        </ol>
      </section>

      <section className="admin-panel">
        <div className="admin-panel-title">
          <div>
            <p className="eyebrow">Validação crítica</p>
            <h2>{hasBlocker ? "Revisar antes de publicar" : "Sem bloqueios"}</h2>
          </div>
          {hasBlocker ? <AlertTriangle size={22} /> : <CheckCircle2 size={22} />}
        </div>

        <div className="admin-status-row">
          <span>{report.ok} medicamentos críticos validados</span>
          <span>{report.absent} ausentes na base atual</span>
          <span>{commercialized.toLocaleString("pt-BR")} comercializadas em 2025</span>
        </div>

        {invalidItems.length > 0 ? (
          <div className="admin-list">
            {invalidItems.map((item) => (
              <article className="admin-issue" key={item.label}>
                <strong>{item.label}</strong>
                <p>{item.total} resultado(s), com possível mistura de princípio ativo.</p>
              </article>
            ))}
          </div>
        ) : null}

        {absentItems.length > 0 ? (
          <details className="admin-details">
            <summary>Medicamentos críticos ausentes nesta edição</summary>
            <div className="admin-tags">
              {absentItems.map((item) => (
                <span key={item.label}>{item.label}</span>
              ))}
            </div>
          </details>
        ) : null}
      </section>
    </main>
  );
}
