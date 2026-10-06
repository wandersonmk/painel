<script setup lang="ts">
import { computed, ref, watch } from 'vue'

interface TrilhaForm {
  id: string
  slug: string
  nome: string
  nivel_label: string
  descricao: string | null
  icone: string
  cor: string
  grupo: string
  ordem: number
  ativo: boolean
}

// null = criar trilha nova
const props = defineProps<{ show: boolean; trilha: TrilhaForm | null; ordemSugerida?: number }>()
const emit = defineEmits<{ close: []; saved: [id?: string] }>()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

// Mesmos grupos e cores da página de Aulas do app (useSuporteVideos.ts).
const GRUPOS = [
  { id: 'comece', nome: 'Comece por aqui' },
  { id: 'atendimento', nome: 'Atendimento e vendas' },
  { id: 'ia', nome: 'Inteligência Artificial' },
  { id: 'modulos', nome: 'Módulos' },
  { id: 'avancado', nome: 'Integrações e gestão' },
  { id: 'crescimento', nome: 'Parcerias' },
]
const CORES: { id: string; bg: string }[] = [
  { id: 'emerald', bg: 'bg-emerald-500' }, { id: 'sky', bg: 'bg-sky-500' }, { id: 'indigo', bg: 'bg-indigo-500' },
  { id: 'orange', bg: 'bg-orange-500' }, { id: 'teal', bg: 'bg-teal-500' }, { id: 'violet', bg: 'bg-violet-500' },
  { id: 'rose', bg: 'bg-rose-500' }, { id: 'cyan', bg: 'bg-cyan-500' }, { id: 'amber', bg: 'bg-amber-500' },
  { id: 'pink', bg: 'bg-pink-500' }, { id: 'slate', bg: 'bg-slate-500' }, { id: 'fuchsia', bg: 'bg-fuchsia-500' },
  { id: 'lime', bg: 'bg-lime-500' },
]
const ICONES = [
  'fa-rocket', 'fa-comments', 'fa-table-columns', 'fa-paper-plane', 'fa-calendar-check', 'fa-robot',
  'fa-motorcycle', 'fa-store', 'fa-house', 'fa-bullseye', 'fa-plug', 'fa-share-nodes', 'fa-user-gear',
  'fa-gift', 'fa-handshake', 'fa-graduation-cap', 'fa-chart-line', 'fa-bolt', 'fa-headset', 'fa-cart-shopping',
]

const nome = ref('')
const nivelLabel = ref('')
const descricao = ref('')
const icone = ref('fa-graduation-cap')
const cor = ref('violet')
const grupo = ref('modulos')
const ordem = ref(0)
const ativo = ref(true)
const saving = ref(false)

watch(() => props.show, (aberto) => {
  if (!aberto) return
  const t = props.trilha
  nome.value = t?.nome || ''
  nivelLabel.value = t?.nivel_label || 'Módulo'
  descricao.value = t?.descricao || ''
  icone.value = t?.icone || 'fa-graduation-cap'
  cor.value = t?.cor || 'violet'
  grupo.value = t?.grupo || 'modulos'
  ordem.value = t?.ordem ?? props.ordemSugerida ?? 0
  ativo.value = t?.ativo ?? true
})

const iconeValido = computed(() => /^fa-[a-z0-9-]+$/.test(icone.value.trim()))
const podeSalvar = computed(() => nome.value.trim().length > 0 && nivelLabel.value.trim().length > 0 && iconeValido.value && !saving.value)
const corAtual = computed(() => CORES.find(c => c.id === cor.value)?.bg || 'bg-violet-500')

