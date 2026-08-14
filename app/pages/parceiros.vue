<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

/**
 * Gestão do Programa de Parceria — modelo único de licenças pré-pagas.
 * O cadastro de parceiros vive aqui; saldo, créditos e carteira ficam no
 * AdminLicencasManager, que carrega os próprios dados.
 */
export interface ParceiroAdmin {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  ativo: boolean
}

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const abaAtiva = ref<'licencas' | 'materiais'>('licencas')
const materiaisCount = ref(0)
const isRefreshing = ref(false)

const licencasRef = ref<{ carregar: () => Promise<void> } | null>(null)

async function recarregarLicencas() {
  await licencasRef.value?.carregar()
}

async function refreshAll() {
  isRefreshing.value = true
  await recarregarLicencas()
  isRefreshing.value = false
}

onMounted(async () => {
  toast = await useToastSafe()
})

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

// ───────── Cadastrar / Editar parceiro ─────────
const showParceiroModal = ref(false)
const parceiroEdit = ref<ParceiroAdmin | null>(null)
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

function abrirEditarParceiro(p: ParceiroAdmin) {
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
    await recarregarLicencas()
  } catch (err: any) {
    toast?.error(err?.data?.statusMessage || err?.message || 'Erro ao salvar parceiro')
  } finally {
    savingParceiro.value = false
  }
}

// ───────── Ações com confirmação (bloquear / excluir) ─────────
const acaoConfirm = ref<{ tipo: 'bloquear' | 'desbloquear' | 'excluir'; parceiro: ParceiroAdmin } | null>(null)

const confirmConfig = computed(() => {
  const a = acaoConfirm.value
  if (!a) return null
  const map = {
    bloquear: { title: 'Suspender parceiro', message: 'O parceiro perde o acesso ao portal e deixa de ver os clientes dele. O saldo de créditos é preservado. Deseja suspender', label: 'Suspender', variant: 'warning' as const },
    desbloquear: { title: 'Reativar parceiro', message: 'O parceiro volta a ter acesso ao portal e às ações da carteira dele. Deseja reativar', label: 'Reativar', variant: 'info' as const },
    excluir: { title: 'Excluir parceiro', message: 'TODOS os vínculos, créditos e o histórico dele serão apagados permanentemente. Deseja excluir', label: 'Excluir', variant: 'danger' as const },
  }
  return map[a.tipo]
})

function pedirConfirmacao(tipo: 'bloquear' | 'desbloquear' | 'excluir', parceiro: ParceiroAdmin) {
  acaoConfirm.value = { tipo, parceiro }
}

async function executarAcaoConfirm() {
  const a = acaoConfirm.value
  if (!a) return
  try {
    if (a.tipo === 'excluir') {
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
      toast?.success(a.tipo === 'bloquear' ? 'Parceiro suspenso' : 'Parceiro reativado')
    }
    await recarregarLicencas()
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
          <p class="text-slate-500 dark:text-slate-400 text-sm">Licenças, créditos e conteúdo do portal do parceiro.</p>
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
          type="button" role="tab" :aria-selected="abaAtiva === 'licencas'"
          @click="abaAtiva = 'licencas'"
          class="flex-1 sm:flex-initial px-4 py-2 rounded-md text-sm font-semibold transition-colors flex items-center justify-center gap-2"
          :class="abaAtiva === 'licencas' ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
        >
          <i class="fa-solid fa-id-card text-purple-500" aria-hidden="true" />
          Licenças
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

      <!-- ══════════════ ABA AULAS ══════════════ -->
      <!-- ══════════════ ABA LICENÇAS ══════════════ -->
      <div v-show="abaAtiva === 'licencas'">
        <AdminLicencasManager
          ref="licencasRef"
          @editar="abrirEditarParceiro"
          @suspender="pedirConfirmacao($event.ativo ? 'bloquear' : 'desbloquear', $event)"
          @excluir="pedirConfirmacao('excluir', $event)"
        />
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

      <!-- Confirmações (suspender / reativar / excluir) -->
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
