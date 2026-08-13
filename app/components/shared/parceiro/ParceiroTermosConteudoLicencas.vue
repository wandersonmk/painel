<script setup lang="ts">
// Termo do modelo de LICENÇAS PRÉ-PAGAS (versão 2.0). O termo de comissão
// (versão 1.0) continua em ParceiroTermosConteudo.vue para quem não migrou.
const secaoTitulo = 'text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mt-6 first:mt-0'
const paragrafo = 'text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-2'
const lista = 'mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed list-disc pl-5'
</script>

<template>
  <div>
    <p class="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Agzap Systems · Programa de Parceria · Versão 2.0</p>
    <h2 class="text-lg font-bold text-slate-900 dark:text-white mt-1">Termo de Revenda por Licenças Pré-pagas</h2>

    <p :class="paragrafo">
      Este termo estabelece as regras do Programa de Parceria da <strong>Agzap Systems</strong> ("Agzap") no modelo de
      revenda por licenças pré-pagas. Ao aceitá-lo, você ("Parceiro") declara que leu, compreendeu e concorda
      integralmente com todas as condições abaixo.
    </p>

    <!-- 1 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-handshake text-purple-500 text-xs" aria-hidden="true" />
      1. Objeto da parceria
    </h3>
    <p :class="paragrafo">
      O Parceiro <strong>compra licenças da Agzap antecipadamente</strong> e as revende ao cliente final por conta e
      risco próprios. Não há pagamento de comissão da Agzap ao Parceiro neste modelo.
    </p>
    <ul :class="lista">
      <li>Cada licença adquirida vira um <strong>crédito</strong> na carteira do Parceiro;</li>
      <li>Crédito de <strong>30 dias</strong> autoriza uma renovação de 30 dias corridos para um cliente;</li>
      <li>Crédito de <strong>12 meses</strong> autoriza uma renovação de 12 meses para um cliente;</li>
      <li>A ativação ou renovação de qualquer cliente consome exatamente <strong>1 crédito</strong>.</li>
    </ul>

    <!-- 2 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-coins text-emerald-500 text-xs" aria-hidden="true" />
      2. Compra e liberação dos créditos
    </h3>
    <ul :class="lista">
      <li>O pagamento à Agzap e a liberação dos créditos são <strong>processos distintos</strong>: os créditos entram na carteira somente após a Agzap confirmar o pagamento;</li>
      <li>Os valores vigentes de compra são exibidos na página <strong>Créditos</strong> do portal e podem ser atualizados pela Agzap a qualquer momento;</li>
      <li>Cada movimentação de crédito fica registrada em extrato permanente, disponível ao Parceiro para consulta.</li>
    </ul>

    <!-- 3 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-ban text-red-500 text-xs" aria-hidden="true" />
      3. Consumo do crédito é definitivo
    </h3>
    <p :class="paragrafo">
      Esta é a regra mais importante deste termo. Depois de confirmada a renovação, o crédito é
      <strong>consumido em definitivo e não retorna ao saldo</strong> em nenhuma hipótese, incluindo:
    </p>
    <ul :class="lista">
      <li>Cancelamento do cliente final;</li>
      <li>Inadimplência do cliente final perante o Parceiro;</li>
      <li>Bloqueio do cliente, seja pelo Parceiro ou pela Agzap;</li>
      <li>Desvinculação ou transferência do cliente para outro parceiro;</li>
      <li>Estorno ou chargeback da cobrança feita pelo Parceiro ao cliente final;</li>
      <li>Exclusão administrativa do cliente.</li>
    </ul>
    <p :class="paragrafo">
      Correções por erro operacional só podem ser lançadas pela Agzap, mediante análise, e ficam registradas em
      auditoria — o histórico original nunca é apagado.
    </p>

    <!-- 4 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-file-invoice-dollar text-blue-500 text-xs" aria-hidden="true" />
      4. Cobrança do cliente final
    </h3>
    <ul :class="lista">
      <li>O Parceiro tem <strong>liberdade total de precificação</strong> na revenda ao cliente final;</li>
      <li>A cobrança do cliente final é feita <strong>diretamente pelo Parceiro</strong>, fora da estrutura de pagamentos da Agzap;</li>
      <li>A Agzap fatura para o Parceiro; o Parceiro fatura para o cliente final;</li>
      <li>A Agzap não controla, não intermedia e não se responsabiliza pela situação financeira do cliente final perante o Parceiro;</li>
      <li>O Parceiro é o <strong>responsável pela cobrança, pelas promessas comerciais, pela entrega e pelo relacionamento</strong> com o cliente que revendeu.</li>
    </ul>

    <!-- 5 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-user-gear text-purple-500 text-xs" aria-hidden="true" />
      5. O que o Parceiro pode fazer
    </h3>
    <ul :class="lista">
      <li>Visualizar apenas os clientes vinculados a ele pela Agzap;</li>
      <li>Acompanhar status, vencimento, dias restantes e uso de instâncias e assistentes;</li>
      <li>Ativar ou renovar um cliente vinculado, consumindo um crédito disponível;</li>
      <li>Bloquear e desbloquear o acesso de um cliente vinculado a ele;</li>
      <li>Consultar o extrato dos próprios créditos;</li>
      <li>Solicitar à Agzap novos créditos, exclusões, instâncias, números ou assistentes adicionais.</li>
    </ul>

    <!-- 6 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-lock text-slate-500 text-xs" aria-hidden="true" />
      6. O que é exclusivo da Agzap
    </h3>
    <ul :class="lista">
      <li><strong>Exclusão de clientes</strong> e qualquer alteração estrutural da conta;</li>
      <li>Quantidade de <strong>instâncias, números e assistentes</strong> de cada cliente;</li>
      <li>Vínculo, transferência e desvinculação de clientes entre parceiros;</li>
      <li>Concessão, correção e ajuste de créditos;</li>
      <li>Renovação administrativa, que não consome crédito do Parceiro;</li>
      <li>Bloqueio administrativo, que <strong>prevalece</strong> sobre o bloqueio comercial do Parceiro.</li>
    </ul>
    <p :class="paragrafo">
      Bloquear um cliente não apaga dados, não altera o vencimento e não devolve crédito. Desbloquear não renova
      e não consome crédito.
    </p>

    <!-- 7 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-shield-halved text-blue-500 text-xs" aria-hidden="true" />
      7. Representação da marca Agzap
    </h3>
    <ul :class="lista">
      <li>Agir com ética, honestidade e profissionalismo em todas as interações com clientes e potenciais clientes;</li>
      <li>Não prometer funcionalidades, prazos ou condições que não existam na plataforma;</li>
      <li>Não denegrir, difamar ou prejudicar a imagem da Agzap, de seus clientes ou de outros parceiros;</li>
      <li>Não se apresentar como funcionário ou representante legal da Agzap — a relação é de parceria comercial, sem vínculo empregatício ou societário.</li>
    </ul>

    <!-- 8 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-ban text-red-500 text-xs" aria-hidden="true" />
      8. Condutas proibidas
    </h3>
    <p :class="paragrafo">
      É <strong>expressamente proibido</strong> ao Parceiro, sob pena de suspensão imediata e demais sanções:
    </p>
    <ul :class="lista">
      <li><strong>Tentar burlar, manipular ou explorar falhas</strong> do sistema, do painel, das APIs ou do banco de dados da Agzap, incluindo qualquer tentativa de gerar crédito, alterar saldo ou mover vencimento fora do fluxo oficial;</li>
      <li>Tentar acessar clientes, saldos ou dados de outro parceiro, ou áreas administrativas da Agzap;</li>
      <li>Compartilhar suas credenciais de acesso com terceiros;</li>
      <li>Usar indevidamente dados pessoais de clientes, em desacordo com a LGPD (Lei nº 13.709/2018);</li>
      <li>Praticar spam, publicidade enganosa ou abordagens abusivas em nome da Agzap.</li>
    </ul>

    <!-- 9 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-gavel text-red-500 text-xs" aria-hidden="true" />
      9. Penalidades
    </h3>
    <ul :class="lista">
      <li>O descumprimento de qualquer regra deste termo poderá resultar em <strong>suspensão ou desligamento do programa, sem aviso prévio</strong>;</li>
      <li>Em caso de fraude comprovada, os créditos vinculados à conduta fraudulenta serão <strong>cancelados</strong>;</li>
      <li>O Parceiro poderá <strong>responder a processo administrativo e judicial</strong>, nas esferas cível e criminal, conforme a legislação brasileira;</li>
      <li>A Agzap pode suspender preventivamente o acesso e as operações do Parceiro durante a apuração de qualquer suspeita ou divergência contábil.</li>
    </ul>

    <!-- 10 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-triangle-exclamation text-amber-500 text-xs" aria-hidden="true" />
      10. Infraestrutura de terceiros
    </h3>
    <p :class="paragrafo">
      A plataforma depende de APIs oficiais da Meta (WhatsApp) e de outros fornecedores de infraestrutura. Mudanças
      de política, indisponibilidade, bloqueio de número ou alteração de regras por parte desses terceiros estão
      fora do controle da Agzap e não geram direito a devolução de créditos. Consultoria técnica avançada,
      quando oferecida, é opcional e pode ser cobrada à parte.
    </p>

    <!-- 11 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-graduation-cap text-purple-500 text-xs" aria-hidden="true" />
      11. Suporte e treinamento
    </h3>
    <ul :class="lista">
      <li>A Agzap disponibiliza aulas, materiais de divulgação e suporte ao Parceiro pelo portal;</li>
      <li>O suporte ao <strong>cliente final</strong> é de responsabilidade primária do Parceiro, que pode escalar à Agzap questões técnicas da plataforma;</li>
      <li>As informações do portal (clientes, saldos, movimentações) são <strong>confidenciais</strong> e de uso exclusivo da parceria.</li>
    </ul>

    <!-- 12 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-rotate text-slate-500 text-xs" aria-hidden="true" />
      12. Alterações e vigência
    </h3>
    <ul :class="lista">
      <li>A Agzap pode atualizar este termo a qualquer momento — alterações relevantes são comunicadas pelo portal e exigem novo aceite;</li>
      <li>A parceria pode ser encerrada por qualquer das partes a qualquer momento;</li>
      <li>No encerramento, <strong>créditos não consumidos</strong> serão tratados conforme negociação direta com a Agzap; créditos já consumidos não são reembolsáveis.</li>
    </ul>

    <!-- 13 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-circle-check text-emerald-500 text-xs" aria-hidden="true" />
      13. Aceite
    </h3>
    <p :class="paragrafo">
      Ao marcar a opção de aceite, o Parceiro declara que <strong>leu integralmente este termo</strong>, compreendeu
      o funcionamento das licenças pré-pagas — em especial a <strong>irreversibilidade do consumo de crédito</strong> —
      e concorda em cumpri-lo enquanto fizer parte do Programa de Parceria da Agzap Systems.
    </p>
  </div>
</template>
