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

  const [lastPartial] = sql
    ? await sql`
        select table_date, imported_at, report
          from price_imports
         where status = 'partial'
         order by imported_at desc
         limit 1
      `
    : [];

  // A blocked (or partial) row only describes the current state of the base
  // while it is newer than the last edition actually applied. Once the
  // blockage is resolved and a later edition is applied, the row stays in
  // the table forever with status = 'blocked'/'partial' — without this
  // comparison the screen would keep announcing a rejected or mixed edition
  // as if it still described the live base.
  const blockedIsCurrent = Boolean(
    lastBlocked && (!lastApplied || new Date(lastBlocked.imported_at) > new Date(lastApplied.imported_at)),
  );
  const partialIsCurrent = Boolean(
    lastPartial && (!lastApplied || new Date(lastPartial.imported_at) > new Date(lastApplied.imported_at)),
  );

  const rawFailures = (lastBlocked?.report as { failures?: unknown })?.failures;
  const blockedFailures = Array.isArray(rawFailures)
    ? rawFailures.filter(
        (failure): failure is { name?: string; detail?: string } =>
          typeof failure === "object" && failure !== null,
      )
    : [];

  const lastSuccessfulOffset = (lastPartial?.report as { lastSuccessfulOffset?: unknown })
    ?.lastSuccessfulOffset;

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
        <div className={blockedIsCurrent ? "admin-card danger" : "admin-card"}>
          <FileCheck2 size={22} />
          <span>{blockedIsCurrent ? "Edição bloqueada" : "Tabela vigente"}</span>
          <strong>{blockedIsCurrent ? String(lastBlocked!.table_date) : tableDate}</strong>
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
            <h2>
              {blockedIsCurrent
                ? "Edição bloqueada por uma trava"
                : partialIsCurrent
                  ? "Base pode estar mista entre edições"
                  : "Em dia"}
            </h2>
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

        {blockedIsCurrent ? (
          <div className="admin-list">
            {blockedFailures.map((failure, index) => (
              <article className="admin-issue" key={`${failure.name ?? "falha"}-${index}`}>
                <strong>{failure.name ?? ""}</strong>
                <p>{failure.detail ?? ""}</p>
              </article>
            ))}
            <p className="admin-copy">
              Para destravar, ajuste o limite correspondente em `scripts/cmed_limits.py` e rode a
              automação de novo. Não há publicação forçada, por decisão de projeto.
            </p>
          </div>
        ) : null}

        {partialIsCurrent ? (
          <div className="admin-list">
            <article className="admin-issue">
              <strong>Seed interrompido no meio da importação</strong>
              <p>
                A última tentativa de importar {lastPartial ? String(lastPartial.table_date) : "a edição mais recente"}{" "}
                falhou depois de gravar só parte dos lotes. A base pode estar misturando preços da
                edição anterior com os da edição nova
                {typeof lastSuccessfulOffset === "number"
                  ? `; o último lote concluído com sucesso parou no deslocamento ${lastSuccessfulOffset}.`
                  : "."}{" "}
                Rode a automação de novo para completar o seed. Não há publicação forçada, por decisão
                de projeto.
              </p>
            </article>
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
