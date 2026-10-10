<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { formatarDocumento, identificarDocumento, normalizarDocumento } from '~~/shared/utils/documento'
import { formatarTelefoneBr, normalizarTelefoneBr } from '~~/shared/utils/telefoneBr'
import { erroAfiliado } from '~/composables/useAfiliado'

definePageMeta({
  middleware: ['auth', 'afiliado'],
  layout: 'afiliado',
})

useHead({ title: 'Dados para receber · Portal do Afiliado' })

/**
 * Dados para receber: nome, CPF/CNPJ, WhatsApp e a chave PIX do saque.
 * A chave tem que estar no nome e no CPF/CNPJ do próprio afiliado.
 */
type TipoChave = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'

interface DadosAfiliado {
  nome: string
  email: string
  telefone: string | null
  documento: string | null
  chave_pix: string | null
  chave_pix_tipo: TipoChave | null
  pix_declarado_titular: boolean
  completo: boolean
  faltando: string[]
  saque_aberto: boolean
}

const TIPOS: Array<{ id: TipoChave; label: string; icone: string }> = [
  { id: 'cpf', label: 'CPF', icone: 'fa-id-card' },
  { id: 'cnpj', label: 'CNPJ', icone: 'fa-building' },
  { id: 'email', label: 'E-mail', icone: 'fa-at' },
  { id: 'telefone', label: 'Telefone', icone: 'fa-mobile-screen' },
  { id: 'aleatoria', label: 'Aleatória', icone: 'fa-key' },
]

const toast = useToast()
const dados = ref<DadosAfiliado | null>(null)
const carregando = ref(true)
const erro = ref<string | null>(null)
const salvando = ref(false)
const erroForm = ref<{ campo: string | null; mensagem: string } | null>(null)

const form = reactive({
  nome: '',
  documento: '',
  telefone: '',
  chave_pix_tipo: '' as TipoChave | '',
  chave_pix: '',
  pix_declarado_titular: false,
})
const original = ref('')

function chaveParaCampo(chave: string | null, tipo: TipoChave | null) {
  if (!chave) return ''
  if (tipo === 'telefone') return formatarTelefoneBr(chave.replace(/^\+/, ''))
  if (tipo === 'cpf' || tipo === 'cnpj') return formatarDocumento(chave)
  return chave
}

function preencher(d: DadosAfiliado) {
  form.nome = d.nome ?? ''
  form.documento = formatarDocumento(d.documento)
  form.telefone = formatarTelefoneBr(d.telefone)
  form.chave_pix_tipo = d.chave_pix_tipo ?? ''
  form.chave_pix = chaveParaCampo(d.chave_pix, d.chave_pix_tipo)
  form.pix_declarado_titular = d.pix_declarado_titular === true
  original.value = assinatura()
}

/** Retrato do formulário para saber se há alteração (o disquete só aparece aí). */
function assinatura() {
  return JSON.stringify({
    nome: form.nome.replace(/\s+/g, ' ').trim(),
    documento: normalizarDocumento(form.documento),
    telefone: form.telefone.replace(/\D/g, ''),
    tipo: form.chave_pix_tipo,
    chave: chaveEnviada.value,
    declarado: form.pix_declarado_titular,
  })
}

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    const resp = await $fetch<{ success: boolean; data?: DadosAfiliado; error?: string }>('/api/afiliado/dados', {
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar seus dados.')
    dados.value = resp.data
    preencher(resp.data)
  }
  catch (e: any) {
    erro.value = erroAfiliado(e, 'Não foi possível carregar seus dados.')
  }
  finally {
    carregando.value = false
  }
}

onMounted(carregar)

const travadoPorSaque = computed(() => !!dados.value?.saque_aberto)
const docInfo = computed(() => identificarDocumento(form.documento))
const chaveEhDocumento = computed(() => form.chave_pix_tipo === 'cpf' || form.chave_pix_tipo === 'cnpj')

