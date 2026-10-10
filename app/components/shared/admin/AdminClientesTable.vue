<script setup lang="ts">
import { ref } from 'vue'
import type { AdminCliente } from '~/composables/useAdminClientes'

interface Props { clientes: AdminCliente[]; loading: boolean }
defineProps<Props>()
const emit = defineEmits<{
  desativar: [clienteId: string]
  reativar: [clienteId: string]
  renovar: [clienteId: string]
  editar: [clienteId: string]
  excluir: [clienteId: string]
  'limite-instancias': [clienteId: string]
  'atribuir-parceiro': [clienteId: string]
  'remover-parceiro': [clienteId: string]
  'tornar-parceiro': [clienteId: string]
  'tornar-afiliado': [clienteId: string]
  'remover-parceria': [clienteId: string]
  'remover-afiliacao': [clienteId: string]
  modulos: [clienteId: string]
  'ver-uso': [clienteId: string]
  'saldo-indicacao': [clienteId: string]
  'ver-indicacao': [clienteId: string]
}>()

// Menu de ações (bottom sheet no mobile, painel central no desktop)
const menuCliente = ref<AdminCliente | null>(null)
function openMenu(c: AdminCliente) { menuCliente.value = c }
function closeMenu() { menuCliente.value = null }
function emitAction(action: 'editar' | 'limite-instancias' | 'renovar' | 'desativar' | 'reativar' | 'excluir' | 'atribuir-parceiro' | 'remover-parceiro' | 'tornar-parceiro' | 'tornar-afiliado' | 'remover-parceria' | 'remover-afiliacao' | 'modulos' | 'saldo-indicacao' | 'ver-indicacao', id: string) {
  emit(action as any, id)
  closeMenu()
}

const {
  formatDate, getPlanLabel, isVencido, formatDiasVencimento, diasParaVencimento, getDataVencimento,
  valorAssinatura, pagaParceiro, formatBRL,
} = useAdminClientes()

