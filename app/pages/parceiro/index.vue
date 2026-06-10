<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

const {
  parceiro, clientes, saldo, resumo, loading, loadingResumo, error,
  checkParceiro, loadDados, loadResumo,
} = useParceiro()
const { hideValues, init: initHideValues, toggle: toggleHideValues, mask: maskValue } = useHideValues()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null
const isRefreshing = ref(false)

async function refreshAll() {
  isRefreshing.value = true
  await Promise.all([loadDados(), loadResumo()])
  isRefreshing.value = false
}

onMounted(async () => {
  initHideValues()
  toast = await useToastSafe()
  await Promise.all([checkParceiro(), loadDados(), loadResumo()])
})

const primeiroNome = computed(() => parceiro.value?.nome?.split(' ')[0] || '')

const clientesAtivos = computed(() => clientes.value.filter(c => c.considerada_ativa))
const clientesInativos = computed(() => clientes.value.filter(c => !c.considerada_ativa))

// Próxima liberação pendente por cliente (menor liberar_em entre os lançamentos "a liberar")
const aLiberarPorEmpresa = computed(() => {
  const map = new Map<string, { data: string; valor: number }>()
  for (const l of resumo.value?.lancamentos ?? []) {
    if (l.status !== 'a_liberar' || !l.empresa_id) continue
    const atual = map.get(l.empresa_id)
    if (!atual || new Date(l.liberar_em) < new Date(atual.data)) {
      map.set(l.empresa_id, { data: l.liberar_em, valor: l.valor_comissao })
    }
  }
  return map
})

const mesAtual = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

function formatBRL(value: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0)
}

function displayBRL(value: number) {
  return maskValue(formatBRL(value))
}

function formatDateStr(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatPercent(value: number) {
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value || 0)}%`
}

function fmtPhone(phone: string | null) {
  return formatPhone(phone) ?? '—'
}

function getStatusBadge(status: string | null) {
  const map: Record<string, { label: string; cls: string }> = {
    active: { label: 'Ativa', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' },
    trial: { label: 'Trial', cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' },
    canceled: { label: 'Cancelada', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20' },
    expired: { label: 'Vencida', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20' },
  }
  return map[status || ''] || { label: status || '—', cls: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/20' }
}

// ───────── Solicitar pagamento ─────────
const WHATSAPP_REPASSE = '5511914600243'
const showPixPendenteModal = ref(false)
const showSaqueModal = ref(false)
const showSemSaldoModal = ref(false)

const temSaldoLiberado = computed(() => (resumo.value?.saldos.liberado ?? 0) > 0)

/** Domingo de Páscoa (algoritmo de Meeus) — base dos feriados móveis. */
function pascoa(ano: number): Date {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4
  const l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const mes = Math.floor((h + l - 7 * m + 114) / 31)
  const dia = ((h + l - 7 * m + 114) % 31) + 1
  return new Date(ano, mes - 1, dia)
}

function chaveData(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function feriadosNacionais(ano: number): Set<string> {
  const fixos = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '11-20', '12-25']
  const datas = new Set(fixos.map(f => `${ano}-${f}`))
  const domingoPascoa = pascoa(ano)
  // Carnaval (seg/ter), Sexta-feira Santa e Corpus Christi
  for (const offset of [-48, -47, -2, 60]) {
    const d = new Date(domingoPascoa)
    d.setDate(d.getDate() + offset)
    datas.add(chaveData(d))
  }
  return datas
}

function isDiaUtil(d: Date) {
  const diaSemana = d.getDay()
  if (diaSemana === 0 || diaSemana === 6) return false
  return !feriadosNacionais(d.getFullYear()).has(chaveData(d))
}

/** Previsão: 24h de processamento, empurrando para o próximo dia útil. */
const previsaoPagamento = computed(() => {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000)
  while (!isDiaUtil(d)) d.setDate(d.getDate() + 1)
  return d
})

const previsaoTexto = computed(() =>
  previsaoPagamento.value.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' }),
)

const caiForaDiaUtil = computed(() => {
  const amanha = new Date(Date.now() + 24 * 60 * 60 * 1000)
  return !isDiaUtil(amanha)
})

function solicitarPagamento() {
  if (!temSaldoLiberado.value) {
    showSemSaldoModal.value = true
    return
  }
  if (!resumo.value?.config?.chave) {
    showPixPendenteModal.value = true
    return
  }
  showSaqueModal.value = true
}

function irParaConfiguracoes() {
  showPixPendenteModal.value = false
  navigateTo('/parceiro/configuracoes')
}

function confirmarSaqueWhatsApp() {
  const pix = resumo.value?.config
  if (!pix) return
  const saldoLiberado = resumo.value?.saldos.liberado ?? 0
  const linhas = [
    `Olá! Sou o parceiro *${parceiro.value?.nome || resumo.value?.parceiro.nome || ''}* e quero solicitar o repasse das minhas comissões.`,
    '',
    `Saldo liberado: *${formatBRL(saldoLiberado)}*`,
    `Chave PIX (${pix.tipo}): ${pix.chave}`,
    `Titular: ${pix.titular_nome}${pix.titular_documento ? ` (${pix.titular_documento})` : ''}`,
    '',
    `Previsão de processamento: ${previsaoTexto.value}`,
  ]
  const url = `https://wa.me/${WHATSAPP_REPASSE}?text=${encodeURIComponent(linhas.join('\n'))}`
  window.open(url, '_blank', 'noopener,noreferrer')
  showSaqueModal.value = false
}

