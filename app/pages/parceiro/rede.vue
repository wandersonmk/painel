<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { ClienteCarteira, ClienteRede, SituacaoAcesso } from '~/composables/useParceiroLicencas'
import { rotuloPlanoCliente } from '~/composables/useParceiroLicencas'
import type { TipoSolicitacao } from '~/components/shared/parceiro/ParceiroSolicitarModal.vue'

definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

/**
 * Minha rede: todos os clientes do parceiro em árvore de quem indicou quem.
 * Quem entra pelo link de um cliente do parceiro também vira cliente dele,
 * sem limite de níveis.
 */
const { parceiro, checkParceiro } = useParceiro()
const { clientes: carteira, saldos, loadCarteira, loadRede } = useParceiroLicencas()

const rede = ref<ClienteRede[]>([])
const carregando = ref(true)
const erro = ref<string | null>(null)

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    const d = await loadRede()
    rede.value = d.clientes
    if (!expansaoIniciada) iniciarExpansao()
  }
  catch (e: any) {
    erro.value = String(e?.message || 'Não foi possível carregar sua rede.')
  }
  finally {
    carregando.value = false
  }
}

onMounted(async () => {
  // A carteira só alimenta os modais (valor, renovar, solicitar): se falhar, a rede segue.
  await Promise.all([checkParceiro(), carregar(), loadCarteira()])
})

// ───────── Árvore ─────────
interface No {
  c: ClienteRede
  nivel: number
  filhos: No[]
  /** Todos abaixo dele, em qualquer nível. */
  naRede: number
}

function porNome(a: ClienteRede, b: ClienteRede) {
  return a.nome.localeCompare(b.nome, 'pt-BR')
}

const arvore = computed(() => {
  const ids = new Set(rede.value.map(c => c.empresa_id))
  const filhosDe = new Map<string, ClienteRede[]>()
  for (const c of rede.value) {
    const pai = c.indicado_por_empresa_id
    if (!pai || !ids.has(pai)) continue
    filhosDe.set(pai, [...(filhosDe.get(pai) ?? []), c])
  }

  const nos = new Map<string, No>()
  function montar(c: ClienteRede, nivel: number): No {
    const no: No = { c, nivel, filhos: [], naRede: 0 }
    nos.set(c.empresa_id, no)
    for (const f of [...(filhosDe.get(c.empresa_id) ?? [])].sort(porNome)) {
      if (nos.has(f.empresa_id)) continue
      const filho = montar(f, nivel + 1)
      no.filhos.push(filho)
      no.naRede += 1 + filho.naRede
    }
    return no
  }

  const raizes: No[] = []
  for (const c of rede.value.filter(c => !c.indicado_por_empresa_id || !ids.has(c.indicado_por_empresa_id)).sort(porNome)) {
    raizes.push(montar(c, 1))
  }
  // Indicação em círculo (A indicou B e B indicou A) não tem topo: vira topo
  // para ninguém sumir da lista.
  for (const c of [...rede.value].sort(porNome)) {
    if (!nos.has(c.empresa_id)) raizes.push(montar(c, 1))
  }
  return { raizes, nos }
})

const expandidos = ref(new Set<string>())
let expansaoIniciada = false

