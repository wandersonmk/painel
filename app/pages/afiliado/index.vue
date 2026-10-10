<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { erroAfiliado } from '~/composables/useAfiliado'

definePageMeta({
  middleware: ['auth', 'afiliado'],
  layout: 'afiliado',
})

useHead({ title: 'Minha rede · Portal do Afiliado' })

/**
 * Minha rede: da 1ª à 5ª conexão do afiliado, em árvore de quem indicou quem.
 * Mostra só nome da empresa, primeiro nome do responsável, plano e situação.
 */
type Situacao = 'pagando' | 'cadastrado' | 'atrasado' | 'cancelado'
type Plano = 'mensal' | 'semestral' | 'anual' | null

interface NoRede {
  empresa_id: string
  nome: string
  responsavel: string | null
  pai_id: string | null
  nivel: number
  plano: Plano
  situacao: Situacao
  preco: number | null
  mes_valor: number
  liberaria: number | null
  diretos: number
  na_rede: number
}

interface Regra {
  conexao: number
  percentual_primeira: number
  percentual_recorrente: number
  meta_clientes: number
}

interface RedeAfiliado {
  nos: NoRede[]
  regras: Regra[]
  proprios_total: number
  proprios_ativos: number
  liberadas: number
  mes_total: number
  bloqueado_estimado: number
}

const dados = ref<RedeAfiliado | null>(null)
const carregando = ref(true)
const erro = ref<string | null>(null)

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    const resp = await $fetch<{ success: boolean; data?: RedeAfiliado; error?: string }>('/api/afiliado/rede', {
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar sua rede.')
    dados.value = resp.data
    if (!expansaoIniciada) iniciarExpansao()
  }
  catch (e: any) {
    erro.value = erroAfiliado(e, 'Não foi possível carregar sua rede.')
  }
  finally {
    carregando.value = false
  }
}

onMounted(carregar)

const nos = computed(() => dados.value?.nos ?? [])
const regras = computed(() => dados.value?.regras ?? [])
const regraDe = computed(() => new Map(regras.value.map(r => [r.conexao, r])))
const liberadas = computed(() => dados.value?.liberadas ?? 1)

// ───────── Progresso (modelo A) ─────────
const proxima = computed(() => regras.value
  .filter(r => r.conexao > liberadas.value)
  .sort((a, b) => a.conexao - b.conexao)[0] ?? null)

const tituloLiberadas = computed(() => liberadas.value <= 1
  ? 'Conexões liberadas: só a 1ª'
  : `Conexões liberadas: da 1ª à ${liberadas.value}ª`)

const progresso = computed(() => {
  const ativos = dados.value?.proprios_ativos ?? 0
  if (!proxima.value) return { pct: 100, ativos, meta: ativos, faltam: 0 }
  const meta = Math.max(proxima.value.meta_clientes, 1)
  return {
    pct: Math.min(100, Math.round((ativos / meta) * 100)),
    ativos,
    meta: proxima.value.meta_clientes,
    faltam: Math.max(0, proxima.value.meta_clientes - ativos),
  }
})

const metas = computed(() => regras.value
  .filter(r => r.conexao >= 2)
  .sort((a, b) => a.conexao - b.conexao))

// ───────── Árvore ─────────
interface No {
  c: NoRede
  filhos: No[]
}

