<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { formatarDocumento } from '~~/shared/utils/documento'
import { formatPhoneSemDdiBrasil, whatsappLink } from '~/utils/phone'

/**
 * Aba "Afiliados" da página /afiliados: resumo do programa (recolhido) e a
 * lista de afiliados. Cada linha começa recolhida; ao abrir, carrega a rede
 * de conexões dele (1ª à 5ª) pela rota /api/admin/afiliados/rede, com metas,
 * clientes e comissões por conexão, além dos dados de PIX e do link.
 * Ações por linha: copiar link de indicação, bloquear/desbloquear (com
 * motivo) e remover afiliação (AdminRemoverPapelModal).
 */
export interface AfiliadoAdmin {
  id: string
  nome: string
  email: string
  telefone: string | null
  documento: string | null
  codigo_indicacao: string
  ativo: boolean
  bloqueado_motivo: string | null
  // Afiliação removida (09/10/2026): ≠ bloqueado. Fica escondida e fora dos totais.
  removido_em?: string | null
  created_at: string
  clientes_total: number
  clientes_ativos: number
  conexoes_liberadas: number
  proxima_conexao: { conexao: number; meta: number } | null
  retido: number
  disponivel: number
  em_saque: number
  sacado: number
  saques_abertos: number
}

export interface TotaisAfiliados {
  afiliados_total: number
  afiliados_ativos: number
  clientes_total: number
  clientes_ativos: number
  retido: number
  disponivel: number
  em_saque: number
  saques_abertos: number
  saques_abertos_valor: number
}

type Situacao = 'pagando' | 'cadastrado' | 'atrasado' | 'cancelado'
type Plano = 'mensal' | 'semestral' | 'anual' | null

interface SaldosRede { retido: number; disponivel: number; em_saque: number; sacado: number; cancelado: number }

interface NivelRede {
  conexao: number
  percentual_primeira: number
  percentual_recorrente: number
  meta_clientes: number
  liberada: boolean
  faltam: number
  clientes_total: number
  clientes_ativos: number
  comissoes: SaldosRede
}

interface ClienteRede {
  empresa_id: string
  nome: string
  responsavel: string | null
  nivel: number
  indicado_por_id: string | null
  indicado_por_nome: string | null
  situacao: Situacao
  plano: Plano
  preco: number | null
  diretos: number
  comissao_gerada: number
  ultima_comissao_em: string | null
  cadastrado_em: string
}

interface RedeAdmin {
  afiliado: {
    id: string
    nome: string
    email: string
    telefone: string | null
    documento: string | null
    chave_pix: string | null
    chave_pix_tipo: string | null
    pix_declarado_titular: boolean
    codigo_indicacao: string
    ativo: boolean
    bloqueado_motivo: string | null
    created_at: string
  }
  recebimento: { completo: boolean; faltando: string[] }
  proprios_total: number
  proprios_ativos: number
  liberadas: number
  niveis: NivelRede[]
  clientes: ClienteRede[]
  totais: SaldosRede
}

const emit = defineEmits<{
  totais: [totais: TotaisAfiliados]
  'abrir-saques': []
}>()

const toast = useToast()

const linkIndicacao = (codigo: string) => `https://app.agzap.com.br/login?afiliado=${encodeURIComponent(codigo)}`
const semProtocolo = (url: string) => url.replace(/^https?:\/\//, '')

const afiliados = ref<AfiliadoAdmin[]>([])
const totais = ref<TotaisAfiliados | null>(null)
const carregando = ref(true)
const erro = ref('')
const busca = ref('')

async function carregar() {
  erro.value = ''
  try {
    const resp = await $fetch<{ success: boolean; data?: { afiliados: AfiliadoAdmin[]; totais: TotaisAfiliados }; error?: string }>(
      '/api/admin/afiliados/lista',
      { headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar os afiliados.')
    afiliados.value = resp.data.afiliados
    totais.value = resp.data.totais
    emit('totais', resp.data.totais)

    // Linhas abertas: some quem saiu da lista; quem ficou recarrega a rede.
    const ids = new Set(resp.data.afiliados.map(a => a.id))
    redes.value = {}
    redeErro.value = {}
    for (const id of [...abertos.value]) {
      if (ids.has(id)) carregarRede(id)
      else abertos.value.delete(id)
    }
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Não foi possível carregar os afiliados.'
  } finally {
    carregando.value = false
  }
}

onMounted(() => {
  carregar()
  document.addEventListener('pointerdown', fecharMenuFora)
  document.addEventListener('keydown', fecharMenuEsc)
})
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', fecharMenuFora)
  document.removeEventListener('keydown', fecharMenuEsc)
})

defineExpose({ carregar })

// ───────── Resumo (recolhido) ─────────
const resumoAberto = ref(false)

// ───────── Linhas abertas + rede (carrega ao abrir) ─────────
const abertos = ref(new Set<string>())
const redes = ref<Record<string, RedeAdmin>>({})
const redeCarregando = ref<Record<string, boolean>>({})
const redeErro = ref<Record<string, string>>({})
const pedidosRede = new Map<string, number>()

async function carregarRede(id: string) {
  const pedido = (pedidosRede.get(id) ?? 0) + 1
  pedidosRede.set(id, pedido)
  redeCarregando.value = { ...redeCarregando.value, [id]: true }
  const erros = { ...redeErro.value }
  delete erros[id]
  redeErro.value = erros
  try {
    const resp = await $fetch<{ success: boolean; data?: RedeAdmin; error?: string }>('/api/admin/afiliados/rede', {
      query: { afiliadoId: id },
      headers: await useAdminAuthHeaders(),
    })
    if (pedidosRede.get(id) !== pedido) return
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar a rede.')
    redes.value = { ...redes.value, [id]: resp.data }
  } catch (e: any) {
    if (pedidosRede.get(id) !== pedido) return
    redeErro.value = { ...redeErro.value, [id]: e?.data?.statusMessage || e?.message || 'Não foi possível carregar a rede.' }
  } finally {
    if (pedidosRede.get(id) === pedido) redeCarregando.value = { ...redeCarregando.value, [id]: false }
  }
}

function alternar(a: AfiliadoAdmin) {
  if (abertos.value.has(a.id)) {
    abertos.value.delete(a.id)
    return
  }
  abertos.value.add(a.id)
  if (!redes.value[a.id] && !redeCarregando.value[a.id]) carregarRede(a.id)
}

// Clientes de cada conexão (recolhidos) e "ver todos" quando a lista é longa.
const LIMITE_CLIENTES = 30
const niveisAbertos = ref(new Set<string>())
const niveisCompletos = ref(new Set<string>())

function alternarNivel(afiliadoId: string, conexao: number) {
  const chave = `${afiliadoId}:${conexao}`
  if (niveisAbertos.value.has(chave)) niveisAbertos.value.delete(chave)
  else niveisAbertos.value.add(chave)
}

function clientesDoNivel(afiliadoId: string, conexao: number) {
  const lista = (redes.value[afiliadoId]?.clientes ?? [])
    .filter(c => c.nivel === conexao)
    .sort((x, y) => Number(y.situacao === 'pagando') - Number(x.situacao === 'pagando') || x.nome.localeCompare(y.nome, 'pt-BR'))
  return niveisCompletos.value.has(`${afiliadoId}:${conexao}`) ? lista : lista.slice(0, LIMITE_CLIENTES)
}

// ───────── Menu de ações ─────────
const menuAberto = ref<string | null>(null)

function alternarMenu(id: string) {
  menuAberto.value = menuAberto.value === id ? null : id
}
function fecharMenuFora(ev: Event) {
  if (!menuAberto.value) return
  const alvo = ev.target as HTMLElement | null
  if (alvo?.closest?.('[data-menu-afiliado]')) return
  menuAberto.value = null
}
function fecharMenuEsc(ev: KeyboardEvent) {
  if (ev.key === 'Escape') menuAberto.value = null
}

// ───────── Copiar ─────────
const copiado = ref<string | null>(null)

async function copiar(texto: string, chave: string, mensagem: string) {
  menuAberto.value = null
  try {
    await navigator.clipboard.writeText(texto)
    copiado.value = chave
    toast.success(mensagem)
    setTimeout(() => { if (copiado.value === chave) copiado.value = null }, 2000)
  } catch {
    toast.error('Não foi possível copiar')
  }
}

// ───────── Removidos e busca ─────────
// Afiliação removida não é afiliado: fica fora da lista (a não ser que peça
// para ver). Os totais já vêm sem eles do servidor.
const mostrarRemovidos = ref(false)
const naoRemovidos = computed(() => afiliados.value.filter(a => !a.removido_em))
const qtdRemovidos = computed(() => afiliados.value.length - naoRemovidos.value.length)
const visiveis = computed(() => mostrarRemovidos.value ? afiliados.value : naoRemovidos.value)

const filtrados = computed(() => {
  const q = busca.value.trim().toLowerCase()
  if (!q) return visiveis.value
  const digitos = q.replace(/\D/g, '')
  return visiveis.value.filter(a =>
    a.nome.toLowerCase().includes(q)
    || (a.email || '').toLowerCase().includes(q)
    || a.codigo_indicacao.toLowerCase().includes(q)
    || (digitos.length >= 3 && (
      (a.telefone || '').replace(/\D/g, '').includes(digitos)
      || (a.documento || '').includes(digitos)
    )))
})

// ───────── Bloquear / desbloquear ─────────
const alvoBloqueio = ref<AfiliadoAdmin | null>(null)
const motivoBloqueio = ref('')
const salvandoBloqueio = ref(false)
const vaiBloquear = computed(() => alvoBloqueio.value?.ativo === true)

function abrirBloqueio(a: AfiliadoAdmin) {
  menuAberto.value = null
  alvoBloqueio.value = a
  motivoBloqueio.value = ''
}

function fecharBloqueio() {
  if (salvandoBloqueio.value) return
  alvoBloqueio.value = null
}

async function confirmarBloqueio() {
  const a = alvoBloqueio.value
  if (!a || salvandoBloqueio.value) return
  const bloquear = a.ativo
  const motivo = motivoBloqueio.value.trim()
  if (bloquear && motivo.length < 3) return
  salvandoBloqueio.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/afiliados/bloquear', {
      method: 'POST',
      body: { afiliadoId: a.id, bloquear, motivo: bloquear ? motivo : undefined },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Não foi possível concluir')
    toast.success(bloquear ? `${a.nome} foi bloqueado` : `${a.nome} foi desbloqueado`)
    salvandoBloqueio.value = false
    alvoBloqueio.value = null
    await carregar()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Não foi possível concluir')
  } finally {
    salvandoBloqueio.value = false
  }
}