/** Abre os 2 primeiros níveis na primeira carga. */
function iniciarExpansao() {
  expansaoIniciada = true
  const abertos = new Set<string>()
  for (const no of arvore.value.nos.values()) {
    if (no.nivel <= 2 && no.filhos.length) abertos.add(no.c.empresa_id)
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
  expandidos.value = new Set([...arvore.value.nos.values()].filter(n => n.filhos.length).map(n => n.c.empresa_id))
}
function recolherTudo() {
  expandidos.value = new Set()
}

// ───────── Resumo ─────────
const mesSP = (d: Date | string) => new Date(d).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
const mesAtual = mesSP(new Date())

const resumo = computed(() => ({
  total: rede.value.length,
  trazidos: rede.value.filter(c => !c.indicado_por_empresa_id).length,
  novos: rede.value.filter(c => c.created_at && mesSP(c.created_at) === mesAtual).length,
  aguardando: rede.value.filter(c => c.aguardando_ativacao).length,
  vencidos: rede.value.filter(c => c.situacao === 'vencido').length,
}))

const cards = computed(() => [
  { label: 'Total na rede', valor: resumo.value.total, sub: 'clientes', icone: 'fa-sitemap', cor: 'text-purple-500' },
  { label: 'Trazidos por você', valor: resumo.value.trazidos, sub: 'sem indicação de cliente', icone: 'fa-user-tie', cor: 'text-indigo-500' },
  { label: 'Novos no mês', valor: resumo.value.novos, sub: 'entraram este mês', icone: 'fa-user-plus', cor: 'text-emerald-500' },
  { label: 'Aguardando ativação', valor: resumo.value.aguardando, sub: 'em teste ou sem vencimento', icone: 'fa-hourglass-half', cor: 'text-amber-500' },
  { label: 'Vencidos', valor: resumo.value.vencidos, sub: 'sem acesso', icone: 'fa-circle-exclamation', cor: 'text-rose-500' },
])

// ───────── Níveis e filtros ─────────
const NIVEIS = [
  { id: 1, label: '1ª conexão' },
  { id: 2, label: '2ª conexão' },
  { id: 3, label: '3ª conexão' },
  { id: 4, label: '4ª conexão' },
  { id: 5, label: '5ª conexão' },
  { id: 6, label: '6ª ou mais' },
] as const
const nivelDoFiltro = (nivel: number) => Math.min(nivel, 6)

const contagemNivel = computed(() => {
  const mapa = new Map<number, number>()
  for (const no of arvore.value.nos.values()) {
    const n = nivelDoFiltro(no.nivel)
    mapa.set(n, (mapa.get(n) ?? 0) + 1)
  }
  return mapa
})

type FiltroSituacao = 'todas' | 'ativo' | 'vencido' | 'bloqueado' | 'aguardando'
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
function alternarNivel(id: number) {
  nivelFiltro.value = nivelFiltro.value === id ? null : id
}

/** Com filtro ou busca, a árvore vira lista: o resultado não some dentro de um nó fechado. */
const listaPlana = computed(() => {
  const termo = normalizar(busca.value.trim())
  return [...arvore.value.nos.values()]
    .filter((no) => {
      if (nivelFiltro.value !== null && nivelDoFiltro(no.nivel) !== nivelFiltro.value) return false
      const s = no.c.situacao
      if (situacaoFiltro.value === 'ativo' && s !== 'ativo') return false
      if (situacaoFiltro.value === 'vencido' && s !== 'vencido') return false
      if (situacaoFiltro.value === 'bloqueado' && !s.startsWith('bloqueado')) return false
      if (situacaoFiltro.value === 'aguardando' && !no.c.aguardando_ativacao) return false
      if (termo) {
        const alvo = normalizar(`${no.c.nome} ${no.c.responsavel ?? ''} ${no.c.indicado_por_nome ?? ''}`)
        if (!alvo.includes(termo)) return false
      }
      return true
    })
    .sort((a, b) => a.nivel - b.nivel || porNome(a.c, b.c))
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
const SITUACOES: Record<SituacaoAcesso, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' },
  vencido: { label: 'Vencido', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20' },
  bloqueado_parceiro: { label: 'Bloqueado por você', cls: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20' },
  bloqueado_admin: { label: 'Bloqueado pela Agzap', cls: 'bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600' },
}

function fmtData(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
}
function vencido(s: string | null) {
  return !!s && new Date(s).getTime() < Date.now()
}

// ───────── Detalhes e ações (mesma fiação da página de Clientes) ─────────
const carteiraPorId = computed(() => new Map(carteira.value.map(c => [c.empresa_id, c])))
const detalheId = ref<string | null>(null)
const clienteSelecionado = computed<ClienteCarteira | null>(() =>
  detalheId.value ? (carteiraPorId.value.get(detalheId.value) ?? null) : null,
)
const showDetalhes = ref(false)
const showRenovar = ref(false)
const showValor = ref(false)
const showSolicitar = ref(false)
const tipoSolicitacao = ref<TipoSolicitacao>('instancia')

function ver(id: string) {
  detalheId.value = id
  showDetalhes.value = true
}
function abrirSolicitacao(tipo: TipoSolicitacao) {
  tipoSolicitacao.value = tipo
  showDetalhes.value = false
  showSolicitar.value = true
}
function abrirValor() {
  showDetalhes.value = false
  showValor.value = true
}
function abrirRenovar() {
  showDetalhes.value = false
  showRenovar.value = true
}
async function recarregarTudo() {
  await Promise.all([carregar(), loadCarteira()])
}

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
          Toda a rede é sua, sem limite: quem entra pelo link de um cliente seu também vira cliente seu.
        </p>
      </div>
      <button
        type="button"
        :disabled="carregando"
        class="inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-normal transition-colors shadow-lg shadow-purple-600/30 dark:shadow-purple-600/20"
        @click="recarregarTudo"
      >
        <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': carregando }" aria-hidden="true" />
        <span class="hidden sm:inline">Atualizar</span>
      </button>
    </div>

    <div v-if="erro" class="p-4 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center gap-2">
      <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
      <span>{{ erro }}</span>
    </div>

    <!-- Resumo -->
    <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3">
      <div v-for="card in cards" :key="card.label" :class="[cardBase, 'p-4 min-w-0']">
        <div class="flex items-center justify-between gap-2 mb-1.5">
          <span class="text-[11px] uppercase tracking-wider text-slate-500 dark:text-slate-400 truncate">{{ card.label }}</span>
          <i :class="['fa-solid', card.icone, card.cor, 'text-xs shrink-0']" aria-hidden="true" />
        </div>
        <p class="text-2xl font-medium tabular-nums text-slate-900 dark:text-white leading-tight">
          <span v-if="carregando && !rede.length" class="inline-block h-7 w-10 rounded bg-slate-100 dark:bg-white/10 animate-pulse align-middle" />
          <template v-else>{{ card.valor }}</template>
        </p>
        <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">{{ card.sub }}</p>
      </div>
    </div>

    <!-- Níveis de conexão: filtram a lista -->
    <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
      <button
        v-for="n in NIVEIS"
        :key="n.id"
        type="button"
        class="rounded-md border px-3 py-2.5 text-left transition-colors"
        :class="nivelFiltro === n.id
          ? 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'
          : 'border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.04] hover:border-purple-300 dark:hover:border-purple-500/40'"
        :aria-pressed="nivelFiltro === n.id"
        @click="alternarNivel(n.id)"
      >
        <span class="block text-[11px] whitespace-nowrap" :class="nivelFiltro === n.id ? 'text-purple-700 dark:text-purple-300' : 'text-slate-500 dark:text-slate-400'">{{ n.label }}</span>
        <span class="block text-lg font-medium tabular-nums" :class="(contagemNivel.get(n.id) ?? 0) > 0 ? 'text-slate-900 dark:text-white' : 'text-slate-300 dark:text-slate-600'">
          {{ contagemNivel.get(n.id) ?? 0 }}
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
          placeholder="Nome, responsável ou quem indicou…"
          :class="[campoFiltro, 'w-full pl-8 pr-3 py-2 placeholder:text-slate-400']"
        >
      </div>
      <select v-model="situacaoFiltro" :class="[campoFiltro, 'flex-1 sm:flex-initial px-3 py-2']" aria-label="Situação">
        <option value="todas">Todas as situações</option>
        <option value="ativo">Ativos</option>
        <option value="vencido">Vencidos</option>
        <option value="bloqueado">Bloqueados</option>
        <option value="aguardando">Aguardando ativação</option>
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
      <div v-if="!filtroAtivo && rede.length" class="flex items-center gap-1 sm:ml-auto">
        <button type="button" class="px-3 py-2 rounded-full text-xs text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors" @click="expandirTudo">
          <i class="fa-solid fa-angles-down text-[10px] mr-1" aria-hidden="true" />Expandir tudo
        </button>
        <button type="button" class="px-3 py-2 rounded-full text-xs text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors" @click="recolherTudo">
          <i class="fa-solid fa-angles-up text-[10px] mr-1" aria-hidden="true" />Recolher
        </button>
      </div>
      <p v-else-if="filtroAtivo" class="text-xs text-slate-400 sm:ml-auto">
        {{ listaPlana.length }} de {{ rede.length }} · lista sem árvore enquanto houver filtro
      </p>
    </div>

    <!-- Tabela em árvore -->
    <div :class="['overflow-hidden', cardBase]">
      <div v-if="carregando && !rede.length" class="p-5 space-y-3">
        <div v-for="i in 5" :key="i" class="flex items-center gap-3">
          <div class="w-8 h-8 rounded bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
          <div class="flex-1 space-y-1.5">
            <div class="h-3 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-2/3" />
            <div class="h-2.5 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-1/3" />
          </div>
        </div>
      </div>

      <div v-else-if="!rede.length" class="px-5 py-14 text-center">
        <i class="fa-solid fa-sitemap text-slate-300 dark:text-slate-700 text-3xl mb-2 block" aria-hidden="true" />
        <p class="text-slate-600 dark:text-slate-300 text-sm">Sua rede ainda está vazia</p>
        <p class="text-slate-400 dark:text-slate-500 text-xs mt-1">Quando a Agzap vincular clientes à sua conta, eles aparecem aqui.</p>
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
              <th class="hidden md:table-cell text-left px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider">Vencimento</th>
              <th class="hidden lg:table-cell text-center px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider" title="Clientes que ele indicou diretamente">Diretos</th>
              <th class="hidden lg:table-cell text-center px-4 py-3 text-xs font-normal text-slate-500 uppercase tracking-wider whitespace-nowrap" title="Todos abaixo dele, em qualquer nível">Na rede</th>
              <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-normal text-slate-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-white/5">
            <tr
              v-for="no in linhas"
              :key="no.c.empresa_id"
              class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
            >
              <!-- Cliente: recuo por nível só na árvore -->
              <td class="px-3 sm:px-5 py-2.5">
                <div
                  class="flex items-center gap-2 min-w-0"
                  :style="!filtroAtivo ? { paddingLeft: `${Math.min(no.nivel - 1, 12) * 18}px` } : undefined"
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
                    class="shrink-0 px-1.5 py-0.5 rounded text-[10px] tabular-nums bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 border border-purple-100 dark:border-purple-500/20"
                    :title="`${no.nivel}ª conexão`"
                  >{{ no.nivel }}ª</span>
                  <div class="min-w-0">
                    <p class="text-sm text-slate-800 dark:text-white truncate">{{ no.c.nome }}</p>
                    <p v-if="no.c.responsavel" class="text-xs text-slate-500 truncate max-w-[240px]">{{ no.c.responsavel }}</p>
                    <!-- Celular: o que as colunas escondem -->
                    <div class="sm:hidden mt-1 flex items-center gap-1.5 flex-wrap">
                      <span class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] border" :class="SITUACOES[no.c.situacao].cls">
                        {{ SITUACOES[no.c.situacao].label }}
                      </span>
                      <span v-if="no.c.indicado_por_nome" class="text-[10px] text-slate-400 truncate">por {{ no.c.indicado_por_nome }}</span>
                    </div>
                  </div>
                </div>
              </td>

              <td class="hidden md:table-cell px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400">
                <span v-if="no.c.indicado_por_nome" class="block truncate max-w-[180px]" :title="no.c.indicado_por_empresa_id ? no.c.indicado_por_nome : `${no.c.indicado_por_nome} (fora da sua rede)`">
                  {{ no.c.indicado_por_nome }}
                  <i v-if="!no.c.indicado_por_empresa_id" class="fa-solid fa-arrow-up-right-from-square text-[9px] text-slate-400 ml-0.5" aria-hidden="true" />
                </span>
                <span v-else class="text-slate-400">Você</span>
              </td>

              <td class="hidden lg:table-cell px-4 py-2.5 text-xs text-slate-600 dark:text-slate-400 whitespace-nowrap">
                {{ rotuloPlanoCliente(no.c.plano, no.c.periodo, no.c.status_assinatura) }}
              </td>

              <td class="hidden sm:table-cell px-4 py-2.5 text-center">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs border whitespace-nowrap" :class="SITUACOES[no.c.situacao].cls">
                  <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                  {{ SITUACOES[no.c.situacao].label }}
                </span>
              </td>

              <td class="hidden md:table-cell px-4 py-2.5 text-xs whitespace-nowrap tabular-nums" :class="vencido(no.c.vencimento) ? 'text-red-600 dark:text-red-400' : 'text-slate-600 dark:text-slate-400'">
                {{ fmtData(no.c.vencimento) }}
              </td>

              <td class="hidden lg:table-cell px-4 py-2.5 text-center text-xs tabular-nums" :class="no.c.diretos ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'">
                {{ no.c.diretos }}
              </td>
              <td class="hidden lg:table-cell px-4 py-2.5 text-center text-xs tabular-nums" :class="no.naRede ? 'text-slate-700 dark:text-slate-200' : 'text-slate-400'">
                {{ no.naRede }}
              </td>

              <td class="px-3 sm:px-5 py-2.5 text-right">
                <button
                  type="button"
                  class="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-normal text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-500/30 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors whitespace-nowrap"
                  :title="`Ver detalhes de ${no.c.nome}`"
                  @click="ver(no.c.empresa_id)"
                >
                  <i class="fa-solid fa-eye text-[10px]" aria-hidden="true" />
                  Ver
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <p class="text-xs text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
      <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
      <span>
        "Diretos" são os clientes que ele indicou. "Na rede" conta todos abaixo dele, em qualquer nível.
        O ícone <i class="fa-solid fa-arrow-up-right-from-square text-[9px]" aria-hidden="true" /> marca quem foi indicado por alguém de fora da sua rede.
      </span>
    </p>

    <ParceiroClienteDetalhesModal
      :show="showDetalhes"
      :cliente="clienteSelecionado"
      :empresa-id="detalheId"
      permite-renovar
      @close="showDetalhes = false"
      @solicitar="abrirSolicitacao"
      @editar-valor="abrirValor"
      @renovar="abrirRenovar"
      @changed="loadCarteira()"
    />
    <ParceiroRenovarModal
      :show="showRenovar"
      :cliente="clienteSelecionado"
      :saldos="saldos"
      @close="showRenovar = false"
      @confirmed="recarregarTudo"
    />
    <ParceiroValorAssinaturaModal
      :show="showValor"
      :cliente="clienteSelecionado"
      @close="showValor = false"
      @saved="loadCarteira()"
    />
    <ParceiroSolicitarModal
      :show="showSolicitar"
      :tipo="tipoSolicitacao"
      :cliente="clienteSelecionado"
      :parceiro-nome="parceiro?.nome"
      @close="showSolicitar = false"
    />
  </div>
</template>