// reusable classes (mesmo padrão do dashboard)
const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 max-w-[1400px] mx-auto w-full">

    <!-- Page Header -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
          {{ primeiroNome ? `Olá, ${primeiroNome}` : 'Meus Clientes' }}
        </h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5 capitalize">{{ mesAtual }} · seus clientes e comissões</p>
      </div>
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <!-- Solicitar pagamento (apagado quando sem saldo; mensagens aparecem nos modais) -->
        <button
          @click="solicitarPagamento"
          :disabled="loadingResumo"
          class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-semibold transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
          :class="temSaldoLiberado
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 dark:shadow-emerald-600/20'
            : 'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-slate-500 opacity-70 hover:opacity-90'"
          type="button"
        >
          <i class="fa-solid fa-money-bill-transfer text-sm" aria-hidden="true" />
          <span>Solicitar pagamento</span>
        </button>
        <button
          @click="refreshAll"
          :disabled="isRefreshing || loading || loadingResumo"
          class="flex-1 sm:flex-initial inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-semibold transition-all duration-150 shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20"
          type="button"
        >
          <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': isRefreshing }" aria-hidden="true" />
          <span>Atualizar</span>
        </button>
      </div>
    </div>

    <!-- Erro ao carregar -->
    <div v-if="error" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>

    <!-- ────────────────────────────── SALDOS ────────────────────────────── -->
    <section>
      <div class="flex items-center gap-2 mb-4">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-emerald-500/20">
          <i class="fa-solid fa-sack-dollar text-emerald-600 dark:text-emerald-400 text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Minhas Comissões</h2>
        <!-- Olhinho: ocultar/mostrar valores -->
        <button
          @click="toggleHideValues"
          class="w-6 h-6 inline-flex items-center justify-center rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors"
          :title="hideValues ? 'Mostrar valores' : 'Ocultar valores'"
          :aria-label="hideValues ? 'Mostrar valores' : 'Ocultar valores'"
          type="button"
        >
          <i class="fa-solid text-xs" :class="hideValues ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" />
        </button>
        <NuxtLink to="/parceiro/extratos" class="ml-auto text-xs text-slate-500 hover:text-purple-700 dark:hover:text-purple-400 transition-colors font-medium">
          Ver extrato completo →
        </NuxtLink>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Comissão mensal"
          :unit="`${saldo?.empresas_ativas ?? 0} de ${saldo?.empresas_total ?? 0} clientes ativos`"
          icon="fa-solid fa-repeat"
          color="purple"
          :loading="loading"
          loading-width="w-24"
        >
          {{ displayBRL(saldo?.saldo_comissao ?? 0) }}
        </KpiCard>

        <KpiCard
          label="A liberar"
          unit="aguardando 30 dias"
          icon="fa-solid fa-hourglass-half"
          color="amber"
          :loading="loadingResumo"
          loading-width="w-24"
        >
          {{ displayBRL(resumo?.saldos.aLiberar ?? 0) }}
        </KpiCard>

        <KpiCard
          label="Saldo liberado"
          unit="disponível para saque"
          icon="fa-solid fa-circle-check"
          color="emerald"
          :loading="loadingResumo"
          loading-width="w-24"
        >
          {{ displayBRL(resumo?.saldos.liberado ?? 0) }}
        </KpiCard>

        <KpiCard
          label="Já recebido"
          unit="repasses anteriores"
          icon="fa-solid fa-hand-holding-dollar"
          color="indigo"
          :loading="loadingResumo"
          loading-width="w-24"
        >
          {{ displayBRL(resumo?.saldos.repassado ?? 0) }}
        </KpiCard>
      </div>

    </section>

    <!-- ────────────────────────────── LISTA DE CLIENTES ────────────────────────────── -->
    <section>
      <div class="flex items-center gap-2 mb-4">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-blue-500/20">
          <i class="fa-solid fa-users text-blue-600 dark:text-blue-400 text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Meus Clientes</h2>
        <span
          v-if="clientes.length > 0"
          class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-200 dark:border-blue-500/20"
        >{{ clientes.length }}</span>
      </div>

      <div :class="['overflow-hidden', cardBase]">
        <!-- Skeleton -->
        <div v-if="loading" class="p-5 space-y-3">
          <div v-for="i in 5" :key="i" class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
            <div class="flex-1 space-y-1.5">
              <div class="h-3 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-2/3" />
              <div class="h-2.5 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-1/3" />
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <div v-else-if="clientes.length === 0" class="px-5 py-12 text-center">
          <i class="fa-solid fa-user-group text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
          <p class="text-slate-500 text-sm">Nenhum cliente atribuído a você ainda</p>
          <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">Quando a Agzap atribuir clientes à sua conta, eles aparecem aqui.</p>
        </div>

        <!-- Tabela -->
        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
                <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Cliente</th>
                <th class="hidden lg:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Cadastro</th>
                <th class="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Vencimento</th>
                <th class="hidden sm:table-cell text-center px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Status</th>
                <th class="hidden sm:table-cell text-right px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Assinatura</th>
                <th class="hidden md:table-cell text-center px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">%</th>
                <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Comissão</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-white/5">
              <tr
                v-for="c in clientes"
                :key="c.vinculo_id"
                class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
                :class="{ 'opacity-60': !c.considerada_ativa }"
              >
                <!-- Cliente -->
                <td class="px-3 sm:px-5 py-3">
                  <div class="flex items-center gap-3 min-w-0">
                    <div class="w-8 h-8 rounded bg-purple-100 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/20 flex items-center justify-center shrink-0">
                      <span class="text-purple-700 dark:text-purple-400 text-xs font-bold">{{ c.empresa_nome.charAt(0).toUpperCase() }}</span>
                    </div>
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ c.empresa_nome }}</p>
                      <div class="flex items-center gap-1.5 mt-0.5">
                        <span class="text-xs text-slate-500 font-mono">{{ fmtPhone(c.empresa_telefone) }}</span>
                        <a
                          v-if="whatsappLink(c.empresa_telefone)"
                          :href="whatsappLink(c.empresa_telefone)!"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white transition-colors"
                          :title="`Abrir WhatsApp de ${c.empresa_nome}`"
                          aria-label="Abrir WhatsApp"
                        >
                          <i class="fa-brands fa-whatsapp text-[10px]" aria-hidden="true" />
                        </a>
                      </div>
                      <!-- Mobile: status + vencimento + a liberar compactos -->
                      <div class="sm:hidden mt-1 flex items-center gap-1.5 flex-wrap">
                        <span
                          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border"
                          :class="getStatusBadge(c.status_assinatura).cls"
                        >
                          <span class="w-1 h-1 rounded-full bg-current" aria-hidden="true" />
                          {{ getStatusBadge(c.status_assinatura).label }}
                        </span>
                        <span v-if="c.proximo_vencimento" class="text-[10px] text-slate-400 dark:text-slate-600">
                          Vence {{ formatDateStr(c.proximo_vencimento) }}
                        </span>
                        <span
                          v-if="aLiberarPorEmpresa.has(c.empresa_id)"
                          class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20"
                        >
                          <i class="fa-solid fa-hourglass-half text-[8px]" aria-hidden="true" />
                          A liberar {{ formatDateStr(aLiberarPorEmpresa.get(c.empresa_id)!.data) }}
                        </span>
                      </div>
                    </div>
                  </div>
                </td>

                <!-- Cadastro -->
                <td class="hidden lg:table-cell px-5 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                  {{ formatDateStr(c.empresa_cadastro) }}
                </td>

                <!-- Vencimento -->
                <td class="hidden md:table-cell px-5 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap">
                  {{ formatDateStr(c.proximo_vencimento) }}
                </td>

                <!-- Status (sm+) -->
                <td class="hidden sm:table-cell px-5 py-3 text-center">
                  <span
                    class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap"
                    :class="getStatusBadge(c.status_assinatura).cls"
                  >
                    <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                    {{ getStatusBadge(c.status_assinatura).label }}
                  </span>
                </td>

                <!-- Valor assinatura -->
                <td class="hidden sm:table-cell px-5 py-3 text-right">
                  <span class="text-slate-700 dark:text-slate-300 tabular-nums text-xs sm:text-sm whitespace-nowrap">{{ displayBRL(c.valor_assinatura) }}</span>
                </td>

                <!-- % comissão -->
                <td class="hidden md:table-cell px-5 py-3 text-center">
                  <span class="text-slate-600 dark:text-slate-400 tabular-nums text-xs">{{ formatPercent(c.comissao_percentual) }}</span>
                </td>

                <!-- Valor comissão -->
                <td class="px-3 sm:px-5 py-3 text-right">
                  <span
                    class="font-semibold tabular-nums text-xs sm:text-sm whitespace-nowrap"
                    :class="c.considerada_ativa ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-600 line-through'"
                    :title="c.considerada_ativa ? 'Entra no saldo' : 'Não entra no saldo (assinatura não ativa)'"
                  >{{ displayBRL(c.valor_comissao) }}</span>
                  <div v-if="aLiberarPorEmpresa.has(c.empresa_id)" class="mt-1 flex justify-end">
                    <span
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-500/20 whitespace-nowrap"
                      :title="`${displayBRL(aLiberarPorEmpresa.get(c.empresa_id)!.valor)} entram no saldo liberado em ${formatDateStr(aLiberarPorEmpresa.get(c.empresa_id)!.data)}`"
                    >
                      <i class="fa-solid fa-hourglass-half text-[8px]" aria-hidden="true" />
                      A liberar {{ formatDateStr(aLiberarPorEmpresa.get(c.empresa_id)!.data) }}
                    </span>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Nota de rodapé -->
      <p v-if="!loading && clientesInativos.length > 0" class="mt-3 text-xs text-slate-400 dark:text-slate-600 flex items-center gap-1.5">
        <i class="fa-solid fa-circle-info text-[10px]" aria-hidden="true" />
        <span>{{ clientesInativos.length }} cliente{{ clientesInativos.length > 1 ? 's' : '' }} sem assinatura ativa — a comissão só entra no saldo quando a assinatura está ativa ({{ clientesAtivos.length }} de {{ clientes.length }} contam hoje).</span>
      </p>
    </section>

    <!-- Modal: sem saldo liberado -->
    <BaseModal :show="showSemSaldoModal" title="Ainda sem saldo liberado" max-width="max-w-sm" @close="showSemSaldoModal = false">
      <div class="text-center py-2">
        <div class="w-14 h-14 rounded-full bg-slate-100 dark:bg-white/10 flex items-center justify-center mx-auto mb-4">
          <i class="fa-solid fa-hourglass-half text-slate-400 dark:text-slate-500 text-2xl" aria-hidden="true" />
        </div>
        <p class="text-sm font-semibold text-slate-900 dark:text-white">Você ainda não tem saldo liberado para solicitar</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
          <template v-if="(resumo?.saldos.aLiberar ?? 0) > 0">
            Você tem <strong class="text-amber-600 dark:text-amber-400">{{ formatBRL(resumo?.saldos.aLiberar ?? 0) }}</strong> a liberar — cada pagamento fica retido por 30 dias antes de ficar disponível para saque.
          </template>
          <template v-else>
            Quando seus clientes pagarem, as comissões entram como "a liberar" e ficam disponíveis para saque após 30 dias.
          </template>
        </p>
      </div>
      <div class="pt-4">
        <button
          type="button"
          @click="showSemSaldoModal = false"
          class="w-full px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors"
        >
          Entendi
        </button>
      </div>
    </BaseModal>

    <!-- Modal: PIX não configurado -->
    <BaseModal :show="showPixPendenteModal" title="Configure seu PIX primeiro" max-width="max-w-sm" @close="showPixPendenteModal = false">
      <div class="text-center py-2">
        <div class="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-500/15 flex items-center justify-center mx-auto mb-4">
          <i class="fa-brands fa-pix text-amber-600 dark:text-amber-400 text-2xl" aria-hidden="true" />
        </div>
        <p class="text-sm font-semibold text-slate-900 dark:text-white">Antes de solicitar o pagamento, cadastre seus dados de recebimento</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">
          Informe sua chave PIX e o nome do titular na aba Configurações. Lembre-se: a chave precisa estar no <strong>seu nome</strong>.
        </p>
      </div>
      <div class="flex gap-2 pt-4">
        <button
          type="button"
          @click="showPixPendenteModal = false"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Agora não
        </button>
        <button
          type="button"
          @click="irParaConfiguracoes"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors flex items-center justify-center gap-2"
        >
          <i class="fa-solid fa-gear text-xs" aria-hidden="true" />
          Configurar agora
        </button>
      </div>
    </BaseModal>

    <!-- Modal: confirmar solicitação de saque -->
    <BaseModal :show="showSaqueModal" title="Solicitar pagamento" max-width="max-w-md" @close="showSaqueModal = false">
      <div class="space-y-4">
        <!-- Valor -->
        <div class="rounded-md bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 px-4 py-3 text-center">
          <p class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Valor do saque</p>
          <p class="text-2xl font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{{ formatBRL(resumo?.saldos.liberado ?? 0) }}</p>
        </div>

        <!-- Destino -->
        <div class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 px-4 py-3">
          <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">Receber via PIX</p>
          <p class="text-sm text-slate-800 dark:text-slate-200">
            <i class="fa-brands fa-pix text-emerald-500 text-xs" aria-hidden="true" />
            {{ resumo?.config?.chave }}
          </p>
          <p class="text-xs text-slate-500 mt-0.5">Titular: {{ resumo?.config?.titular_nome }}</p>
        </div>

        <!-- Aviso de prazo -->
        <div class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 flex items-start gap-2.5">
          <i class="fa-solid fa-clock text-amber-600 dark:text-amber-400 text-sm mt-0.5" aria-hidden="true" />
          <div class="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
            <p>O processamento leva <strong>até 24 horas</strong> e acontece apenas em <strong>dias úteis</strong> — fins de semana e feriados não contam.</p>
            <p v-if="caiForaDiaUtil" class="mt-1">Como o prazo cai em fim de semana ou feriado, o pagamento será processado no próximo dia útil.</p>
            <p class="mt-1 font-semibold capitalize">Previsão: {{ previsaoTexto }}</p>
          </div>
        </div>

        <div class="flex gap-2 pt-1">
          <button
            type="button"
            @click="showSaqueModal = false"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            @click="confirmarSaqueWhatsApp"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center justify-center gap-2"
          >
            <i class="fa-brands fa-whatsapp" aria-hidden="true" />
            Solicitar via WhatsApp
          </button>
        </div>
      </div>
    </BaseModal>

  </div>
</template>