function porNome(a: NoRede, b: NoRede) {
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

const arvore = computed(() => {
  const filhosDe = new Map<string, NoRede[]>()
  for (const c of nos.value) {
    if (!c.pai_id) continue
    filhosDe.set(c.pai_id, [...(filhosDe.get(c.pai_id) ?? []), c])
  }
  const mapa = new Map<string, No>()
  function montar(c: NoRede): No {
    const no: No = { c, filhos: [] }
    mapa.set(c.empresa_id, no)
    for (const f of [...(filhosDe.get(c.empresa_id) ?? [])].sort(porNome)) {
      if (mapa.has(f.empresa_id)) continue
      no.filhos.push(montar(f))
    }
    return no
  }
  const raizes = nos.value.filter(c => c.nivel === 1).sort(porNome).map(montar)
  // Segurança: quem não pendurou em ninguém (não deveria acontecer) vira topo.
  for (const c of [...nos.value].sort((a, b) => a.nivel - b.nivel || porNome(a, b))) {
    if (!mapa.has(c.empresa_id)) raizes.push(montar(c))
  }
  return { raizes, mapa }
})

const nomePorId = computed(() => new Map(nos.value.map(c => [c.empresa_id, c.nome])))

const expandidos = ref(new Set<string>())
let expansaoIniciada = false

/** Abre a 1ª e a 2ª conexão na primeira carga. */
function iniciarExpansao() {
  expansaoIniciada = true
  const abertos = new Set<string>()
  for (const no of arvore.value.mapa.values()) {
    if (no.c.nivel <= 2 && no.filhos.length) abertos.add(no.c.empresa_id)
  }
  expandidos.value = abertos
}
function alternar(id: string) {
  const novo = new Set(expandidos.value)
  if (novo.has(id)) novo.delete(id)
  else novo.add(id)
  expandidos.value = novo
}
function expandirTudo() {
  expandidos.value = new Set([...arvore.value.mapa.values()].filter(n => n.filhos.length).map(n => n.c.empresa_id))
}
function recolherTudo() {
  expandidos.value = new Set()
}

// ───────── Resumo ─────────
const contagemNivel = computed(() => {
  const m = new Map<number, number>()
  for (const c of nos.value) m.set(c.nivel, (m.get(c.nivel) ?? 0) + 1)
  return m
})

const cards = computed(() => [
  {
    label: 'Total na rede',
    valor: String(nos.value.length),
    sub: 'da 1ª à 5ª conexão',
    icone: 'fa-sitemap',
    cor: 'text-purple-500',
  },
  {
    label: 'Trazidos por você',
    valor: String(dados.value?.proprios_total ?? 0),
    sub: `${dados.value?.proprios_ativos ?? 0} ${(dados.value?.proprios_ativos ?? 0) === 1 ? 'ativo' : 'ativos'}`,
    icone: 'fa-user-plus',
    cor: 'text-indigo-500',
  },
  {
    label: 'Ganhos deste mês',
    valor: fmtBRL(dados.value?.mes_total ?? 0),
    sub: 'comissões geradas no mês',
    icone: 'fa-sack-dollar',
    cor: 'text-emerald-500',
  },
  {
    label: 'Bloqueado este mês',
    valor: fmtBRL(dados.value?.bloqueado_estimado ?? 0),
    sub: 'estimativa nas conexões bloqueadas',
    icone: 'fa-lock',
    cor: 'text-amber-500',
  },
])

// ───────── Filtros ─────────
type FiltroSituacao = 'todas' | Situacao
const nivelFiltro = ref<number | null>(null)
const situacaoFiltro = ref<FiltroSituacao>('todas')
const busca = ref('')

function normalizar(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

const filtroAtivo = computed(() => nivelFiltro.value !== null || situacaoFiltro.value !== 'todas' || !!busca.value.trim())

function limparFiltros() {
  nivelFiltro.value = null
  situacaoFiltro.value = 'todas'
  busca.value = ''
}
function alternarNivel(n: number) {
  nivelFiltro.value = nivelFiltro.value === n ? null : n
}

/** Com filtro ou busca, a árvore vira lista: o resultado não some dentro de um nó fechado. */
const listaPlana = computed(() => {
  const termo = normalizar(busca.value.trim())
  return [...arvore.value.mapa.values()]
    .filter((no) => {
      if (nivelFiltro.value !== null && no.c.nivel !== nivelFiltro.value) return false
      if (situacaoFiltro.value !== 'todas' && no.c.situacao !== situacaoFiltro.value) return false
      if (termo) {
        const pai = no.c.pai_id ? (nomePorId.value.get(no.c.pai_id) ?? '') : ''
        const alvo = normalizar(`${no.c.nome} ${no.c.responsavel ?? ''} ${pai}`)
        if (!alvo.includes(termo)) return false
      }
      return true
    })
    .sort((a, b) => a.c.nivel - b.c.nivel || porNome(a.c, b.c))
})

const linhasArvore = computed(() => {
  const saida: No[] = []
  const visitar = (no: No) => {
    saida.push(no)
    if (expandidos.value.has(no.c.empresa_id)) no.filhos.forEach(visitar)
  }
  arvore.value.raizes.forEach(visitar)
  return saida
})

const linhas = computed(() => (filtroAtivo.value ? listaPlana.value : linhasArvore.value))

// ───────── Formatação ─────────
function fmtBRL(v: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v ?? 0)
}
function fmtPct(v: number | null | undefined) {
  return `${(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}

const PLANOS: Record<string, string> = { mensal: 'Mensal', semestral: 'Semestral', anual: 'Anual' }
function rotuloPlano(p: Plano) {
  return p ? (PLANOS[p] ?? 'Sem plano') : 'Sem plano'
}

const SITUACOES: Record<Situacao, { label: string; cls: string }> = {
  pagando: { label: 'Pagando', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' },
  cadastrado: { label: 'Cadastrado', cls: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400 border-sky-200 dark:border-sky-500/20' },
  atrasado: { label: 'Atrasado', cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-500/20' },
  cancelado: { label: 'Cancelado', cls: 'bg-slate-200 dark:bg-slate-500/20 text-slate-600 dark:text-slate-300 border-slate-300 dark:border-slate-600' },
}

function bloqueada(nivel: number) {
  return nivel > liberadas.value
}

function percentualTile(n: number) {
  const r = regraDe.value.get(n)
  if (!r) return '—'
  if (r.percentual_primeira === r.percentual_recorrente) return fmtPct(r.percentual_primeira)
  return `${fmtPct(r.percentual_primeira)} / ${fmtPct(r.percentual_recorrente)}`
}

function voceGanha(c: NoRede) {
  const r = regraDe.value.get(c.nivel)
  if (!r) return '—'
  if (bloqueada(c.nivel)) return `bloqueada · libera com ${r.meta_clientes} clientes`
  if (r.percentual_primeira === r.percentual_recorrente) return fmtPct(r.percentual_primeira)
  return `${fmtPct(r.percentual_primeira)} no 1º pagamento, depois ${fmtPct(r.percentual_recorrente)}`
}

/** Por que "Este mês" está zerado. */
function motivoZero(c: NoRede): string {
  if (bloqueada(c.nivel)) return 'conexão bloqueada'
  if (c.situacao === 'cadastrado') return 'ainda não pagou'
  if (c.situacao === 'atrasado') return 'pagamento atrasado'
  if (c.situacao === 'cancelado') return 'cancelado'
  if (!c.preco) return 'sem mensalidade cadastrada'
  return 'sem pagamento este mês'
}

const NIVEIS = [1, 2, 3, 4, 5] as const

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
const campoFiltro = 'bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-full text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500'
</script>

<template>
  <div class="p-4 sm:p-6 md:p-8 space-y-6 w-full">

    <!-- Cabeçalho -->
    <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">Minha rede</h1>
        <p class="text-slate-500 dark:text-slate-400 text-xs sm:text-sm mt-0.5">
          Quem criou a conta pelo seu link é sua 1ª conexão. Quem essas pessoas indicarem entra na sua rede até a 5ª conexão.
        </p>
      </div>
      <button
        type="button"
        :disabled="carregando"
        class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-normal transition-colors shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20"
        @click="carregar"
      >
        <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': carregando }" aria-hidden="true" />
        <span class="hidden sm:inline">Atualizar</span>
      </button>
    </div>

    <div v-if="erro" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ erro }}</span>
    </div>

    <!-- Progresso das conexões -->
    <div :class="[cardBase, 'p-4 sm:p-5']">
      <div v-if="carregando && !dados" class="space-y-3">
        <div class="h-4 w-56 rounded bg-slate-100 dark:bg-white/10 animate-pulse" />
        <div class="h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/10 animate-pulse" />
        <div class="h-3 w-80 max-w-full rounded bg-slate-100 dark:bg-white/10 animate-pulse" />
      </div>
      <template v-else>
        <div class="flex flex-col lg:flex-row lg:items-center gap-4 lg:gap-8">
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between gap-3 mb-2">
              <p class="text-sm text-slate-900 dark:text-white flex items-center gap-2">
                <i class="fa-solid fa-unlock text-purple-500 text-xs" aria-hidden="true" />
                {{ tituloLiberadas }}
              </p>
              <span v-if="proxima" class="text-xs tabular-nums text-slate-500 dark:text-slate-400 whitespace-nowrap">
                {{ progresso.ativos }} de {{ progresso.meta }}
              </span>
            </div>
            <div
              class="h-2.5 w-full rounded-full bg-slate-100 dark:bg-white/10 overflow-hidden"
              role="progressbar"
              :aria-valuenow="progresso.pct"
              aria-valuemin="0"
              aria-valuemax="100"
              :aria-label="proxima ? `Progresso para liberar a ${proxima.conexao}ª conexão` : 'Todas as conexões liberadas'"
            >
              <div class="h-full rounded-full bg-purple-600 transition-[width] duration-500" :style="{ width: `${progresso.pct}%` }" />
            </div>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-2">
              <template v-if="proxima">
                A {{ proxima.conexao }}ª conexão libera com {{ proxima.meta_clientes }} clientes que você trouxe, ativos.
                <span class="text-slate-700 dark:text-slate-200">Faltam {{ progresso.faltam }}.</span>
              </template>
              <template v-else>Todas as conexões liberadas.</template>
            </p>
          </div>

          <div class="grid grid-cols-4 gap-2 lg:w-[420px] shrink-0">
            <div
              v-for="m in metas"
              :key="m.conexao"
              class="rounded border px-2 py-2 text-center"
              :class="m.conexao <= liberadas
                ? 'border-emerald-200 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10'
                : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]'"
            >
              <p class="text-[11px] flex items-center justify-center gap-1" :class="m.conexao <= liberadas ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500 dark:text-slate-400'">
                <i class="fa-solid text-[9px]" :class="m.conexao <= liberadas ? 'fa-lock-open' : 'fa-lock'" aria-hidden="true" />
                {{ m.conexao }}ª
              </p>
              <p class="text-xs tabular-nums text-slate-700 dark:text-slate-200 mt-0.5">{{ m.meta_clientes }} clientes</p>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Resumo -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
      <div v-for="card in cards" :key="card.label" :class="[cardBase, 'p-4 min-w-0']">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{{ card.label }}</span>
          <i :class="['fa-solid', card.icone, card.cor, 'text-xs shrink-0']" aria-hidden="true" />
        </div>
        <p class="text-2xl font-medium tabular-nums text-slate-900 dark:text-white leading-tight truncate">
          <span v-if="carregando && !dados" class="inline-block h-7 w-20 rounded bg-slate-100 dark:bg-white/10 animate-pulse align-middle" />
          <template v-else>{{ card.valor }}</template>
        </p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">{{ card.sub }}</p>
      </div>
    </div>

    <!-- Conexões: filtram a lista -->
    <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
      <button
        v-for="n in NIVEIS"
        :key="n"
        type="button"
        class="rounded-md border px-3 py-2.5 text-left transition-colors"
        :class="nivelFiltro === n
          ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
          : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:border-purple-300 dark:hover:border-purple-500/40'"
        :aria-pressed="nivelFiltro === n"
        @click="alternarNivel(n)"
      >
        <span class="flex items-center justify-between gap-2">
          <span class="text-[11px] whitespace-nowrap" :class="nivelFiltro === n ? 'text-purple-700 dark:text-purple-300' : 'text-slate-500 dark:text-slate-400'">{{ n }}ª conexão</span>
          <span class="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">{{ percentualTile(n) }}</span>
        </span>
        <span class="block text-lg font-medium tabular-nums" :class="(contagemNivel.get(n) ?? 0) > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'">
          {{ contagemNivel.get(n) ?? 0 }}
        </span>
        <span
          class="block text-[11px] truncate"
          :class="bloqueada(n) ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'"
        >
          <i class="fa-solid text-[9px] mr-0.5" :class="bloqueada(n) ? 'fa-lock' : 'fa-lock-open'" aria-hidden="true" />
          <template v-if="bloqueada(n)">bloqueada · {{ regraDe.get(n)?.meta_clientes ?? '—' }} clientes</template>
          <template v-else>liberada</template>
        </span>
      </button>
    </div>

    <!-- Busca e situação -->
    <div :class="[cardBase, 'p-3 sm:p-4 flex flex-wrap items-center gap-2']">
      <div class="relative w-full sm:w-72 xl:w-80">
        <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs" aria-hidden="true" />
        <input
          v-model="busca"
          type="search"
          placeholder="Empresa, responsável ou quem indicou…"
          aria-label="Buscar na rede"
          :class="[campoFiltro, 'w-full pl-8 pr-3 py-2 placeholder:text-slate-400']"
        >
      </div>
      <select v-model="situacaoFiltro" :class="[campoFiltro, 'flex-1 sm:flex-initial px-3 py-2']" aria-label="Situação">
        <option value="todas">Todas as situações</option>
        <option value="pagando">Pagando</option>
        <option value="cadastrado">Cadastrado</option>
        <option value="atrasado">Atrasado</option>
        <option value="cancelado">Cancelado</option>
      </select>
      <button
        v-if="filtroAtivo"
        type="button"
        class="px-3 py-2 rounded-full text-xs text-slate-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors whitespace-nowrap"
        @click="limparFiltros"
      >
        <i class="fa-solid fa-xmark text-[10px] mr-1" aria-hidden="true" />
        Limpar
      </button>
      <div v-if="!filtroAtivo && nos.length" class="flex items-center gap-1 sm:ml-auto">
        <button type="button" class="px-3 py-2 rounded-full text-xs text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors" @click="expandirTudo">
          <i class="fa-solid fa-angles-down text-[10px] mr-1" aria-hidden="true" />Expandir tudo
        </button>
        <button type="button" class="px-3 py-2 rounded-full text-xs text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors" @click="recolherTudo">
          <i class="fa-solid fa-angles-up text-[10px] mr-1" aria-hidden="true" />Recolher
        </button>
      </div>
      <p v-else-if="filtroAtivo" class="text-xs text-slate-400 sm:ml-auto">
        {{ listaPlana.length }} de {{ nos.length }} · lista sem árvore enquanto houver filtro
      </p>
    </div>

    <!-- Tabela em árvore -->
    <div :class="['overflow-hidden', cardBase]">
      <div v-if="carregando && !dados" class="p-5 space-y-3">
        <div v-for="i in 5" :key="i" class="flex items-center gap-3">
          <div class="w-8 h-8 rounded bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
          <div class="flex-1 space-y-1.5">
            <div class="h-3 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-2/3" />
            <div class="h-2.5 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-1/3" />
          </div>
        </div>
      </div>

      <div v-else-if="!nos.length" class="px-5 py-14 text-center">
        <i class="fa-solid fa-sitemap text-slate-300 dark:text-slate-700 text-3xl mb-2 block" aria-hidden="true" />
        <p class="text-slate-600 dark:text-slate-300 text-sm">Sua rede ainda está vazia</p>
        <p class="text-slate-400 dark:text-slate-500 text-xs mt-1">
          Compartilhe o seu link: quem criar a conta por ele aparece aqui.
        </p>
        <NuxtLink
          to="/afiliado/link"
          class="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-normal transition-colors"
        >
          <i class="fa-solid fa-link text-xs" aria-hidden="true" />
          Ver meu link
        </NuxtLink>
      </div>

      <div v-else-if="!linhas.length" class="px-5 py-12 text-center">
        <p class="text-slate-500 text-sm">Ninguém da rede com esses filtros</p>
        <button type="button" class="mt-2 text-xs text-purple-600 dark:text-purple-400 hover:underline" @click="limparFiltros">
          Limpar filtros
        </button>
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
              <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider">Cliente</th>
              <th class="hidden md:table-cell text-left px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider whitespace-nowrap">Indicado por</th>
              <th class="hidden lg:table-cell text-left px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider">Plano</th>
              <th class="hidden sm:table-cell text-center px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider">Situação</th>
              <th class="hidden xl:table-cell text-left px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider whitespace-nowrap">Você ganha</th>
              <th class="text-right px-3 sm:px-4 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider whitespace-nowrap">Este mês</th>
              <th class="hidden lg:table-cell text-center px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider" title="Clientes que ele indicou diretamente">Diretos</th>
              <th class="hidden lg:table-cell text-center px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider whitespace-nowrap" title="Todos abaixo dele, até a 5ª conexão">Na rede</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-white/5">
            <tr
              v-for="no in linhas"
              :key="no.c.empresa_id"
              class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
            >
              <!-- Cliente: recuo por conexão só na árvore -->
              <td class="px-3 sm:px-5 py-2.5">
                <div
                  class="flex items-center gap-2 min-w-0"
                  :style="!filtroAtivo ? { paddingLeft: `${(no.c.nivel - 1) * 18}px` } : undefined"
                >
                  <button
                    v-if="!filtroAtivo && no.filhos.length"
                    type="button"
                    class="w-6 h-6 shrink-0 inline-flex items-center justify-center rounded text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
                    :aria-expanded="expandidos.has(no.c.empresa_id)"
                    :aria-label="expandidos.has(no.c.empresa_id) ? `Recolher indicados de ${no.c.nome}` : `Mostrar indicados de ${no.c.nome}`"
                    @click="alternar(no.c.empresa_id)"
                  >
                    <i
                      class="fa-solid fa-chevron-right text-[10px] transition-transform duration-150"
                      :class="{ 'rotate-90': expandidos.has(no.c.empresa_id) }"
                      aria-hidden="true"
                    />
                  </button>
                  <span v-else-if="!filtroAtivo" class="w-6 shrink-0" aria-hidden="true" />
                  <span
                    class="shrink-0 px-1.5 py-0.5 rounded text-[10px] tabular-nums border"
                    :class="bloqueada(no.c.nivel)
                      ? 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-white/10'
                      : 'bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-500/20'"
                    :title="`${no.c.nivel}ª conexão${bloqueada(no.c.nivel) ? ' (bloqueada)' : ''}`"
                  >{{ no.c.nivel }}ª</span>
                  <div class="min-w-0">
                    <p class="text-sm text-slate-800 dark:text-white truncate">{{ no.c.nome }}</p>
                    <p v-if="no.c.responsavel" class="text-xs text-slate-500 truncate max-w-[240px]">{{ no.c.responsavel }}</p>
                    <!-- Celular: o que as colunas escondem -->
                    <div class="sm:hidden mt-1 flex items-center gap-1.5 flex-wrap">
                      <span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] border" :class="SITUACOES[no.c.situacao].cls">
                        {{ SITUACOES[no.c.situacao].label }}
                      </span>
                      <span class="text-[10px] text-slate-400 truncate">{{ voceGanha(no.c) }}</span>
                    </div>
                  </div>
                </div>
              </td>

              <td class="hidden md:table-cell px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                <span v-if="no.c.nivel === 1" class="text-slate-400">Você</span>
                <span v-else class="block truncate max-w-[180px]">{{ (no.c.pai_id && nomePorId.get(no.c.pai_id)) || '—' }}</span>
              </td>

              <td class="hidden lg:table-cell px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                {{ rotuloPlano(no.c.plano) }}
              </td>

              <td class="hidden sm:table-cell px-4 py-2.5 text-center">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border whitespace-nowrap" :class="SITUACOES[no.c.situacao].cls">
                  <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                  {{ SITUACOES[no.c.situacao].label }}
                </span>
              </td>

              <td class="hidden xl:table-cell px-4 py-2.5 text-xs whitespace-nowrap" :class="bloqueada(no.c.nivel) ? 'text-amber-600 dark:text-amber-400' : 'text-slate-700 dark:text-slate-200'">
                <i v-if="bloqueada(no.c.nivel)" class="fa-solid fa-lock text-[9px] mr-1" aria-hidden="true" />
                {{ voceGanha(no.c) }}
              </td>

              <td class="px-3 sm:px-4 py-2.5 text-right whitespace-nowrap">
                <template v-if="no.c.mes_valor > 0">
                  <span class="text-sm tabular-nums text-emerald-700 dark:text-emerald-400">{{ fmtBRL(no.c.mes_valor) }}</span>
                </template>
                <template v-else-if="bloqueada(no.c.nivel) && no.c.liberaria">
                  <span class="block text-sm tabular-nums text-slate-400">{{ fmtBRL(0) }}</span>
                  <span class="block text-[11px] text-amber-600 dark:text-amber-400">liberaria {{ fmtBRL(no.c.liberaria) }}</span>
                </template>
                <template v-else>
                  <span class="block text-sm tabular-nums text-slate-400">{{ fmtBRL(0) }}</span>
                  <span class="block text-[11px] text-slate-400 dark:text-slate-500">{{ motivoZero(no.c) }}</span>
                </template>
              </td>

              <td class="hidden lg:table-cell px-4 py-2.5 text-center text-xs tabular-nums" :class="no.c.diretos ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'">
                {{ no.c.diretos }}
              </td>
              <td class="hidden lg:table-cell px-4 py-2.5 text-center text-xs tabular-nums" :class="no.c.na_rede ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'">
                {{ no.c.na_rede }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="text-xs text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
      <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
      <span>
        "Este mês" soma as comissões geradas no mês por cliente. Conexão bloqueada não gera comissão: o valor em "liberaria" é uma estimativa
        do que você ganharia com ela liberada. "Diretos" são os clientes que ele indicou; "Na rede" conta todos abaixo dele, até a 5ª conexão.
      </span>
    </p>
  </div>
</template>
