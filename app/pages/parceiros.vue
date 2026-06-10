<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

interface ParceiroResumoAdmin {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  ativo: boolean
  pix: { tipo: string; chave: string; titular_nome: string; titular_documento: string | null } | null
  saldos: { aLiberar: number; liberado: number; repassado: number; estornado: number }
}

interface LancamentoAdmin {
  id: string
  parceiro_id: string
  parceiro_nome: string
  empresa_nome: string
  origem: 'manual' | 'stripe' | 'ajuste'
  valor_base: number
  valor_comissao: number
  pago_em: string
  liberar_em: string
  repassado_em: string | null
  observacao: string | null
  status: 'a_liberar' | 'liberado' | 'estornado' | 'repassado'
}

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const abaAtiva = ref<'comissoes' | 'aulas' | 'materiais'>('comissoes')
const parceiros = ref<ParceiroResumoAdmin[]>([])
const lancamentos = ref<LancamentoAdmin[]>([])
const aulasCount = ref(0)
const materiaisCount = ref(0)
const loading = ref(true)
const isRefreshing = ref(false)

// ───────── Carregamento ─────────
async function loadResumo() {
  try {
    const resp = await $fetch<{ success: boolean; data?: { parceiros: ParceiroResumoAdmin[]; lancamentos: LancamentoAdmin[] }; error?: string }>(
      '/api/admin/parceiros/resumo',
      { headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    parceiros.value = resp.data.parceiros
    lancamentos.value = resp.data.lancamentos
  } catch {
    toast?.error('Erro ao carregar parceiros')
  }
}

async function refreshAll() {
  isRefreshing.value = true
  await loadResumo()
  isRefreshing.value = false
}

onMounted(async () => {
  toast = await useToastSafe()
  loading.value = true
  await loadResumo()
  loading.value = false
})

// ───────── Helpers ─────────
function formatBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0)
}
function formatDateStr(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function lancamentoStatusBadge(l: LancamentoAdmin) {
  if (l.status === 'a_liberar') return { label: `A liberar ${formatDateStr(l.liberar_em)}`, cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' }
  if (l.status === 'liberado') return { label: 'Liberado', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' }
  if (l.status === 'repassado') return { label: `Pago ${formatDateStr(l.repassado_em)}`, cls: 'bg-slate-100 dark:bg-slate-500/15 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-500/20' }
  return { label: 'Estornado', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20' }
}

function origemLabel(origem: string) {
  if (origem === 'stripe') return 'Cartão'
  if (origem === 'ajuste') return 'Ajuste'
  return 'PIX/Manual'
}

// ───────── Credenciais do parceiro recém-criado ─────────
const credenciaisCriadas = ref<{ nome: string; email: string; senha: string } | null>(null)
const credCopiada = ref<string | null>(null)

async function copiarCredencial(tipo: 'email' | 'senha' | 'tudo') {
  if (!credenciaisCriadas.value) return
  const { email, senha } = credenciaisCriadas.value
  const texto = tipo === 'email' ? email : tipo === 'senha' ? senha : `Login: ${email}\nSenha: ${senha}`
  try {
    await navigator.clipboard.writeText(texto)
    credCopiada.value = tipo
    setTimeout(() => { if (credCopiada.value === tipo) credCopiada.value = null }, 2000)
  } catch {
    toast?.error('Não foi possível copiar')
  }
}

// ───────── Copiar chave PIX ─────────
const pixCopiado = ref<string | null>(null)
async function copiarPix(p: ParceiroResumoAdmin) {
  if (!p.pix?.chave) return
  try {
    await navigator.clipboard.writeText(p.pix.chave)
    pixCopiado.value = p.id
    setTimeout(() => { if (pixCopiado.value === p.id) pixCopiado.value = null }, 2000)
  } catch {
    toast?.error('Não foi possível copiar a chave')
  }
}

// ───────── Cadastrar / Editar parceiro ─────────
const showParceiroModal = ref(false)
const parceiroEdit = ref<ParceiroResumoAdmin | null>(null)
const formNome = ref('')
const formEmail = ref('')
const formTelefone = ref('')
const formDocumento = ref('')
const formObservacoes = ref('')
const formSenha = ref('')
const mostrarSenha = ref(false)
const savingParceiro = ref(false)

function abrirNovoParceiro() {
  parceiroEdit.value = null
  formNome.value = ''
  formEmail.value = ''
  formTelefone.value = ''
  formDocumento.value = ''
  formObservacoes.value = ''
  formSenha.value = ''
  mostrarSenha.value = false
  showParceiroModal.value = true
}

function abrirEditarParceiro(p: ParceiroResumoAdmin) {
  parceiroEdit.value = p
  formNome.value = p.nome
  formEmail.value = p.email || ''
  formTelefone.value = p.telefone || ''
  formDocumento.value = ''
  formObservacoes.value = ''
  formSenha.value = ''
  showParceiroModal.value = true
}

async function salvarParceiro() {
  if (formNome.value.trim().length < 3 || savingParceiro.value) return
  if (!parceiroEdit.value && formSenha.value && formSenha.value.length < 6) {
    toast?.warning('A senha precisa ter pelo menos 6 caracteres')
    return
  }
  savingParceiro.value = true
  try {
    const resp = await $fetch<{ success: boolean; data?: { loginVinculado: boolean; contaCriada: boolean }; error?: string }>(
      '/api/admin/parceiros/salvar',
      {
        method: 'POST',
        body: {
          id: parceiroEdit.value?.id,
          nome: formNome.value,
          email: formEmail.value,
          telefone: formTelefone.value,
          documento: formDocumento.value,
          observacoes: formObservacoes.value,
          senha: !parceiroEdit.value && formSenha.value ? formSenha.value : undefined,
        },
        headers: await useAdminAuthHeaders(),
      },
    )
    if (!resp.success) throw new Error(resp.error || 'Erro')
    if (parceiroEdit.value) {
      toast?.success('Parceiro atualizado')
    } else if (resp.data?.contaCriada) {
      // Guarda as credenciais para o modal de copiar e enviar ao parceiro
      credenciaisCriadas.value = {
        nome: formNome.value.trim(),
        email: formEmail.value.trim().toLowerCase(),
        senha: formSenha.value,
      }
      toast?.success('Parceiro cadastrado e conta de acesso criada!')
    } else if (resp.data?.loginVinculado) {
      toast?.success('Parceiro cadastrado e vinculado à conta Agzap existente desse email.')
    } else {
      toast?.warning('Parceiro cadastrado sem acesso — informe email e senha para criar o login dele.')
    }
    showParceiroModal.value = false
    await loadResumo()
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao salvar parceiro')
  } finally {
    savingParceiro.value = false
  }
}

// ───────── Ajustar saldo ─────────
const showAjusteModal = ref(false)
const parceiroAjuste = ref<ParceiroResumoAdmin | null>(null)
const ajusteTipo = ref<'adicionar' | 'remover'>('adicionar')
const ajusteValor = ref<number | null>(null)
const ajusteObs = ref('')
const savingAjuste = ref(false)

function abrirAjuste(p: ParceiroResumoAdmin, tipo: 'adicionar' | 'remover') {
  parceiroAjuste.value = p
  ajusteTipo.value = tipo
  ajusteValor.value = null
  ajusteObs.value = ''
  showAjusteModal.value = true
}

async function salvarAjuste() {
  if (!parceiroAjuste.value || !ajusteValor.value || ajusteValor.value <= 0 || savingAjuste.value) return
  savingAjuste.value = true
  try {
    const valor = ajusteTipo.value === 'remover' ? -Math.abs(ajusteValor.value) : Math.abs(ajusteValor.value)
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/parceiros/ajustar-saldo', {
      method: 'POST',
      body: { parceiroId: parceiroAjuste.value.id, valor, observacao: ajusteObs.value || undefined },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success(ajusteTipo.value === 'adicionar' ? 'Saldo adicionado' : 'Saldo removido')
    showAjusteModal.value = false
    await loadResumo()
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao ajustar saldo')
  } finally {
    savingAjuste.value = false
  }
}

// ───────── Ações com confirmação (bloquear / excluir / repasse) ─────────
const acaoConfirm = ref<{ tipo: 'bloquear' | 'desbloquear' | 'excluir' | 'repassar'; parceiro: ParceiroResumoAdmin } | null>(null)

const confirmConfig = computed(() => {
  const a = acaoConfirm.value
  if (!a) return null
  const map = {
    bloquear: { title: 'Bloquear parceiro', message: 'O parceiro perde o acesso ao portal e deixa de ver os clientes. Deseja bloquear', label: 'Bloquear', variant: 'warning' as const },
    desbloquear: { title: 'Desbloquear parceiro', message: 'O parceiro volta a ter acesso ao portal. Deseja desbloquear', label: 'Desbloquear', variant: 'info' as const },
    excluir: { title: 'Excluir parceiro', message: 'TODOS os vínculos e o extrato de comissões serão apagados permanentemente. Deseja excluir', label: 'Excluir', variant: 'danger' as const },
    repassar: { title: 'Pagamento realizado', message: `Confirma que pagou ${formatBRL(a.parceiro.saldos.liberado)} ao parceiro? O saldo liberado será zerado (o saldo a liberar continua correndo o prazo normalmente). Parceiro:`, label: 'Confirmar pagamento', variant: 'info' as const },
  }
  return map[a.tipo]
})

async function executarAcaoConfirm() {
  const a = acaoConfirm.value
  if (!a) return
  try {
    if (a.tipo === 'repassar') {
      const resp = await $fetch<{ success: boolean; data?: { quantidade: number; total: number }; error?: string }>(
        '/api/admin/parceiros/repassar',
        { method: 'POST', body: { parceiroId: a.parceiro.id }, headers: await useAdminAuthHeaders() },
      )
      if (!resp.success) throw new Error(resp.error || 'Erro')
      toast?.success(`Repasse registrado: ${formatBRL(resp.data?.total || 0)} (${resp.data?.quantidade || 0} lançamentos)`)
    } else if (a.tipo === 'excluir') {
      const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/parceiros/excluir', {
        method: 'POST', body: { parceiroId: a.parceiro.id }, headers: await useAdminAuthHeaders(),
      })
      if (!resp.success) throw new Error(resp.error || 'Erro')
      toast?.success('Parceiro excluído')
    } else {
      const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/parceiros/status', {
        method: 'POST', body: { parceiroId: a.parceiro.id, ativo: a.tipo === 'desbloquear' }, headers: await useAdminAuthHeaders(),
      })
      if (!resp.success) throw new Error(resp.error || 'Erro')
      toast?.success(a.tipo === 'bloquear' ? 'Parceiro bloqueado' : 'Parceiro desbloqueado')
    }
    await loadResumo()
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao executar ação')
  } finally {
    acaoConfirm.value = null
  }
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-10">
    <div class="max-w-[1400px] mx-auto space-y-6">

      <!-- Header -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Parceiros</h1>
          <p class="text-slate-500 dark:text-slate-400 text-sm">Comissões, repasses e conteúdo do portal do parceiro.</p>
        </div>
        <div class="flex items-center gap-2">
          <button
            @click="abrirNovoParceiro"
            class="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded text-sm font-semibold transition-colors"
            type="button"
          >
            <i class="fa-solid fa-user-plus text-teal-600 dark:text-teal-400" aria-hidden="true" />
            <span>Novo parceiro</span>
          </button>
          <button
            @click="refreshAll"
            :disabled="isRefreshing"
            class="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-semibold transition-colors"
            type="button"
          >
            <i class="fa-solid fa-arrows-rotate" :class="{ 'animate-spin': isRefreshing }" aria-hidden="true" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <!-- Abas -->
      <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-lg w-full sm:w-fit" role="tablist">
        <button
          type="button" role="tab" :aria-selected="abaAtiva === 'comissoes'"
          @click="abaAtiva = 'comissoes'"
          class="flex-1 sm:flex-initial px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          :class="abaAtiva === 'comissoes' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
        >
          <i class="fa-solid fa-sack-dollar text-emerald-500" aria-hidden="true" />
          Comissões
        </button>
        <button
          type="button" role="tab" :aria-selected="abaAtiva === 'aulas'"
          @click="abaAtiva = 'aulas'"
          class="flex-1 sm:flex-initial px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          :class="abaAtiva === 'aulas' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
        >
          <i class="fa-solid fa-graduation-cap text-purple-500" aria-hidden="true" />
          Aulas
          <span class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">{{ aulasCount }}</span>
        </button>
        <button
          type="button" role="tab" :aria-selected="abaAtiva === 'materiais'"
          @click="abaAtiva = 'materiais'"
          class="flex-1 sm:flex-initial px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          :class="abaAtiva === 'materiais' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
        >
          <i class="fa-solid fa-box-open text-emerald-500" aria-hidden="true" />
          Materiais
          <span class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-bold tabular-nums bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400">{{ materiaisCount }}</span>
        </button>
      </div>

      <!-- ══════════════ ABA COMISSÕES ══════════════ -->
      <template v-if="abaAtiva === 'comissoes'">

        <!-- Loading -->
        <div v-if="loading" class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div v-for="i in 2" :key="i" class="h-48 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse border border-slate-200 dark:border-white/5" />
        </div>

        <!-- Empty -->
        <div v-else-if="parceiros.length === 0" :class="['px-5 py-14 text-center', cardBase]">
          <i class="fa-solid fa-handshake text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
          <p class="text-slate-600 dark:text-slate-400 text-sm font-medium">Nenhum parceiro cadastrado</p>
          <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">Clique em "Novo parceiro" para começar.</p>
        </div>

        <!-- Cards de parceiros -->
        <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div
            v-for="p in parceiros"
            :key="p.id"
            :class="['p-5', cardBase, !p.ativo ? 'opacity-70' : '']"
          >
            <!-- Cabeçalho do parceiro -->
            <div class="flex items-start justify-between gap-3 mb-4">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white" :class="p.ativo ? 'bg-teal-600' : 'bg-slate-400 dark:bg-slate-600'">
                  {{ p.nome.charAt(0).toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <p class="font-semibold text-slate-900 dark:text-white truncate">{{ p.nome }}</p>
                    <span v-if="!p.ativo" class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400">
                      <i class="fa-solid fa-ban" aria-hidden="true" />
                      Bloqueado
                    </span>
                  </div>
                  <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ p.email || 'sem email' }}</p>
                  <p v-if="p.pix" class="text-xs text-slate-400 dark:text-slate-600 mt-0.5 flex items-center gap-1 min-w-0">
                    <i class="fa-brands fa-pix text-emerald-500 text-[10px] shrink-0" aria-hidden="true" />
                    <span class="truncate">{{ p.pix.chave }} · {{ p.pix.titular_nome }}</span>
                    <button
                      @click="copiarPix(p)"
                      class="shrink-0 w-5 h-5 inline-flex items-center justify-center rounded transition-colors"
                      :class="pixCopiado === p.id ? 'text-emerald-500' : 'text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
                      :title="pixCopiado === p.id ? 'Copiado!' : 'Copiar chave PIX'"
                      :aria-label="pixCopiado === p.id ? 'Chave copiada' : 'Copiar chave PIX'"
                      type="button"
                    >
                      <i class="fa-solid text-[10px]" :class="pixCopiado === p.id ? 'fa-check' : 'fa-copy'" aria-hidden="true" />
                    </button>
                  </p>
                  <p v-else class="text-xs text-slate-400 dark:text-slate-600 italic mt-0.5">PIX não configurado</p>
                </div>
              </div>

              <!-- Ações do parceiro -->
              <div class="flex items-center gap-1 shrink-0">
                <button @click="abrirEditarParceiro(p)" class="w-8 h-8 flex items-center justify-center rounded hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors" title="Editar parceiro" type="button">
                  <i class="fa-solid fa-pen-to-square text-sm" aria-hidden="true" />
                </button>
                <button @click="abrirAjuste(p, 'adicionar')" class="w-8 h-8 flex items-center justify-center rounded hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors" title="Adicionar saldo" type="button">
                  <i class="fa-solid fa-circle-plus text-sm" aria-hidden="true" />
                </button>
                <button @click="abrirAjuste(p, 'remover')" class="w-8 h-8 flex items-center justify-center rounded hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-colors" title="Remover saldo" type="button">
                  <i class="fa-solid fa-circle-minus text-sm" aria-hidden="true" />
                </button>
                <button
                  @click="acaoConfirm = { tipo: p.ativo ? 'bloquear' : 'desbloquear', parceiro: p }"
                  class="w-8 h-8 flex items-center justify-center rounded transition-colors"
                  :class="p.ativo ? 'hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'"
                  :title="p.ativo ? 'Bloquear parceiro' : 'Desbloquear parceiro'"
                  type="button"
                >
                  <i class="fa-solid text-sm" :class="p.ativo ? 'fa-lock' : 'fa-lock-open'" aria-hidden="true" />
                </button>
                <button @click="acaoConfirm = { tipo: 'excluir', parceiro: p }" class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors" title="Excluir parceiro" type="button">
                  <i class="fa-solid fa-trash text-sm" aria-hidden="true" />
                </button>
              </div>
            </div>

            <!-- Saldos -->
            <div class="grid grid-cols-3 gap-2">
              <div class="rounded border border-amber-200 dark:border-amber-500/15 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
                <p class="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wider">A liberar</p>
                <p class="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{{ formatBRL(p.saldos.aLiberar) }}</p>
              </div>
              <div class="rounded border border-emerald-200 dark:border-emerald-500/15 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2">
                <p class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider">Liberado</p>
                <p class="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{{ formatBRL(p.saldos.liberado) }}</p>
              </div>
              <div class="rounded border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] px-3 py-2">
                <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Já pago</p>
                <p class="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">{{ formatBRL(p.saldos.repassado) }}</p>
              </div>
            </div>

            <!-- Pagamento realizado -->
            <button
              v-if="p.saldos.liberado > 0"
              @click="acaoConfirm = { tipo: 'repassar', parceiro: p }"
              class="mt-3 w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded text-sm font-semibold transition-colors"
              type="button"
            >
              <i class="fa-solid fa-money-bill-transfer" aria-hidden="true" />
              Pagamento realizado · {{ formatBRL(p.saldos.liberado) }}
            </button>
          </div>
        </div>

        <!-- Extrato geral -->
        <section v-if="!loading">
          <div class="flex items-center gap-2 mb-4 mt-2">
            <div class="w-4 h-4 rounded flex items-center justify-center bg-emerald-500/20">
              <i class="fa-solid fa-receipt text-emerald-600 dark:text-emerald-400 text-xs" aria-hidden="true" />
            </div>
            <h2 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Extrato de Comissões</h2>
            <span v-if="lancamentos.length > 0" class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">{{ lancamentos.length }}</span>
          </div>

          <div :class="['overflow-hidden', cardBase]">
            <div v-if="lancamentos.length === 0" class="px-5 py-10 text-center">
              <i class="fa-solid fa-receipt text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
              <p class="text-slate-500 text-sm">Nenhum lançamento ainda</p>
              <p class="text-slate-400 dark:text-slate-600 text-xs mt-1">Sinalize pagamentos na página de Clientes ou aguarde a sincronização do Stripe.</p>
            </div>
            <div v-else class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead>
                  <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
                    <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Pagamento</th>
                    <th class="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Parceiro</th>
                    <th class="hidden lg:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Origem</th>
                    <th class="hidden sm:table-cell text-right px-5 py-3 text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Valor</th>
                    <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Comissão</th>
                    <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-slate-100 dark:divide-white/5">
                  <tr v-for="l in lancamentos" :key="l.id" class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors" :class="{ 'opacity-60': l.status === 'estornado' }">
                    <td class="px-3 sm:px-5 py-3">
                      <p class="text-sm font-medium text-slate-800 dark:text-white truncate max-w-[160px]" :title="l.observacao || undefined">
                        {{ l.origem === 'ajuste' ? 'Ajuste de saldo' : l.empresa_nome }}
                      </p>
                      <p class="text-xs text-slate-500 mt-0.5">{{ formatDateStr(l.pago_em) }}</p>
                    </td>
                    <td class="hidden md:table-cell px-5 py-3 text-slate-600 dark:text-slate-400 text-xs truncate max-w-[140px]">{{ l.parceiro_nome }}</td>
                    <td class="hidden lg:table-cell px-5 py-3 text-slate-600 dark:text-slate-400 text-xs">{{ origemLabel(l.origem) }}</td>
                    <td class="hidden sm:table-cell px-5 py-3 text-right text-slate-700 dark:text-slate-300 tabular-nums text-xs sm:text-sm whitespace-nowrap">
                      {{ l.origem === 'ajuste' ? '—' : formatBRL(l.valor_base) }}
                    </td>
                    <td class="px-3 sm:px-5 py-3 text-right">
                      <span class="font-semibold tabular-nums text-xs sm:text-sm whitespace-nowrap" :class="l.status === 'estornado' ? 'text-slate-400 dark:text-slate-600 line-through' : l.valor_comissao < 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'">
                        {{ formatBRL(l.valor_comissao) }}
                      </span>
                    </td>
                    <td class="px-3 sm:px-5 py-3">
                      <span class="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-full text-[10px] sm:text-xs font-medium border whitespace-nowrap" :class="lancamentoStatusBadge(l).cls">
                        <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                        {{ lancamentoStatusBadge(l).label }}
                      </span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </template>

      <!-- ══════════════ ABA AULAS ══════════════ -->
      <div v-show="abaAtiva === 'aulas'">
        <AdminAulasManager @count-change="aulasCount = $event" />
      </div>

      <!-- ══════════════ ABA MATERIAIS ══════════════ -->
      <div v-show="abaAtiva === 'materiais'">
        <AdminMateriaisManager @count-change="materiaisCount = $event" />
      </div>

      <!-- ══════════════ MODAIS ══════════════ -->

      <!-- Cadastrar/editar parceiro -->
      <BaseModal :show="showParceiroModal" :title="parceiroEdit ? 'Editar parceiro' : 'Novo parceiro'" max-width="max-w-md" @close="showParceiroModal = false">
        <form @submit.prevent="salvarParceiro" class="space-y-4">
          <div>
            <label for="p-nome" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Nome</label>
            <input id="p-nome" v-model="formNome" type="text" required placeholder="Nome completo"
              class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="p-email" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Email (login)</label>
              <input id="p-email" v-model="formEmail" type="email" placeholder="email@exemplo.com"
                class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
            <div>
              <label for="p-tel" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Telefone</label>
              <input id="p-tel" v-model="formTelefone" type="tel" placeholder="(11) 99999-9999"
                class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
            </div>
          </div>
          <div>
            <label for="p-doc" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Documento (CPF/CNPJ) <span class="font-normal text-slate-400">(opcional)</span></label>
            <input id="p-doc" v-model="formDocumento" type="text"
              class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label for="p-obs" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Observações <span class="font-normal text-slate-400">(opcional)</span></label>
            <input id="p-obs" v-model="formObservacoes" type="text"
              class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>

          <!-- Senha de acesso (somente no cadastro) -->
          <div v-if="!parceiroEdit">
            <label for="p-senha" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
              <i class="fa-solid fa-key text-amber-500 text-xs" aria-hidden="true" />
              Senha de acesso
            </label>
            <div class="relative">
              <input
                id="p-senha"
                v-model="formSenha"
                :type="mostrarSenha ? 'text' : 'password'"
                minlength="6"
                placeholder="Mínimo 6 caracteres"
                autocomplete="new-password"
                class="w-full pl-4 pr-11 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
              <button
                type="button"
                @click="mostrarSenha = !mostrarSenha"
                class="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                :aria-label="mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'"
              >
                <i class="fa-solid text-sm" :class="mostrarSenha ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" />
              </button>
            </div>
            <p class="text-xs text-slate-400 dark:text-slate-600 mt-1.5 flex items-start gap-1.5">
              <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
              <span>Cria a conta do parceiro (mesmo login do app Agzap). Se o email já tiver conta, a senha é ignorada e o login existente é vinculado.</span>
            </p>
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" @click="showParceiroModal = false" :disabled="savingParceiro"
              class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" :disabled="formNome.trim().length < 3 || savingParceiro"
              class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors flex items-center justify-center gap-2">
              <i v-if="savingParceiro" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
              {{ savingParceiro ? 'Salvando…' : (parceiroEdit ? 'Atualizar' : 'Cadastrar') }}
            </button>
          </div>
        </form>
      </BaseModal>

      <!-- Ajustar saldo -->
      <BaseModal :show="showAjusteModal" :title="ajusteTipo === 'adicionar' ? 'Adicionar saldo' : 'Remover saldo'" max-width="max-w-sm" @close="showAjusteModal = false">
        <form @submit.prevent="salvarAjuste" class="space-y-4">
          <div class="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
            <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0" :class="ajusteTipo === 'adicionar' ? 'bg-emerald-100 dark:bg-emerald-500/20' : 'bg-amber-100 dark:bg-amber-500/20'">
              <i class="fa-solid text-sm" :class="ajusteTipo === 'adicionar' ? 'fa-circle-plus text-emerald-600 dark:text-emerald-400' : 'fa-circle-minus text-amber-600 dark:text-amber-400'" aria-hidden="true" />
            </div>
            <div>
              <p class="font-semibold text-slate-900 dark:text-white text-sm">{{ parceiroAjuste?.nome }}</p>
              <p class="text-xs text-slate-500">Saldo liberado atual: {{ formatBRL(parceiroAjuste?.saldos.liberado ?? 0) }}</p>
            </div>
          </div>
          <div>
            <label for="ajuste-valor" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Valor</label>
            <AppCurrencyInput id="ajuste-valor" v-model="ajusteValor" required
              class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500" />
            <p class="text-xs text-slate-400 dark:text-slate-600 mt-1">
              {{ ajusteTipo === 'adicionar' ? 'Entra direto no saldo liberado do parceiro.' : 'Desconta direto do saldo liberado do parceiro.' }}
            </p>
          </div>
          <div>
            <label for="ajuste-obs" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Motivo <span class="font-normal text-slate-400">(opcional)</span></label>
            <input id="ajuste-obs" v-model="ajusteObs" type="text" placeholder="Ex.: bônus de indicação"
              class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div class="flex gap-2 pt-1">
            <button type="button" @click="showAjusteModal = false" :disabled="savingAjuste"
              class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors">
              Cancelar
            </button>
            <button type="submit" :disabled="!ajusteValor || ajusteValor <= 0 || savingAjuste"
              class="flex-1 px-4 py-2.5 rounded font-semibold text-sm text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              :class="ajusteTipo === 'adicionar' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-amber-600 hover:bg-amber-700'">
              <i v-if="savingAjuste" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
              {{ savingAjuste ? 'Salvando…' : (ajusteTipo === 'adicionar' ? 'Adicionar' : 'Remover') }}
            </button>
          </div>
        </form>
      </BaseModal>

      <!-- Credenciais do parceiro criado -->
      <BaseModal :show="!!credenciaisCriadas" title="Conta criada com sucesso" max-width="max-w-md" @close="credenciaisCriadas = null">
        <div class="space-y-4">
          <div class="flex items-center gap-3 pb-1">
            <div class="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 flex items-center justify-center shrink-0">
              <i class="fa-solid fa-user-check text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
            </div>
            <p class="text-sm text-slate-600 dark:text-slate-400">
              Acesso de <strong class="text-slate-900 dark:text-white">{{ credenciaisCriadas?.nome }}</strong> pronto — copie e envie para o parceiro. Ele já pode entrar, sem confirmação de email.
            </p>
          </div>

          <!-- Email -->
          <div class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Email (login)</p>
              <p class="text-sm font-medium text-slate-900 dark:text-white truncate">{{ credenciaisCriadas?.email }}</p>
            </div>
            <button
              @click="copiarCredencial('email')"
              class="shrink-0 w-9 h-9 flex items-center justify-center rounded transition-colors"
              :class="credCopiada === 'email' ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
              :title="credCopiada === 'email' ? 'Copiado!' : 'Copiar email'"
              type="button"
            >
              <i class="fa-solid text-sm" :class="credCopiada === 'email' ? 'fa-check' : 'fa-copy'" aria-hidden="true" />
            </button>
          </div>

          <!-- Senha -->
          <div class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 px-4 py-3 flex items-center justify-between gap-3">
            <div class="min-w-0">
              <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Senha</p>
              <p class="text-sm font-medium text-slate-900 dark:text-white font-mono truncate">{{ credenciaisCriadas?.senha }}</p>
            </div>
            <button
              @click="copiarCredencial('senha')"
              class="shrink-0 w-9 h-9 flex items-center justify-center rounded transition-colors"
              :class="credCopiada === 'senha' ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-500/10' : 'text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-800'"
              :title="credCopiada === 'senha' ? 'Copiado!' : 'Copiar senha'"
              type="button"
            >
              <i class="fa-solid text-sm" :class="credCopiada === 'senha' ? 'fa-check' : 'fa-copy'" aria-hidden="true" />
            </button>
          </div>

          <p class="text-xs text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
            <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
            <span>A senha não fica visível depois que este modal for fechado — copie agora.</span>
          </p>

          <div class="flex gap-2 pt-1">
            <button
              type="button"
              @click="copiarCredencial('tudo')"
              class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors flex items-center justify-center gap-2"
            >
              <i class="fa-solid text-xs" :class="credCopiada === 'tudo' ? 'fa-check text-emerald-500' : 'fa-copy'" aria-hidden="true" />
              {{ credCopiada === 'tudo' ? 'Copiado!' : 'Copiar login e senha' }}
            </button>
            <button
              type="button"
              @click="credenciaisCriadas = null"
              class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors"
            >
              Concluir
            </button>
          </div>
        </div>
      </BaseModal>

      <!-- Confirmações (bloquear / desbloquear / excluir / repasse) -->
      <AdminConfirmacaoModal
        :show="!!acaoConfirm"
        :title="confirmConfig?.title || ''"
        :message="confirmConfig?.message || ''"
        :cliente-nome="acaoConfirm?.parceiro.nome"
        :confirm-label="confirmConfig?.label"
        :variant="confirmConfig?.variant"
        @close="acaoConfirm = null"
        @confirm="executarAcaoConfirm"
      />

    </div>
  </div>
</template>
