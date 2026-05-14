<script setup lang="ts">
import { ref } from 'vue'

defineProps<{ show: boolean; clienteNome: string }>()
const emit = defineEmits<{
  close: []
  confirm: [plan: string, period: string]
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

function handleSubmit() {
  const { plan } = periodPlanMap[selected.value] || { plan: 'basic' }
  emit('confirm', plan, selected.value)
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
