<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

interface ClienteVinculado {
  vinculo_id: string
  empresa_id: string
  empresa_nome: string
  vinculado_em: string
  vencimento: string | null
  situacao: 'ativo' | 'vencido' | 'bloqueado_parceiro' | 'bloqueado_admin'
  cobranca_agzap: boolean
}

interface ParceiroLicencas {
  id: string
  nome: string
  email: string | null
  telefone: string | null
  ativo: boolean
  migrado_em: string | null
  saldos: { mensal_30d: number; anual_12m: number }
  clientes_total: number
  clientes_ativos: number
  clientes_vencidos: number
  clientes_bloqueados: number
  ultimo_consumo_em: string | null
  clientes: ClienteVinculado[]
}

interface Movimentacao {
  id: string
  parceiro_id: string
  tipo_credito: 'mensal_30d' | 'anual_12m'
  quantidade: number
  operacao: string
  empresa_nome: string | null
  referencia: string | null
  valor_pago: number | null
  descricao: string | null
  criado_por_papel: string
  created_at: string
}

interface Renovacao {
  id: string
  parceiro_id: string
  empresa_nome: string | null
  tipo_credito: string | null
  origem: 'parceiro' | 'admin'
  consumiu_credito: boolean
  vencimento_novo: string | null
  executado_em: string
}

interface Preco {
  id: string
  tipo_credito: 'mensal_30d' | 'anual_12m'
  quantidade_min: number
  preco_unitario: number
}

// O cadastro do parceiro (modais de editar/suspender/excluir) mora na página;
// aqui só disparamos a ação com o parceiro do card.
const emit = defineEmits<{
  editar: [parceiro: ParceiroLicencas]
  suspender: [parceiro: ParceiroLicencas]
  excluir: [parceiro: ParceiroLicencas]
}>()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const parceiros = ref<ParceiroLicencas[]>([])
const movimentacoes = ref<Movimentacao[]>([])
const renovacoes = ref<Renovacao[]>([])
const precos = ref<Preco[]>([])
const loading = ref(true)
const expandido = ref<string | null>(null)