// ───────── Remover afiliação ─────────
const alvoRemocao = ref<AfiliadoAdmin | null>(null)

function abrirRemocao(a: AfiliadoAdmin) {
  menuAberto.value = null
  alvoRemocao.value = a
}

async function aposRemocao() {
  const id = alvoRemocao.value?.id
  alvoRemocao.value = null
  if (id) abertos.value.delete(id)
  await carregar()
}

// ───────── Aceite do Termo do Afiliado ─────────
const alvoTermos = ref<AfiliadoAdmin | null>(null)

function abrirTermos(a: AfiliadoAdmin) {
  menuAberto.value = null
  alvoTermos.value = a
}

// ───────── Situação (ativo / bloqueado / removido) ─────────
function rotuloSituacao(a: AfiliadoAdmin) {
  if (a.removido_em) return 'Removido'
  return a.ativo ? 'Ativo' : 'Bloqueado'
}
function classeSituacao(a: AfiliadoAdmin) {
  if (a.removido_em) return 'bg-slate-200 dark:bg-white/10 text-slate-600 dark:text-slate-300'
  return a.ativo
    ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
    : 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400'
}

// ───────── Formatação ─────────
function fmtBRL(v: number | null | undefined) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))
}
function fmtData(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}
function fmtPct(v: number) {
  return `${Number(v || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`
}
function rotuloConexoes(a: AfiliadoAdmin) {
  return a.conexoes_liberadas <= 1 ? 'Só a 1ª' : `1ª à ${a.conexoes_liberadas}ª`
}
function faltaParaProxima(a: AfiliadoAdmin) {
  if (!a.proxima_conexao) return null
  const falta = Math.max(0, a.proxima_conexao.meta - a.clientes_ativos)
  return `faltam ${falta} ${falta === 1 ? 'ativo' : 'ativos'} p/ a ${a.proxima_conexao.conexao}ª`
}
function plural(n: number, um: string, varios: string) {
  return `${n} ${n === 1 ? um : varios}`
}
function percentuais(n: NivelRede) {
  if (n.percentual_primeira === n.percentual_recorrente) return `${fmtPct(n.percentual_primeira)} em todo pagamento`
  return `${fmtPct(n.percentual_primeira)} no 1º pagamento · ${fmtPct(n.percentual_recorrente)} recorrente`
}
function progressoMeta(rede: RedeAdmin, n: NivelRede) {
  if (!n.meta_clientes) return 100
  return Math.min(100, Math.round((rede.proprios_ativos / n.meta_clientes) * 100))
}

const DESCRICAO: Record<number, string> = {
  1: 'Clientes que ele trouxe pelo link',
  2: 'Indicados pelos clientes dele',
  3: 'Indicados pela 2ª conexão',
  4: 'Indicados pela 3ª conexão',
  5: 'Indicados pela 4ª conexão',
}

