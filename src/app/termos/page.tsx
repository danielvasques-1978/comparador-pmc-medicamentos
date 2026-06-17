import Link from "next/link";

export default function TermsPage() {
  return (
    <main className="legal-shell">
      <Link className="ghost-button" href="/">
        Voltar
      </Link>
      <section className="legal-panel">
        <p className="eyebrow">Uso do serviço</p>
        <h1>Termos de Uso</h1>
        <p>
          O Comparador PMC Medicamentos é uma ferramenta de consulta de preço máximo ao consumidor. A informação deve ser
          conferida com a tabela vigente e não substitui responsabilidade profissional.
        </p>
        <h2>Conta</h2>
        <p>O usuário é responsável por manter sua senha protegida. A conta pode ser excluída a qualquer momento.</p>
        <h2>Dados e fonte</h2>
        <p>A base é importada de PDF fornecido pelo operador. A página de revisão indica data da tabela e validação crítica.</p>
        <h2>Assinatura</h2>
        <p>
          Recursos pagos, quando ativados, exigem contratação explícita pelo Stripe Checkout. Cancelamento,
          atualização de cartão e recibos são gerenciados pelo portal de assinatura.
        </p>
        <h2>Limitações</h2>
        <p>Falhas de importação devem ser revisadas antes de uso profissional. Medicamentos críticos possuem validação própria.</p>
      </section>
    </main>
  );
}
