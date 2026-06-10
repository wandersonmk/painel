<script setup lang="ts">
const secaoTitulo = 'text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mt-6 first:mt-0'
const paragrafo = 'text-sm text-slate-600 dark:text-slate-400 leading-relaxed mt-2'
const lista = 'mt-2 space-y-1.5 text-sm text-slate-600 dark:text-slate-400 leading-relaxed list-disc pl-5'
</script>

<template>
  <div>
    <p class="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-semibold">Agzap Systems · Programa de Parceria · Versão 1.0</p>
    <h2 class="text-lg font-bold text-slate-900 dark:text-white mt-1">Termo de Responsabilidade e Parceria</h2>

    <p :class="paragrafo">
      Este termo estabelece as regras do Programa de Parceria da <strong>Agzap Systems</strong> ("Agzap"). Ao aceitá-lo, você ("Parceiro") declara que leu, compreendeu e concorda integralmente com todas as condições abaixo.
    </p>

    <!-- 1 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-handshake text-purple-500 text-xs" aria-hidden="true" />
      1. Objeto da parceria
    </h3>
    <p :class="paragrafo">
      O Parceiro indica empresas para utilizarem a plataforma Agzap e recebe <strong>comissão</strong> sobre os pagamentos efetivamente realizados pelos clientes a ele atribuídos. O percentual de comissão é definido pela Agzap individualmente para cada cliente atribuído e pode ser ajustado a qualquer momento.
    </p>

    <!-- 2 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-shield-halved text-blue-500 text-xs" aria-hidden="true" />
      2. Representação da marca Agzap
    </h3>
    <p :class="paragrafo">
      Ao indicar clientes, o Parceiro <strong>representa o nome da Agzap</strong> e se compromete a:
    </p>
    <ul :class="lista">
      <li>Agir com ética, honestidade e profissionalismo em todas as interações com clientes e potenciais clientes;</li>
      <li>Não prometer funcionalidades, prazos ou condições que não existam na plataforma;</li>
      <li>Não denegrir, difamar ou prejudicar a imagem da Agzap, de seus clientes ou de outros parceiros;</li>
      <li>Não se apresentar como funcionário ou representante legal da Agzap — a relação é de parceria comercial, sem vínculo empregatício ou societário.</li>
    </ul>

    <!-- 3 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-sack-dollar text-emerald-500 text-xs" aria-hidden="true" />
      3. Comissões — como funcionam
    </h3>
    <ul :class="lista">
      <li>Comissão só existe sobre <strong>pagamento efetivamente confirmado</strong> do cliente — por cartão de crédito (assinatura processada pela plataforma de pagamentos) ou por PIX confirmado pela Agzap;</li>
      <li>Cliente que não paga, não gera comissão — independentemente de estar atribuído ao Parceiro;</li>
      <li>Os valores e percentuais podem ser acompanhados em tempo real no Portal do Parceiro, na aba Extratos.</li>
    </ul>

    <!-- 4 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-hourglass-half text-amber-500 text-xs" aria-hidden="true" />
      4. Prazo de liberação (retenção de 30 dias)
    </h3>
    <ul :class="lista">
      <li>Cada pagamento confirmado fica <strong>retido por 30 (trinta) dias</strong> como garantia contra estornos, chargebacks e cancelamentos;</li>
      <li>Após os 30 dias, a comissão passa automaticamente para o <strong>saldo liberado</strong>, disponível para saque;</li>
      <li><strong>Se o pagamento for estornado, contestado (chargeback) ou reembolsado</strong> dentro do período de retenção, a comissão correspondente é <strong>cancelada e não será liberada</strong>;</li>
      <li>A regra vale para todos os planos — mensais e anuais — e para todas as formas de pagamento.</li>
    </ul>

    <!-- 5 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-money-bill-transfer text-emerald-500 text-xs" aria-hidden="true" />
      5. Saque e processamento do pagamento
    </h3>
    <ul :class="lista">
      <li>O saque do saldo liberado é solicitado pelo Portal do Parceiro (botão "Solicitar pagamento");</li>
      <li>O processamento ocorre em <strong>até 24 (vinte e quatro) horas, somente em dias úteis</strong> — solicitações que caiam em fins de semana ou feriados são processadas no próximo dia útil;</li>
      <li>O repasse é feito exclusivamente via <strong>PIX</strong>, para chave cadastrada <strong>obrigatoriamente em nome do próprio Parceiro</strong> (mesma titularidade). Chaves de terceiros não são aceitas em hipótese alguma;</li>
      <li>É responsabilidade do Parceiro manter seus dados de recebimento corretos e atualizados na aba Configurações.</li>
    </ul>

    <!-- 6 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-ban text-red-500 text-xs" aria-hidden="true" />
      6. Condutas proibidas
    </h3>
    <p :class="paragrafo">
      É <strong>expressamente proibido</strong> ao Parceiro, sob pena de desligamento imediato e demais sanções:
    </p>
    <ul :class="lista">
      <li><strong>Cometer qualquer tipo de fraude</strong>, incluindo simular pagamentos, criar clientes falsos ou autoindicações para gerar comissão indevida;</li>
      <li><strong>Tentar burlar, manipular ou explorar falhas do sistema</strong>, do painel, das APIs ou do banco de dados da Agzap, por qualquer meio;</li>
      <li>Tentar acessar áreas, painéis ou dados aos quais não tem autorização (incluindo dados de outros parceiros ou da administração);</li>
      <li>Compartilhar suas credenciais de acesso com terceiros;</li>
      <li>Usar indevidamente dados pessoais de clientes, em desacordo com a LGPD (Lei Geral de Proteção de Dados — Lei nº 13.709/2018);</li>
      <li>Praticar spam, publicidade enganosa ou abordagens abusivas em nome da Agzap.</li>
    </ul>

    <!-- 7 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-gavel text-red-500 text-xs" aria-hidden="true" />
      7. Penalidades
    </h3>
    <ul :class="lista">
      <li>O descumprimento de qualquer regra deste termo poderá resultar em <strong>desligamento e banimento automático do programa de parceria, sem aviso prévio</strong>;</li>
      <li>Em caso de fraude comprovada, os saldos pendentes e liberados vinculados à conduta fraudulenta serão <strong>cancelados</strong>;</li>
      <li>O Parceiro que cometer fraude ou qualquer anomalia fora dos consentimentos da Agzap Systems poderá ainda <strong>responder a processo administrativo e judicial</strong>, nas esferas cível e criminal, conforme a legislação brasileira;</li>
      <li>A Agzap se reserva o direito de bloquear preventivamente o acesso e os saldos do Parceiro durante apuração de qualquer suspeita.</li>
    </ul>

    <!-- 8 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-lock text-slate-500 text-xs" aria-hidden="true" />
      8. Confidencialidade e dados
    </h3>
    <ul :class="lista">
      <li>As informações disponíveis no Portal do Parceiro (clientes, valores, comissões) são <strong>confidenciais</strong> e de uso exclusivo da parceria;</li>
      <li>É proibido divulgar, vender ou repassar essas informações a terceiros.</li>
    </ul>

    <!-- 9 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-rotate text-slate-500 text-xs" aria-hidden="true" />
      9. Alterações e vigência
    </h3>
    <ul :class="lista">
      <li>A Agzap pode atualizar este termo a qualquer momento — alterações relevantes serão comunicadas pelo próprio portal;</li>
      <li>O uso contínuo do Portal do Parceiro após alterações representa concordância com a nova versão;</li>
      <li>A parceria pode ser encerrada por qualquer uma das partes a qualquer momento. Comissões já liberadas e não fraudulentas permanecem devidas.</li>
    </ul>

    <!-- 10 -->
    <h3 :class="secaoTitulo">
      <i class="fa-solid fa-circle-check text-emerald-500 text-xs" aria-hidden="true" />
      10. Aceite
    </h3>
    <p :class="paragrafo">
      Ao marcar a opção de aceite, o Parceiro declara que <strong>leu integralmente este termo</strong>, compreendeu todas as regras de comissionamento, prazos e condutas, e concorda em cumpri-las enquanto fizer parte do Programa de Parceria da Agzap Systems.
    </p>
  </div>
</template>
