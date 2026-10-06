<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { formatarDocumento, identificarDocumento, normalizarDocumento } from '~~/shared/utils/documento'
import { formatarTelefoneBr, normalizarTelefoneBr } from '~~/shared/utils/telefoneBr'
import { formatPhoneSemDdiBrasil, whatsappLink } from '~/utils/phone'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

/**
 * Cartela de indicações: o parceiro registra cada cliente que indicou.
 * Quando o cliente procura a Agzap para assinar, o admin consulta pelo
 * CPF/CNPJ ou telefone e vê que a indicação é deste parceiro.
 */
interface Indicacao {
  id: string
  documento: string
  documento_tipo: 'cpf' | 'cnpj'
  nome_cliente: string
  telefone: string
  observacao: string | null
  created_at: string
  updated_at: string
  conta_agzap_desde: string | null
  tem_conta_agzap: boolean
}

const toast = useToast()

const indicacoes = ref<Indicacao[]>([])
const carregando = ref(true)
const erroCarga = ref<string | null>(null)

async function carregar() {
  carregando.value = true
  erroCarga.value = null
  try {
    const resp = await $fetch<{ success: boolean; data?: { indicacoes: Indicacao[] }; error?: string }>(
      '/api/parceiro/indicacoes',
      { headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar suas indicações.')
    indicacoes.value = resp.data.indicacoes
  }
  catch (err: any) {
    erroCarga.value = String(err?.data?.statusMessage || err?.message || err)
  }
  finally {
    carregando.value = false
  }
}

onMounted(carregar)

// ───────── Formulário de registro ─────────
const form = reactive({ documento: '', nome: '', telefone: '', observacao: '' })
const enviando = ref(false)
const erroForm = ref<{ campo: string | null; mensagem: string } | null>(null)

function limparErro(campo: string) {
  if (erroForm.value?.campo === campo) erroForm.value = null
}
// Máscara: grava também no próprio input, porque quando o texto formatado
// não muda (ex.: digitou um caractere que a máscara descarta) o Vue não
// re-renderiza e o caractere ficaria na tela.
function aoDigitarDocumento(e: Event) {
  const alvo = e.target as HTMLInputElement
  form.documento = formatarDocumento(alvo.value)
  alvo.value = form.documento
  limparErro('documento')
}
function aoDigitarTelefone(e: Event) {
  const alvo = e.target as HTMLInputElement
  form.telefone = formatarTelefoneBr(alvo.value)
  alvo.value = form.telefone
  limparErro('telefone')
}

/** Dica ao lado do campo, só quando o documento já tem o tamanho completo. */
const dicaDocumento = computed(() => {
  const d = normalizarDocumento(form.documento)
  if (d.length !== 11 && d.length !== 14) return null
  const doc = identificarDocumento(d)
  if (!doc) return { ok: false, texto: d.length === 11 ? 'CPF inválido' : 'CNPJ inválido' }
  return { ok: true, texto: doc.tipo === 'cpf' ? 'CPF válido' : 'CNPJ válido' }
})

const dicaTelefone = computed(() => {
  const d = form.telefone.replace(/\D/g, '')
  if (d.length < 10) return null
  return normalizarTelefoneBr(d) ? { ok: true, texto: 'Telefone ok' } : { ok: false, texto: 'Confira o DDD e o número' }
})

const podeEnviar = computed(() =>
  !!identificarDocumento(form.documento)
  && form.nome.trim().length >= 2
  && !!normalizarTelefoneBr(form.telefone)
  && !enviando.value,
)

async function registrar() {
  if (!podeEnviar.value) return
  enviando.value = true
  erroForm.value = null
  try {
    const resp = await $fetch<{ success: boolean; campo?: string; error?: string }>(
      '/api/parceiro/indicacoes/registrar',
      {
        method: 'POST',
        body: { ...form },
        headers: await useAdminAuthHeaders(),
      },
    )
    if (!resp.success) {
      erroForm.value = { campo: resp.campo ?? null, mensagem: resp.error || 'Não foi possível registrar.' }
      return
    }
    toast.success('Indicação registrada na sua cartela')
    form.documento = ''
    form.nome = ''
    form.telefone = ''
    form.observacao = ''
    await carregar()
  }
  catch (err: any) {
    erroForm.value = { campo: null, mensagem: String(err?.data?.statusMessage || err?.message || 'Não foi possível registrar.') }
  }
  finally {
    enviando.value = false
  }
}

// ───────── Lista ─────────
const busca = ref('')

function semAcento(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const filtradas = computed(() => {
  const termo = semAcento(busca.value.trim())
  if (!termo) return indicacoes.value
  const soDigitos = busca.value.replace(/[^0-9A-Za-z]/g, '').toUpperCase()
  return indicacoes.value.filter(i =>
    semAcento(i.nome_cliente).includes(termo)
    || (soDigitos.length >= 3 && (i.documento.includes(soDigitos) || i.telefone.includes(soDigitos))),
  )
})

const totalComConta = computed(() => indicacoes.value.filter(i => i.tem_conta_agzap).length)

function fmtDataHora(iso: string) {
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Sao_Paulo',
  })
}
function fmtData(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

// ───────── Editar (só nome e observação) ─────────
const editando = ref<Indicacao | null>(null)
const editNome = ref('')
const editObs = ref('')
const salvandoEdicao = ref(false)
const erroEdicao = ref('')

function abrirEdicao(i: Indicacao) {
  editando.value = i
  editNome.value = i.nome_cliente
  editObs.value = i.observacao ?? ''
  erroEdicao.value = ''
}

async function salvarEdicao() {
  if (!editando.value || editNome.value.trim().length < 2 || salvandoEdicao.value) return
  salvandoEdicao.value = true
  erroEdicao.value = ''
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/parceiro/indicacoes/editar', {
      method: 'POST',
      body: { id: editando.value.id, nome: editNome.value, observacao: editObs.value },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) {
      erroEdicao.value = resp.error || 'Não foi possível salvar.'
      return
    }
    toast.success('Indicação atualizada')
    editando.value = null
    await carregar()
  }
  catch (err: any) {
    erroEdicao.value = String(err?.data?.statusMessage || err?.message || 'Não foi possível salvar.')
  }
  finally {
    salvandoEdicao.value = false
  }
}