const SITUACOES: Record<Situacao, { rotulo: string; cls: string }> = {
  pagando: { rotulo: 'Ativo', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  cadastrado: { rotulo: 'Em teste', cls: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400' },
  atrasado: { rotulo: 'Atrasado', cls: 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400' },
  cancelado: { rotulo: 'Cancelado', cls: 'bg-slate-200 dark:bg-slate-500/20 text-slate-600 dark:text-slate-300' },
}

const PLANOS: Record<string, string> = { mensal: 'Mensal', semestral: 'Semestral', anual: 'Anual' }

const TIPOS_CHAVE: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Aleatória',
}
function chaveFormatada(r: RedeAdmin['afiliado']) {
  if (!r.chave_pix) return '—'
  if (r.chave_pix_tipo === 'cpf' || r.chave_pix_tipo === 'cnpj') return formatarDocumento(r.chave_pix)
  if (r.chave_pix_tipo === 'telefone') return formatPhoneSemDdiBrasil(r.chave_pix) || r.chave_pix
  return r.chave_pix
}
function tipoDocumento(doc: string | null) {
  const d = String(doc || '').replace(/[^0-9A-Za-z]/g, '')
  return d.length === 11 ? 'CPF' : d.length === 14 ? 'CNPJ' : 'Documento'
}

const kpis = computed(() => {
  const t = totais.value
  return [
    {
      titulo: 'Afiliados ativos',
      valor: String(t?.afiliados_ativos ?? 0),
      sub: `${t?.afiliados_total ?? 0} cadastrados`,
      icone: 'fa-user-check',
      cor: 'bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400',
      destaque: false,
    },
    {
      titulo: 'Clientes trazidos (ativos)',
      valor: String(t?.clientes_ativos ?? 0),
      sub: `${t?.clientes_total ?? 0} no total`,
      icone: 'fa-users',
      cor: 'bg-blue-100 dark:bg-blue-500/15 text-blue-600 dark:text-blue-400',
      destaque: false,
    },
    {
      titulo: 'Retido',
      valor: fmtBRL(t?.retido),
      sub: '7 dias no PIX, 15 no cartão',
      icone: 'fa-hourglass-half',
      cor: 'bg-amber-100 dark:bg-amber-500/15 text-amber-600 dark:text-amber-400',
      destaque: false,
    },
    {
      titulo: 'Disponível',
      valor: fmtBRL(t?.disponivel),
      sub: 'a pagar quando pedirem',
      icone: 'fa-wallet',
      cor: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      destaque: false,
    },
    {
      titulo: 'Saques abertos',
      valor: String(t?.saques_abertos ?? 0),
      sub: t?.saques_abertos ? `${fmtBRL(t.saques_abertos_valor)} para pagar` : 'nenhum pedido aguardando',
      icone: 'fa-money-bill-transfer',
      cor: 'bg-orange-100 dark:bg-orange-500/15 text-orange-600 dark:text-orange-400',
      destaque: (t?.saques_abertos ?? 0) > 0,
    },
  ]
})

const cardBase = 'rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none'
const painelBase = 'rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800'
const tituloPainel = 'text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider'
const colHead = 'text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider'
const itemMenu = 'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors'
</script>

<template>
  <div class="space-y-4">

    <!-- ═════════ Resumo do programa (começa recolhido) ═════════ -->
    <section :class="cardBase">
      <button
        type="button"
        class="w-full flex items-center gap-3 px-4 py-2.5 text-left rounded-md hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
        :aria-expanded="resumoAberto"
        aria-controls="afiliados-resumo"
        @click="resumoAberto = !resumoAberto"
      >
        <span class="size-7 rounded-md bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
          <i class="fa-solid fa-chart-simple text-xs" aria-hidden="true" />
        </span>
        <span class="hidden sm:inline text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider shrink-0">Resumo</span>
        <span v-if="carregando && !totais" class="flex-1 h-4 max-w-md rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
        <span v-else class="flex-1 min-w-0 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-slate-700 dark:text-slate-300">
          <span class="whitespace-nowrap tabular-nums">{{ plural(totais?.afiliados_ativos ?? 0, 'afiliado ativo', 'afiliados ativos') }}</span>
          <span class="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
          <span class="whitespace-nowrap tabular-nums">{{ plural(totais?.clientes_ativos ?? 0, 'cliente ativo', 'clientes ativos') }}</span>
          <span class="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
          <span class="whitespace-nowrap tabular-nums">{{ fmtBRL(totais?.retido) }} retido</span>
          <span class="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
          <span class="whitespace-nowrap tabular-nums">{{ fmtBRL(totais?.disponivel) }} disponível</span>
          <span class="text-slate-300 dark:text-slate-600" aria-hidden="true">·</span>
          <span
            class="whitespace-nowrap tabular-nums"
            :class="(totais?.saques_abertos ?? 0) > 0 ? 'text-orange-600 dark:text-orange-400' : ''"
          >{{ plural(totais?.saques_abertos ?? 0, 'saque aberto', 'saques abertos') }}</span>
        </span>
        <i
          class="fa-solid fa-chevron-down text-xs text-slate-400 shrink-0 transition-transform duration-200"
          :class="{ 'rotate-180': resumoAberto }"
          aria-hidden="true"
        />
      </button>

      <div v-if="resumoAberto" id="afiliados-resumo" class="border-t border-slate-200 dark:border-slate-800 p-3">
        <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <!-- Só "Saques abertos" fica em destaque (quando há pedido) e vira atalho para a aba Saques. -->
          <component
            :is="k.destaque ? 'button' : 'div'"
            v-for="k in kpis"
            :key="k.titulo"
            :type="k.destaque ? 'button' : undefined"
            class="text-left px-3.5 py-3 rounded-md border flex items-start justify-between gap-3 transition-colors min-w-0"
            :class="k.destaque
              ? 'bg-orange-50 dark:bg-orange-500/10 border-orange-200 dark:border-orange-500/25 hover:bg-orange-100/70 dark:hover:bg-orange-500/15'
              : 'bg-slate-50/70 dark:bg-white/[0.02] border-slate-200 dark:border-slate-800'"
            :title="k.destaque ? 'Ver saques abertos' : undefined"
            @click="k.destaque && emit('abrir-saques')"
          >
            <div class="min-w-0">
              <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ k.titulo }}</p>
              <p class="text-lg sm:text-xl font-medium text-slate-900 dark:text-white tabular-nums leading-tight mt-0.5 truncate">{{ k.valor }}</p>
              <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate mt-0.5">{{ k.sub }}</p>
            </div>
            <div class="size-8 rounded-lg flex items-center justify-center shrink-0 text-xs" :class="k.cor">
              <i :class="['fa-solid', k.icone]" aria-hidden="true" />
            </div>
          </component>
        </div>
      </div>
    </section>

    <!-- ═════════ Lista de afiliados ═════════ -->
    <section :class="cardBase">
      <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div class="flex items-center gap-2 min-w-0">
          <h2 class="text-sm font-medium text-slate-900 dark:text-white">Afiliados</h2>
          <span class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] tabular-nums bg-slate-100 dark:bg-white/10 text-slate-600 dark:text-slate-400">{{ naoRemovidos.length }}</span>
          <button
            v-if="qtdRemovidos"
            type="button"
            class="ml-1 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-normal border transition-colors"
            :class="mostrarRemovidos
              ? 'border-slate-400 dark:border-slate-500 text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-white/10'
              : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-white/5'"
            :aria-pressed="mostrarRemovidos"
            @click="mostrarRemovidos = !mostrarRemovidos"
          >
            <i class="fa-solid text-[10px]" :class="mostrarRemovidos ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" />
            {{ mostrarRemovidos ? 'Esconder removidos' : `Mostrar removidos (${qtdRemovidos})` }}
          </button>
        </div>
        <div class="relative w-full sm:w-80">
          <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[11px]" aria-hidden="true" />
          <input
            v-model="busca"
            type="search"
            placeholder="Buscar por nome, e-mail, WhatsApp ou código…"
            aria-label="Buscar afiliado"
            class="w-full pl-8 pr-3 py-2 bg-white dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 rounded-full text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
        </div>
      </div>

      <div v-if="erro" class="m-4 p-3 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center justify-between gap-3">
        <span class="min-w-0">{{ erro }}</span>
        <button type="button" class="text-xs font-normal underline shrink-0" @click="carregar">Tentar de novo</button>
      </div>

      <div v-if="carregando && !afiliados.length" class="p-4 space-y-3">
        <div v-for="i in 4" :key="i" class="flex items-center gap-3">
          <div class="size-9 rounded-full bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
          <div class="flex-1 space-y-1.5">
            <div class="h-3.5 rounded bg-slate-100 dark:bg-white/5 animate-pulse" :class="i % 2 === 0 ? 'w-1/3' : 'w-1/2'" />
            <div class="h-3 w-1/4 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
          </div>
        </div>
      </div>

      <div v-else-if="!filtrados.length && !erro" class="px-5 py-14 text-center">
        <i class="fa-solid fa-people-arrows text-slate-300 dark:text-slate-700 text-3xl mb-3 block" aria-hidden="true" />
        <p class="text-slate-500 dark:text-slate-400 text-sm">
          {{ busca.trim() ? 'Nenhum afiliado com essa busca' : 'Nenhum afiliado ainda. Mande o link de cadastro lá de cima para quem quer indicar a Agzap.' }}
        </p>
      </div>

      <template v-else-if="filtrados.length">
        <!-- Cabeçalho das colunas (telas largas) -->
        <div class="hidden lg:flex items-center gap-3 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-white/[0.02]">
          <span :class="[colHead, 'flex-1 min-w-0 pl-12']">Afiliado</span>
          <span :class="[colHead, 'hidden 2xl:block w-40 shrink-0']">WhatsApp</span>
          <span :class="[colHead, 'hidden xl:block w-20 shrink-0']">Desde</span>
          <span :class="[colHead, 'w-24 shrink-0 text-right']" title="Clientes ativos / total que ele trouxe">Clientes</span>
          <span :class="[colHead, 'hidden xl:block w-28 shrink-0']">Conexões</span>
          <span :class="[colHead, 'w-28 shrink-0 text-right']">Disponível</span>
          <span :class="[colHead, 'w-24 shrink-0']">Situação</span>
          <span class="w-[4.75rem] shrink-0" aria-hidden="true" />
        </div>

        <ul class="divide-y divide-slate-100 dark:divide-slate-800">
          <li v-for="(a, idx) in filtrados" :key="a.id">
            <!-- Linha recolhida -->
            <div
              class="flex items-center gap-3 px-3 sm:px-4 py-3 cursor-pointer transition-colors"
              :class="abertos.has(a.id) ? 'bg-purple-50/40 dark:bg-purple-500/[0.04]' : 'hover:bg-slate-50/80 dark:hover:bg-white/[0.03]'"
              @click="alternar(a)"
            >
              <div class="size-9 rounded-full flex items-center justify-center shrink-0" :class="a.ativo ? 'bg-purple-600' : 'bg-slate-400 dark:bg-slate-600'">
                <span class="text-white text-sm font-medium">{{ a.nome.charAt(0).toUpperCase() }}</span>
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 min-w-0">
                  <p class="text-sm font-medium text-slate-900 dark:text-white truncate">{{ a.nome }}</p>
                  <span
                    class="sm:hidden shrink-0 inline-flex px-1.5 py-0.5 rounded-full text-[10px]"
                    :class="classeSituacao(a)"
                  >{{ rotuloSituacao(a) }}</span>
                </div>
                <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ a.email }}</p>
                <!-- O que não cabe nas colunas desta largura -->
                <div class="2xl:hidden mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                  <span class="lg:hidden tabular-nums whitespace-nowrap">
                    <span :class="a.clientes_ativos ? 'text-emerald-600 dark:text-emerald-400' : ''">{{ a.clientes_ativos }}</span>/{{ a.clientes_total }} clientes
                  </span>
                  <span class="lg:hidden tabular-nums whitespace-nowrap" :class="a.disponivel ? 'text-emerald-600 dark:text-emerald-400' : ''">{{ fmtBRL(a.disponivel) }} disp.</span>
                  <span class="xl:hidden whitespace-nowrap">Conexões: {{ rotuloConexoes(a) }}</span>
                  <span class="xl:hidden tabular-nums whitespace-nowrap">desde {{ fmtData(a.created_at) }}</span>
                  <a
                    v-if="a.telefone && whatsappLink(a.telefone)"
                    :href="whatsappLink(a.telefone) || undefined"
                    target="_blank"
                    rel="noopener"
                    class="inline-flex items-center gap-1 tabular-nums whitespace-nowrap hover:text-emerald-600 dark:hover:text-emerald-400"
                    title="Abrir no WhatsApp"
                    @click.stop
                  >
                    <i class="fa-brands fa-whatsapp text-emerald-500" aria-hidden="true" />
                    {{ formatPhoneSemDdiBrasil(a.telefone) }}
                  </a>
                </div>
              </div>

              <div class="hidden 2xl:block w-40 shrink-0 min-w-0">
                <a
                  v-if="a.telefone && whatsappLink(a.telefone)"
                  :href="whatsappLink(a.telefone) || undefined"
                  target="_blank"
                  rel="noopener"
                  class="inline-flex items-center gap-1.5 text-sm tabular-nums text-slate-700 dark:text-slate-300 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors max-w-full truncate"
                  title="Abrir no WhatsApp"
                  @click.stop
                >
                  <i class="fa-brands fa-whatsapp text-emerald-500" aria-hidden="true" />
                  {{ formatPhoneSemDdiBrasil(a.telefone) }}
                </a>
                <span v-else class="text-sm text-slate-400">—</span>
              </div>

              <div class="hidden xl:block w-20 shrink-0 text-sm tabular-nums text-slate-600 dark:text-slate-400">{{ fmtData(a.created_at) }}</div>

              <div class="hidden lg:block w-24 shrink-0 text-right text-sm tabular-nums" :title="`${a.clientes_ativos} ativos de ${a.clientes_total} trazidos`">
                <span :class="a.clientes_ativos ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'">{{ a.clientes_ativos }}</span>
                <span class="text-slate-400">/{{ a.clientes_total }}</span>
              </div>

              <div class="hidden xl:block w-28 shrink-0" :title="faltaParaProxima(a) || 'Todas as conexões liberadas'">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap"
                  :class="a.conexoes_liberadas > 1
                    ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-600 dark:text-slate-400'"
                >{{ rotuloConexoes(a) }}</span>
              </div>

              <div class="hidden lg:block w-28 shrink-0 text-right">
                <p class="text-sm tabular-nums" :class="a.disponivel ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'">{{ fmtBRL(a.disponivel) }}</p>
                <p v-if="a.em_saque" class="text-[11px] text-orange-600 dark:text-orange-400 tabular-nums">em saque {{ fmtBRL(a.em_saque) }}</p>
              </div>

              <div class="hidden sm:block w-24 shrink-0">
                <span
                  class="inline-flex px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap"
                  :class="classeSituacao(a)"
                  :title="!a.ativo && a.bloqueado_motivo ? a.bloqueado_motivo : undefined"
                >{{ rotuloSituacao(a) }}</span>
              </div>

              <button
                type="button"
                class="size-8 shrink-0 rounded-md flex items-center justify-center text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                :aria-expanded="abertos.has(a.id)"
                :aria-label="abertos.has(a.id) ? `Recolher ${a.nome}` : `Expandir ${a.nome}`"
                @click.stop="alternar(a)"
              >
                <i class="fa-solid fa-chevron-down text-xs transition-transform duration-200" :class="{ 'rotate-180': abertos.has(a.id) }" aria-hidden="true" />
              </button>

              <div class="relative shrink-0" data-menu-afiliado @click.stop>
                <button
                  type="button"
                  class="size-8 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  :class="{ 'bg-slate-100 dark:bg-white/5 text-slate-700 dark:text-slate-200': menuAberto === a.id }"
                  aria-haspopup="menu"
                  :aria-expanded="menuAberto === a.id"
                  :aria-label="`Ações de ${a.nome}`"
                  @click="alternarMenu(a.id)"
                >
                  <i class="fa-solid fa-ellipsis-vertical text-sm" aria-hidden="true" />
                </button>
                <div
                  v-if="menuAberto === a.id"
                  role="menu"
                  class="absolute right-0 z-30 w-60 py-1 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-lg shadow-slate-900/10 dark:shadow-black/40"
                  :class="idx >= filtrados.length - 2 && filtrados.length > 3 ? 'bottom-full mb-1' : 'top-full mt-1'"
                >
                  <button
                    type="button"
                    role="menuitem"
                    :class="[itemMenu, 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800']"
                    @click="copiar(linkIndicacao(a.codigo_indicacao), `link-${a.id}`, `Link de indicação de ${a.nome} copiado`)"
                  >
                    <i class="fa-solid fa-copy w-4 text-center text-xs text-slate-400" aria-hidden="true" />
                    Copiar link de indicação
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    :class="[itemMenu, 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800']"
                    @click="abrirTermos(a)"
                  >
                    <i class="fa-solid fa-file-signature w-4 text-center text-xs text-purple-500" aria-hidden="true" />
                    Termo do Afiliado (aceite)
                  </button>
                  <button
                    type="button"
                    role="menuitem"
                    :class="[itemMenu, 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800']"
                    @click="abrirBloqueio(a)"
                  >
                    <i class="fa-solid w-4 text-center text-xs" :class="a.ativo ? 'fa-ban text-amber-500' : 'fa-unlock text-emerald-500'" aria-hidden="true" />
                    {{ a.ativo ? 'Bloquear' : a.removido_em ? 'Reativar afiliação' : 'Desbloquear' }}
                  </button>
                  <div v-if="!a.removido_em" class="my-1 border-t border-slate-100 dark:border-slate-800" role="separator" />
                  <button
                    v-if="!a.removido_em"
                    type="button"
                    role="menuitem"
                    :class="[itemMenu, 'text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10']"
                    @click="abrirRemocao(a)"
                  >
                    <i class="fa-solid fa-user-minus w-4 text-center text-xs" aria-hidden="true" />
                    Remover afiliação
                  </button>
                </div>
              </div>
            </div>

            <!-- ═════════ Linha aberta ═════════ -->
            <div v-if="abertos.has(a.id)" class="border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/40 px-3 sm:px-4 py-4 space-y-4">

              <div
                v-if="a.removido_em"
                class="rounded-md bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 px-3.5 py-2.5 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2"
              >
                <i class="fa-solid fa-user-minus text-[11px] mt-0.5" aria-hidden="true" />
                <span class="min-w-0 break-words">
                  Afiliação removida em {{ fmtData(a.removido_em) }}. Ele voltou a ser cliente normal e não entra no portal do afiliado; o histórico fica guardado.
                </span>
              </div>
              <div
                v-else-if="!a.ativo"
                class="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-400 flex items-start gap-2"
              >
                <i class="fa-solid fa-ban text-[11px] mt-0.5" aria-hidden="true" />
                <span class="min-w-0 break-words">
                  Bloqueado. Pagamentos dos clientes dele não geram comissão enquanto estiver assim.
                  <template v-if="a.bloqueado_motivo"> Motivo: {{ a.bloqueado_motivo }}</template>
                </span>
              </div>

              <div class="grid gap-4 xl:grid-cols-3 items-start">

                <!-- ── Rede de conexões ── -->
                <div :class="[painelBase, 'xl:col-span-2 min-w-0']">
                  <div class="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
                    <div class="min-w-0">
                      <h3 class="text-sm font-medium text-slate-900 dark:text-white">Rede de conexões</h3>
                      <p class="text-[11px] text-slate-500 dark:text-slate-400">
                        A conexão libera pela quantidade de clientes ativos que ele trouxe direto.
                      </p>
                    </div>
                    <p v-if="redes[a.id]" class="text-xs text-slate-600 dark:text-slate-300 tabular-nums whitespace-nowrap">
                      <span class="text-emerald-600 dark:text-emerald-400">{{ redes[a.id]!.proprios_ativos }}</span>
                      {{ redes[a.id]!.proprios_ativos === 1 ? 'ativo direto' : 'ativos diretos' }}
                      <span class="text-slate-400">de {{ redes[a.id]!.proprios_total }}</span>
                      · até a {{ redes[a.id]!.liberadas }}ª liberada
                    </p>
                  </div>

                  <div v-if="redeErro[a.id]" class="m-4 p-3 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center justify-between gap-3">
                    <span class="min-w-0">{{ redeErro[a.id] }}</span>
                    <button type="button" class="text-xs font-normal underline shrink-0" @click="carregarRede(a.id)">Tentar de novo</button>
                  </div>

                  <div v-else-if="!redes[a.id]" class="p-4 space-y-4">
                    <div v-for="i in 5" :key="i" class="flex items-start gap-3">
                      <div class="size-8 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
                      <div class="flex-1 space-y-1.5">
                        <div class="h-3.5 w-40 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
                        <div class="h-3 w-2/3 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
                      </div>
                    </div>
                  </div>

                  <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800">
                    <li v-for="n in redes[a.id]!.niveis" :key="n.conexao" class="px-4 py-3">
                      <div class="flex items-start gap-3">
                        <div
                          class="size-8 rounded-md flex items-center justify-center text-xs font-medium shrink-0 tabular-nums"
                          :class="n.liberada
                            ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
                            : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'"
                        >{{ n.conexao }}ª</div>

                        <div class="min-w-0 flex-1">
                          <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <p class="text-sm font-medium text-slate-900 dark:text-white">{{ n.conexao }}ª conexão</p>
                            <span
                              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] whitespace-nowrap"
                              :class="n.liberada
                                ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-400'"
                            >
                              <i class="fa-solid text-[8px]" :class="n.liberada ? 'fa-lock-open' : 'fa-lock'" aria-hidden="true" />
                              {{ n.liberada ? 'Liberada' : 'Bloqueada' }}
                            </span>
                            <span class="text-xs text-slate-500 dark:text-slate-400">{{ percentuais(n) }}</span>
                          </div>
                          <p class="text-[11px] text-slate-400 dark:text-slate-500">
                            {{ DESCRICAO[n.conexao] }}
                            <template v-if="n.conexao === 1"> · sempre liberada</template>
                            <template v-else-if="n.liberada"> · meta de {{ n.meta_clientes }} ativos batida</template>
                          </p>

                          <div v-if="!n.liberada" class="mt-2 max-w-sm">
                            <div class="flex items-center justify-between gap-3 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                              <span>{{ redes[a.id]!.proprios_ativos }} de {{ n.meta_clientes }} clientes ativos diretos</span>
                              <span class="shrink-0">faltam {{ n.faltam }}</span>
                            </div>
                            <div class="mt-1 h-1.5 rounded-full bg-slate-200 dark:bg-white/10 overflow-hidden" role="progressbar" :aria-valuenow="progressoMeta(redes[a.id]!, n)" aria-valuemin="0" aria-valuemax="100" :aria-label="`Progresso para liberar a ${n.conexao}ª conexão`">
                              <div class="h-full rounded-full bg-purple-500" :style="{ width: `${progressoMeta(redes[a.id]!, n)}%` }" />
                            </div>
                          </div>

                          <dl class="mt-2 grid grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1.5">
                            <div class="min-w-0">
                              <dt class="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Clientes</dt>
                              <dd class="text-xs tabular-nums text-slate-700 dark:text-slate-200">
                                <span :class="n.clientes_ativos ? 'text-emerald-600 dark:text-emerald-400' : ''">{{ n.clientes_ativos }}</span>
                                {{ n.clientes_ativos === 1 ? 'ativo' : 'ativos' }}
                                <span class="text-slate-400">de {{ n.clientes_total }}</span>
                              </dd>
                            </div>
                            <div class="min-w-0">
                              <dt class="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Retido</dt>
                              <dd class="text-xs tabular-nums" :class="n.comissoes.retido ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'">{{ fmtBRL(n.comissoes.retido) }}</dd>
                            </div>
                            <div class="min-w-0">
                              <dt class="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Disponível</dt>
                              <dd class="text-xs tabular-nums" :class="n.comissoes.disponivel ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'">
                                {{ fmtBRL(n.comissoes.disponivel) }}
                                <span v-if="n.comissoes.em_saque" class="block text-[10px] text-orange-600 dark:text-orange-400">em saque {{ fmtBRL(n.comissoes.em_saque) }}</span>
                              </dd>
                            </div>
                            <div class="min-w-0">
                              <dt class="text-[10px] uppercase tracking-wider text-slate-400 dark:text-slate-500">Sacado</dt>
                              <dd class="text-xs tabular-nums" :class="n.comissoes.sacado ? 'text-slate-900 dark:text-white' : 'text-slate-400'">{{ fmtBRL(n.comissoes.sacado) }}</dd>
                            </div>
                          </dl>
                        </div>

                        <button
                          v-if="n.clientes_total"
                          type="button"
                          class="shrink-0 inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md text-xs text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800 hover:border-purple-300 dark:hover:border-purple-500/40 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                          :aria-expanded="niveisAbertos.has(`${a.id}:${n.conexao}`)"
                          :aria-label="`${niveisAbertos.has(`${a.id}:${n.conexao}`) ? 'Esconder' : 'Ver'} clientes da ${n.conexao}ª conexão`"
                          @click="alternarNivel(a.id, n.conexao)"
                        >
                          <span class="hidden sm:inline">Clientes</span>
                          <span class="tabular-nums">{{ n.clientes_total }}</span>
                          <i class="fa-solid fa-chevron-down text-[10px] transition-transform duration-200" :class="{ 'rotate-180': niveisAbertos.has(`${a.id}:${n.conexao}`) }" aria-hidden="true" />
                        </button>
                        <span v-else class="shrink-0 text-[11px] text-slate-400 dark:text-slate-500 pt-1.5">Nenhum cliente</span>
                      </div>

                      <!-- Clientes desta conexão -->
                      <div v-if="n.clientes_total && niveisAbertos.has(`${a.id}:${n.conexao}`)" class="mt-3 sm:ml-11">
                        <ul class="rounded-md border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 bg-slate-50/50 dark:bg-white/[0.02]">
                          <li
                            v-for="c in clientesDoNivel(a.id, n.conexao)"
                            :key="c.empresa_id"
                            class="px-3 py-2 flex flex-wrap lg:flex-nowrap items-center gap-x-3 gap-y-1"
                          >
                            <div class="min-w-0 flex-1 basis-full lg:basis-auto">
                              <p class="text-sm text-slate-900 dark:text-white truncate" :title="c.responsavel ? `${c.nome} · ${c.responsavel}` : c.nome">{{ c.nome }}</p>
                              <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                                <template v-if="c.nivel === 1">pelo link de {{ a.nome }}</template>
                                <template v-else>indicado por {{ c.indicado_por_nome || '—' }}</template>
                                <template v-if="c.diretos"> · indicou {{ c.diretos }}</template>
                              </p>
                            </div>
                            <span class="inline-flex px-1.5 py-0.5 rounded-full text-[10px] whitespace-nowrap shrink-0" :class="SITUACOES[c.situacao]?.cls">{{ SITUACOES[c.situacao]?.rotulo ?? c.situacao }}</span>
                            <span class="text-xs tabular-nums text-slate-700 dark:text-slate-300 whitespace-nowrap shrink-0 lg:w-36 lg:text-right" title="Valor do plano">
                              {{ c.preco !== null ? fmtBRL(c.preco) : 'Sem valor' }}
                              <span class="text-slate-400">· {{ c.plano ? PLANOS[c.plano] : 'sem plano' }}</span>
                            </span>
                            <span class="text-xs tabular-nums whitespace-nowrap shrink-0 lg:w-28 lg:text-right" :class="c.comissao_gerada ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'" title="Comissão que este cliente já gerou para o afiliado">
                              gerou {{ fmtBRL(c.comissao_gerada) }}
                            </span>
                          </li>
                        </ul>
                        <button
                          v-if="n.clientes_total > LIMITE_CLIENTES && !niveisCompletos.has(`${a.id}:${n.conexao}`)"
                          type="button"
                          class="mt-2 text-xs text-purple-600 dark:text-purple-400 hover:underline"
                          @click="niveisCompletos.add(`${a.id}:${n.conexao}`)"
                        >
                          Mostrar todos os {{ n.clientes_total }} clientes
                        </button>
                      </div>
                    </li>
                  </ul>
                </div>

                <!-- ── Coluna da direita ── -->
                <div class="space-y-4 min-w-0">

                  <!-- Comissões -->
                  <div :class="[painelBase, 'p-4']">
                    <p :class="tituloPainel">Comissões</p>
                    <dl class="mt-3 grid grid-cols-2 gap-3">
                      <div class="min-w-0">
                        <dt class="text-[11px] text-slate-500 dark:text-slate-400">Retido</dt>
                        <dd class="text-base tabular-nums truncate" :class="a.retido ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'">{{ fmtBRL(a.retido) }}</dd>
                      </div>
                      <div class="min-w-0">
                        <dt class="text-[11px] text-slate-500 dark:text-slate-400">Disponível</dt>
                        <dd class="text-base tabular-nums truncate" :class="a.disponivel ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'">{{ fmtBRL(a.disponivel) }}</dd>
                      </div>
                      <div class="min-w-0">
                        <dt class="text-[11px] text-slate-500 dark:text-slate-400">Em saque</dt>
                        <dd class="text-base tabular-nums truncate" :class="a.em_saque ? 'text-orange-600 dark:text-orange-400' : 'text-slate-400'">{{ fmtBRL(a.em_saque) }}</dd>
                      </div>
                      <div class="min-w-0">
                        <dt class="text-[11px] text-slate-500 dark:text-slate-400">Sacado</dt>
                        <dd class="text-base tabular-nums truncate" :class="a.sacado ? 'text-slate-900 dark:text-white' : 'text-slate-400'">{{ fmtBRL(a.sacado) }}</dd>
                      </div>
                    </dl>
                    <p v-if="redes[a.id]?.totais.cancelado" class="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      {{ fmtBRL(redes[a.id]!.totais.cancelado) }} cancelado ou estornado
                    </p>
                    <button
                      v-if="a.saques_abertos"
                      type="button"
                      class="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs text-orange-700 dark:text-orange-300 bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/25 hover:bg-orange-100/70 dark:hover:bg-orange-500/15 transition-colors"
                      @click="emit('abrir-saques')"
                    >
                      <i class="fa-solid fa-money-bill-transfer text-[11px]" aria-hidden="true" />
                      {{ plural(a.saques_abertos, 'saque aberto', 'saques abertos') }} · ver na aba Saques
                    </button>
                  </div>

                  <!-- Recebimento (PIX) -->
                  <div :class="[painelBase, 'p-4']">
                    <div class="flex items-center justify-between gap-2">
                      <p :class="tituloPainel">Recebimento (PIX)</p>
                      <span
                        v-if="redes[a.id]"
                        class="inline-flex px-1.5 py-0.5 rounded-full text-[10px] whitespace-nowrap"
                        :class="redes[a.id]!.recebimento.completo
                          ? 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : 'bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-400'"
                      >{{ redes[a.id]!.recebimento.completo ? 'Completo' : 'Incompleto' }}</span>
                    </div>

                    <div v-if="!redes[a.id]" class="mt-3 space-y-2">
                      <div class="h-3.5 w-2/3 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
                      <div class="h-3.5 w-1/2 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
                    </div>

                    <dl v-else class="mt-3 space-y-2.5">
                      <div class="min-w-0">
                        <dt class="text-[11px] text-slate-500 dark:text-slate-400">
                          Chave {{ redes[a.id]!.afiliado.chave_pix_tipo ? `(${TIPOS_CHAVE[redes[a.id]!.afiliado.chave_pix_tipo!] ?? redes[a.id]!.afiliado.chave_pix_tipo})` : '' }}
                        </dt>
                        <dd class="flex items-center gap-1.5 min-w-0">
                          <span class="text-sm tabular-nums text-slate-800 dark:text-slate-200 break-all min-w-0">{{ chaveFormatada(redes[a.id]!.afiliado) }}</span>
                          <button
                            v-if="redes[a.id]!.afiliado.chave_pix"
                            type="button"
                            class="shrink-0 size-7 rounded flex items-center justify-center transition-colors"
                            :class="copiado === `pix-${a.id}` ? 'text-emerald-500' : 'text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-white/5'"
                            aria-label="Copiar chave PIX"
                            title="Copiar chave PIX"
                            @click="copiar(redes[a.id]!.afiliado.chave_pix!, `pix-${a.id}`, 'Chave PIX copiada')"
                          >
                            <i class="fa-solid text-[11px]" :class="copiado === `pix-${a.id}` ? 'fa-check' : 'fa-copy'" aria-hidden="true" />
                          </button>
                        </dd>
                      </div>
                      <div class="min-w-0">
                        <dt class="text-[11px] text-slate-500 dark:text-slate-400">{{ tipoDocumento(redes[a.id]!.afiliado.documento) }} do afiliado</dt>
                        <dd class="text-sm tabular-nums text-slate-800 dark:text-slate-200">{{ redes[a.id]!.afiliado.documento ? formatarDocumento(redes[a.id]!.afiliado.documento!) : '—' }}</dd>
                      </div>
                      <div class="min-w-0">
                        <dt class="text-[11px] text-slate-500 dark:text-slate-400">Titularidade</dt>
                        <dd class="text-xs flex items-start gap-1.5" :class="redes[a.id]!.afiliado.pix_declarado_titular ? 'text-emerald-700 dark:text-emerald-400' : 'text-amber-700 dark:text-amber-400'">
                          <i class="fa-solid text-[10px] mt-0.5" :class="redes[a.id]!.afiliado.pix_declarado_titular ? 'fa-circle-check' : 'fa-circle-exclamation'" aria-hidden="true" />
                          <span>{{ redes[a.id]!.afiliado.pix_declarado_titular ? 'Declarou que a chave está no nome dele' : 'Ainda não declarou que a chave é dele' }}</span>
                        </dd>
                      </div>
                      <p v-if="!redes[a.id]!.recebimento.completo && redes[a.id]!.recebimento.faltando.length" class="text-[11px] text-amber-700 dark:text-amber-400 pt-2 border-t border-slate-100 dark:border-slate-800">
                        Falta: {{ redes[a.id]!.recebimento.faltando.join(', ') }}.
                      </p>
                    </dl>
                  </div>

                  <!-- Cadastro e indicação -->
                  <div :class="[painelBase, 'p-4']">
                    <p :class="tituloPainel">Cadastro e indicação</p>
                    <dl class="mt-3 space-y-2.5">
                      <div class="min-w-0">
                        <dt class="text-[11px] text-slate-500 dark:text-slate-400">Código de indicação</dt>
                        <dd class="text-sm font-mono text-slate-800 dark:text-slate-200">{{ a.codigo_indicacao }}</dd>
                      </div>
                      <div class="min-w-0">
                        <dt class="text-[11px] text-slate-500 dark:text-slate-400">Link de indicação</dt>
                        <dd class="flex items-center gap-1.5 min-w-0">
                          <span class="text-xs text-slate-700 dark:text-slate-300 truncate min-w-0" :title="linkIndicacao(a.codigo_indicacao)">{{ semProtocolo(linkIndicacao(a.codigo_indicacao)) }}</span>
                          <button
                            type="button"
                            class="shrink-0 size-7 rounded flex items-center justify-center transition-colors"
                            :class="copiado === `link-${a.id}` ? 'text-emerald-500' : 'text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-white/5'"
                            aria-label="Copiar link de indicação"
                            title="Copiar link de indicação"
                            @click="copiar(linkIndicacao(a.codigo_indicacao), `link-${a.id}`, `Link de indicação de ${a.nome} copiado`)"
                          >
                            <i class="fa-solid text-[11px]" :class="copiado === `link-${a.id}` ? 'fa-check' : 'fa-copy'" aria-hidden="true" />
                          </button>
                        </dd>
                      </div>
                      <div class="grid grid-cols-2 gap-3">
                        <div class="min-w-0">
                          <dt class="text-[11px] text-slate-500 dark:text-slate-400">Afiliado desde</dt>
                          <dd class="text-sm tabular-nums text-slate-800 dark:text-slate-200">{{ fmtData(a.created_at) }}</dd>
                        </div>
                        <div class="min-w-0">
                          <dt class="text-[11px] text-slate-500 dark:text-slate-400">WhatsApp</dt>
                          <dd class="text-sm tabular-nums min-w-0">
                            <a
                              v-if="a.telefone && whatsappLink(a.telefone)"
                              :href="whatsappLink(a.telefone) || undefined"
                              target="_blank"
                              rel="noopener"
                              class="inline-flex items-center gap-1 text-slate-800 dark:text-slate-200 hover:text-emerald-600 dark:hover:text-emerald-400 max-w-full truncate"
                            >
                              <i class="fa-brands fa-whatsapp text-emerald-500" aria-hidden="true" />
                              {{ formatPhoneSemDdiBrasil(a.telefone) }}
                            </a>
                            <span v-else class="text-slate-400">—</span>
                          </dd>
                        </div>
                      </div>
                      <div class="min-w-0">
                        <dt class="text-[11px] text-slate-500 dark:text-slate-400">E-mail</dt>
                        <dd class="text-sm text-slate-800 dark:text-slate-200 truncate">{{ a.email }}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </li>
        </ul>
      </template>
    </section>

    <!-- ═════════ Modal: bloquear / desbloquear ═════════ -->
    <BaseModal
      :show="!!alvoBloqueio"
      :title="vaiBloquear ? 'Bloquear afiliado' : 'Desbloquear afiliado'"
      max-width="max-w-lg"
      @close="fecharBloqueio"
    >
      <form v-if="alvoBloqueio" class="space-y-4" @submit.prevent="confirmarBloqueio">
        <p class="text-sm text-slate-600 dark:text-slate-400">
          {{ vaiBloquear ? 'Bloquear' : 'Desbloquear' }}
          <span class="font-medium text-slate-900 dark:text-white">{{ alvoBloqueio.nome }}</span>
          <span class="text-slate-400"> ({{ alvoBloqueio.email }})</span>?
        </p>

        <template v-if="vaiBloquear">
          <ul class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 px-3.5 py-3 space-y-1.5 text-xs text-amber-800 dark:text-amber-300">
            <li class="flex items-start gap-1.5">
              <i class="fa-solid fa-circle-minus text-[10px] mt-0.5" aria-hidden="true" />
              <span>Perde o acesso ao portal de afiliado.</span>
            </li>
            <li class="flex items-start gap-1.5">
              <i class="fa-solid fa-circle-minus text-[10px] mt-0.5" aria-hidden="true" />
              <span>Pagamentos dos clientes dele deixam de gerar comissão enquanto estiver bloqueado.</span>
            </li>
            <li class="flex items-start gap-1.5">
              <i class="fa-solid fa-circle-check text-[10px] mt-0.5" aria-hidden="true" />
              <span>O que ele já ganhou continua registrado. Saques já pedidos seguem na aba Saques para você pagar ou recusar.</span>
            </li>
          </ul>
          <div>
            <label for="afiliado-motivo-bloqueio" class="block text-sm text-slate-700 dark:text-slate-300 mb-1.5">Motivo do bloqueio</label>
            <textarea
              id="afiliado-motivo-bloqueio"
              v-model="motivoBloqueio"
              rows="3"
              maxlength="500"
              required
              placeholder="Ex.: divulgação enganosa, cadastro duplicado…"
              class="w-full px-3.5 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
            />
            <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Obrigatório. Fica registrado no cadastro do afiliado.</p>
          </div>
        </template>

        <template v-else>
          <div v-if="alvoBloqueio.bloqueado_motivo" class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 px-3.5 py-3">
            <p class="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider">Motivo do bloqueio</p>
            <p class="text-sm text-slate-800 dark:text-slate-200 mt-0.5 whitespace-pre-line break-words">{{ alvoBloqueio.bloqueado_motivo }}</p>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
            <i class="fa-solid fa-circle-info text-[10px] mt-0.5" aria-hidden="true" />
            <span>Ele volta a entrar no portal e a ganhar comissão nos próximos pagamentos. Pagamentos feitos enquanto estava bloqueado não geram comissão depois.</span>
          </p>
        </template>

        <div class="flex gap-2 pt-1">
          <button
            type="button"
            :disabled="salvandoBloqueio"
            class="flex-1 px-4 py-2.5 rounded text-sm font-normal border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
            @click="fecharBloqueio"
          >
            Cancelar
          </button>
          <button
            type="submit"
            :disabled="salvandoBloqueio || (vaiBloquear && motivoBloqueio.trim().length < 3)"
            class="flex-1 px-4 py-2.5 rounded text-sm font-normal text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            :class="vaiBloquear ? 'bg-red-600 hover:bg-red-700' : 'bg-purple-600 hover:bg-purple-700'"
          >
            <i v-if="salvandoBloqueio" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
            {{ salvandoBloqueio ? 'Salvando…' : (vaiBloquear ? 'Bloquear' : 'Desbloquear') }}
          </button>
        </div>
      </form>
    </BaseModal>

    <!-- ═════════ Modal: remover afiliação ═════════ -->
    <AdminRemoverPapelModal
      :show="!!alvoRemocao"
      tipo="afiliacao"
      :afiliado-id="alvoRemocao?.id"
      :nome="alvoRemocao?.nome"
      @close="alvoRemocao = null"
      @removido="aposRemocao"
    />

    <!-- ═════════ Modal: aceite do Termo do Afiliado ═════════ -->
    <AdminAfiliadoTermosModal :show="!!alvoTermos" :afiliado="alvoTermos" @close="alvoTermos = null" />
  </div>
</template>