async function salvar() {
  if (!podeSalvar.value) return
  saving.value = true
  toast = toast || await useToastSafe()
  try {
    const resp = await $fetch<{ success: boolean; id?: string; error?: string }>('/api/admin/suporte/trilha-salvar', {
      method: 'POST',
      body: {
        id: props.trilha?.id,
        nome: nome.value,
        nivelLabel: nivelLabel.value,
        descricao: descricao.value,
        icone: icone.value.trim(),
        cor: cor.value,
        grupo: grupo.value,
        ordem: ordem.value,
        ativo: ativo.value,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro ao salvar')
    toast?.success(props.trilha ? 'Trilha atualizada' : 'Trilha criada')
    emit('saved', resp.id)
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
  <BaseModal :show="show" :title="trilha ? 'Editar trilha' : 'Nova trilha'" max-width="max-w-2xl" @close="emit('close')">
    <form @submit.prevent="salvar" class="space-y-4 max-h-[72vh] overflow-y-auto pr-1">

      <!-- Prévia -->
      <div class="flex items-center gap-3 p-3 rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03]">
        <span class="w-11 h-11 rounded-lg flex items-center justify-center text-white text-lg shrink-0" :class="corAtual">
          <i class="fa-solid" :class="iconeValido ? icone : 'fa-question'" aria-hidden="true" />
        </span>
        <div class="min-w-0">
          <p class="font-semibold text-slate-900 dark:text-white truncate">{{ nome || 'Nome da trilha' }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">{{ GRUPOS.find(g => g.id === grupo)?.nome }} · {{ nivelLabel || 'Selo' }}</p>
        </div>
        <span v-if="trilha" class="ml-auto text-[11px] text-slate-400 font-mono truncate" title="Endereço da trilha no app (não muda)">?trilha={{ trilha.slug }}</span>
      </div>

      <div class="grid sm:grid-cols-2 gap-3">
        <div>
          <label for="st-nome" :class="labelCls">Nome</label>
          <input id="st-nome" v-model="nome" type="text" required placeholder="Ex.: Delivery" :class="inputCls" />
        </div>
        <div>
          <label for="st-nivel" :class="labelCls">Selo</label>
          <input id="st-nivel" v-model="nivelLabel" type="text" required placeholder="Ex.: Módulo, Avançado, Do básico ao avançado" :class="inputCls" />
        </div>
      </div>

      <div class="grid sm:grid-cols-[1fr_120px] gap-3">
        <div>
          <label for="st-grupo" :class="labelCls">Grupo na página de Aulas</label>
          <select id="st-grupo" v-model="grupo" :class="inputCls">
            <option v-for="g in GRUPOS" :key="g.id" :value="g.id">{{ g.nome }}</option>
          </select>
        </div>
        <div>
          <label for="st-ordem" :class="labelCls">Ordem</label>
          <input id="st-ordem" v-model.number="ordem" type="number" min="0" :class="[inputCls, 'text-center tabular-nums']" />
        </div>
      </div>

      <div>
        <label for="st-desc" :class="labelCls">Descrição</label>
        <textarea id="st-desc" v-model="descricao" rows="2" placeholder="O que o cliente aprende nesta trilha" :class="[inputCls, 'resize-none']" />
      </div>

      <div>
        <span :class="labelCls">Cor</span>
        <div class="flex flex-wrap gap-1.5">
          <button
            v-for="c in CORES"
            :key="c.id"
            type="button"
            @click="cor = c.id"
            class="w-7 h-7 rounded-full transition-transform"
            :class="[c.bg, cor === c.id ? 'ring-2 ring-offset-2 ring-slate-900 dark:ring-white dark:ring-offset-slate-900 scale-110' : 'hover:scale-110']"
            :title="c.id"
            :aria-label="`Cor ${c.id}`"
          />
        </div>
      </div>

      <div>
        <label for="st-icone" :class="labelCls">Ícone <span class="font-normal text-slate-400">(Font Awesome)</span></label>
        <div class="flex flex-wrap gap-1.5 mb-2">
          <button
            v-for="i in ICONES"
            :key="i"
            type="button"
            @click="icone = i"
            class="w-8 h-8 rounded flex items-center justify-center border transition-colors"
            :class="icone === i ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/15 text-purple-600 dark:text-purple-300' : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'"
            :title="i"
          ><i class="fa-solid text-sm" :class="i" aria-hidden="true" /></button>
        </div>
        <input id="st-icone" v-model="icone" type="text" placeholder="fa-robot" :class="[inputCls, 'font-mono', iconeValido ? '' : 'border-red-400']" />
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
          {{ saving ? 'Salvando…' : (trilha ? 'Salvar alterações' : 'Criar trilha') }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
