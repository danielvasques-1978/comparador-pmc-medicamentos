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

  const [lastApplied] = sql
    ? await sql`
        select table_date, imported_at, row_count
          from price_imports
         where status = 'applied'
         order by imported_at desc
         limit 1
      `
    : [];

  const [lastBlocked] = sql
    ? await sql`
        select table_date, imported_at, report, source_url
          from price_imports
         where status = 'blocked'
         order by imported_at desc
         limit 1
      `
    : [];

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
        <div className={lastBlocked ? "admin-card danger" : "admin-card"}>
          <FileCheck2 size={22} />
          <span>{lastBlocked ? "Edição bloqueada" : "Tabela vigente"}</span>
          <strong>{lastBlocked ? String(lastBlocked.table_date) : tableDate}</strong>
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
            <p className="eyebrow">Atualização automática</p>
            <h2>{lastBlocked ? "Edição bloqueada por uma trava" : "Em dia"}</h2>
          </div>
          <UploadCloud size={22} />
        </div>

        {lastApplied ? (
          <div className="admin-status-row">
            <span>Última edição aplicada: {String(lastApplied.table_date)}</span>
            <span>{Number(lastApplied.row_count).toLocaleString("pt-BR")} apresentações</span>
          </div>
        ) : (
          <p className="admin-copy">Nenhuma edição registrada ainda pela automação.</p>
        )}

        {lastBlocked ? (
          <div className="admin-list">
            {((lastBlocked.report as { failures?: Array<{ name: string; detail: string }> })?.failures ?? []).map(
              (failure) => (
                <article className="admin-issue" key={failure.name}>
                  <strong>{failure.name}</strong>
                  <p>{failure.detail}</p>
                </article>
              ),
            )}
            <p className="admin-copy">
              Para destravar, ajuste o limite correspondente em `scripts/cmed_limits.py` e rode a
              automação de novo. Não há publicação forçada, por decisão de projeto.
            </p>
          </div>
        ) : null}
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
