<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { validarCpfCnpj } from '~~/shared/utils/documento'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

const { resumo, loadingResumo, loadResumo, salvarConfig } = useParceiro()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const pixTipo = ref('cpf')
const pixChave = ref('')
const titularNome = ref('')
const titularDocumento = ref('')
const saving = ref(false)

// Modo travado/edição: com dados salvos, os campos ficam bloqueados até clicar em Editar
const modoEdicao = ref(true)
const temConfigSalva = ref(false)
const salvos = ref({ tipo: 'cpf', chave: '', nome: '', documento: '' })

const tiposPix = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'celular', label: 'Celular' },
  { value: 'email', label: 'E-mail' },
  { value: 'aleatoria', label: 'Chave aleatória' },
]

function atualizarSnapshot() {
  salvos.value = {
    tipo: pixTipo.value,
    chave: pixChave.value,
    nome: titularNome.value,
    documento: titularDocumento.value,
  }
}

const houveAlteracao = computed(() =>
  pixTipo.value !== salvos.value.tipo
  || pixChave.value !== salvos.value.chave
  || titularNome.value !== salvos.value.nome
  || titularDocumento.value !== salvos.value.documento,
)

function entrarEdicao() {
  modoEdicao.value = true
}

function cancelarEdicao() {
  pixTipo.value = salvos.value.tipo
  pixChave.value = salvos.value.chave
  titularNome.value = salvos.value.nome
  titularDocumento.value = salvos.value.documento
  tentouSalvar.value = false
  modoEdicao.value = false
}

onMounted(async () => {
  toast = await useToastSafe()
  await loadResumo()
  const cfg = resumo.value?.config
  if (cfg) {
    pixTipo.value = cfg.tipo || 'cpf'
    pixChave.value = cfg.chave || ''
    titularNome.value = cfg.titular_nome || ''
    titularDocumento.value = cfg.titular_documento || ''
    temConfigSalva.value = true
    modoEdicao.value = false
    atualizarSnapshot()
  } else if (resumo.value?.parceiro?.nome) {
    titularNome.value = resumo.value.parceiro.nome
  }
})

const documentoDigitos = computed(() => titularDocumento.value.replace(/\D/g, ''))
const tentouSalvar = ref(false)

const erroChave = computed(() =>
  pixChave.value.trim().length >= 5 ? '' : 'Preencha sua chave PIX',
)
const erroTitular = computed(() =>
  titularNome.value.trim().length >= 3 ? '' : 'Preencha o nome do titular',
)
const erroDocumento = computed(() => {
  if (!titularDocumento.value.trim()) return 'Preencha o CPF/CNPJ do titular'
  const len = documentoDigitos.value.length
  if (len !== 11 && len !== 14) return 'Informe um CPF (11 dígitos) ou CNPJ (14 dígitos)'
  if (!validarCpfCnpj(documentoDigitos.value)) {
    return len === 11 ? 'CPF inválido — confira os dígitos' : 'CNPJ inválido — confira os dígitos'
  }
  return ''
})

const podeSalvar = computed(() => !erroChave.value && !erroTitular.value && !erroDocumento.value)

