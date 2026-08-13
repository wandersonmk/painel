<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { LABEL_CREDITO } from '~/composables/useParceiroLicencas'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

const { parceiro, checkParceiro } = useParceiro()
const { saldos, movimentacoes, precos, loadingCreditos, error, loadCreditos } = useParceiroLicencas()

const showSolicitar = ref(false)
const filtro = ref<'todas' | 'entradas' | 'consumos'>('todas')

onMounted(async () => {
  await Promise.all([checkParceiro(), loadCreditos()])
})

const OPERACOES: Record<string, { label: string; icone: string; cls: string }> = {
  compra: { label: 'Compra', icone: 'fa-cart-shopping', cls: 'text-emerald-600 dark:text-emerald-400' },
  concessao_admin: { label: 'Liberado pela Agzap', icone: 'fa-gift', cls: 'text-emerald-600 dark:text-emerald-400' },
  consumo: { label: 'Renovação de cliente', icone: 'fa-rotate', cls: 'text-purple-600 dark:text-purple-400' },
  correcao: { label: 'Correção', icone: 'fa-pen-to-square', cls: 'text-amber-600 dark:text-amber-400' },
  migracao: { label: 'Migração', icone: 'fa-right-left', cls: 'text-slate-500 dark:text-slate-400' },
}

const movimentacoesFiltradas = computed(() => {
  if (filtro.value === 'entradas') return movimentacoes.value.filter(m => m.quantidade > 0)
  if (filtro.value === 'consumos') return movimentacoes.value.filter(m => m.quantidade < 0)
  return movimentacoes.value
})

const precosMensais = computed(() => precos.value.filter(p => p.tipo_credito === 'mensal_30d'))
const precosAnuais = computed(() => precos.value.filter(p => p.tipo_credito === 'anual_12m'))

function fmtBRL(v: number | null) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))
}

