<script setup lang="ts">
import { ref, watch } from 'vue'

// Saldo do programa de indicação da empresa (como indicadora). "Disponível"
// é o que passou da carência e NÃO está no Stripe (cliente de Pix): dá pra
// abater na renovação (também pelo "Renovar assinatura") ou usar em serviço.
const props = defineProps<{ show: boolean; clienteId: string | null; clienteNome: string }>()
const emit = defineEmits<{ close: []; usado: [valor: number] }>()

interface Saldo {
  disponivel: number; pendente: number; naFatura: number; utilizado: number
  itens: { id: string; status: string; valor: number; tipo: string; indicada: string | null; liberarEm: string | null; liberadoEm: string | null; utilizadoEm: string | null; utilizadoDescricao: string | null }[]
}
const saldo = ref<Saldo | null>(null)
const carregando = ref(false)
const erro = ref('')
const valor = ref<number | null>(null)
const descricao = ref('')
const salvando = ref(false)

function brl(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function data(iso: string | null) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : '' }
const ROTULO: Record<string, string> = { pendente_liberacao: 'Em carência', liberado: 'Disponível', creditado: 'Na fatura (Stripe)', utilizado: 'Utilizado' }

async function carregar() {
  if (!props.clienteId) return
  carregando.value = true
  erro.value = ''
  try {
    saldo.value = await $fetch<Saldo>('/api/admin/indicacao-saldo', { query: { empresaId: props.clienteId }, headers: await useAdminAuthHeaders() })
    valor.value = saldo.value.disponivel || null
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.statusMessage || 'Não foi possível carregar o saldo'
  } finally {
    carregando.value = false
  }
}
watch(() => [props.show, props.clienteId], ([s]) => { if (s) { descricao.value = ''; void carregar() } }, { immediate: true })

async function usar() {
  if (!props.clienteId || !valor.value || !descricao.value.trim() || salvando.value) return
  salvando.value = true
  erro.value = ''
  try {
    await $fetch('/api/admin/indicacao-usar-saldo', {
      method: 'POST', headers: await useAdminAuthHeaders(),
      body: { empresaId: props.clienteId, valor: valor.value, descricao: descricao.value.trim() },
    })
    emit('usado', valor.value)
    descricao.value = ''
    await carregar()
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.statusMessage || 'Não foi possível registrar o uso'
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <BaseModal :show="show" title="Saldo de indicação" max-width="max-w-lg" @close="$emit('close')">
    <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
      Descontos que <span class="font-semibold text-slate-900 dark:text-white">{{ clienteNome }}</span> ganhou indicando outras empresas.
    </p>
    <div v-if="carregando && !saldo" class="py-8 text-center text-sm text-slate-500">Carregando…</div>
    <template v-else-if="saldo">
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <div class="rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-3">
          <p class="text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Disponível</p>
          <p class="text-lg font-bold text-emerald-700 dark:text-emerald-400">{{ brl(saldo.disponivel) }}</p>
        </div>
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Em carência</p>
          <p class="text-lg font-bold text-amber-600">{{ brl(saldo.pendente) }}</p>
        </div>
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3" title="Já está no saldo do Stripe: desconta sozinho na próxima fatura do cartão">
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Na fatura</p>
          <p class="text-lg font-bold text-slate-800 dark:text-slate-200">{{ brl(saldo.naFatura) }}</p>
        </div>
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Utilizado</p>
          <p class="text-lg font-bold text-sky-600">{{ brl(saldo.utilizado) }}</p>
        </div>
      </div>

      <form v-if="saldo.disponivel > 0" class="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2 mb-4" @submit.prevent="usar">
        <p class="text-sm font-semibold text-slate-800 dark:text-slate-200">Usar o saldo disponível</p>
        <div class="flex gap-2">
          <input v-model.number="valor" type="number" min="0.01" step="0.01" :max="saldo.disponivel" class="w-32 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm" aria-label="Valor" />
          <input v-model="descricao" type="text" maxlength="200" placeholder="Em quê? Ex.: Desconto no Pix de outubro / Serviço de configuração" class="flex-1 min-w-0 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-transparent text-sm" />
        </div>
        <button type="submit" class="w-full px-4 py-2.5 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 text-white disabled:opacity-50" :disabled="salvando || !valor || !descricao.trim()">
          {{ salvando ? 'Registrando…' : `Registrar uso de ${brl(valor || 0)}` }}
        </button>
      </form>
      <p v-else class="text-xs text-slate-500 mb-4">Nada disponível pra usar agora.</p>

      <p v-if="erro" class="text-sm text-red-600 mb-3">{{ erro }}</p>

      <div v-if="saldo.itens.length" class="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800">
        <div v-for="i in saldo.itens" :key="i.id" class="flex items-center justify-between gap-3 px-3 py-2 text-xs">
          <div class="min-w-0">
            <p class="font-semibold text-slate-800 dark:text-slate-200 truncate">{{ i.indicada || 'Indicada' }} · {{ i.tipo === 'primeira' ? '1ª mensalidade' : 'recorrente' }}</p>
            <p class="text-slate-500 truncate">
              {{ ROTULO[i.status] || i.status }}
              <template v-if="i.status === 'pendente_liberacao' && i.liberarEm"> · libera em {{ data(i.liberarEm) }}</template>
              <template v-else-if="i.status === 'utilizado'"> · {{ data(i.utilizadoEm) }} · {{ i.utilizadoDescricao }}</template>
            </p>
          </div>
          <span class="font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{{ brl(i.valor) }}</span>
        </div>
      </div>
      <p v-else class="text-xs text-slate-500">Essa empresa ainda não ganhou desconto por indicação.</p>
    </template>
    <p v-else-if="erro" class="text-sm text-red-600">{{ erro }}</p>
  </BaseModal>
</template>
