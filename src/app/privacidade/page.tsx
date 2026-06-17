import Link from "next/link";

export default function PrivacyPage() {
  return (
    <main className="legal-shell">
      <Link className="ghost-button" href="/">
        Voltar
      </Link>
      <section className="legal-panel">
        <p className="eyebrow">LGPD</p>
        <h1>Política de Privacidade</h1>
        <p>
          O Comparador PMC Medicamentos usa dados de conta apenas para autenticação, favoritos, histórico de busca,
          preferências de ICMS e eventual controle de assinatura.
        </p>
        <h2>Dados tratados</h2>
        <p>
          E-mail, senha protegida por hash, favoritos, histórico de consultas, UF/ICMS escolhido, status de assinatura,
          identificadores de cliente/assinatura no Stripe e registros técnicos.
        </p>
        <h2>Finalidade</h2>
        <p>Salvar preferências, recuperar histórico, proteger a conta e administrar cobrança opcional.</p>
        <h2>Base legal</h2>
        <p>Execução do serviço solicitado pelo usuário, consentimento no cadastro e cumprimento de obrigações legais.</p>
        <h2>Direitos do titular</h2>
        <p>O usuário pode exportar seus dados e excluir a conta pela tela de conta. Pedidos adicionais podem ser feitos ao operador do serviço.</p>
        <h2>Retenção</h2>
        <p>Dados de conta permanecem enquanto a conta estiver ativa. A exclusão remove conta, favoritos e histórico salvos.</p>
        <h2>Pagamento</h2>
        <p>
          Pagamentos são processados pelo Stripe. O serviço armazena apenas identificadores e status da assinatura;
          dados completos de cartão não são armazenados neste sistema.
        </p>
        <h2>Preço PMC</h2>
        <p>Os preços exibidos são PMC, preço máximo ao consumidor, conforme tabela importada. Não representam preço praticado por farmácias.</p>
      </section>
    </main>
  );
}