function fmtDataHora(s: string) {
  return new Date(s).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

function fmtData(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 sm:space-y-8 max-w-[1400px] mx-auto w-full">

    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Créditos</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
          Saldo, compras e consumos da sua carteira de licenças
        </p>
      </div>
      <button
        @click="showSolicitar = true"
        type="button"
        class="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-600/30 dark:shadow-emerald-600/20 transition-all duration-150"
      >
        <i class="fa-solid fa-coins text-sm" aria-hidden="true" />
        <span>Solicitar novos créditos</span>
      </button>
    </div>

    <div v-if="error" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ error }}</span>
    </div>

    <!-- Saldos -->
    <div class="grid grid-cols-2 gap-3 sm:gap-4">
      <KpiCard label="Créditos de 30 dias" unit="disponíveis" icon="fa-solid fa-calendar-day" color="purple" :loading="loadingCreditos">
        {{ saldos.mensal_30d }}
      </KpiCard>
      <KpiCard label="Créditos de 12 meses" unit="disponíveis" icon="fa-solid fa-calendar-days" color="indigo" :loading="loadingCreditos">
        {{ saldos.anual_12m }}
      </KpiCard>
    </div>

    <!-- Tabela comercial -->
    <section v-if="precos.length > 0">
      <div class="flex items-center gap-2 mb-3">
        <div class="w-4 h-4 rounded flex items-center justify-center bg-emerald-500/20">
          <i class="fa-solid fa-tag text-emerald-600 dark:text-emerald-400 text-xs" aria-hidden="true" />
        </div>
        <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Quanto custa</h2>
      </div>

      <div :class="['p-4 sm:p-5', cardBase]">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div v-if="precosMensais.length">
            <p class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Licença de 30 dias</p>
            <ul class="space-y-1.5">
              <li v-for="p in precosMensais" :key="p.quantidade_min" class="flex items-baseline justify-between text-sm">
                <span class="text-slate-500 dark:text-slate-400 text-xs">
                  {{ p.quantidade_min === 1 ? 'até 5 licenças' : `${p.quantidade_min} ou mais` }}
                </span>
                <span class="font-semibold text-slate-800 dark:text-white tabular-nums">{{ fmtBRL(p.preco_unitario) }}</span>
              </li>
            </ul>
          </div>
          <div v-if="precosAnuais.length">
            <p class="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">Licença de 12 meses</p>
            <ul class="space-y-1.5">
              <li v-for="p in precosAnuais" :key="p.quantidade_min" class="flex items-baseline justify-between text-sm">
                <span class="text-slate-500 dark:text-slate-400 text-xs">por licença</span>
                <span class="font-semibold text-slate-800 dark:text-white tabular-nums">{{ fmtBRL(p.preco_unitario) }}</span>
              </li>
            </ul>
          </div>
        </div>
        <p class="mt-4 pt-3 border-t border-slate-100 dark:border-white/5 text-xs text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
          <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
          <span>
            Você define livremente quanto cobra do seu cliente final.
            <template v-if="precosMensais[0]?.preco_sugerido_revenda">
              A Agzap sugere {{ fmtBRL(precosMensais[0].preco_sugerido_revenda) }}/mês como referência.
            </template>
            O crédito só entra na carteira depois que a Agzap confirma o pagamento.
          </span>
        </p>
      </div>
    </section>

    <!-- Extrato -->
    <section>
      <div class="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <div class="flex items-center gap-2">
          <div class="w-4 h-4 rounded flex items-center justify-center bg-purple-500/20">
            <i class="fa-solid fa-receipt text-purple-600 dark:text-purple-400 text-xs" aria-hidden="true" />
          </div>
          <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Movimentações</h2>
        </div>
        <div class="flex gap-1.5 sm:ml-auto">
          <button
            v-for="f in ([
              { id: 'todas', label: 'Todas' },
              { id: 'entradas', label: 'Entradas' },
              { id: 'consumos', label: 'Consumos' },
            ] as const)"
            :key="f.id"
            type="button"
            @click="filtro = f.id"
            class="px-3 py-1.5 rounded-full border text-xs font-semibold transition-colors"
            :class="filtro === f.id
              ? 'border-purple-400 bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400'
              : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300'"
          >{{ f.label }}</button>
        </div>
      </div>

      <div :class="['overflow-hidden', cardBase]">
        <div v-if="loadingCreditos" class="p-5 space-y-3">
          <div v-for="i in 4" :key="i" class="h-10 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
        </div>

        <div v-else-if="movimentacoesFiltradas.length === 0" class="px-5 py-12 text-center">
          <i class="fa-solid fa-receipt text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
          <p class="text-slate-500 text-sm">Nenhuma movimentação por aqui ainda</p>
          <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">
            Assim que a Agzap liberar seus primeiros créditos, eles aparecem nesta lista.
          </p>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
                <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Movimentação</th>
                <th class="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
                <th class="hidden lg:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Nova validade</th>
                <th class="hidden sm:table-cell text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Tipo</th>
                <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Qtd.</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-white/5">
              <tr v-for="m in movimentacoesFiltradas" :key="m.id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors">
                <td class="px-3 sm:px-5 py-3">
                  <div class="flex items-center gap-2.5 min-w-0">
                    <i
                      :class="['fa-solid', OPERACOES[m.operacao]?.icone ?? 'fa-circle', 'text-xs shrink-0', OPERACOES[m.operacao]?.cls]"
                      aria-hidden="true"
                    />
                    <div class="min-w-0">
                      <p class="text-sm font-medium text-slate-800 dark:text-white truncate">
                        {{ OPERACOES[m.operacao]?.label ?? m.operacao }}
                      </p>
                      <p class="text-[11px] text-slate-400 tabular-nums">{{ fmtDataHora(m.created_at) }}</p>
                      <p v-if="m.empresa_nome" class="md:hidden text-[11px] text-slate-500 truncate">{{ m.empresa_nome }}</p>
                      <!-- Motivo do lançamento: correção/estorno sem justificativa
                           visível vira número inexplicado no extrato do parceiro. -->
                      <p v-if="m.descricao" class="text-[11px] text-slate-500 dark:text-slate-400 leading-snug mt-0.5 whitespace-normal">
                        <i class="fa-solid fa-quote-left text-[8px] text-slate-300 dark:text-slate-600 mr-1" aria-hidden="true" />{{ m.descricao }}
                      </p>
                    </div>
                  </div>
                </td>
                <td class="hidden md:table-cell px-5 py-3 text-xs text-slate-600 dark:text-slate-400 truncate max-w-[200px]">
                  {{ m.empresa_nome ?? '—' }}
                </td>
                <td class="hidden lg:table-cell px-5 py-3 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                  {{ fmtData(m.nova_validade) }}
                </td>
                <td class="hidden sm:table-cell px-5 py-3 text-center">
                  <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    {{ LABEL_CREDITO[m.tipo_credito] }}
                  </span>
                </td>
                <td class="px-3 sm:px-5 py-3 text-right">
                  <span
                    class="font-bold tabular-nums text-sm"
                    :class="m.quantidade > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'"
                  >{{ m.quantidade > 0 ? '+' : '' }}{{ m.quantidade }}</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <p class="mt-3 text-xs text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
        <i class="fa-solid fa-lock text-[10px] mt-0.5" aria-hidden="true" />
        <span>
          O extrato é somente leitura. Crédito consumido em uma renovação não retorna ao saldo,
          mesmo se o cliente cancelar, for bloqueado ou ficar inadimplente.
        </span>
      </p>
    </section>

    <ParceiroSolicitarModal
      :show="showSolicitar"
      tipo="creditos"
      :parceiro-nome="parceiro?.nome"
      @close="showSolicitar = false"
    />
  </div>
</template>
