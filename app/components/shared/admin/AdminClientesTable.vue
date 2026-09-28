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
  modulos: [clienteId: string]
  'ver-uso': [clienteId: string]
}>()

// Menu de ações (bottom sheet no mobile, painel central no desktop)
const menuCliente = ref<AdminCliente | null>(null)
function openMenu(c: AdminCliente) { menuCliente.value = c }
function closeMenu() { menuCliente.value = null }
function emitAction(action: 'editar' | 'limite-instancias' | 'renovar' | 'desativar' | 'reativar' | 'excluir' | 'atribuir-parceiro' | 'remover-parceiro' | 'tornar-parceiro' | 'modulos', id: string) {
  emit(action as any, id)
  closeMenu()
}

const { formatDate, getPlanLabel, isVencido, formatDiasVencimento, diasParaVencimento, getDataVencimento } = useAdminClientes()

const statusConfig: Record<string, { label: string; cls: string; dot: string }> = {
  trial:    { label: 'Trial',     cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',     dot: 'bg-amber-500' },
  active:   { label: 'Ativo',    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400', dot: 'bg-emerald-500' },
  canceled: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400',       dot: 'bg-slate-400' },
  expired:  { label: 'Expirado', cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',              dot: 'bg-red-500' },
}

function diasRestantesCls(c: AdminCliente) {
  if (c.subscription_status === 'trial' && !getDataVencimento(c))
    return 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300'
  const d = diasParaVencimento(c)
  if (d < 0 || isVencido(c)) return 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300'
  if (d === 0)  return 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300'
  if (d <= 7)   return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400'
}

function diasRestantesText(c: AdminCliente) {
  if (c.subscription_status === 'trial' && !getDataVencimento(c)) return 'Assinar'
  return formatDiasVencimento(c)
}

// Resumo pro cartão "Módulos do app" do menu de ações (28/09/2026). Antes o
// selo "Restrito" só olhava o Roteamento; agora conta todos os gates comuns
// desligados e mostra quais add-ons pagos estão ligados.
function resumoModulos(c: AdminCliente) {
  const gates = [
    c.roteamento_habilitado, c.agendamentos_habilitado, c.pagina_agendamento_habilitada,
    c.api_assistente_habilitada, c.webhooks_habilitado, c.documentacao_habilitada, c.vitrine_habilitada,
  ]
  const desligados = gates.filter(v => v === false).length
  const addons = [c.envios_habilitado ? 'Disparos' : '', c.delivery_modulo_ativo ? 'Delivery' : ''].filter(Boolean)
  return { desligados, addons }
}

// Badge de cancelamento da assinatura no Stripe.
// `cancel_at_period_end` = cliente cancelou no Stripe, mantém acesso até o fim do período.
// `subscription_status === 'canceled'` = assinatura já encerrada.
// Acento na borda esquerda da linha — sinaliza risco ao varrer a lista (cor + texto, nunca só cor).
function rowAccent(c: AdminCliente): string {
  if (c.cancel_at_period_end) return 'border-orange-400 dark:border-orange-500/60'
  if (c.subscription_status === 'canceled' || isVencido(c)) return 'border-red-400 dark:border-red-500/60'
  const d = diasParaVencimento(c)
  if (Number.isFinite(d) && d >= 0 && d <= 7) return 'border-amber-400 dark:border-amber-500/60'
  return 'border-transparent'
}

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
      cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
      icon: 'fa-lock',
    }
  }
  if (c.cancel_at_period_end) {
    const ate = formatDate(getDataVencimento(c))
    return {
      text: 'Cancelou',
      title: ate ? `Cliente cancelou a assinatura no Stripe · acesso até ${ate}` : 'Cliente cancelou a assinatura no Stripe',
      cls: 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400',
      icon: 'fa-ban',
    }
  }
  if (c.subscription_status === 'canceled') {
    return {
      text: 'Cancelado',
      title: 'Assinatura encerrada no Stripe',
      cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400',
      icon: 'fa-ban',
    }
  }
  return null
}

</script>