// ───────── Excluir ─────────
const excluindoAlvo = ref<Indicacao | null>(null)
const excluindo = ref(false)
const erroExclusao = ref('')

function abrirExclusao(i: Indicacao) {
  if (i.tem_conta_agzap) return
  excluindoAlvo.value = i
  erroExclusao.value = ''
}

async function confirmarExclusao() {
  if (!excluindoAlvo.value || excluindo.value) return
  excluindo.value = true
  erroExclusao.value = ''
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/parceiro/indicacoes/excluir', {
      method: 'POST',
      body: { id: excluindoAlvo.value.id },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) {
      erroExclusao.value = resp.error || 'Não foi possível excluir.'
      await carregar()
      return
    }
    toast.success('Indicação excluída')
    excluindoAlvo.value = null
    await carregar()
  }
  catch (err: any) {
    erroExclusao.value = String(err?.data?.statusMessage || err?.message || 'Não foi possível excluir.')
  }
  finally {
    excluindo.value = false
  }
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
const inputBase = 'w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border rounded text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500'
function bordaCampo(campo: string) {
  return erroForm.value?.campo === campo
    ? 'border-red-400 dark:border-red-500/60'
    : 'border-slate-200 dark:border-slate-700'
}
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-5 w-full">

    <!-- Cabeçalho -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Indicados</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
          Registre cada cliente que você indicou. Quando ele procurar a Agzap para assinar, a indicação aparece como sua.
        </p>
      </div>
      <div class="flex items-center gap-2">
        <div class="flex items-stretch rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 divide-x divide-slate-200 dark:divide-white/10 overflow-hidden">
          <div class="px-3.5 py-1.5 text-center min-w-[78px]">
            <p class="text-xl font-bold leading-none tabular-nums text-slate-900 dark:text-white">{{ indicacoes.length }}</p>
            <p class="text-[10px] font-semibold uppercase tracking-wide text-purple-600 dark:text-purple-400 mt-0.5">registrados</p>
          </div>
          <div class="px-3.5 py-1.5 text-center min-w-[78px]">
            <p class="text-xl font-bold leading-none tabular-nums" :class="totalComConta ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'">{{ totalComConta }}</p>
            <p class="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 mt-0.5">com conta</p>
          </div>
        </div>
        <button
          type="button"
          :disabled="carregando"
          class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-semibold transition-all duration-150 shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20"
          @click="carregar"
        >
          <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': carregando }" aria-hidden="true" />
          <span class="hidden sm:inline">Atualizar</span>
        </button>
      </div>
    </div>

    <div class="grid gap-4 lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)] items-start">

      <!-- ═════════ Registrar ═════════ -->
      <form :class="[cardBase, 'p-5 space-y-4']" @submit.prevent="registrar">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded bg-purple-100 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/20 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-user-plus text-purple-600 dark:text-purple-400 text-sm" aria-hidden="true" />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-slate-900 dark:text-white">Registrar indicação</h2>
            <p class="text-[11px] text-slate-500 dark:text-slate-400">Fica salvo na sua cartela com a data de hoje</p>
          </div>
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="ind-doc" class="text-xs font-semibold text-slate-700 dark:text-slate-300">CPF ou CNPJ do cliente</label>
            <span
              v-if="dicaDocumento"
              class="text-[11px] font-semibold flex items-center gap-1"
              :class="dicaDocumento.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'"
            >
              <i class="fa-solid text-[10px]" :class="dicaDocumento.ok ? 'fa-circle-check' : 'fa-circle-xmark'" aria-hidden="true" />
              {{ dicaDocumento.texto }}
            </span>
          </div>
          <input
            id="ind-doc"
            :value="form.documento"
            type="text"
            inputmode="text"
            autocomplete="off"
            maxlength="18"
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            :class="[inputBase, bordaCampo('documento'), 'tabular-nums uppercase']"
            @input="aoDigitarDocumento"
          >
        </div>

        <div>
          <label for="ind-nome" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nome do cliente</label>
          <input
            id="ind-nome"
            v-model="form.nome"
            type="text"
            maxlength="120"
            autocomplete="off"
            placeholder="Nome da pessoa ou da empresa"
            :class="[inputBase, bordaCampo('nome')]"
            @input="limparErro('nome')"
          >
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="ind-tel" class="text-xs font-semibold text-slate-700 dark:text-slate-300">Telefone (WhatsApp) do cliente</label>
            <span
              v-if="dicaTelefone"
              class="text-[11px] font-semibold flex items-center gap-1"
              :class="dicaTelefone.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'"
            >
              <i class="fa-solid text-[10px]" :class="dicaTelefone.ok ? 'fa-circle-check' : 'fa-circle-xmark'" aria-hidden="true" />
              {{ dicaTelefone.texto }}
            </span>
          </div>
          <input
            id="ind-tel"
            :value="form.telefone"
            type="tel"
            inputmode="tel"
            autocomplete="off"
            placeholder="(11) 99999-9999"
            :class="[inputBase, bordaCampo('telefone'), 'tabular-nums']"
            @input="aoDigitarTelefone"
          >
        </div>

        <div>
          <label for="ind-obs" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Observação <span class="font-normal text-slate-400">(opcional)</span>
          </label>
          <textarea
            id="ind-obs"
            v-model="form.observacao"
            rows="2"
            maxlength="500"
            placeholder="Ex.: conversamos na feira, ele vai assinar o plano anual"
            :class="[inputBase, 'border-slate-200 dark:border-slate-700 resize-none']"
          />
        </div>

        <div
          v-if="erroForm"
          class="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2.5 text-xs text-red-700 dark:text-red-400 flex items-start gap-2"
          role="alert"
        >
          <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
          <span>{{ erroForm.mensagem }}</span>
        </div>

        <button
          type="submit"
          :disabled="!podeEnviar"
          class="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded text-sm font-semibold transition-colors"
        >
          <i class="fa-solid text-xs" :class="enviando ? 'fa-circle-notch animate-spin' : 'fa-check'" aria-hidden="true" />
          {{ enviando ? 'Registrando…' : 'Registrar indicação' }}
        </button>

        <ul class="space-y-1.5 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
          <li class="flex items-start gap-1.5">
            <i class="fa-solid fa-flag-checkered text-[10px] mt-0.5 text-purple-500" aria-hidden="true" />
            <span>O primeiro parceiro a registrar um CPF/CNPJ fica com a indicação.</span>
          </li>
          <li class="flex items-start gap-1.5">
            <i class="fa-solid fa-lock text-[10px] mt-0.5 text-purple-500" aria-hidden="true" />
            <span>Depois de registrado, o CPF/CNPJ e o telefone não mudam. Errou? Exclua e registre de novo (vale a data do novo registro).</span>
          </li>
          <li class="flex items-start gap-1.5">
            <i class="fa-solid fa-shield-halved text-[10px] mt-0.5 text-purple-500" aria-hidden="true" />
            <span>Quando o cliente cria a conta na Agzap, o registro fica travado como prova da sua indicação.</span>
          </li>
        </ul>
      </form>

      <!-- ═════════ Cartela ═════════ -->
      <div :class="[cardBase, 'overflow-hidden min-w-0']">
        <div class="px-4 sm:px-5 py-3.5 border-b border-slate-200 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 class="text-sm font-semibold text-slate-900 dark:text-white">Minha cartela de indicações</h2>
            <p v-if="!carregando && indicacoes.length" class="text-[11px] text-slate-500 dark:text-slate-400">
              Mostrando {{ filtradas.length }} de {{ indicacoes.length }}
            </p>
          </div>
          <div v-if="indicacoes.length" class="relative w-full sm:w-72">
            <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" aria-hidden="true" />
            <input
              v-model="busca"
              type="search"
              placeholder="Nome, CPF/CNPJ ou telefone…"
              class="w-full pl-8 pr-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-full text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
          </div>
        </div>

        <div v-if="erroCarga" class="m-4 p-3 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
          <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
          <span>{{ erroCarga }}</span>
        </div>

        <!-- Carregando -->
        <div v-if="carregando && !indicacoes.length" class="p-5 space-y-3">
          <div v-for="i in 4" :key="i" class="flex items-center gap-3">
            <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
            <div class="flex-1 space-y-1.5">
              <div class="h-3 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-2/3" />
              <div class="h-2.5 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-1/3" />
            </div>
          </div>
        </div>

        <!-- Vazio -->
        <div v-else-if="!indicacoes.length && !erroCarga" class="px-5 py-14 text-center">
          <i class="fa-solid fa-address-card text-slate-300 dark:text-slate-700 text-3xl mb-2 block" aria-hidden="true" />
          <p class="text-slate-600 dark:text-slate-300 text-sm font-semibold">Nenhuma indicação registrada ainda</p>
          <p class="text-slate-400 dark:text-slate-500 text-xs mt-1">Use o formulário ao lado para registrar o primeiro cliente que você indicou.</p>
        </div>

        <div v-else-if="!filtradas.length" class="px-5 py-12 text-center">
          <p class="text-slate-500 text-sm">Nenhuma indicação com essa busca</p>
          <button type="button" class="mt-2 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline" @click="busca = ''">
            Limpar busca
          </button>
        </div>

        <div v-else class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
                <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
                <th class="hidden md:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">CPF / CNPJ</th>
                <th class="hidden lg:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Telefone</th>
                <th class="hidden sm:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Registrado em</th>
                <th class="hidden sm:table-cell text-left px-4 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Conta na Agzap</th>
                <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Ações</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-slate-100 dark:divide-white/5">
              <tr v-for="i in filtradas" :key="i.id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors align-top">
                <td class="px-3 sm:px-5 py-3">
                  <p class="font-semibold text-slate-900 dark:text-white break-words">{{ i.nome_cliente }}</p>
                  <!-- No celular as colunas somem: os dados vão para baixo do nome -->
                  <p class="md:hidden text-xs text-slate-500 dark:text-slate-400 tabular-nums mt-0.5">
                    {{ i.documento_tipo.toUpperCase() }} {{ formatarDocumento(i.documento) }}
                  </p>
                  <p class="lg:hidden text-xs text-slate-500 dark:text-slate-400 tabular-nums">{{ formatPhoneSemDdiBrasil(i.telefone) }}</p>
                  <p class="sm:hidden text-[11px] text-slate-400 mt-0.5">Registrado em {{ fmtDataHora(i.created_at) }}</p>
                  <p v-if="i.observacao" class="text-xs text-slate-500 dark:text-slate-400 mt-1 italic break-words">{{ i.observacao }}</p>
                </td>
                <td class="hidden md:table-cell px-4 py-3 whitespace-nowrap">
                  <span class="text-[10px] font-bold uppercase text-slate-400 mr-1">{{ i.documento_tipo }}</span>
                  <span class="tabular-nums text-slate-700 dark:text-slate-300">{{ formatarDocumento(i.documento) }}</span>
                </td>
                <td class="hidden lg:table-cell px-4 py-3 whitespace-nowrap">
                  <a
                    v-if="whatsappLink(i.telefone)"
                    :href="whatsappLink(i.telefone)!"
                    target="_blank"
                    rel="noopener"
                    class="tabular-nums text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 inline-flex items-center gap-1.5"
                  >
                    <i class="fa-brands fa-whatsapp text-emerald-500" aria-hidden="true" />
                    {{ formatPhoneSemDdiBrasil(i.telefone) }}
                  </a>
                </td>
                <td class="hidden sm:table-cell px-4 py-3 whitespace-nowrap tabular-nums text-slate-600 dark:text-slate-400 text-xs">
                  {{ fmtDataHora(i.created_at) }}
                </td>
                <td class="hidden sm:table-cell px-4 py-3">
                  <span
                    v-if="i.tem_conta_agzap"
                    class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20"
                  >
                    <i class="fa-solid fa-circle-check text-[9px]" aria-hidden="true" />
                    {{ i.conta_agzap_desde ? `Desde ${fmtData(i.conta_agzap_desde)}` : 'Tem conta' }}
                  </span>
                  <span
                    v-else
                    class="inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-semibold whitespace-nowrap bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10"
                    title="Nenhuma conta na Agzap com esse CPF/CNPJ até agora"
                  >
                    Ainda não
                  </span>
                </td>
                <td class="px-3 sm:px-5 py-3">
                  <div class="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      class="w-8 h-8 rounded flex items-center justify-center text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                      title="Editar nome ou observação"
                      aria-label="Editar indicação"
                      @click="abrirEdicao(i)"
                    >
                      <i class="fa-solid fa-pen text-xs" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      class="w-8 h-8 rounded flex items-center justify-center transition-colors"
                      :class="i.tem_conta_agzap
                        ? 'text-slate-300 dark:text-slate-700 cursor-not-allowed'
                        : 'text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10'"
                      :disabled="i.tem_conta_agzap"
                      :title="i.tem_conta_agzap
                        ? 'O cliente já tem conta na Agzap: o registro fica guardado como prova da sua indicação'
                        : 'Excluir indicação'"
                      aria-label="Excluir indicação"
                      @click="abrirExclusao(i)"
                    >
                      <i class="fa-solid text-xs" :class="i.tem_conta_agzap ? 'fa-lock' : 'fa-trash'" aria-hidden="true" />
                    </button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ═════════ Modal: editar ═════════ -->
    <BaseModal :show="!!editando" title="Editar indicação" max-width="max-w-lg" @close="editando = null">
      <form v-if="editando" class="space-y-4" @submit.prevent="salvarEdicao">
        <div class="grid grid-cols-2 gap-3">
          <div class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 px-3 py-2">
            <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">{{ editando.documento_tipo }}</p>
            <p class="text-sm font-medium text-slate-900 dark:text-white tabular-nums">{{ formatarDocumento(editando.documento) }}</p>
          </div>
          <div class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 px-3 py-2">
            <p class="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Telefone</p>
            <p class="text-sm font-medium text-slate-900 dark:text-white tabular-nums">{{ formatPhoneSemDdiBrasil(editando.telefone) }}</p>
          </div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5 -mt-1">
          <i class="fa-solid fa-lock text-[10px] mt-0.5" aria-hidden="true" />
          <span>CPF/CNPJ e telefone não mudam, para a data do registro continuar valendo para este cliente.</span>
        </p>
        <div>
          <label for="ed-nome" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nome do cliente</label>
          <input id="ed-nome" v-model="editNome" type="text" maxlength="120" :class="[inputBase, 'border-slate-200 dark:border-slate-700']">
        </div>
        <div>
          <label for="ed-obs" class="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
            Observação <span class="font-normal text-slate-400">(opcional)</span>
          </label>
          <textarea id="ed-obs" v-model="editObs" rows="3" maxlength="500" :class="[inputBase, 'border-slate-200 dark:border-slate-700 resize-none']" />
        </div>
        <p v-if="erroEdicao" class="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5" role="alert">
          <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
          {{ erroEdicao }}
        </p>
        <div class="flex gap-2 pt-1">
          <button
            type="button"
            :disabled="salvandoEdicao"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            @click="editando = null"
          >
            Cancelar
          </button>
          <button
            type="submit"
            :disabled="editNome.trim().length < 2 || salvandoEdicao"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2"
          >
            <i v-if="salvandoEdicao" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
            {{ salvandoEdicao ? 'Salvando…' : 'Salvar' }}
          </button>
        </div>
      </form>
    </BaseModal>

    <!-- ═════════ Modal: excluir ═════════ -->
    <BaseModal :show="!!excluindoAlvo" title="Excluir indicação" max-width="max-w-md" @close="excluindoAlvo = null">
      <div v-if="excluindoAlvo" class="space-y-4">
        <p class="text-sm text-slate-600 dark:text-slate-400">
          Excluir o registro de <strong class="text-slate-900 dark:text-white">{{ excluindoAlvo.nome_cliente }}</strong>
          ({{ excluindoAlvo.documento_tipo.toUpperCase() }} {{ formatarDocumento(excluindoAlvo.documento) }}), feito em
          {{ fmtDataHora(excluindoAlvo.created_at) }}?
        </p>
        <ul class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3.5 py-3 space-y-1.5 text-xs text-amber-800 dark:text-amber-300">
          <li class="flex items-start gap-1.5">
            <i class="fa-solid fa-unlock text-[10px] mt-0.5" aria-hidden="true" />
            <span>O CPF/CNPJ fica livre: outro parceiro pode registrar esse cliente.</span>
          </li>
          <li class="flex items-start gap-1.5">
            <i class="fa-solid fa-calendar-xmark text-[10px] mt-0.5" aria-hidden="true" />
            <span>Se você registrar de novo, passa a valer a data do novo registro, e não a data original.</span>
          </li>
        </ul>
        <p v-if="erroExclusao" class="text-xs text-red-600 dark:text-red-400 flex items-start gap-1.5" role="alert">
          <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
          {{ erroExclusao }}
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            :disabled="excluindo"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            @click="excluindoAlvo = null"
          >
            Manter
          </button>
          <button
            type="button"
            :disabled="excluindo"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2"
            @click="confirmarExclusao"
          >
            <i v-if="excluindo" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
            {{ excluindo ? 'Excluindo…' : 'Excluir' }}
          </button>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