const statusConfig: Record<string, { label: string; cls: string; dot: string }> = {
  trial:    { label: 'Trial',     cls: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',         dot: 'bg-amber-500' },
  active:   { label: 'Ativo',     cls: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300', dot: 'bg-emerald-500' },
  canceled: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',           dot: 'bg-slate-400' },
  expired:  { label: 'Expirado',  cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',                 dot: 'bg-red-500' },
}

function diasRestantesCls(c: AdminCliente) {
  if (c.subscription_status === 'trial' && !getDataVencimento(c))
    return 'bg-blue-50 text-blue-700 dark:bg-blue-500/10 dark:text-blue-300'
  const d = diasParaVencimento(c)
  if (d < 0 || isVencido(c)) return 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
  if (d === 0)  return 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
  if (d <= 7)   return 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
}

function diasRestantesText(c: AdminCliente) {
  if (c.subscription_status === 'trial' && !getDataVencimento(c)) return 'Assinar'
  return formatDiasVencimento(c)
}

function dataVencimento(c: AdminCliente) {
  const d = getDataVencimento(c)
  return d ? formatDate(d) : '—'
}

// Resumo pro cartão "Módulos do app" do menu de ações (28/09/2026). Antes o
// selo "Restrito" só olhava o Roteamento; agora conta todos os gates comuns
// desligados e mostra quais add-ons pagos estão ligados.
function resumoModulos(c: AdminCliente) {
  const gates = [
    c.agendamentos_habilitado, c.pagina_agendamento_habilitada,
    c.api_assistente_habilitada, c.webhooks_habilitado, c.documentacao_habilitada, c.vitrine_habilitada,
  ]
  const desligados = gates.filter(v => v === false).length
  // Roteamento é add-on pago desde 28/09/2026 (junto de Disparos e Delivery);
  // Imóveis entrou como add-on pago em 01/10/2026.
  const addons = [
    c.roteamento_habilitado === true ? 'Roteamento' : '',
    c.envios_habilitado ? 'Disparos' : '',
    c.delivery_modulo_ativo ? 'Delivery' : '',
    c.imoveis_modulo_ativo === true ? 'Imóveis' : '',
  ].filter(Boolean)
  return { desligados, addons }
}

// Faixa fina na borda esquerda — sinaliza risco ao varrer a lista (cor + texto
// na coluna de dias, nunca só cor). Mais discreta desde o redesenho (09/10/2026).
function rowAccent(c: AdminCliente): string {
  if (c.cancel_at_period_end) return 'border-orange-300 dark:border-orange-500/50'
  if (c.subscription_status === 'canceled' || isVencido(c)) return 'border-red-300 dark:border-red-500/50'
  const d = diasParaVencimento(c)
  if (Number.isFinite(d) && d >= 0 && d <= 7) return 'border-amber-300 dark:border-amber-500/50'
  return 'border-transparent'
}

// Badge de cancelamento da assinatura no Stripe.
// `cancel_at_period_end` = cliente cancelou no Stripe, mantém acesso até o fim do período.
// `subscription_status === 'canceled'` = assinatura já encerrada.
function situacaoBadge(c: AdminCliente): { text: string; title: string; cls: string; icon: string } | null {
  // O bloqueio comercial do parceiro vem antes do rótulo de cancelamento: o
  // cliente não cancelou nada no Stripe, quem derrubou o acesso foi o parceiro.
  // Sem isso a lista mostrava só "Cancelado" e o motivo real ficava invisível.
  if (c.parceiro_bloqueio_origem === 'parceiro') {
    const quem = c.parceiro_nome ? `pelo parceiro ${c.parceiro_nome}` : 'pelo parceiro'
    const quando = c.parceiro_bloqueado_em ? ` em ${formatDate(c.parceiro_bloqueado_em)}` : ''
    return {
      text: 'Bloqueado pelo parceiro',
      title: `Acesso bloqueado ${quem}${quando} · bloqueio comercial, não é cancelamento no Stripe`,
      cls: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
      icon: 'fa-lock',
    }
  }
  if (c.cancel_at_period_end) {
    const venc = getDataVencimento(c)
    const ate = venc ? formatDate(venc) : ''
    return {
      text: 'Cancelou',
      title: ate ? `Cliente cancelou a assinatura no Stripe · acesso até ${ate}` : 'Cliente cancelou a assinatura no Stripe',
      cls: 'bg-orange-50 text-orange-700 dark:bg-orange-500/10 dark:text-orange-300',
      icon: 'fa-ban',
    }
  }
  if (c.subscription_status === 'canceled') {
    return {
      text: 'Cancelado',
      title: 'Assinatura encerrada no Stripe',
      cls: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
      icon: 'fa-ban',
    }
  }
  return null
}

// Na coluna Status o pill já diz "Cancelado": o selo extra só entra quando
// acrescenta informação (bloqueio do parceiro ou cancelamento agendado).
function situacaoExtra(c: AdminCliente) {
  const s = situacaoBadge(c)
  return s && s.text !== 'Cancelado' ? s : null
}

// Categoria do cliente (coluna "Categoria"): de quem ele é cliente e o papel
// do dono da conta. Tudo vem da lista (vínculo de parceiro e papéis do dono).
interface Selo { key: string; text: string; title: string; cls: string; icon: string }
const SELO_CLS = {
  agzap: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  parceiro: 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300',
  papelParceiro: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300',
  papelAfiliado: 'bg-teal-50 text-teal-700 dark:bg-teal-500/10 dark:text-teal-300',
  viaAfiliado: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  apagado: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400',
  superAdmin: 'bg-purple-100 text-purple-800 dark:bg-purple-500/20 dark:text-purple-200',
}
function categorias(c: AdminCliente): Selo[] {
  const selos: Selo[] = []
  if (c.role === 'superAdmin') {
    selos.push({ key: 'sa', text: 'Super Admin', title: 'Conta da equipe Agzap', cls: SELO_CLS.superAdmin, icon: 'fa-shield-halved' })
  } else if (c.parceiro_nome) {
    const comissao = c.parceiro_comissao != null ? ` · ${c.parceiro_comissao}% de comissão` : ''
    selos.push({
      key: 'parceiro',
      text: `Parceiro: ${c.parceiro_nome}`,
      title: `Cliente do parceiro ${c.parceiro_nome}${comissao}. ${c.parceiro_cobranca_agzap
        ? 'Marcado como cobrado pela Agzap: paga a Agzap direto.'
        : 'Paga o parceiro; a Agzap recebe do parceiro pela compra de créditos.'}`,
      cls: SELO_CLS.parceiro,
      icon: 'fa-handshake',
    })
    if (c.parceiro_cobranca_agzap) {
      selos.push({ key: 'cobranca', text: 'Cobrança Agzap', title: 'Cliente de parceiro cobrado direto pela Agzap (não consome crédito do parceiro)', cls: SELO_CLS.agzap, icon: 'fa-receipt' })
    }
  } else {
    selos.push({ key: 'agzap', text: 'Agzap', title: 'Cliente direto da Agzap', cls: SELO_CLS.agzap, icon: 'fa-building' })
  }
  // Quem TROUXE o cliente (1ª conexão, afiliado_empresas). Diferente de
  // "É afiliado", que fala do papel do dono desta conta.
  if (c.afiliado_id) {
    const nome = c.afiliado_nome || 'afiliado'
    selos.push({
      key: 'via-afiliado',
      text: `Via afiliado: ${nome}${c.afiliado_removido ? ' (removido)' : ''}`,
      title: `Entrou pelo link do afiliado ${nome} (1ª conexão)${c.afiliado_removido ? ' · a afiliação dele foi removida' : ''}`,
      cls: c.afiliado_removido ? SELO_CLS.apagado : SELO_CLS.viaAfiliado,
      icon: 'fa-link',
    })
  }
  // Papel do DONO desta conta (ele é parceiro/afiliado da Agzap).
  if (c.dono_parceiro_situacao) {
    const suspenso = c.dono_parceiro_situacao === 'suspenso'
    selos.push({
      key: 'dono-parceiro',
      text: suspenso ? 'É parceiro (suspenso)' : 'É parceiro',
      title: suspenso ? 'O dono desta conta é parceiro da Agzap (parceria suspensa)' : 'O dono desta conta é parceiro da Agzap (revende)',
      cls: suspenso ? SELO_CLS.apagado : SELO_CLS.papelParceiro,
      icon: 'fa-user-tie',
    })
  }
  if (c.dono_afiliado_situacao) {
    const bloqueado = c.dono_afiliado_situacao === 'bloqueado'
    selos.push({
      key: 'dono-afiliado',
      text: bloqueado ? 'É afiliado (bloqueado)' : 'É afiliado',
      title: bloqueado ? 'O dono desta conta é afiliado da Agzap (afiliação bloqueada)' : 'O dono desta conta é afiliado da Agzap (ganha comissão indicando)',
      cls: bloqueado ? SELO_CLS.apagado : SELO_CLS.papelAfiliado,
      icon: 'fa-people-arrows',
    })
  }
  return selos
}

function tituloIndicacao(c: AdminCliente) {
  const quem = c.indicado_por_responsavel
    ? `${c.indicado_por_responsavel} (${c.indicado_por_nome || 'empresa'})`
    : (c.indicado_por_nome || 'outro cliente')
  return `Indicação de ${quem}. Clique para ver ou remover`
}

// Coluna "Mensalidade": valor CADASTRADO no cliente (plano de 12 meses mostra
// o anual). Fica apagado quando o cliente não está pagando agora, e o título
// deixa claro quando o dinheiro vai para o parceiro, não para a Agzap.
function valorInfo(c: AdminCliente) {
  const v = valorAssinatura(c)
  if (!v) return null
  const pagandoAgora = c.subscription_status === 'active' && c.ativo && !isVencido(c)
  let title = v.anual ? 'Valor do plano de 12 meses cadastrado' : 'Mensalidade cadastrada'
  if (pagaParceiro(c)) title += ` · o cliente paga ao parceiro ${c.parceiro_nome}, não é receita da Agzap`
  if (c.subscription_status === 'trial') title += ' · ainda em teste'
  else if (!pagandoAgora) title += ' · não está pagando agora'
  return { texto: formatBRL(v.valor), sufixo: v.anual ? '/ano' : '/mês', apagado: !pagandoAgora, title }
}
</script>

<template>
  <div class="bg-white dark:bg-slate-900 border border-slate-200/70 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
    <!-- Cabeçalho do painel (título, busca e filtros vêm da página) -->
    <slot name="topo" />

    <!-- Loading -->
    <div v-if="loading" class="p-10 flex items-center justify-center border-t border-slate-100 dark:border-slate-800">
      <AppLoading />
    </div>

    <!-- Empty -->
    <div v-else-if="clientes.length === 0" class="p-12 flex flex-col items-center justify-center text-center gap-3 border-t border-slate-100 dark:border-slate-800">
      <div class="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <i class="fa-solid fa-users text-slate-400 dark:text-slate-600 text-xl" aria-hidden="true" />
      </div>
      <div>
        <p class="text-slate-700 dark:text-slate-300 font-medium text-sm">Nenhum cliente encontrado</p>
        <p class="text-slate-400 dark:text-slate-500 text-xs mt-0.5">Tente ajustar os filtros de busca</p>
      </div>
    </div>

    <template v-else>
      <!-- Celular e telas médias (abaixo de xl): um cartão por cliente -->
      <ul class="xl:hidden border-t border-slate-100 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
        <li
          v-for="c in clientes"
          :key="c.id"
          class="px-4 sm:px-5 py-4 border-l-[3px] cursor-pointer transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30"
          :class="[rowAccent(c), !c.ativo ? 'opacity-60' : '']"
          title="Ver uso desta empresa"
          @click="$emit('ver-uso', c.id)"
        >
          <div class="flex items-start gap-3">
            <div
              class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold text-white"
              :class="c.ativo ? 'bg-purple-600' : 'bg-slate-400 dark:bg-slate-600'"
              aria-hidden="true"
            >
              {{ c.nome.charAt(0).toUpperCase() }}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-slate-900 dark:text-white truncate">{{ c.nome }}</p>
              <p v-if="c.nome_cliente" class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ c.nome_cliente }}</p>
            </div>
            <button
              @click.stop="openMenu(c)"
              class="-mr-2 -mt-1 w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title="Ações"
              aria-label="Abrir ações do cliente"
              type="button"
            >
              <i class="fa-solid fa-ellipsis-vertical text-sm" aria-hidden="true" />
            </button>
          </div>

          <!-- Categoria -->
          <div class="mt-2.5 flex flex-wrap items-center gap-1.5">
            <span
              v-for="s in categorias(c)"
              :key="s.key"
              class="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-md text-[11px] font-medium"
              :class="s.cls"
              :title="s.title"
            >
              <i class="fa-solid text-[9px]" :class="s.icon" aria-hidden="true" />
              <span class="truncate">{{ s.text }}</span>
            </span>
            <button
              v-if="c.indicado_por_empresa_id"
              type="button"
              class="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-md text-[11px] font-medium bg-pink-50 text-pink-700 hover:bg-pink-100 dark:bg-pink-500/10 dark:text-pink-300 dark:hover:bg-pink-500/20 transition-colors"
              :title="tituloIndicacao(c)"
              @click.stop="$emit('ver-indicacao', c.id)"
            >
              <i class="fa-solid fa-gift text-[9px]" aria-hidden="true" />
              <span class="truncate">Indicação de {{ c.indicado_por_responsavel || c.indicado_por_nome || 'cliente' }}</span>
            </button>
          </div>

          <!-- Dados -->
          <dl class="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
            <div class="min-w-0">
              <dt class="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Status</dt>
              <dd class="mt-1 flex flex-wrap items-center gap-1">
                <span
                  class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium"
                  :class="statusConfig[c.subscription_status]?.cls ?? statusConfig.canceled!.cls"
                >
                  <span class="w-1.5 h-1.5 rounded-full" :class="statusConfig[c.subscription_status]?.dot ?? 'bg-slate-400'" aria-hidden="true" />
                  {{ statusConfig[c.subscription_status]?.label ?? c.subscription_status }}
                </span>
                <span
                  v-if="situacaoExtra(c)"
                  class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap"
                  :class="situacaoExtra(c)!.cls"
                  :title="situacaoExtra(c)!.title"
                >
                  <i class="fa-solid" :class="situacaoExtra(c)!.icon" aria-hidden="true" />
                  {{ situacaoExtra(c)!.text }}
                </span>
                <span v-if="!c.ativo" class="inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                  Inativo
                </span>
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Plano</dt>
              <dd class="mt-1 text-sm text-slate-700 dark:text-slate-300">{{ getPlanLabel(c.subscription_plan) }}</dd>
            </div>
            <div class="min-w-0">
              <dt class="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Mensalidade</dt>
              <dd class="mt-1 text-sm tabular-nums whitespace-nowrap" :title="valorInfo(c)?.title">
                <template v-if="valorInfo(c)">
                  <span :class="valorInfo(c)!.apagado ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'">{{ valorInfo(c)!.texto }}</span><span class="ml-0.5 text-[11px] text-slate-400 dark:text-slate-500">{{ valorInfo(c)!.sufixo }}</span>
                </template>
                <span v-else class="text-slate-400 dark:text-slate-500">—</span>
              </dd>
            </div>
            <div class="min-w-0">
              <dt class="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500">Vencimento</dt>
              <dd class="mt-1 flex flex-wrap items-center gap-1.5">
                <span class="text-sm text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">{{ dataVencimento(c) }}</span>
                <span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap" :class="diasRestantesCls(c)">{{ diasRestantesText(c) }}</span>
              </dd>
            </div>
          </dl>

          <!-- Contato -->
          <div class="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400 min-w-0">
            <span v-if="c.email" class="truncate max-w-full">{{ c.email }}</span>
            <span v-if="formatPhone(c.whatsapp)" class="inline-flex items-center gap-1.5 tabular-nums whitespace-nowrap">
              {{ formatPhone(c.whatsapp) }}
              <a
                :href="whatsappLink(c.whatsapp) ?? '#'"
                target="_blank"
                rel="noopener noreferrer"
                class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white transition-colors"
                :title="`Abrir WhatsApp de ${c.nome}`"
                aria-label="Abrir WhatsApp"
                @click.stop
              ><i class="fa-brands fa-whatsapp text-[12px]" aria-hidden="true" /></a>
            </span>
          </div>
        </li>
      </ul>

      <!-- Desktop (xl+): tabela. Rola dentro do próprio painel se faltar largura. -->
      <div class="hidden xl:block overflow-x-auto border-t border-slate-100 dark:border-slate-800">
        <!-- Abaixo de 2xl: os dias restantes vão embaixo da data e a coluna
             "Ativo" sai (a conta inativa aparece no Status). A coluna de ações
             fica presa à direita para o ⋮ nunca sumir se a tabela rolar. -->
        <table class="w-full min-w-[860px] text-sm">
          <thead>
            <tr class="border-b border-slate-100 dark:border-slate-800">
              <th scope="col" class="pl-5 pr-3 py-3 text-left text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Cliente</th>
              <th scope="col" class="px-3 py-3 text-left text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Categoria</th>
              <th scope="col" class="px-3 py-3 text-left text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Status</th>
              <th scope="col" class="px-3 py-3 text-left text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Plano</th>
              <th scope="col" class="px-3 py-3 text-right text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Mensalidade</th>
              <th scope="col" class="px-3 py-3 text-left text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Vencimento</th>
              <th scope="col" class="hidden 2xl:table-cell px-3 py-3 text-left text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Dias restantes</th>
              <th scope="col" class="hidden 2xl:table-cell px-3 py-3 text-center text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ativo</th>
              <th scope="col" class="sticky right-0 bg-white dark:bg-slate-900 pl-3 pr-5 py-3 text-right text-[11px] font-medium text-slate-400 dark:text-slate-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>

          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr
              v-for="c in clientes"
              :key="c.id"
              class="group hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
              :class="!c.ativo ? 'opacity-60' : ''"
              title="Ver uso desta empresa"
              @click="$emit('ver-uso', c.id)"
            >
              <!-- Cliente -->
              <td class="pl-4 pr-3 py-4 border-l-[3px] align-middle" :class="rowAccent(c)">
                <div class="flex items-center gap-3 min-w-0">
                  <div
                    class="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold text-white"
                    :class="c.ativo ? 'bg-purple-600' : 'bg-slate-400 dark:bg-slate-600'"
                    aria-hidden="true"
                  >
                    {{ c.nome.charAt(0).toUpperCase() }}
                  </div>
                  <div class="min-w-0 max-w-[210px] 2xl:max-w-[300px]">
                    <p class="font-medium text-slate-900 dark:text-white leading-tight truncate" :title="c.nome">{{ c.nome }}</p>
                    <p class="mt-0.5 text-xs text-slate-500 dark:text-slate-400 truncate" :title="[c.nome_cliente, c.email].filter(Boolean).join(' · ')">
                      <template v-if="c.nome_cliente"><span class="text-slate-600 dark:text-slate-300">{{ c.nome_cliente }}</span><template v-if="c.email"> · </template></template>{{ c.email }}
                    </p>
                    <p v-if="formatPhone(c.whatsapp)" class="mt-0.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 tabular-nums whitespace-nowrap">
                      {{ formatPhone(c.whatsapp) }}
                      <a
                        :href="whatsappLink(c.whatsapp) ?? '#'"
                        target="_blank"
                        rel="noopener noreferrer"
                        class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white transition-colors"
                        :title="`Abrir WhatsApp de ${c.nome}`"
                        aria-label="Abrir WhatsApp"
                        @click.stop
                      ><i class="fa-brands fa-whatsapp text-[11px]" aria-hidden="true" /></a>
                    </p>
                  </div>
                </div>
              </td>

              <!-- Categoria -->
              <td class="px-3 py-4 align-middle">
                <div class="flex flex-wrap items-center gap-1 max-w-[170px] 2xl:max-w-[240px]">
                  <span
                    v-for="s in categorias(c)"
                    :key="s.key"
                    class="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-md text-[11px] font-medium"
                    :class="s.cls"
                    :title="s.title"
                  >
                    <i class="fa-solid text-[9px]" :class="s.icon" aria-hidden="true" />
                    <span class="truncate">{{ s.text }}</span>
                  </span>
                  <button
                    v-if="c.indicado_por_empresa_id"
                    type="button"
                    class="inline-flex items-center gap-1 max-w-full px-2 py-0.5 rounded-md text-[11px] font-medium bg-pink-50 text-pink-700 hover:bg-pink-100 dark:bg-pink-500/10 dark:text-pink-300 dark:hover:bg-pink-500/20 transition-colors"
                    :title="tituloIndicacao(c)"
                    @click.stop="$emit('ver-indicacao', c.id)"
                  >
                    <i class="fa-solid fa-gift text-[9px]" aria-hidden="true" />
                    <span class="truncate">Indicação de {{ c.indicado_por_responsavel || c.indicado_por_nome || 'cliente' }}</span>
                  </button>
                </div>
              </td>

              <!-- Status -->
              <td class="px-3 py-4 align-middle">
                <div class="flex flex-col items-start gap-1">
                  <span
                    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium whitespace-nowrap"
                    :class="statusConfig[c.subscription_status]?.cls ?? statusConfig.canceled!.cls"
                  >
                    <span class="w-1.5 h-1.5 rounded-full" :class="statusConfig[c.subscription_status]?.dot ?? 'bg-slate-400'" aria-hidden="true" />
                    {{ statusConfig[c.subscription_status]?.label ?? c.subscription_status }}
                  </span>
                  <span
                    v-if="situacaoExtra(c)"
                    class="inline-flex items-start gap-1 max-w-[120px] px-1.5 py-0.5 rounded-md text-[10px] font-medium leading-tight"
                    :class="situacaoExtra(c)!.cls"
                    :title="situacaoExtra(c)!.title"
                  >
                    <i class="fa-solid mt-px" :class="situacaoExtra(c)!.icon" aria-hidden="true" />
                    <span>{{ situacaoExtra(c)!.text }}</span>
                  </span>
                  <!-- Sem a coluna "Ativo" (abaixo de 2xl), a conta desativada aparece aqui -->
                  <span v-if="!c.ativo" class="2xl:hidden inline-flex items-center px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                    Inativo
                  </span>
                </div>
              </td>

              <!-- Plano -->
              <td class="px-3 py-4 align-middle">
                <span class="text-slate-700 dark:text-slate-300 whitespace-nowrap">{{ getPlanLabel(c.subscription_plan) }}</span>
              </td>

              <!-- Mensalidade (valor cadastrado) -->
              <td class="px-3 py-4 align-middle text-right whitespace-nowrap tabular-nums" :title="valorInfo(c)?.title">
                <template v-if="valorInfo(c)">
                  <span :class="valorInfo(c)!.apagado ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-200'">{{ valorInfo(c)!.texto }}</span><span class="ml-0.5 text-[11px] text-slate-400 dark:text-slate-500">{{ valorInfo(c)!.sufixo }}</span>
                </template>
                <span v-else class="text-slate-400 dark:text-slate-500">—</span>
              </td>

              <!-- Vencimento (abaixo de 2xl leva os dias restantes embaixo) -->
              <td class="px-3 py-4 align-middle">
                <div class="flex flex-col items-start gap-1">
                  <span class="text-slate-700 dark:text-slate-300 tabular-nums whitespace-nowrap">{{ dataVencimento(c) }}</span>
                  <span class="2xl:hidden inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium whitespace-nowrap" :class="diasRestantesCls(c)">
                    {{ diasRestantesText(c) }}
                  </span>
                </div>
              </td>

              <!-- Dias restantes (2xl+) -->
              <td class="hidden 2xl:table-cell px-3 py-4 align-middle">
                <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap" :class="diasRestantesCls(c)">
                  {{ diasRestantesText(c) }}
                </span>
              </td>

              <!-- Ativo (2xl+) -->
              <td class="hidden 2xl:table-cell px-3 py-4 align-middle text-center">
                <span v-if="c.ativo" class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-50 dark:bg-emerald-500/10" title="Conta ativa">
                  <i class="fa-solid fa-check text-emerald-600 dark:text-emerald-400 text-[11px]" aria-hidden="true" />
                  <span class="sr-only">Sim</span>
                </span>
                <span v-else class="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-100 dark:bg-slate-800" title="Conta desativada">
                  <i class="fa-solid fa-xmark text-slate-400 text-[11px]" aria-hidden="true" />
                  <span class="sr-only">Não</span>
                </span>
              </td>

              <!-- Ações: menu de três pontinhos (preso à direita) -->
              <td class="sticky right-0 bg-white dark:bg-slate-900 group-hover:bg-slate-50 dark:group-hover:bg-[#221f32] transition-colors pl-3 pr-5 py-4 align-middle">
                <div class="flex justify-end">
                  <button
                    @click.stop="openMenu(c)"
                    class="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    title="Ações"
                    aria-label="Abrir ações do cliente"
                    type="button"
                  >
                    <i class="fa-solid fa-ellipsis-vertical text-sm" aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </template>

    <!-- Bottom sheet de ações (mobile) -->
    <Teleport to="body">
      <Transition name="sheet">
        <div v-if="menuCliente" class="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4" role="dialog" aria-modal="true">
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/60 sm:backdrop-blur-sm" @click="closeMenu" aria-hidden="true" />
          <!-- Sheet (mobile) / painel central (desktop). Desktop mais largo, ações
               em cartões de 2 colunas por grupo (28/09/2026): antes era uma lista
               comprida e estreita. Mobile segue bottom sheet, 1 coluna. -->
          <div class="relative bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl border-t sm:border border-slate-200 dark:border-slate-800 shadow-2xl pb-[max(env(safe-area-inset-bottom),1rem)] sm:pb-4 animate-slide-up sm:w-full sm:max-w-2xl max-h-[92vh] flex flex-col">
            <!-- Drag handle (mobile) -->
            <div class="flex justify-center py-2 sm:hidden">
              <div class="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>
            <div class="hidden sm:block pt-4" />
            <!-- Header -->
            <div class="px-5 pb-3.5 border-b border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold text-white"
                  :class="menuCliente.ativo ? 'bg-purple-600' : 'bg-slate-400 dark:bg-slate-600'">
                  {{ menuCliente.nome.charAt(0).toUpperCase() }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-semibold text-slate-900 dark:text-white text-sm truncate">{{ menuCliente.nome }}</p>
                    <span
                      v-if="situacaoBadge(menuCliente)"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium whitespace-nowrap"
                      :class="situacaoBadge(menuCliente)!.cls"
                      :title="situacaoBadge(menuCliente)!.title"
                    >
                      <i class="fa-solid" :class="situacaoBadge(menuCliente)!.icon" aria-hidden="true" />
                      {{ situacaoBadge(menuCliente)!.text }}
                    </span>
                    <span
                      v-if="menuCliente.parceiro_nome"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300"
                    >
                      <i class="fa-solid fa-handshake" aria-hidden="true" />
                      <span class="truncate max-w-[110px]">{{ menuCliente.parceiro_nome }}</span>
                    </span>
                    <button
                      v-if="menuCliente.indicado_por_empresa_id"
                      type="button"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-pink-50 text-pink-700 hover:bg-pink-100 dark:bg-pink-500/10 dark:text-pink-300 dark:hover:bg-pink-500/20 transition-colors"
                      :title="`Indicação de ${menuCliente.indicado_por_nome || 'outro cliente'}. Clique para ver ou remover`"
                      @click="emitAction('ver-indicacao', menuCliente.id)"
                    >
                      <i class="fa-solid fa-gift" aria-hidden="true" />
                      <span class="truncate max-w-[150px]">Indicação de {{ menuCliente.indicado_por_responsavel || menuCliente.indicado_por_nome || 'cliente' }}</span>
                    </button>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400 truncate">
                    <template v-if="menuCliente.nome_cliente">{{ menuCliente.nome_cliente }} · </template>{{ getPlanLabel(menuCliente.subscription_plan) }} · {{ diasRestantesText(menuCliente) }}
                  </p>
                </div>
                <button
                  type="button"
                  @click="closeMenu"
                  class="hidden sm:flex shrink-0 w-8 h-8 rounded-lg items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 dark:hover:text-slate-300 transition-colors"
                  aria-label="Fechar"
                >
                  <i class="fa-solid fa-xmark" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div class="overflow-y-auto px-4 pt-4 space-y-4">
              <!-- Conta e plano -->
              <section>
                <p class="px-1 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Conta e plano</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button type="button" @click="emitAction('editar', menuCliente.id)" class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-purple-300 dark:hover:border-purple-500/40 hover:bg-purple-50/40 dark:hover:bg-purple-500/5">
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400"><i class="fa-solid fa-pen-to-square" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-slate-800 dark:text-slate-200">Editar cliente</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">Nome, contato, valor e token</span>
                    </span>
                  </button>
                  <button type="button" @click="emitAction('renovar', menuCliente.id)" class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-purple-300 dark:hover:border-purple-500/40 hover:bg-purple-50/40 dark:hover:bg-purple-500/5">
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><i class="fa-solid fa-calendar-check" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-slate-800 dark:text-slate-200">Renovar assinatura</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">{{ diasRestantesText(menuCliente) }}</span>
                    </span>
                  </button>
                  <button type="button" @click="emitAction('saldo-indicacao', menuCliente.id)" class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-purple-300 dark:hover:border-purple-500/40 hover:bg-purple-50/40 dark:hover:bg-purple-500/5">
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><i class="fa-solid fa-gift" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-slate-800 dark:text-slate-200">Saldo de indicação</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">Ver e usar em desconto ou serviço</span>
                    </span>
                  </button>
                  <button type="button" @click="emitAction('limite-instancias', menuCliente.id)" class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-purple-300 dark:hover:border-purple-500/40 hover:bg-purple-50/40 dark:hover:bg-purple-500/5">
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-purple-50 dark:bg-purple-500/10 text-purple-600 dark:text-purple-400"><i class="fa-solid fa-mobile-screen" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-slate-800 dark:text-slate-200">Canais WhatsApp</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">{{ menuCliente.max_instancias ?? 1 }} {{ (menuCliente.max_instancias ?? 1) === 1 ? 'canal liberado' : 'canais liberados' }}</span>
                    </span>
                  </button>
                  <button type="button" @click="emitAction('modulos', menuCliente.id)" class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-purple-300 dark:hover:border-purple-500/40 hover:bg-purple-50/40 dark:hover:bg-purple-500/5">
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400"><i class="fa-solid fa-puzzle-piece" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-slate-800 dark:text-slate-200">Módulos do app</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">
                        <template v-if="resumoModulos(menuCliente).desligados > 0">
                          <span class="font-semibold text-amber-600 dark:text-amber-400">{{ resumoModulos(menuCliente).desligados }} desligado{{ resumoModulos(menuCliente).desligados > 1 ? 's' : '' }}</span>
                        </template>
                        <template v-else>Todos os módulos liberados</template>
                        <template v-if="resumoModulos(menuCliente).addons.length"> · <span class="text-purple-600 dark:text-purple-400 font-medium">+ {{ resumoModulos(menuCliente).addons.join(', ') }}</span></template>
                      </span>
                    </span>
                  </button>
                </div>
              </section>

              <!-- Parceria (não vale pro superAdmin) -->
              <section v-if="menuCliente.role !== 'superAdmin'">
                <p class="px-1 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Parceria</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button type="button" @click="emitAction('atribuir-parceiro', menuCliente.id)" class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-purple-300 dark:hover:border-purple-500/40 hover:bg-purple-50/40 dark:hover:bg-purple-500/5">
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-teal-50 dark:bg-teal-500/10 text-teal-600 dark:text-teal-400"><i class="fa-solid fa-handshake" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-slate-800 dark:text-slate-200">{{ menuCliente.parceiro_nome ? 'Trocar parceiro' : 'Atribuir a parceiro' }}</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">{{ menuCliente.parceiro_nome ? `Hoje: ${menuCliente.parceiro_nome}` : 'Sem parceiro vinculado' }}</span>
                    </span>
                  </button>
                  <button
                    v-if="menuCliente.parceiro_nome"
                    type="button"
                    @click="emitAction('remover-parceiro', menuCliente.id)"
                    class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-orange-300 dark:hover:border-orange-500/40 hover:bg-orange-50/40 dark:hover:bg-orange-500/5"
                  >
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-orange-50 dark:bg-orange-500/10 text-orange-600 dark:text-orange-400"><i class="fa-solid fa-link-slash" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-slate-800 dark:text-slate-200">Remover do parceiro</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">Desvincula de {{ menuCliente.parceiro_nome }}</span>
                    </span>
                  </button>
                  <!-- Um papel por vez (09/10/2026): "Tornar…" aparece sempre que
                       o dono não tem aquele papel ativo — se tiver o outro, a troca
                       é automática (o modal mostra o que sai). "Remover…" aparece
                       para o papel que ainda existe (ativo ou suspenso/bloqueado). -->
                  <button v-if="!menuCliente.dono_parceiro" type="button" @click="emitAction('tornar-parceiro', menuCliente.id)" class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-purple-300 dark:hover:border-purple-500/40 hover:bg-purple-50/40 dark:hover:bg-purple-500/5">
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"><i class="fa-solid fa-user-tie" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-medium text-slate-800 dark:text-slate-200">{{ menuCliente.dono_parceiro_situacao === 'suspenso' ? 'Reativar parceria' : 'Tornar empresa parceira' }}</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">{{ menuCliente.dono_afiliado_situacao ? 'Sai da afiliação e vira parceiro' : 'Passa a revender a Agzap' }}</span>
                    </span>
                  </button>
                  <button v-if="!menuCliente.dono_afiliado" type="button" @click="emitAction('tornar-afiliado', menuCliente.id)" class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-purple-300 dark:hover:border-purple-500/40 hover:bg-purple-50/40 dark:hover:bg-purple-500/5">
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><i class="fa-solid fa-people-arrows" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-medium text-slate-800 dark:text-slate-200">{{ menuCliente.dono_afiliado_situacao === 'bloqueado' ? 'Desbloquear afiliado' : 'Tornar afiliado' }}</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">{{ menuCliente.dono_parceiro_situacao ? 'Sai da parceria e vira afiliado' : 'Ganha comissão em dinheiro indicando' }}</span>
                    </span>
                  </button>
                  <button v-if="menuCliente.dono_parceiro_situacao" type="button" @click="emitAction('remover-parceria', menuCliente.id)" class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-red-300 dark:hover:border-red-500/40 hover:bg-red-50/40 dark:hover:bg-red-500/5">
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"><i class="fa-solid fa-user-xmark" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-medium text-slate-800 dark:text-slate-200">Remover parceria</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">{{ menuCliente.dono_parceiro_situacao === 'suspenso' ? 'Parceiro suspenso: volta a ser cliente' : 'O dono volta a ser cliente normal' }}</span>
                    </span>
                  </button>
                  <button v-if="menuCliente.dono_afiliado_situacao" type="button" @click="emitAction('remover-afiliacao', menuCliente.id)" class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-red-300 dark:hover:border-red-500/40 hover:bg-red-50/40 dark:hover:bg-red-500/5">
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"><i class="fa-solid fa-user-minus" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-medium text-slate-800 dark:text-slate-200">Remover afiliação</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">{{ menuCliente.dono_afiliado_situacao === 'bloqueado' ? 'Afiliado bloqueado: volta a ser cliente' : 'O dono volta a ser cliente normal' }}</span>
                    </span>
                  </button>
                </div>
              </section>

              <!-- Situação da conta -->
              <section v-if="menuCliente.role !== 'superAdmin'">
                <p class="px-1 mb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">Situação da conta</p>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    v-if="menuCliente.ativo"
                    type="button"
                    @click="emitAction('desativar', menuCliente.id)"
                    class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-amber-300 dark:hover:border-amber-500/40 hover:bg-amber-50/40 dark:hover:bg-amber-500/5"
                  >
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400"><i class="fa-solid fa-circle-pause" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-slate-800 dark:text-slate-200">Desativar cliente</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">Bloqueia o acesso; dá pra reativar</span>
                    </span>
                  </button>
                  <button
                    v-else
                    type="button"
                    @click="emitAction('reativar', menuCliente.id)"
                    class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-emerald-300 dark:hover:border-emerald-500/40 hover:bg-emerald-50/40 dark:hover:bg-emerald-500/5"
                  >
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"><i class="fa-solid fa-circle-check" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-slate-800 dark:text-slate-200">Reativar cliente</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">Libera o acesso de novo</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    @click="emitAction('excluir', menuCliente.id)"
                    class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors border-red-200 dark:border-red-500/30 hover:border-red-300 dark:hover:border-red-500/50 hover:bg-red-50 dark:hover:bg-red-500/10"
                  >
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400"><i class="fa-solid fa-trash" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-red-600 dark:text-red-400">Excluir cliente</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">Apaga a empresa (pede confirmação)</span>
                    </span>
                  </button>
                </div>
              </section>
            </div>

            <!-- Cancelar: só no celular (no desktop tem o X) -->
            <div class="px-3 pt-3 sm:hidden">
              <button
                @click="closeMenu"
                class="w-full py-3 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm"
                type="button"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-active .animate-slide-up,
.sheet-leave-active .animate-slide-up {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.sheet-enter-from .animate-slide-up,
.sheet-leave-to .animate-slide-up {
  transform: translateY(100%);
}
</style>