/** Chave que vai para o servidor: em CPF/CNPJ é sempre o próprio documento. */
const chaveEnviada = computed(() => {
  if (chaveEhDocumento.value) return normalizarDocumento(form.documento)
  if (form.chave_pix_tipo === 'telefone') return form.chave_pix.replace(/\D/g, '')
  return form.chave_pix.trim().toLowerCase()
})

const alterado = computed(() => !!dados.value && assinatura() !== original.value)

function limparErro(campo: string) {
  if (erroForm.value?.campo === campo || erroForm.value?.campo === null) erroForm.value = null
}

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
function aoDigitarChave(e: Event) {
  const alvo = e.target as HTMLInputElement
  form.chave_pix = form.chave_pix_tipo === 'telefone' ? formatarTelefoneBr(alvo.value) : alvo.value
  alvo.value = form.chave_pix
  limparErro('chave_pix')
}

function escolherTipo(t: TipoChave) {
  if (travadoPorSaque.value || form.chave_pix_tipo === t) return
  form.chave_pix_tipo = t
  form.chave_pix = ''
  limparErro('chave_pix')
  limparErro('chave_pix_tipo')
}

/** CPF só vale com documento CPF; CNPJ só com documento CNPJ. */
function tipoIndisponivel(t: TipoChave) {
  if (t !== 'cpf' && t !== 'cnpj') return false
  return !!docInfo.value && docInfo.value.tipo !== t
}

const EMAIL_RE = /^[^\s@,;()<>]+@[^\s@,;()<>]+\.[^\s@,;()<>]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const problemas = computed(() => {
  const p: Record<string, string | null> = { nome: null, documento: null, telefone: null, chave_pix: null }
  const nome = form.nome.replace(/\s+/g, ' ').trim()
  if (nome.length >= 2 && !nome.includes(' ')) p.nome = 'Informe nome e sobrenome'
  const d = normalizarDocumento(form.documento)
  if ((d.length === 11 || d.length === 14) && !(docInfo.value && /^\d+$/.test(docInfo.value.documento))) {
    p.documento = d.length === 11 ? 'CPF inválido' : 'CNPJ inválido'
  }
  const tel = form.telefone.replace(/\D/g, '')
  if (tel.length >= 10 && !normalizarTelefoneBr(tel)) p.telefone = 'Confira o DDD e o número'
  if (form.chave_pix_tipo === 'email' && form.chave_pix.trim().length > 3 && !EMAIL_RE.test(form.chave_pix.trim())) p.chave_pix = 'E-mail inválido'
  if (form.chave_pix_tipo === 'telefone' && form.chave_pix.replace(/\D/g, '').length >= 10 && !normalizarTelefoneBr(form.chave_pix)) p.chave_pix = 'Telefone inválido'
  if (form.chave_pix_tipo === 'aleatoria' && form.chave_pix.trim().length >= 30 && !UUID_RE.test(form.chave_pix.trim().toLowerCase())) p.chave_pix = 'Chave aleatória inválida'
  if (chaveEhDocumento.value && tipoIndisponivel(form.chave_pix_tipo as TipoChave)) p.chave_pix = 'Use a chave do mesmo documento informado'
  return p
})

const podeSalvar = computed(() => {
  const nome = form.nome.replace(/\s+/g, ' ').trim()
  const doc = docInfo.value
  if (nome.length < 2 || !nome.includes(' ')) return false
  if (!doc || !/^\d+$/.test(doc.documento)) return false
  if (!normalizarTelefoneBr(form.telefone)) return false
  if (!form.chave_pix_tipo) return false
  if (chaveEhDocumento.value) {
    if (doc.tipo !== form.chave_pix_tipo) return false
  }
  else if (form.chave_pix_tipo === 'email') {
    if (!EMAIL_RE.test(form.chave_pix.trim())) return false
  }
  else if (form.chave_pix_tipo === 'telefone') {
    if (!normalizarTelefoneBr(form.chave_pix)) return false
  }
  else if (!UUID_RE.test(form.chave_pix.trim().toLowerCase())) {
    return false
  }
  return form.pix_declarado_titular
})

