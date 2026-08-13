<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ClienteCarteira, SaldosCredito, TipoCredito } from '~/composables/useParceiroLicencas'

const props = defineProps<{
  show: boolean
  cliente: ClienteCarteira | null
  saldos: SaldosCredito
}>()

const emit = defineEmits<{ close: []; confirmed: [] }>()

const { renovar, novaIdempotencyKey } = useParceiroLicencas()
let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null
onMounted(async () => { toast = await useToastSafe() })

const tipo = ref<TipoCredito>('mensal_30d')
const salvando = ref(false)
const erro = ref<string | null>(null)
/**
 * Uma chave por tentativa: reenviar depois de uma falha de rede reaproveita a
 * mesma chave e o banco recusa o segundo consumo. Fechar e reabrir gera outra.
 */
const idempotencyKey = ref('')

watch(() => props.show, (aberto) => {
  if (!aberto) return
  erro.value = null
  salvando.value = false
  idempotencyKey.value = novaIdempotencyKey()
  // Abre já no tipo que ele tem saldo, quando só um dos dois tem.
  if (props.saldos.mensal_30d < 1 && props.saldos.anual_12m > 0) tipo.value = 'anual_12m'
  else tipo.value = 'mensal_30d'
})

const saldoAtual = computed(() => props.saldos[tipo.value] ?? 0)
const saldoDepois = computed(() => Math.max(0, saldoAtual.value - 1))
const temSaldo = computed(() => saldoAtual.value >= 1)

/** Só previsão visual — a data que vale é a que o servidor devolve. */
const novaValidadeEstimada = computed(() => {
  const agora = new Date()
  const atual = props.cliente?.vencimento ? new Date(props.cliente.vencimento) : agora
  const base = atual > agora ? new Date(atual) : agora
  if (tipo.value === 'mensal_30d') base.setDate(base.getDate() + 30)
  else base.setMonth(base.getMonth() + 12)
  return base
})

function fmtData(d: Date | string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function confirmar() {
  if (!props.cliente || salvando.value || !temSaldo.value) return
  salvando.value = true
  erro.value = null
  try {
    const r = await renovar(props.cliente.empresa_id, tipo.value, idempotencyKey.value)
    toast?.success(`Renovado até ${fmtData(r.vencimento_novo)}`)
    emit('confirmed')
    emit('close')
  } catch (e: any) {
    erro.value = String(e?.message || 'Não foi possível renovar')
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <BaseModal :show="show" title="Renovar cliente" max-width="max-w-md" @close="emit('close')">
    <div v-if="cliente" class="space-y-4">

      <!-- Cliente -->
      <div class="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
          <span class="text-white font-bold text-sm">{{ cliente.empresa_nome.charAt(0).toUpperCase() }}</span>
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-slate-900 dark:text-white truncate">{{ cliente.empresa_nome }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Vence hoje em {{ fmtData(cliente.vencimento) }}
          </p>
        </div>
      </div>

      <!-- Tipo de crédito -->
      <div>
        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
          Crédito a consumir
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="opcao in ([
              { valor: 'mensal_30d', titulo: '30 dias', icone: 'fa-calendar-day' },
              { valor: 'anual_12m', titulo: '12 meses', icone: 'fa-calendar-days' },
            ] as const)"
            :key="opcao.valor"
            type="button"
            @click="tipo = opcao.valor"
            class="px-3 py-2.5 rounded-md border text-left transition-colors"
            :class="tipo === opcao.valor
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
              : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'"
          >
            <span class="flex items-center gap-2">
              <i :class="['fa-solid', opcao.icone, 'text-xs', tipo === opcao.valor ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400']" aria-hidden="true" />
              <span class="text-sm font-semibold text-slate-800 dark:text-white">{{ opcao.titulo }}</span>
            </span>
            <span class="block text-[11px] mt-0.5" :class="saldos[opcao.valor] > 0 ? 'text-slate-500 dark:text-slate-400' : 'text-red-500 dark:text-red-400'">
              {{ saldos[opcao.valor] }} disponíve{{ saldos[opcao.valor] === 1 ? 'l' : 'is' }}
            </span>
          </button>
        </div>
      </div>

      <!-- Resumo da operação -->
      <div class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5">
        <div class="flex items-center justify-between px-4 py-2.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">Saldo atual</span>
          <span class="text-sm font-semibold text-slate-800 dark:text-white tabular-nums">{{ saldoAtual }}</span>
        </div>
        <div class="flex items-center justify-between px-4 py-2.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">Saldo após confirmar</span>
          <span
            class="text-sm font-semibold tabular-nums"
            :class="temSaldo ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'"
          >{{ temSaldo ? saldoDepois : '—' }}</span>
        </div>
        <div class="flex items-center justify-between px-4 py-2.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">Novo vencimento (estimado)</span>
          <span class="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {{ fmtData(novaValidadeEstimada) }}
          </span>
        </div>
      </div>

      <!-- Sem saldo -->
      <div
        v-if="!temSaldo"
        class="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 flex items-start gap-2.5"
      >
        <i class="fa-solid fa-circle-exclamation text-red-500 text-sm mt-0.5" aria-hidden="true" />
        <p class="text-xs text-red-700 dark:text-red-300 leading-relaxed">
          Você não tem crédito de <strong>{{ tipo === 'mensal_30d' ? '30 dias' : '12 meses' }}</strong> disponível.
          Solicite novos créditos à Agzap na página <strong>Créditos</strong>.
        </p>
      </div>

      <!-- Aviso obrigatório de irreversibilidade -->
      <div
        v-else
        class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 flex items-start gap-2.5"
      >
        <i class="fa-solid fa-triangle-exclamation text-amber-600 dark:text-amber-400 text-sm mt-0.5" aria-hidden="true" />
        <p class="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Após a confirmação, o crédito será consumido definitivamente e não retornará ao saldo
          em caso de cancelamento, bloqueio, estorno ou inadimplência do cliente final.
        </p>
      </div>

      <p v-if="erro" class="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
        <i class="fa-solid fa-circle-exclamation text-[10px]" aria-hidden="true" />
        {{ erro }}
      </p>

      <div class="flex gap-2 pt-1">
        <button
          type="button"
          @click="emit('close')"
          :disabled="salvando"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="confirmar"
          :disabled="salvando || !temSaldo"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
        >
          <i :class="['fa-solid', salvando ? 'fa-circle-notch fa-spin' : 'fa-circle-check', 'text-xs']" aria-hidden="true" />
          {{ salvando ? 'Renovando…' : 'Confirmar e consumir' }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