async function salvar() {
  if (saving.value) return
  tentouSalvar.value = true
  if (!podeSalvar.value) {
    toast?.warning('Preencha todos os campos obrigatórios')
    return
  }
  saving.value = true
  try {
    await salvarConfig({
      pixTipo: pixTipo.value,
      pixChave: pixChave.value,
      titularNome: titularNome.value,
      titularDocumento: titularDocumento.value || undefined,
    })
    toast?.success('Dados de pagamento salvos!')
    atualizarSnapshot()
    temConfigSalva.value = true
    modoEdicao.value = false
    tentouSalvar.value = false
  } catch (err: any) {
    toast?.error(err?.message || 'Erro ao salvar configuração')
  } finally {
    saving.value = false
  }
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 max-w-[800px] mx-auto w-full">

    <!-- Page Header -->
    <div>
      <h1 class="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Configurações</h1>
      <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">Dados para receber suas comissões</p>
    </div>

    <!-- Loading -->
    <div v-if="loadingResumo" :class="['p-6 space-y-4', cardBase]">
      <div v-for="i in 4" :key="i" class="h-10 bg-slate-100 dark:bg-white/5 rounded animate-pulse" />
    </div>

    <!-- Form -->
    <div v-else :class="['p-5 sm:p-6', cardBase]">
      <div class="flex items-center gap-2 mb-5">
        <div class="w-8 h-8 rounded bg-emerald-100 dark:bg-emerald-500/15 flex items-center justify-center">
          <i class="fa-brands fa-pix text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        </div>
        <div>
          <h2 class="text-sm font-semibold text-slate-800 dark:text-white">Recebimento via PIX</h2>
          <p class="text-xs text-slate-500 mt-0.5">É por essa chave que enviaremos seus repasses</p>
        </div>
      </div>

      <!-- Aviso titularidade -->
      <div class="mb-5 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 flex items-start gap-2.5">
        <i class="fa-solid fa-triangle-exclamation text-amber-600 dark:text-amber-400 text-sm mt-0.5" aria-hidden="true" />
        <p class="text-xs text-amber-800 dark:text-amber-300">
          <strong>Importante:</strong> a chave PIX precisa estar no <strong>seu nome</strong> (titular da conta de parceiro). Chaves de terceiros não são aceitas para repasse.
        </p>
      </div>

      <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">
        <span class="text-red-500 font-bold">*</span> Todos os campos são obrigatórios
      </p>

      <form @submit.prevent="salvar" class="space-y-4" novalidate>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="pix-tipo" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Tipo da chave <span class="text-red-500">*</span>
            </label>
            <select
              id="pix-tipo"
              v-model="pixTipo"
              :disabled="!modoEdicao"
              class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-white/[0.02]"
            >
              <option v-for="t in tiposPix" :key="t.value" :value="t.value">{{ t.label }}</option>
            </select>
          </div>
          <div>
            <label for="pix-chave" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Chave PIX <span class="text-red-500">*</span>
            </label>
            <input
              id="pix-chave"
              v-model="pixChave"
              type="text"
              :disabled="!modoEdicao"
              placeholder="Sua chave PIX"
              class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-white/[0.02]"
              :class="tentouSalvar && erroChave
                ? 'border-red-400 dark:border-red-500/60'
                : 'border-slate-200 dark:border-slate-700'"
            />
            <p v-if="tentouSalvar && erroChave" class="text-xs text-red-500 dark:text-red-400 mt-1" role="alert">
              {{ erroChave }}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="titular-nome" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              Nome do titular <span class="text-red-500">*</span>
            </label>
            <input
              id="titular-nome"
              v-model="titularNome"
              type="text"
              :disabled="!modoEdicao"
              placeholder="Nome completo do titular da conta"
              class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-white/[0.02]"
              :class="tentouSalvar && erroTitular
                ? 'border-red-400 dark:border-red-500/60'
                : 'border-slate-200 dark:border-slate-700'"
            />
            <p v-if="tentouSalvar && erroTitular" class="text-xs text-red-500 dark:text-red-400 mt-1" role="alert">
              {{ erroTitular }}
            </p>
          </div>
          <div>
            <label for="titular-doc" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
              CPF/CNPJ do titular <span class="text-red-500">*</span>
            </label>
            <input
              id="titular-doc"
              v-model="titularDocumento"
              type="text"
              :disabled="!modoEdicao"
              inputmode="numeric"
              placeholder="Somente números"
              class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border rounded text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed disabled:bg-slate-50 dark:disabled:bg-white/[0.02]"
              :class="(tentouSalvar || titularDocumento) && erroDocumento
                ? 'border-red-400 dark:border-red-500/60'
                : 'border-slate-200 dark:border-slate-700'"
            />
            <p v-if="(tentouSalvar || titularDocumento) && erroDocumento" class="text-xs text-red-500 dark:text-red-400 mt-1" role="alert">
              {{ erroDocumento }}
            </p>
          </div>
        </div>

        <div class="pt-2 flex justify-end gap-2">
          <!-- Dados salvos e bloqueados: botão Editar -->
          <button
            v-if="!modoEdicao"
            type="button"
            @click="entrarEdicao"
            class="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 rounded text-sm font-semibold transition-colors"
          >
            <i class="fa-solid fa-pen-to-square text-xs" aria-hidden="true" />
            Editar dados
          </button>

          <!-- Editando dados já salvos: pode cancelar -->
          <button
            v-if="modoEdicao && temConfigSalva"
            type="button"
            @click="cancelarEdicao"
            :disabled="saving"
            class="inline-flex items-center justify-center gap-2 px-5 py-2.5 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 rounded text-sm font-semibold transition-colors"
          >
            Cancelar
          </button>

          <!-- Salvar: primeiro preenchimento sempre; em edição, só quando houver alteração -->
          <button
            v-if="modoEdicao && (!temConfigSalva || houveAlteracao)"
            type="submit"
            :disabled="saving"
            class="inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-semibold transition-colors shadow-lg shadow-purple-600/30"
          >
            <i v-if="saving" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
            {{ saving ? 'Salvando…' : 'Salvar dados' }}
          </button>
        </div>
      </form>
    </div>

  </div>
</template>
