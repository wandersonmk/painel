<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface TrilhaForm {
  id: string
  slug: string
  nome: string
  nivel_label: string
  descricao: string | null
  ordem: number
  ativo: boolean
}

const props = defineProps<{ show: boolean; trilha: TrilhaForm | null }>()
const emit = defineEmits<{ close: []; saved: [] }>()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const nome = ref('')
const nivelLabel = ref('')
const descricao = ref('')
const ordem = ref(0)
const ativo = ref(true)
const saving = ref(false)

watch(() => props.show, (aberto) => {
  if (!aberto || !props.trilha) return
  nome.value = props.trilha.nome
  nivelLabel.value = props.trilha.nivel_label
  descricao.value = props.trilha.descricao || ''
  ordem.value = props.trilha.ordem
  ativo.value = props.trilha.ativo
})

const podeSalvar = computed(() => nome.value.trim().length > 0 && nivelLabel.value.trim().length > 0 && !saving.value)

async function salvar() {
  if (!podeSalvar.value || !props.trilha) return
  saving.value = true
  toast = toast || await useToastSafe()
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/suporte/trilha-salvar', {
      method: 'POST',
      body: {
        id: props.trilha.id,
        nome: nome.value,
        nivelLabel: nivelLabel.value,
        descricao: descricao.value,
        ordem: ordem.value,
        ativo: ativo.value,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro ao salvar')
    toast?.success('Trilha atualizada')
    emit('saved')
    emit('close')
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao salvar trilha')
  } finally {
    saving.value = false
  }
}

const inputCls = 'w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500'
const labelCls = 'block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1'
</script>

<template>
  <BaseModal :show="show" title="Editar trilha" @close="emit('close')">
    <form @submit.prevent="salvar" class="space-y-4">

      <!-- slug é referência fixa do app — exibido apenas para contexto -->
      <div class="px-3 py-2 rounded bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 flex items-center gap-2">
        <i class="fa-solid fa-link text-slate-400 text-xs" aria-hidden="true" />
        <span class="text-xs text-slate-500 dark:text-slate-400">Slug (fixo): <code class="font-mono font-semibold text-slate-700 dark:text-slate-300">{{ trilha?.slug }}</code></span>
      </div>

      <div>
        <label for="st-nome" :class="labelCls">Nome</label>
        <input id="st-nome" v-model="nome" type="text" required :class="inputCls" />
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="st-nivel" :class="labelCls">Nível (selo)</label>
          <input id="st-nivel" v-model="nivelLabel" type="text" required placeholder="Ex.: Iniciante" :class="inputCls" />
        </div>
        <div>
          <label for="st-ordem" :class="labelCls">Ordem de exibição</label>
          <input id="st-ordem" v-model.number="ordem" type="number" min="0" :class="[inputCls, 'text-center tabular-nums']" />
        </div>
      </div>

      <div>
        <label for="st-desc" :class="labelCls">Descrição</label>
        <textarea id="st-desc" v-model="descricao" rows="2" :class="[inputCls, 'resize-none']" />
      </div>

      <button
        type="button"
        @click="ativo = !ativo"
        class="w-full px-3 py-2 rounded text-sm font-semibold border transition-colors inline-flex items-center justify-center gap-2"
        :class="ativo
          ? 'border-emerald-300 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
          : 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 dark:text-slate-400'"
      >
        <i class="fa-solid text-xs" :class="ativo ? 'fa-eye' : 'fa-eye-slash'" aria-hidden="true" />
        {{ ativo ? 'Trilha visível no app' : 'Trilha oculta no app' }}
      </button>

      <div class="flex gap-2 pt-1">
        <button type="button" @click="emit('close')"
          class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
          Cancelar
        </button>
        <button type="submit" :disabled="!podeSalvar"
          class="flex-1 px-4 py-2.5 rounded-lg font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2">
          <i v-if="saving" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
          {{ saving ? 'Salvando…' : 'Salvar alterações' }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
