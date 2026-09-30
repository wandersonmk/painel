<script setup lang="ts">
import { ref, watch, computed } from 'vue'

const props = defineProps<{ show: boolean; clienteNome: string; clienteId?: string | null; precoMensal?: number | null; precoAnual?: number | null }>()
const emit = defineEmits<{
  close: []
  // abater = quanto do saldo de indicação foi usado nesta renovação (0 = nada)
  confirm: [plan: string, period: string, abater: number]
}>()

const periodPlanMap: Record<string, { plan: string; label: string }> = {
  trial1d: { plan: 'free', label: 'Gratuito (1 dia)' },
  trial2d: { plan: 'free', label: 'Gratuito (2 dias)' },
  trial3d: { plan: 'free', label: 'Gratuito (3 dias)' },
  trial5d: { plan: 'free', label: 'Gratuito (5 dias)' },
  trial: { plan: 'free', label: 'Gratuito (7 dias)' },
  '1month': { plan: 'basic', label: 'Básico (1 mês)' },
  '6months': { plan: 'pro', label: 'Pro (6 meses)' },
  '12months': { plan: 'enterprise', label: 'Enterprise (12 meses)' },
}

const selected = ref<string>('1month')

// Saldo de indicação disponível (cliente de Pix): dá pra abater aqui na
// renovação — o painel registra o uso e você cobra só a diferença.
const saldoDisponivel = ref(0)
const usarSaldo = ref(false)
const valorAbater = ref<number | null>(null)
watch(() => [props.show, props.clienteId], async ([s]) => {
  saldoDisponivel.value = 0
  usarSaldo.value = false
  if (!s || !props.clienteId) return
  try {
    const r = await $fetch<{ disponivel: number }>('/api/admin/indicacao-saldo', { query: { empresaId: props.clienteId }, headers: await useAdminAuthHeaders() })
    saldoDisponivel.value = r.disponivel || 0
    usarSaldo.value = saldoDisponivel.value > 0
  } catch { saldoDisponivel.value = 0 }
}, { immediate: true })
const precoPeriodo = computed(() => {
  if (selected.value === '1month') return Number(props.precoMensal || 0)
  if (selected.value === '6months' || selected.value === '12months') return Number(props.precoAnual || 0)
  return 0
})
watch([saldoDisponivel, () => selected.value], () => {
  valorAbater.value = precoPeriodo.value > 0 ? Math.min(saldoDisponivel.value, precoPeriodo.value) : saldoDisponivel.value
})
function brl(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }

function handleSubmit() {
  const { plan } = periodPlanMap[selected.value] || { plan: 'basic' }
  const abater = !selected.value.startsWith('trial') && usarSaldo.value && valorAbater.value
    ? Math.min(Math.round(Number(valorAbater.value) * 100) / 100, saldoDisponivel.value)
    : 0
  emit('confirm', plan, selected.value, abater > 0 ? abater : 0)
}
</script>

<template>
  <BaseModal :show="show" title="Renovar assinatura" @close="$emit('close')">
    <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
      Renovando para <span class="font-semibold text-slate-900 dark:text-white">{{ clienteNome }}</span>
    </p>
    <form @submit.prevent="handleSubmit" class="space-y-4">
      <div>
        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Período</label>
        <div class="grid gap-2">
          <label
            v-for="(p, key) in periodPlanMap"
            :key="key"
            class="flex items-center gap-3 px-4 py-3 rounded-lg border cursor-pointer transition-colors"
            :class="selected === key
              ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
              : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50'"
          >
            <input v-model="selected" type="radio" :value="key" class="text-purple-600" />
            <span class="text-sm font-medium text-slate-900 dark:text-white">{{ p.label }}</span>
          </label>
        </div>
      </div>
      <div v-if="saldoDisponivel > 0 && !selected.startsWith('trial')" class="rounded-lg border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 space-y-2">
        <label class="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          <input v-model="usarSaldo" type="checkbox" class="text-emerald-600" />
          Abater o saldo de indicação ({{ brl(saldoDisponivel) }} disponível)
        </label>
        <div v-if="usarSaldo" class="flex items-center gap-2 text-sm">
          <span class="text-emerald-800 dark:text-emerald-300">Abater</span>
          <input v-model.number="valorAbater" type="number" min="0.01" step="0.01" :max="saldoDisponivel" class="w-28 px-2 py-1.5 rounded-md border border-emerald-300 dark:border-emerald-500/40 bg-white dark:bg-slate-900 text-sm" />
          <span v-if="precoPeriodo > 0" class="text-xs text-emerald-800 dark:text-emerald-300">→ cobrar {{ brl(Math.max(0, precoPeriodo - (valorAbater || 0))) }} de {{ brl(precoPeriodo) }}</span>
        </div>
      </div>
      <div class="flex gap-2 pt-2">
        <button type="button" @click="$emit('close')" class="flex-1 px-4 py-2.5 rounded-lg font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
          Cancelar
        </button>
        <button type="submit" class="flex-1 px-4 py-2.5 rounded-lg font-semibold bg-purple-600 hover:bg-purple-700 text-white">
          Renovar
        </button>
      </div>
    </form>
  </BaseModal>
</template>