async function carregar() {
  try {
    const resp = await $fetch<{ success: boolean; data?: any; error?: string }>(
      '/api/admin/parceiros/licencas',
      { headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    parceiros.value = resp.data.parceiros
    movimentacoes.value = resp.data.movimentacoes
    renovacoes.value = resp.data.renovacoes
    precos.value = resp.data.precos
  } catch {
    toast?.error('Erro ao carregar as licenças')
  }
}

onMounted(async () => {
  toast = await useToastSafe()
  loading.value = true
  await carregar()
  loading.value = false
})

defineExpose({ carregar })

// ───────── Conceder créditos ─────────
const showCreditos = ref(false)
const alvoCredito = ref<ParceiroLicencas | null>(null)
const formTipo = ref<'mensal_30d' | 'anual_12m'>('mensal_30d')
const formOperacao = ref<'concessao_admin' | 'compra' | 'correcao'>('compra')
const formQuantidade = ref<number | null>(null)
const formReferencia = ref('')
const formValorPago = ref<number | null>(null)
const formDescricao = ref('')
const salvandoCredito = ref(false)
const idemCredito = ref('')

function novaChave() {
  const bruto = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`
  return bruto.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 60)
}

function abrirCreditos(p: ParceiroLicencas) {
  alvoCredito.value = p
  formTipo.value = 'mensal_30d'
  formOperacao.value = 'compra'
  formQuantidade.value = null
  formReferencia.value = ''
  formValorPago.value = null
  formDescricao.value = ''
  idemCredito.value = novaChave()
  showCreditos.value = true
}

/** Preço da faixa que cobre a quantidade informada. */
const precoSugerido = computed(() => {
  const qtd = Math.abs(formQuantidade.value ?? 0)
  if (!qtd) return null
  const faixas = precos.value
    .filter(p => p.tipo_credito === formTipo.value && p.quantidade_min <= qtd)
    .sort((a, b) => b.quantidade_min - a.quantidade_min)
  const faixa = faixas[0]
  if (!faixa) return null
  return { unitario: Number(faixa.preco_unitario), total: Number(faixa.preco_unitario) * qtd }
})

/**
 * Numa compra, o valor já vem preenchido pela tabela comercial — evita erro de
 * digitação. O admin pode sobrescrever se cobrou um valor diferente.
 */
watch([formQuantidade, formTipo, formOperacao], () => {
  if (formOperacao.value !== 'compra') return
  formValorPago.value = precoSugerido.value ? Number(precoSugerido.value.total.toFixed(2)) : null
})

const podeSalvarCredito = computed(() => {
  const q = formQuantidade.value
  if (!q || !Number.isInteger(q) || q === 0) return false
  if (q < 0 && formOperacao.value !== 'correcao') return false
  if (formOperacao.value === 'correcao' && !formDescricao.value.trim()) return false
  return true
})

async function salvarCredito() {
  if (!alvoCredito.value || !podeSalvarCredito.value || salvandoCredito.value) return
  salvandoCredito.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string; data?: { saldo: number } }>(
      '/api/admin/parceiros/creditos',
      {
        method: 'POST',
        body: {
          parceiroId: alvoCredito.value.id,
          tipoCredito: formTipo.value,
          quantidade: formQuantidade.value,
          operacao: formOperacao.value,
          referencia: formReferencia.value,
          valorPago: formValorPago.value,
          descricao: formDescricao.value,
          idempotencyKey: idemCredito.value,
        },
        headers: await useAdminAuthHeaders(),
      },
    )
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success(`Saldo atualizado: ${resp.data?.saldo ?? '—'} créditos`)
    showCreditos.value = false
    await carregar()
  } catch (e: any) {
    toast?.error(e?.data?.statusMessage || e?.message || 'Erro ao lançar créditos')
  } finally {
    salvandoCredito.value = false
  }
}

// ───────── Cobrança Agzap ─────────
async function alternarCobrancaAgzap(c: ClienteVinculado) {
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/parceiros/cobranca-agzap', {
      method: 'POST',
      body: { empresaId: c.empresa_id, cobrancaAgzap: !c.cobranca_agzap },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success(!c.cobranca_agzap
      ? 'Cliente marcado como cobrança da Agzap'
      : 'Cliente volta a consumir crédito do parceiro')
    await carregar()
  } catch (e: any) {
    toast?.error(e?.data?.statusMessage || e?.message || 'Erro ao salvar')
  }
}

// ───────── Helpers ─────────
function fmtBRL(v: number | null) {
  if (v === null || v === undefined) return '—'
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v))
}
function fmtData(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtDataHora(s: string) {
  return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

const SITUACOES: Record<string, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  vencido: { label: 'Vencido', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400' },
  bloqueado_parceiro: { label: 'Bloq. parceiro', cls: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  bloqueado_admin: { label: 'Bloq. Agzap', cls: 'bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300' },
}

const OPERACOES: Record<string, string> = {
  compra: 'Compra',
  concessao_admin: 'Concessão',
  consumo: 'Consumo',
  correcao: 'Correção',
  migracao: 'Migração',
}

const LABEL_TIPO: Record<string, string> = { mensal_30d: '30 dias', anual_12m: '12 meses' }

const movsDoParceiro = (id: string) => movimentacoes.value.filter(m => m.parceiro_id === id).slice(0, 20)
const renovsDoParceiro = (id: string) => renovacoes.value.filter(r => r.parceiro_id === id).slice(0, 20)

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div class="space-y-4">

    <div v-if="loading" class="space-y-3">
      <div v-for="i in 2" :key="i" class="h-32 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse border border-slate-200 dark:border-white/5" />
    </div>

    <div v-else-if="parceiros.length === 0" :class="['px-5 py-14 text-center', cardBase]">
      <i class="fa-solid fa-id-card text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
      <p class="text-slate-500 text-sm">Nenhum parceiro cadastrado</p>
    </div>

    <!-- Um cartão por parceiro -->
    <div v-for="p in parceiros" :key="p.id" :class="[cardBase, 'overflow-hidden']">

      <div class="p-4 sm:p-5">
        <div class="flex flex-col lg:flex-row lg:items-center gap-4">
          <!-- Identidade -->
          <div class="flex items-center gap-3 min-w-0 flex-1">
            <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
              <span class="text-white font-bold text-sm">{{ p.nome.charAt(0).toUpperCase() }}</span>
            </div>
            <div class="min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <p class="font-semibold text-slate-900 dark:text-white truncate">{{ p.nome }}</p>
                <span
                  v-if="!p.ativo"
                  class="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400"
                >Suspenso</span>
              </div>
              <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ p.email || '—' }}</p>
            </div>
          </div>

          <!-- Saldos -->
          <div class="flex gap-2 shrink-0">
            <div class="px-3 py-2 rounded-md bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 text-center min-w-[86px]">
              <p class="text-[10px] font-bold text-purple-600 dark:text-purple-400 uppercase">30 dias</p>
              <p class="text-lg font-bold text-slate-800 dark:text-white tabular-nums leading-tight">{{ p.saldos.mensal_30d }}</p>
            </div>
            <div class="px-3 py-2 rounded-md bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 text-center min-w-[86px]">
              <p class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase">12 meses</p>
              <p class="text-lg font-bold text-slate-800 dark:text-white tabular-nums leading-tight">{{ p.saldos.anual_12m }}</p>
            </div>
          </div>

          <!-- Ações -->
          <div class="flex items-center gap-2 shrink-0">
            <button
              type="button"
              @click="abrirCreditos(p)"
              class="px-3 py-2 rounded text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center gap-1.5"
            >
              <i class="fa-solid fa-plus text-[10px]" aria-hidden="true" />
              Créditos
            </button>

            <button
              type="button"
              @click="emit('editar', p)"
              class="w-8 h-8 inline-flex items-center justify-center rounded text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 transition-colors"
              title="Editar cadastro"
              aria-label="Editar cadastro"
            >
              <i class="fa-solid fa-pen-to-square text-xs" aria-hidden="true" />
            </button>
            <button
              type="button"
              @click="emit('suspender', p)"
              class="w-8 h-8 inline-flex items-center justify-center rounded transition-colors"
              :class="p.ativo
                ? 'text-slate-400 hover:text-amber-600 dark:hover:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10'
                : 'text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10'"
              :title="p.ativo ? 'Suspender parceiro' : 'Reativar parceiro'"
              :aria-label="p.ativo ? 'Suspender parceiro' : 'Reativar parceiro'"
            >
              <i class="fa-solid text-xs" :class="p.ativo ? 'fa-lock' : 'fa-lock-open'" aria-hidden="true" />
            </button>
            <button
              type="button"
              @click="emit('excluir', p)"
              class="w-8 h-8 inline-flex items-center justify-center rounded text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
              title="Excluir parceiro"
              aria-label="Excluir parceiro"
            >
              <i class="fa-solid fa-trash text-xs" aria-hidden="true" />
            </button>

            <button
              type="button"
              @click="expandido = expandido === p.id ? null : p.id"
              class="w-8 h-8 inline-flex items-center justify-center rounded text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
              :aria-label="expandido === p.id ? 'Recolher' : 'Expandir'"
            >
              <i class="fa-solid text-xs" :class="expandido === p.id ? 'fa-chevron-up' : 'fa-chevron-down'" aria-hidden="true" />
            </button>
          </div>
        </div>

        <!-- Resumo da carteira -->
        <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 pt-3 border-t border-slate-100 dark:border-white/5 text-xs text-slate-500 dark:text-slate-400">
          <span><strong class="text-slate-700 dark:text-slate-200 tabular-nums">{{ p.clientes_total }}</strong> clientes</span>
          <span><strong class="text-emerald-600 dark:text-emerald-400 tabular-nums">{{ p.clientes_ativos }}</strong> ativos</span>
          <span><strong class="text-red-600 dark:text-red-400 tabular-nums">{{ p.clientes_vencidos }}</strong> vencidos</span>
          <span><strong class="text-orange-600 dark:text-orange-400 tabular-nums">{{ p.clientes_bloqueados }}</strong> bloqueados</span>
          <span v-if="p.ultimo_consumo_em" class="ml-auto">Último consumo: {{ fmtDataHora(p.ultimo_consumo_em) }}</span>
        </div>
      </div>

      <!-- Detalhe expandido -->
      <div v-if="expandido === p.id" class="border-t border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.02] p-4 sm:p-5 space-y-5">

        <!-- Clientes vinculados -->
        <div>
          <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Clientes vinculados</p>
          <div v-if="p.clientes.length === 0" class="text-xs text-slate-400 py-2">Nenhum cliente vinculado.</div>
          <div v-else class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-slate-500 dark:text-slate-500">
                  <th class="text-left py-1.5 pr-3 font-semibold uppercase tracking-wider">Cliente</th>
                  <th class="text-left py-1.5 px-3 font-semibold uppercase tracking-wider">Vinculado</th>
                  <th class="text-left py-1.5 px-3 font-semibold uppercase tracking-wider">Vencimento</th>
                  <th class="text-center py-1.5 px-3 font-semibold uppercase tracking-wider">Situação</th>
                  <th class="text-right py-1.5 pl-3 font-semibold uppercase tracking-wider">Cobrança</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-slate-200 dark:divide-white/5">
                <tr v-for="c in p.clientes" :key="c.vinculo_id">
                  <td class="py-2 pr-3 text-slate-800 dark:text-white font-medium truncate max-w-[180px]">{{ c.empresa_nome }}</td>
                  <td class="py-2 px-3 text-slate-500 tabular-nums">{{ fmtData(c.vinculado_em) }}</td>
                  <td class="py-2 px-3 text-slate-500 tabular-nums">{{ fmtData(c.vencimento) }}</td>
                  <td class="py-2 px-3 text-center">
                    <span class="px-2 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap" :class="SITUACOES[c.situacao]?.cls">
                      {{ SITUACOES[c.situacao]?.label }}
                    </span>
                  </td>
                  <td class="py-2 pl-3 text-right">
                    <button
                      type="button"
                      @click="alternarCobrancaAgzap(c)"
                      class="px-2 py-1 rounded text-[10px] font-semibold transition-colors whitespace-nowrap"
                      :class="c.cobranca_agzap
                        ? 'bg-slate-200 dark:bg-slate-600/40 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                        : 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400 hover:bg-purple-200'"
                      :title="c.cobranca_agzap
                        ? 'Cobrado pela Agzap — não consome crédito. Clique para devolver ao crédito do parceiro.'
                        : 'Renovado com crédito do parceiro. Clique para marcar como cobrança da Agzap.'"
                    >
                      {{ c.cobranca_agzap ? 'Agzap' : 'Crédito do parceiro' }}
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- Movimentações e renovações -->
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div>
            <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Movimentações de crédito</p>
            <div v-if="movsDoParceiro(p.id).length === 0" class="text-xs text-slate-400 py-2">Nenhuma movimentação.</div>
            <ul v-else class="space-y-1.5">
              <li
                v-for="m in movsDoParceiro(p.id)"
                :key="m.id"
                class="flex items-center gap-2 text-xs py-1.5 border-b border-slate-100 dark:border-white/5 last:border-0"
              >
                <span
                  class="font-bold tabular-nums w-8 shrink-0"
                  :class="m.quantidade > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-600 dark:text-slate-300'"
                >{{ m.quantidade > 0 ? '+' : '' }}{{ m.quantidade }}</span>
                <span class="text-slate-700 dark:text-slate-300 shrink-0">{{ OPERACOES[m.operacao] ?? m.operacao }}</span>
                <span class="text-slate-400 shrink-0">{{ LABEL_TIPO[m.tipo_credito] }}</span>
                <span v-if="m.empresa_nome" class="text-slate-500 truncate">· {{ m.empresa_nome }}</span>
                <span v-if="m.valor_pago" class="text-slate-500 shrink-0">· {{ fmtBRL(m.valor_pago) }}</span>
                <span class="ml-auto text-slate-400 tabular-nums shrink-0">{{ fmtData(m.created_at) }}</span>
              </li>
            </ul>
          </div>

          <div>
            <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Renovações</p>
            <div v-if="renovsDoParceiro(p.id).length === 0" class="text-xs text-slate-400 py-2">Nenhuma renovação.</div>
            <ul v-else class="space-y-1.5">
              <li
                v-for="r in renovsDoParceiro(p.id)"
                :key="r.id"
                class="flex items-center gap-2 text-xs py-1.5 border-b border-slate-100 dark:border-white/5 last:border-0"
              >
                <span
                  class="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase shrink-0"
                  :class="r.origem === 'admin'
                    ? 'bg-slate-200 dark:bg-slate-600/40 text-slate-600 dark:text-slate-300'
                    : 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-400'"
                >{{ r.origem === 'admin' ? 'Agzap' : 'Parceiro' }}</span>
                <span class="text-slate-700 dark:text-slate-300 truncate">{{ r.empresa_nome ?? '—' }}</span>
                <span v-if="!r.consumiu_credito" class="text-slate-400 shrink-0">sem crédito</span>
                <span class="ml-auto text-slate-400 tabular-nums shrink-0">até {{ fmtData(r.vencimento_novo) }}</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════ Modal: lançar créditos ══════════════ -->
    <BaseModal :show="showCreditos" title="Lançar créditos" max-width="max-w-md" @close="showCreditos = false">
      <div v-if="alvoCredito" class="space-y-4">
        <div class="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
            <span class="text-white font-bold text-sm">{{ alvoCredito.nome.charAt(0).toUpperCase() }}</span>
          </div>
          <div class="min-w-0">
            <p class="font-semibold text-slate-900 dark:text-white truncate">{{ alvoCredito.nome }}</p>
            <p class="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Saldo: {{ alvoCredito.saldos.mensal_30d }} × 30 dias · {{ alvoCredito.saldos.anual_12m }} × 12 meses
            </p>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Tipo</label>
            <select v-model="formTipo" class="w-full px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="mensal_30d">30 dias</option>
              <option value="anual_12m">12 meses</option>
            </select>
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Operação</label>
            <select v-model="formOperacao" class="w-full px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500">
              <option value="compra">Compra paga</option>
              <option value="concessao_admin">Concessão (cortesia)</option>
              <option value="correcao">Correção</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Quantidade
            <span v-if="formOperacao === 'correcao'" class="font-medium normal-case text-slate-400">— use negativo para retirar</span>
          </label>
          <input
            v-model.number="formQuantidade"
            type="number"
            step="1"
            :min="formOperacao === 'correcao' ? undefined : 1"
            placeholder="Ex.: 10"
            class="w-full px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500"
          />
          <p v-if="precoSugerido && formOperacao === 'compra'" class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Tabela: {{ fmtBRL(precoSugerido.unitario) }} por licença ·
            <strong class="text-slate-700 dark:text-slate-200">{{ fmtBRL(precoSugerido.total) }}</strong> no total
          </p>
        </div>

        <div v-if="formOperacao === 'compra'" class="grid grid-cols-2 gap-3">
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Referência do pedido</label>
            <input v-model="formReferencia" type="text" maxlength="120" placeholder="Ex.: PIX 12/08"
              class="w-full px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
          </div>
          <div>
            <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">Valor pago</label>
            <AppCurrencyInput
              v-model="formValorPago"
              placeholder="R$ 0,00"
              class="w-full px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        <div>
          <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
            Observação
            <span v-if="formOperacao === 'correcao'" class="text-red-500">— obrigatória na correção</span>
          </label>
          <input v-model="formDescricao" type="text" maxlength="300" placeholder="Fica registrado na auditoria"
            class="w-full px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500" />
        </div>

        <div class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 p-3 flex items-start gap-2.5">
          <i class="fa-solid fa-circle-info text-slate-400 text-sm mt-0.5" aria-hidden="true" />
          <p class="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
            O lançamento é imutável. Para desfazer, use uma <strong>correção</strong> com quantidade negativa —
            o lançamento original permanece no histórico.
          </p>
        </div>

        <div class="flex gap-2">
          <button type="button" @click="showCreditos = false" :disabled="salvandoCredito"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors">
            Cancelar
          </button>
          <button type="button" @click="salvarCredito" :disabled="!podeSalvarCredito || salvandoCredito"
            class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2">
            <i :class="['fa-solid', salvandoCredito ? 'fa-circle-notch fa-spin' : 'fa-check', 'text-xs']" aria-hidden="true" />
            {{ salvandoCredito ? 'Lançando…' : 'Lançar' }}
          </button>
        </div>
      </div>
    </BaseModal>

  </div>
</template>
