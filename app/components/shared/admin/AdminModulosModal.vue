<script setup lang="ts">
import { ref, watch } from 'vue'

// Habilita/desabilita módulos do app por empresa (gate de admin).
// Não confundir com `transporte_ativo`: aquele é o toggle da própria
// empresa dentro do app — aqui o admin decide se ela PODE usar o módulo.
const props = defineProps<{
  show: boolean
  clienteNome: string
  roteamentoAtual: boolean
  transporteAtual: boolean
}>()
const emit = defineEmits<{
  close: []
  confirm: [modulos: { roteamentoHabilitado: boolean; transporteHabilitado: boolean }]
}>()

const roteamento = ref(true)
const transporte = ref(true)

watch(() => props.show, (open) => {
  if (open) {
    roteamento.value = props.roteamentoAtual
    transporte.value = props.transporteAtual
  }
})

const MODULOS = [
  {
    key: 'roteamento' as const,
    label: 'Roteamento',
    icon: 'fa-route',
    iconCls: 'text-violet-500',
    descricao: 'Página de Roteamento de Leads no menu lateral do app',
  },
  {
    key: 'transporte' as const,
    label: 'Transporte',
    icon: 'fa-bus',
    iconCls: 'text-blue-500',
    descricao: 'Módulo de Transporte (viagens, reservas e link público)',
  },
]

const valores = { roteamento, transporte }
</script>

<template>
  <BaseModal :show="show" title="Módulos do app" max-width="max-w-md" @close="$emit('close')">

    <!-- Header do cliente -->
    <div class="flex items-center gap-3 pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
      <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
        <span class="text-white font-bold text-sm">{{ clienteNome.charAt(0).toUpperCase() }}</span>
      </div>
      <div>
        <p class="font-semibold text-slate-900 dark:text-white">{{ clienteNome }}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400">Controle quais módulos esta empresa pode acessar</p>
      </div>
    </div>

    <form @submit.prevent="$emit('confirm', { roteamentoHabilitado: roteamento, transporteHabilitado: transporte })" class="space-y-4">
      <div class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 divide-y divide-slate-200 dark:divide-slate-800">
        <div
          v-for="m in MODULOS"
          :key="m.key"
          class="flex items-center justify-between gap-3 p-4"
        >
          <div class="min-w-0 flex-1">
            <p class="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <i :class="['fa-solid', m.icon, m.iconCls, 'text-xs']" aria-hidden="true" />
              {{ m.label }}
            </p>
            <p class="text-xs text-slate-400 dark:text-slate-600 mt-0.5">{{ m.descricao }}</p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="valores[m.key].value"
            :aria-label="`${valores[m.key].value ? 'Desabilitar' : 'Habilitar'} módulo ${m.label}`"
            @click="valores[m.key].value = !valores[m.key].value"
            class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            :class="valores[m.key].value ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'"
          >
            <span
              class="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
              :class="valores[m.key].value ? 'translate-x-6' : 'translate-x-1'"
            />
          </button>
        </div>
      </div>

      <p class="text-xs text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
        <i class="fa-solid fa-circle-info mt-0.5" aria-hidden="true" />
        <span>Ao desabilitar, a opção some do menu lateral do app e o acesso à página é bloqueado. Pode reabilitar a qualquer momento.</span>
      </p>

      <div class="flex gap-2 pt-1">
        <button
          type="button"
          @click="$emit('close')"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors"
        >
          Salvar
        </button>
      </div>
    </form>
  </BaseModal>
</template>