<template>
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">

    <!-- Loading -->
    <div v-if="loading" class="p-10 flex items-center justify-center">
      <AppLoading />
    </div>

    <!-- Empty -->
    <div v-else-if="clientes.length === 0" class="p-12 flex flex-col items-center justify-center text-center gap-3">
      <div class="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <i class="fa-solid fa-users text-slate-400 dark:text-slate-600 text-xl" aria-hidden="true" />
      </div>
      <div>
        <p class="text-slate-700 dark:text-slate-300 font-semibold text-sm">Nenhum cliente encontrado</p>
        <p class="text-slate-400 dark:text-slate-600 text-xs mt-0.5">Tente ajustar os filtros de busca</p>
      </div>
    </div>

    <!-- Table -->
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
            <th scope="col" class="px-2 sm:px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Cliente</th>
            <th scope="col" class="hidden md:table-cell px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Status</th>
            <th scope="col" class="px-2 sm:px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Plano</th>
            <th scope="col" class="px-2 sm:px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Vencimento</th>
            <th scope="col" class="hidden sm:table-cell px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Dias Restantes</th>
            <th scope="col" class="hidden lg:table-cell px-5 py-3.5 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Ativo</th>
            <th scope="col" class="px-2 sm:px-5 py-3.5 text-right text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Ações</th>
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr
            v-for="c in clientes"
            :key="c.id"
            class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
            :class="!c.ativo ? 'opacity-55' : ''"
            title="Ver uso desta empresa"
            @click="$emit('ver-uso', c.id)"
          >
            <!-- Cliente -->
            <td class="px-2 sm:px-5 py-3 sm:py-4 max-w-[160px] sm:max-w-none border-l-4" :class="rowAccent(c)">
              <div class="flex items-center gap-2 sm:gap-3 min-w-0">
                <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 text-xs sm:text-sm font-bold text-white"
                  :class="c.ativo ? 'bg-purple-600' : 'bg-slate-400 dark:bg-slate-600'">
                  {{ c.nome.charAt(0).toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-slate-900 dark:text-white leading-tight text-sm truncate">{{ c.nome }}</span>
                    <span
                      v-if="c.role === 'superAdmin'"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-purple-600 to-blue-600 text-white"
                    >
                      <i class="fa-solid fa-shield-halved" aria-hidden="true" />
                      <span class="hidden sm:inline">Super Admin</span>
                    </span>
                    <span
                      v-if="situacaoBadge(c)"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
                      :class="situacaoBadge(c)!.cls"
                      :title="situacaoBadge(c)!.title"
                    >
                      <i class="fa-solid" :class="situacaoBadge(c)!.icon" aria-hidden="true" />
                      {{ situacaoBadge(c)!.text }}
                    </span>
                    <span
                      v-if="c.parceiro_nome"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400"
                      :title="`Atribuído ao parceiro ${c.parceiro_nome}${c.parceiro_comissao != null ? ` · ${c.parceiro_comissao}% de comissão` : ''}`"
                    >
                      <i class="fa-solid fa-handshake" aria-hidden="true" />
                      <span class="truncate max-w-[110px]">{{ c.parceiro_nome }}</span>
                    </span>
                  </div>
                  <p class="hidden md:block text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    <template v-if="c.nome_cliente"><i class="fa-solid fa-user text-[10px] text-slate-400 dark:text-slate-500" aria-hidden="true" /> <span class="font-medium text-slate-600 dark:text-slate-300">{{ c.nome_cliente }}</span> · </template>{{ c.email }}<template v-if="formatPhone(c.whatsapp)"> · {{ formatPhone(c.whatsapp) }} <a
                      :href="whatsappLink(c.whatsapp) ?? '#'"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white transition-colors align-middle"
                      :title="`Abrir WhatsApp de ${c.nome}`"
                      aria-label="Abrir WhatsApp"
                      @click.stop
                    ><i class="fa-brands fa-whatsapp text-[11px]" aria-hidden="true" /></a></template>
                  </p>
                  <!-- Mobile: nome do cliente (a linha de email/fone é md+) -->
                  <p v-if="c.nome_cliente" class="md:hidden text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    <i class="fa-solid fa-user text-[9px]" aria-hidden="true" /> {{ c.nome_cliente }}
                  </p>
                  <!-- Mobile: dias restantes inline + status quando o status pill estiver escondido -->
                  <div class="md:hidden mt-1 flex items-center gap-1.5 flex-wrap">
                    <span
                      class="sm:hidden inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                      :class="diasRestantesCls(c)"
                    >{{ diasRestantesText(c) }}</span>
                    <span v-if="!c.ativo" class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      Inativo
                    </span>
                  </div>
                </div>
              </div>
            </td>

            <!-- Status (md+) -->
            <td class="hidden md:table-cell px-5 py-4">
              <span
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                :class="statusConfig[c.subscription_status]?.cls ?? statusConfig.canceled.cls"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full"
                  :class="statusConfig[c.subscription_status]?.dot ?? 'bg-slate-400'"
                  aria-hidden="true"
                />
                {{ statusConfig[c.subscription_status]?.label ?? c.subscription_status }}
              </span>
            </td>

            <!-- Plano -->
            <td class="px-2 sm:px-5 py-3 sm:py-4">
              <span class="text-slate-700 dark:text-slate-300 font-medium text-xs sm:text-sm whitespace-nowrap">{{ getPlanLabel(c.subscription_plan) }}</span>
            </td>

            <!-- Vencimento -->
            <td class="px-2 sm:px-5 py-3 sm:py-4">
              <span class="text-slate-700 dark:text-slate-300 tabular-nums text-xs sm:text-sm whitespace-nowrap">
                {{ formatDate(getDataVencimento(c)) || '—' }}
              </span>
            </td>

            <!-- Dias Restantes (sm+) -->
            <td class="hidden sm:table-cell px-5 py-4">
              <span
                class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                :class="diasRestantesCls(c)"
              >
                {{ diasRestantesText(c) }}
              </span>
            </td>

            <!-- Ativo (lg+) -->
            <td class="hidden lg:table-cell px-5 py-4 text-center">
              <span v-if="c.ativo" class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                <i class="fa-solid fa-check text-emerald-600 dark:text-emerald-400 text-xs" aria-hidden="true" />
              </span>
              <span v-else class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800">
                <i class="fa-solid fa-xmark text-slate-400 text-xs" aria-hidden="true" />
              </span>
            </td>

            <!-- Ações: menu de três pontinhos (todas as telas) -->
            <td class="px-2 sm:px-5 py-3 sm:py-4">
              <div class="flex justify-end">
                <button
                  @click.stop="openMenu(c)"
                  class="w-8 h-8 flex items-center justify-center rounded text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
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
                <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                  :class="menuCliente.ativo ? 'bg-purple-600' : 'bg-slate-400 dark:bg-slate-600'">
                  {{ menuCliente.nome.charAt(0).toUpperCase() }}
                </div>
                <div class="min-w-0 flex-1">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-semibold text-slate-900 dark:text-white text-sm truncate">{{ menuCliente.nome }}</p>
                    <span
                      v-if="situacaoBadge(menuCliente)"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold whitespace-nowrap"
                      :class="situacaoBadge(menuCliente)!.cls"
                      :title="situacaoBadge(menuCliente)!.title"
                    >
                      <i class="fa-solid" :class="situacaoBadge(menuCliente)!.icon" aria-hidden="true" />
                      {{ situacaoBadge(menuCliente)!.text }}
                    </span>
                    <span
                      v-if="menuCliente.parceiro_nome"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-700 dark:bg-teal-500/15 dark:text-teal-400"
                    >
                      <i class="fa-solid fa-handshake" aria-hidden="true" />
                      <span class="truncate max-w-[110px]">{{ menuCliente.parceiro_nome }}</span>
                    </span>
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
                <p class="px-1 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Conta e plano</p>
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
                <p class="px-1 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Parceria</p>
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
                  <button type="button" @click="emitAction('tornar-parceiro', menuCliente.id)" class="group flex items-start gap-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 text-left transition-colors hover:border-purple-300 dark:hover:border-purple-500/40 hover:bg-purple-50/40 dark:hover:bg-purple-500/5">
                    <span class="shrink-0 w-9 h-9 rounded-lg flex items-center justify-center bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400"><i class="fa-solid fa-user-tie" aria-hidden="true" /></span>
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-slate-800 dark:text-slate-200">Tornar empresa parceira</span>
                      <span class="block text-xs text-slate-500 dark:text-slate-400 truncate">Passa a revender a Agzap</span>
                    </span>
                  </button>
                </div>
              </section>

              <!-- Situação da conta -->
              <section v-if="menuCliente.role !== 'superAdmin'">
                <p class="px-1 mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Situação da conta</p>
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
