<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

/**
 * Vendas de pedidos extras: quem comprou, de onde veio a venda e quanto foi
 * cobrado. Só a Agzap vende, pelo modal Módulos do app.
 */
interface VendaExtra {
  id: string
  empresa_id: string | null
  empresa_nome: string
  parceiro_id: string | null
  parceiro_nome: string | null
  quantidade: number
  valor: number
  saldo_atual: number | null
  lancado_por_nome: string | null
  criado_em: string
}

type Filtro = 'todas' | 'parceiros' | 'diretos'

const FUSO = 'America/Sao_Paulo'
const hoje = new Date().toLocaleDateString('sv-SE', { timeZone: FUSO })

const mes = ref(hoje.slice(0, 7))
const vendas = ref<VendaExtra[]>([])
const filtro = ref<Filtro>('todas')
const loading = ref(true)
const erro = ref<string | null>(null)

async function carregar() {
  loading.value = true
  erro.value = null
  try {
    const resp = await $fetch<{ success: boolean; data?: { vendas: VendaExtra[] }; error?: string }>('/api/admin/pedidos-extras', {
      query: { mes: mes.value },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    vendas.value = resp.data.vendas
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Erro ao carregar as vendas de pedidos extras'
  } finally {
    loading.value = false
  }
}

onMounted(carregar)
watch(mes, (novo) => { if (novo) carregar() })

const contagem = computed(() => ({
  todas: vendas.value.length,
  parceiros: vendas.value.filter(v => v.parceiro_nome).length,
  diretos: vendas.value.filter(v => !v.parceiro_nome).length,
}))

const filtros: { id: Filtro; rotulo: string }[] = [
  { id: 'todas', rotulo: 'Todas' },
  { id: 'parceiros', rotulo: 'Clientes de parceiros' },
  { id: 'diretos', rotulo: 'Clientes diretos da Agzap' },
]

const visiveis = computed(() => {
  if (filtro.value === 'parceiros') return vendas.value.filter(v => v.parceiro_nome)
  if (filtro.value === 'diretos') return vendas.value.filter(v => !v.parceiro_nome)
  return vendas.value
})

const rotuloMes = computed(() => {
  const [ano, numero] = mes.value.split('-').map(Number) as [number, number]
  return new Date(ano, numero - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
})

const fmtBRL = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
const fmtDataHora = (s: string) => new Date(s).toLocaleString('pt-BR', {
  day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: FUSO,
})

const th = 'px-3 py-2.5 text-left text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap'
const td = 'px-3 py-2.5 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap'
</script>

<template>
  <section class="mt-6 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none">
    <div class="px-4 sm:px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
      <div class="min-w-0">
        <h2 class="text-base font-semibold text-slate-900 dark:text-white">Vendas de pedidos extras</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">Quem comprou, de onde veio a venda e quanto foi cobrado · {{ rotuloMes }}</p>
      </div>
      <label class="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
        Mês
        <input
          v-model="mes"
          type="month"
          class="px-2.5 py-1.5 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-md text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40"
        />
      </label>
    </div>

    <div class="px-4 sm:px-5 py-3 flex flex-wrap gap-2">
      <button
        v-for="f in filtros"
        :key="f.id"
        type="button"
        @click="filtro = f.id"
        class="px-3 py-1.5 rounded-full border text-xs font-medium transition-colors"
        :class="filtro === f.id
          ? 'border-purple-400 bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
          : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'"
      >
        {{ f.rotulo }} · <span class="tabular-nums">{{ contagem[f.id] }}</span>
      </button>
    </div>

    <p v-if="erro" role="alert" class="mx-4 sm:mx-5 mb-4 px-3 py-2.5 rounded-md bg-red-50 dark:bg-red-500/10 text-sm text-red-700 dark:text-red-400">{{ erro }}</p>

    <div v-else-if="loading" class="px-4 sm:px-5 pb-4 space-y-2">
      <div v-for="i in 3" :key="i" class="h-8 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
    </div>

    <p v-else-if="!visiveis.length" class="px-5 pb-8 pt-4 text-center text-sm text-slate-500 dark:text-slate-400">Nenhuma venda neste mês</p>

    <div v-else class="overflow-x-auto border-t border-slate-200 dark:border-slate-800">
      <table class="w-full">
        <thead>
          <tr class="bg-slate-50/60 dark:bg-white/[0.02] border-b border-slate-200 dark:border-slate-800">
            <th :class="th">Data</th>
            <th :class="th">Cliente</th>
            <th :class="th">Origem</th>
            <th :class="[th, 'text-right']">Pedidos comprados</th>
            <th :class="[th, 'text-right']">Valor cobrado</th>
            <th :class="[th, 'text-right']">Saldo atual</th>
            <th :class="th">Lançado por</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr v-for="v in visiveis" :key="v.id">
            <td :class="[td, 'tabular-nums text-slate-500 dark:text-slate-400']">{{ fmtDataHora(v.criado_em) }}</td>
            <td :class="[td, 'font-medium text-slate-900 dark:text-white']">{{ v.empresa_nome }}</td>
            <td :class="td">{{ v.parceiro_nome ?? 'Cliente direto da Agzap' }}</td>
            <td :class="[td, 'text-right tabular-nums text-emerald-600 dark:text-emerald-400']">+{{ v.quantidade.toLocaleString('pt-BR') }}</td>
            <td :class="[td, 'text-right tabular-nums']">{{ fmtBRL(v.valor) }}</td>
            <td :class="[td, 'text-right tabular-nums']">{{ v.saldo_atual === null ? '—' : v.saldo_atual.toLocaleString('pt-BR') }}</td>
            <td :class="td">{{ v.lancado_por_nome ?? '—' }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
</template>
