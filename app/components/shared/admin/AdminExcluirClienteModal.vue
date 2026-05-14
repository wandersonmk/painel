<script setup lang="ts">
import { ref, watch } from 'vue'

const props = defineProps<{ show: boolean; clienteNome: string }>()
const emit = defineEmits<{ close: []; confirm: [] }>()

const confirmText = ref('')
const isValid = ref(false)

watch(confirmText, (v) => { isValid.value = v.trim().toUpperCase() === 'EXCLUIR' })
watch(() => props.show, (v) => { if (!v) { confirmText.value = ''; isValid.value = false } })
</script>

<template>
  <BaseModal :show="show" title="Excluir cliente" @close="$emit('close')">
    <div class="space-y-4">
      <div class="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-lg p-3 flex gap-3">
        <i class="fa-solid fa-triangle-exclamation text-red-600 dark:text-red-400 mt-0.5" aria-hidden="true" />
        <p class="text-sm text-red-700 dark:text-red-300">
          Esta ação é <strong>irreversível</strong>. Todos os dados de
          <strong>{{ clienteNome }}</strong> serão excluídos em cascata.
        </p>
      </div>
      <div>
        <label class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
          Digite <span class="font-mono text-red-600 dark:text-red-400">EXCLUIR</span> para confirmar
        </label>
        <input
          v-model="confirmText"
          type="text"
          class="w-full px-3 py-2 bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white font-mono"
          placeholder="EXCLUIR"
          autocomplete="off"
        />
      </div>
      <div class="flex gap-2">
        <button type="button" @click="$emit('close')" class="flex-1 px-4 py-2.5 rounded-lg font-semibold border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
          Cancelar
        </button>
        <button
          type="button"
          @click="$emit('confirm')"
          :disabled="!isValid"
          class="flex-1 px-4 py-2.5 rounded-lg font-semibold bg-red-600 hover:bg-red-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Excluir
        </button>
      </div>
    </div>
  </BaseModal>
</template>