/** Primeiro motivo para o disquete não salvar, mostrado ao clicar. */
function motivoNaoSalva(): string {
  const nome = form.nome.replace(/\s+/g, ' ').trim()
  if (nome.length < 2 || !nome.includes(' ')) return 'Informe seu nome completo.'
  if (!docInfo.value || !/^\d+$/.test(docInfo.value.documento)) return 'Confira o CPF ou CNPJ.'
  if (!normalizarTelefoneBr(form.telefone)) return 'Confira o WhatsApp.'
  if (!form.chave_pix_tipo) return 'Escolha o tipo da chave PIX.'
  if (problemas.value.chave_pix || (!chaveEhDocumento.value && !form.chave_pix.trim())) return 'Confira a chave PIX.'
  if (!form.pix_declarado_titular) return 'Marque a declaração de que a chave PIX é sua.'
  return 'Confira os campos.'
}

async function salvar() {
  if (salvando.value) return
  if (!podeSalvar.value) {
    toast.warning(motivoNaoSalva())
    return
  }
  salvando.value = true
  erroForm.value = null
  try {
    const resp = await $fetch<{ success: boolean; campo?: string; data?: DadosAfiliado; error?: string }>('/api/afiliado/dados', {
      method: 'POST',
      headers: await useAdminAuthHeaders(),
      body: {
        nome: form.nome,
        documento: form.documento,
        telefone: form.telefone,
        chave_pix_tipo: form.chave_pix_tipo,
        chave_pix: chaveEhDocumento.value ? normalizarDocumento(form.documento) : form.chave_pix,
        pix_declarado_titular: form.pix_declarado_titular,
      },
    })
    if (!resp.success || !resp.data) {
      erroForm.value = { campo: resp.campo ?? null, mensagem: resp.error || 'Não foi possível salvar seus dados.' }
      toast.error(resp.error || 'Não foi possível salvar seus dados.')
      return
    }
    dados.value = resp.data
    preencher(resp.data)
    toast.success('Dados para receber salvos')
  }
  catch (e: any) {
    const msg = erroAfiliado(e, 'Não foi possível salvar seus dados.')
    erroForm.value = { campo: null, mensagem: msg }
    toast.error(msg)
  }
  finally {
    salvando.value = false
  }
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
const inputBase = 'w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border rounded text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed'
function borda(campo: string) {
  return erroForm.value?.campo === campo || problemas.value[campo]
    ? 'border-red-400 dark:border-red-500/60'
    : 'border-slate-200 dark:border-slate-700'
}
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 w-full">

    <div>
      <h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Dados para receber</h1>
      <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
        Para onde vai o PIX dos seus saques. A chave precisa estar no seu nome e no seu CPF/CNPJ.
      </p>
    </div>

    <div v-if="erro" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ erro }}</span>
    </div>

    <!-- Situação dos dados -->
    <div
      v-if="dados"
      class="p-4 rounded-md border text-sm flex items-start gap-2.5"
      :class="dados.completo
        ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-800 dark:text-emerald-300'
        : 'bg-amber-50 dark:bg-amber-500/10 border-amber-200 dark:border-amber-500/20 text-amber-800 dark:text-amber-300'"
    >
      <i class="fa-solid mt-0.5" :class="dados.completo ? 'fa-circle-check' : 'fa-circle-exclamation'" aria-hidden="true" />
      <span v-if="dados.completo">Dados completos. Você já pode pedir saque em Ganhos e saque.</span>
      <span v-else>Falta completar: {{ dados.faltando.join(', ') }}. Sem isso o saque fica travado.</span>
    </div>

    <div
      v-if="travadoPorSaque"
      class="p-4 rounded-md bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 text-sky-800 dark:text-sky-300 text-sm flex items-start gap-2.5"
    >
      <i class="fa-solid fa-lock mt-0.5" aria-hidden="true" />
      <span>Você tem um saque em andamento. CPF/CNPJ e chave PIX ficam travados até ele ser pago.</span>
    </div>

    <div v-if="carregando && !dados" class="grid gap-3 lg:grid-cols-2">
      <div v-for="i in 2" :key="i" :class="[cardBase, 'p-5 space-y-4']">
        <div v-for="j in 3" :key="j" class="space-y-1.5">
          <div class="h-3 w-24 rounded bg-slate-100 dark:bg-white/10 animate-pulse" />
          <div class="h-10 w-full rounded bg-slate-100 dark:bg-white/10 animate-pulse" />
        </div>
      </div>
    </div>

    <form v-else-if="dados" class="grid gap-3 lg:grid-cols-2 items-start" novalidate @submit.prevent="salvar">
      <!-- Seus dados -->
      <section :class="[cardBase, 'p-4 sm:p-5 space-y-4']">
        <p class="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
          <i class="fa-solid fa-user text-purple-500 text-xs" aria-hidden="true" />
          Seus dados
        </p>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="dd-nome" class="text-xs text-slate-600 dark:text-slate-300">Nome completo</label>
            <span v-if="problemas.nome" class="text-[11px] text-red-600 dark:text-red-400">{{ problemas.nome }}</span>
          </div>
          <input
            id="dd-nome"
            v-model="form.nome"
            type="text"
            maxlength="120"
            autocomplete="name"
            placeholder="Como está no banco"
            :class="[inputBase, borda('nome')]"
            @input="limparErro('nome')"
          >
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="dd-doc" class="text-xs text-slate-600 dark:text-slate-300">CPF ou CNPJ</label>
            <span v-if="problemas.documento" class="text-[11px] text-red-600 dark:text-red-400">{{ problemas.documento }}</span>
          </div>
          <input
            id="dd-doc"
            :value="form.documento"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            maxlength="18"
            placeholder="000.000.000-00 ou 00.000.000/0000-00"
            :disabled="travadoPorSaque"
            :class="[inputBase, borda('documento'), 'tabular-nums']"
            @input="aoDigitarDocumento"
          >
        </div>

        <div>
          <div class="flex items-center justify-between mb-1.5">
            <label for="dd-tel" class="text-xs text-slate-600 dark:text-slate-300">WhatsApp</label>
            <span v-if="problemas.telefone" class="text-[11px] text-red-600 dark:text-red-400">{{ problemas.telefone }}</span>
          </div>
          <input
            id="dd-tel"
            :value="form.telefone"
            type="text"
            inputmode="tel"
            autocomplete="tel-national"
            maxlength="16"
            placeholder="(11) 99999-9999"
            :class="[inputBase, borda('telefone'), 'tabular-nums']"
            @input="aoDigitarTelefone"
          >
        </div>

        <div>
          <p class="text-xs text-slate-600 dark:text-slate-300 mb-1.5">E-mail de acesso</p>
          <p class="px-3.5 py-2.5 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-white/[0.02] text-sm text-slate-500 dark:text-slate-400 truncate">
            {{ dados.email }}
          </p>
        </div>
      </section>

      <!-- Chave PIX -->
      <section :class="[cardBase, 'p-4 sm:p-5 space-y-4']">
        <p class="text-sm font-medium text-slate-900 dark:text-white flex items-center gap-2">
          <i class="fa-solid fa-money-bill-transfer text-purple-500 text-xs" aria-hidden="true" />
          Chave PIX
        </p>

        <div>
          <p class="text-xs text-slate-600 dark:text-slate-300 mb-1.5">Tipo da chave PIX</p>
          <div class="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo da chave PIX">
            <button
              v-for="t in TIPOS"
              :key="t.id"
              type="button"
              role="radio"
              :aria-checked="form.chave_pix_tipo === t.id"
              :disabled="travadoPorSaque || tipoIndisponivel(t.id)"
              :title="tipoIndisponivel(t.id) ? 'A chave precisa ser do mesmo documento informado em Seus dados' : undefined"
              class="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-normal border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              :class="form.chave_pix_tipo === t.id
                ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
                : 'border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-300 hover:border-purple-300 dark:hover:border-purple-500/40'"
              @click="escolherTipo(t.id)"
            >
              <i class="fa-solid text-[10px]" :class="t.icone" aria-hidden="true" />
              {{ t.label }}
            </button>
          </div>
        </div>

        <div v-if="form.chave_pix_tipo">
          <div class="flex items-center justify-between mb-1.5">
            <label for="dd-chave" class="text-xs text-slate-600 dark:text-slate-300">Chave PIX</label>
            <span v-if="problemas.chave_pix" class="text-[11px] text-red-600 dark:text-red-400">{{ problemas.chave_pix }}</span>
          </div>
          <input
            v-if="chaveEhDocumento"
            id="dd-chave"
            :value="form.documento"
            type="text"
            disabled
            :class="[inputBase, borda('chave_pix'), 'tabular-nums']"
          >
          <input
            v-else
            id="dd-chave"
            :value="form.chave_pix"
            :type="form.chave_pix_tipo === 'email' ? 'email' : 'text'"
            :inputmode="form.chave_pix_tipo === 'telefone' ? 'tel' : undefined"
            autocomplete="off"
            :maxlength="form.chave_pix_tipo === 'telefone' ? 16 : 77"
            :placeholder="form.chave_pix_tipo === 'email' ? 'voce@exemplo.com' : form.chave_pix_tipo === 'telefone' ? '(11) 99999-9999' : '00000000-0000-0000-0000-000000000000'"
            :disabled="travadoPorSaque"
            :class="[inputBase, borda('chave_pix'), form.chave_pix_tipo === 'aleatoria' ? 'font-mono text-xs' : '']"
            @input="aoDigitarChave"
          >
          <p v-if="chaveEhDocumento" class="text-[11px] text-slate-400 mt-1">
            Chave {{ form.chave_pix_tipo === 'cpf' ? 'CPF' : 'CNPJ' }} é sempre o documento informado em Seus dados.
          </p>
        </div>

        <label
          class="flex items-start gap-2.5 p-3 rounded border cursor-pointer transition-colors"
          :class="erroForm?.campo === 'pix_declarado_titular'
            ? 'border-red-400 dark:border-red-500/60'
            : 'border-slate-200 dark:border-white/10 hover:border-purple-300 dark:hover:border-purple-500/40'"
        >
          <input
            v-model="form.pix_declarado_titular"
            type="checkbox"
            class="mt-0.5 w-4 h-4 rounded border-slate-300 dark:border-slate-600 text-purple-600 focus:ring-purple-500"
            @change="limparErro('pix_declarado_titular')"
          >
          <span class="text-sm text-slate-700 dark:text-slate-200">Declaro que a chave PIX está no meu nome e no meu CPF/CNPJ.</span>
        </label>

        <p class="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
          <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
          <span>Chave de terceiros é recusada. O PIX do saque cai em até 48 horas.</span>
        </p>

        <div
          v-if="erroForm"
          class="p-3 rounded bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-start gap-2"
          role="alert"
        >
          <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
          <span>{{ erroForm.mensagem }}</span>
        </div>
      </section>
    </form>

    <!-- Salvar: disquete verde flutuante, só com alteração -->
    <Transition name="scale">
      <button
        v-if="alterado || salvando"
        type="button"
        :disabled="salvando"
        class="fixed bottom-6 right-6 z-40 w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/30 transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        :title="salvando ? 'Salvando…' : 'Salvar dados para receber'"
        :aria-label="salvando ? 'Salvando' : 'Salvar dados para receber'"
        @click="salvar"
      >
        <span v-if="salvando" class="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        <i v-else class="fa-solid fa-floppy-disk text-lg" aria-hidden="true" />
        <span
          v-if="alterado && !salvando"
          class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-orange-500 border-2 border-white dark:border-slate-900 rounded-full animate-ping"
          aria-hidden="true"
        />
        <span
          v-if="alterado && !salvando"
          class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-orange-500 border-2 border-white dark:border-slate-900 rounded-full"
          aria-hidden="true"
        />
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.scale-enter-active,
.scale-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.scale-enter-from,
.scale-leave-to {
  transform: scale(0.9);
  opacity: 0;
}
</style>
