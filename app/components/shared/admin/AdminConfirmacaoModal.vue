<script setup lang="ts">
defineProps<{
  show: boolean
  title: string
  message: string
  clienteNome?: string
  confirmLabel?: string
  variant?: 'danger' | 'warning' | 'info'
}>()
defineEmits<{ close: []; confirm: [] }>()
</script>

<template>
  <BaseModal :show="show" :title="title" @close="$emit('close')">
    <p class="text-sm text-slate-600 dark:text-slate-400">
      {{ message }}
      <span v-if="clienteNome" class="font-semibold text-slate-900 dark:text-white">{{ clienteNome }}</span>?
    </p>
    <div class="flex gap-2 pt-4">
      <button type="button" @click="$emit('close')" class="flex-1 px-4 py-2.5 rounded-lg font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
        Cancelar
      </button>
      <button
        type="button"
        @click="$emit('confirm')"
        class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-white"
        :class="{
          'bg-red-600 hover:bg-red-700': variant === 'danger',
          'bg-amber-600 hover:bg-amber-700': variant === 'warning',
          'bg-purple-600 hover:bg-purple-700': !variant || variant === 'info',
        }"
      >
        {{ confirmLabel || 'Confirmar' }}
      </button>
    </div>
  </BaseModal>
</template>
