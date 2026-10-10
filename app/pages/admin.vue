<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { AdminCliente } from '~/composables/useAdminClientes'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

const {
  clientes, stats, loading, error,
  loadClientes, desativarCliente, reativarCliente, renovarAssinatura,
  excluirCliente, editarCliente, diasParaVencimento, isVencido,
} = useAdminClientes()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null
onMounted(async () => {
  toast = await useToastSafe()
  await loadClientes()
})

const showRenovarModal = ref(false)
// Saldo de indicação (ver/usar em desconto ou serviço)
const showSaldoIndicacao = ref(false)
const clienteSaldoIndicacao = ref<{ id: string; nome: string } | null>(null)
function handleSaldoIndicacao(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { clienteSaldoIndicacao.value = { id: c.id, nome: c.nome }; showSaldoIndicacao.value = true }
}
// Quem indicou este cliente (badge "Indicação de …"): ver e remover
const showIndicacaoVinculo = ref(false)
const clienteIndicacaoVinculo = ref<{ id: string; nome: string } | null>(null)
function handleVerIndicacao(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (!c) return
  showUsoModal.value = false
  clienteIndicacaoVinculo.value = { id: c.id, nome: c.nome }
  showIndicacaoVinculo.value = true
}
async function onIndicacaoRemovida(r: { mesesCancelados: number; valorCancelado: number; indicadora: string }) {
  showIndicacaoVinculo.value = false
  clienteIndicacaoVinculo.value = null
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  toast?.success(r.mesesCancelados > 0
    ? `Indicação de ${r.indicadora} removida. ${r.mesesCancelados} ${r.mesesCancelados === 1 ? 'mês cancelado' : 'meses cancelados'} (${brl(r.valorCancelado)}).`
    : `Indicação de ${r.indicadora} removida.`)
  await loadClientes()
}
const clienteRenovar = computed(() => clientes.value.find(x => x.id === selectedCliente.value?.id) || null)
const showExcluirModal = ref(false)
const showEditarModal = ref(false)
const showDesativarModal = ref(false)
const showReativarModal = ref(false)
const showLimiteInstanciasModal = ref(false)
const showAtribuirParceiroModal = ref(false)
const showUsoModal = ref(false)
const clienteUso = ref<AdminCliente | null>(null)

const selectedCliente = ref<{ id: string; nome: string } | null>(null)
const clienteParaEditar = ref<any>(null)
const clienteLimiteInstancias = ref<{
  id: string
  nome: string
  max_instancias: number
  max_agentes: number
  max_webhooks_entrada: number
  max_webhooks_saida: number
} | null>(null)
const showModulosModal = ref(false)
const clienteModulos = ref<{
  id: string
  nome: string
  roteamento_habilitado: boolean
  agendamentos_habilitado: boolean
  pagina_agendamento_habilitada: boolean
  api_assistente_habilitada: boolean
  webhooks_habilitado: boolean
  documentacao_habilitada: boolean
  envios_habilitado: boolean
  max_envios_mes: number
  max_profissionais: number
  max_clientes: number
  delivery_modulo_ativo: boolean
  max_macros: number
  max_acoes_macro: number
  max_pedidos_mes: number
  max_produtos_vitrine: number
  vitrine_habilitada: boolean
  imoveis_modulo_ativo: boolean
  max_imoveis: number
} | null>(null)

const searchQuery = ref('')
const filterStatus = ref('all')
const filterPlan = ref('all')
// Filtro por parceiro: 'all', 'sem' (sem parceiro = cliente direto da Agzap)
// ou o id do parceiro (nunca o nome: nomes podem se repetir).
const filterParceiro = ref('all')
// Filtro por afiliado que TROUXE o cliente (1ª conexão): 'all' ou o id dele.
const filterAfiliado = ref('all')
const isRefreshing = ref(false)

// A página inteira em abas (pedido do dono, 28/09/2026): antes as
// estatísticas e o token ficavam empilhados em cima da lista, e a lista
// (que é o que se usa no dia a dia) ficava lá embaixo. Cada aba tem um
// objetivo só:
//  - Clientes em dia / Vencidos: a lista, separada porque é ordenada por
//    dias restantes — os vencidos subiam pro topo e empurravam a carteira;
//  - Estatísticas: os indicadores e a distribuição por plano;
//  - Token OpenAI: a configuração do token global.
// A aba vai na URL (?aba=), então um F5 volta pra mesma aba.
type Aba = 'em-dia' | 'vencidos' | 'estatisticas' | 'token'
const ABAS_VALIDAS: Aba[] = ['em-dia', 'vencidos', 'estatisticas', 'token']
const rotaAdmin = useRoute()
const roteadorAdmin = useRouter()
const abaDaUrl = String(rotaAdmin.query.aba || '') as Aba
const abaAtiva = ref<Aba>(ABAS_VALIDAS.includes(abaDaUrl) ? abaDaUrl : 'em-dia')
const ehAbaDeLista = computed(() => abaAtiva.value === 'em-dia' || abaAtiva.value === 'vencidos')

const clientesDaAba = computed(() =>
  clientes.value.filter(c => isVencido(c) === (abaAtiva.value === 'vencidos')),
)

// count null = aba sem contador (Estatísticas e Token não são listas)
const abas = computed<{ value: Aba; label: string; icon: string; count: number | null; tone: '' | 'red' }[]>(() => {
  const vencidos = clientes.value.filter(c => isVencido(c)).length
  return [
    { value: 'em-dia', label: 'Clientes em dia', icon: 'fa-users', count: clientes.value.length - vencidos, tone: '' },
    { value: 'vencidos', label: 'Vencidos', icon: 'fa-triangle-exclamation', count: vencidos, tone: 'red' },
    { value: 'estatisticas', label: 'Estatísticas', icon: 'fa-chart-pie', count: null, tone: '' },
    { value: 'token', label: 'Token OpenAI', icon: 'fa-key', count: null, tone: '' },
  ]
})

// Os chips valem só dentro da aba, e cada aba tem status diferentes — trocar
// de aba mantendo o chip anterior daria lista vazia sem explicação.
function selecionarAba(v: Aba) {
  abaAtiva.value = v
  filterStatus.value = 'all'
  roteadorAdmin.replace({ query: { ...rotaAdmin.query, aba: v === 'em-dia' ? undefined : v } })
}

async function refreshData() {
  isRefreshing.value = true
  await loadClientes()
  isRefreshing.value = false
}

const filteredClientes = computed(() => {
  let filtered = clientesDaAba.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    filtered = filtered.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      c.nome_cliente?.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.whatsapp?.includes(q),
    )
  }
  if (filterStatus.value !== 'all') {
    if (filterStatus.value === 'vencendo-hoje') {
      filtered = filtered.filter(c => diasParaVencimento(c) === 0)
    } else {
      filtered = filtered.filter(c => c.subscription_status === filterStatus.value)
    }
  }
  if (filterPlan.value !== 'all') {
    filtered = filtered.filter(c => c.subscription_plan === filterPlan.value)
  }
  if (filterParceiro.value === 'sem') {
    filtered = filtered.filter(c => !c.parceiro_id)
  } else if (filterParceiro.value !== 'all') {
    filtered = filtered.filter(c => c.parceiro_id === filterParceiro.value)
  }
  if (filterAfiliado.value !== 'all') {
    filtered = filtered.filter(c => c.afiliado_id === filterAfiliado.value)
  }
  return filtered.slice().sort((a, b) => {
    const dA = diasParaVencimento(a)
    const dB = diasParaVencimento(b)
    if (dA !== dB) return dA - dB
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
  })
})

// Distribuição de planos (apenas visual — barra empilhada no lugar dos 4 cards de plano)
const planDistribution = computed(() => {
  const list = clientes.value
  const count = (p: string) => list.filter(c => c.subscription_plan === p).length
  const pro = count('pro'), basic = count('basic'), enterprise = count('enterprise'), free = count('free')
  const total = pro + basic + enterprise + free || 1
  return [
    { key: 'pro',        label: 'Pro',        value: pro,        bar: 'bg-purple-500',  dot: 'bg-purple-500',  pct: (pro / total) * 100 },
    { key: 'basic',      label: 'Básico',     value: basic,      bar: 'bg-blue-500',    dot: 'bg-blue-500',    pct: (basic / total) * 100 },
    { key: 'enterprise', label: 'Enterprise', value: enterprise, bar: 'bg-slate-500',   dot: 'bg-slate-500',   pct: (enterprise / total) * 100 },
    { key: 'free',       label: 'Gratuito',   value: free,       bar: 'bg-emerald-500', dot: 'bg-emerald-500', pct: (free / total) * 100 },
  ]
})

// Contagem por status dentro da aba atual (mesma lógica do filteredClientes)
const statusCounts = computed<Record<string, number>>(() => {
  const base = clientesDaAba.value
  return {
    all: base.length,
    active: base.filter(c => c.subscription_status === 'active').length,
    trial: base.filter(c => c.subscription_status === 'trial').length,
    'vencendo-hoje': base.filter(c => diasParaVencimento(c) === 0).length,
    canceled: base.filter(c => c.subscription_status === 'canceled').length,
  }
})

const statusChips = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'trial', label: 'Trial' },
  { value: 'vencendo-hoje', label: 'Vencendo hoje', tone: 'orange' },
  { value: 'canceled', label: 'Cancelados' },
] as const

// ───────── Filtros por parceiro e por afiliado (09/10/2026) ─────────
// As opções listam só quem tem cliente na base. A contagem entre parênteses é
// da aba aberta, para bater com o que a lista mostra ao escolher.
const opcoesParceiro = computed(() => {
  const mapa = new Map<string, { id: string; nome: string; total: number }>()
  for (const c of clientes.value) {
    if (c.parceiro_id && !mapa.has(c.parceiro_id)) {
      mapa.set(c.parceiro_id, { id: c.parceiro_id, nome: c.parceiro_nome || 'Parceiro sem nome', total: 0 })
    }
  }
  for (const c of clientesDaAba.value) {
    if (c.parceiro_id) mapa.get(c.parceiro_id)!.total++
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
})
const semParceiroNaAba = computed(() => clientesDaAba.value.filter(c => !c.parceiro_id).length)
const opcoesAfiliado = computed(() => {
  const mapa = new Map<string, { id: string; nome: string; removido: boolean; total: number }>()
  for (const c of clientes.value) {
    if (c.afiliado_id && !mapa.has(c.afiliado_id)) {
      mapa.set(c.afiliado_id, { id: c.afiliado_id, nome: c.afiliado_nome || 'Afiliado sem nome', removido: !!c.afiliado_removido, total: 0 })
    }
  }
  for (const c of clientesDaAba.value) {
    if (c.afiliado_id) mapa.get(c.afiliado_id)!.total++
  }
  return [...mapa.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' }))
})
const afiliadoSelecionado = computed(() => opcoesAfiliado.value.find(a => a.id === filterAfiliado.value) || null)
// Se o parceiro/afiliado escolhido some da base (ex.: depois de "Remover do
// parceiro" + recarregar), o filtro volta para "todos" em vez de lista vazia.
watch([opcoesParceiro, opcoesAfiliado], () => {
  if (filterParceiro.value !== 'all' && filterParceiro.value !== 'sem'
    && !opcoesParceiro.value.some(p => p.id === filterParceiro.value)) filterParceiro.value = 'all'
  if (filterAfiliado.value !== 'all' && !opcoesAfiliado.value.some(a => a.id === filterAfiliado.value)) filterAfiliado.value = 'all'
})

// ───────── Resumo do topo (redesenho 09/10/2026) ─────────
// Dois cartões (Clientes e Vencimentos) calculados da lista carregada, sempre
// sobre TODA a base (as duas abas de lista). Nada de número inventado. O
// cartão de mensalidades cadastradas foi para o Dashboard (pedido do dono).
interface CardResumo {
  key: string
  titulo: string
  icon: string
  tom: 'lavanda' | 'menta' | 'ambar' | 'ceu'
  principalLabel: string
  principal: string
  principalDetalhe: string
  tiles: { label: string; icon: string; iconCls: string; valor: string; detalhe: string }[]
}
// Enquanto a lista não chegou (ou falhou), os cartões mostram "—" em vez de zeros.
const resumoPronto = computed(() => clientes.value.length > 0 || (!loading.value && !error.value))
const cardsResumo = computed<CardResumo[]>(() => {
  const todos = clientes.value
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
  const emDia = todos.filter(c => !isVencido(c))
  // Mesmas regras dos chips "Ativos" e "Trial" da aba Clientes em dia.
  const ativos = emDia.filter(c => c.subscription_status === 'active')
  const emTeste = emDia.filter(c => c.subscription_status === 'trial')
  const vencem7 = emDia.filter(c => {
    const d = diasParaVencimento(c)
    return Number.isFinite(d) && d >= 0 && d <= 7
  }).length
  const vencemHoje = emDia.filter(c => diasParaVencimento(c) === 0).length
  const vencidos = todos.length - emDia.length
  const cancelados = todos.filter(c => c.subscription_status === 'canceled').length
  const cancelamentoAgendado = todos.filter(c => c.cancel_at_period_end && c.subscription_status !== 'canceled').length

  return [
    {
      key: 'clientes',
      titulo: 'Clientes',
      icon: 'fa-users',
      tom: 'lavanda',
      principalLabel: 'Total na base',
      principal: String(todos.length),
      principalDetalhe: stats.value.clientesEssaSemana
        ? `+${stats.value.clientesEssaSemana} nos últimos 7 dias`
        : 'Nenhum novo nos últimos 7 dias',
      tiles: [
        { label: 'Ativos', icon: 'fa-circle-check', iconCls: 'text-emerald-500', valor: String(ativos.length), detalhe: 'assinatura em dia' },
        { label: 'Em teste', icon: 'fa-hourglass-half', iconCls: 'text-amber-500', valor: String(emTeste.length), detalhe: 'trial em andamento' },
      ],
    },
    {
      key: 'vencimentos',
      titulo: 'Vencimentos',
      icon: 'fa-calendar-day',
      tom: 'ambar',
      principalLabel: 'Vencem em até 7 dias',
      principal: String(vencem7),
      principalDetalhe: vencemHoje
        ? `${plural(vencemHoje, 'vence', 'vencem')} hoje`
        : 'Nenhum vence hoje',
      tiles: [
        { label: 'Vencidos', icon: 'fa-triangle-exclamation', iconCls: 'text-red-500', valor: String(vencidos), detalhe: 'na aba Vencidos' },
        {
          label: 'Cancelados',
          icon: 'fa-ban',
          iconCls: 'text-slate-400',
          valor: String(cancelados),
          detalhe: cancelamentoAgendado
            ? `+${cancelamentoAgendado} com cancelamento agendado`
            : 'assinatura encerrada',
        },
      ],
    },
  ]
})

function handleDesativar(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { selectedCliente.value = { id: c.id, nome: c.nome }; showDesativarModal.value = true }
}
async function confirmDesativar() {
  if (!selectedCliente.value) return
  try {
    await desativarCliente(selectedCliente.value.id)
    toast?.success('Cliente desativado')
  } catch { toast?.error('Erro ao desativar cliente') }
  showDesativarModal.value = false
  selectedCliente.value = null
}

function handleReativar(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { selectedCliente.value = { id: c.id, nome: c.nome }; showReativarModal.value = true }
}
async function confirmReativar() {
  if (!selectedCliente.value) return
  try {
    await reativarCliente(selectedCliente.value.id)
    toast?.success('Cliente reativado')
  } catch { toast?.error('Erro ao reativar cliente') }
  showReativarModal.value = false
  selectedCliente.value = null
}

function handleRenovar(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { selectedCliente.value = { id: c.id, nome: c.nome }; showRenovarModal.value = true }
}
async function confirmRenovar(plan: string, period: string, abater = 0, ancora?: 'vencimento' | 'hoje') {
  if (!selectedCliente.value) return
  try {
    await renovarAssinatura(selectedCliente.value.id, plan as any, period as any, ancora)
    if (abater > 0) {
      // Desconto do saldo de indicação nesta renovação (cliente de Pix)
      try {
        await $fetch('/api/admin/indicacao-usar-saldo', {
          method: 'POST', headers: await useAdminAuthHeaders(),
          body: { empresaId: selectedCliente.value.id, valor: abater, descricao: `Desconto na renovação (${period}) de ${new Date().toLocaleDateString('pt-BR')}` },
        })
        toast?.success(`Assinatura renovada · ${abater.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} de saldo de indicação abatido`)
      } catch (e: any) {
        toast?.error(`Renovada, mas não registrei o desconto da indicação: ${e?.data?.statusMessage || 'erro'}`)
      }
    } else {
      toast?.success('Assinatura renovada')
    }
  } catch { toast?.error('Erro ao renovar assinatura') }
  showRenovarModal.value = false
  selectedCliente.value = null
}

function handleEditar(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { clienteParaEditar.value = c; showEditarModal.value = true }
}
async function confirmEditar(dados: any) {
  if (!clienteParaEditar.value) return
  try {
    await editarCliente(clienteParaEditar.value.id, dados)
    toast?.success('Cliente editado')
  } catch { toast?.error('Erro ao editar cliente') }
  showEditarModal.value = false
  clienteParaEditar.value = null
}

function handleExcluir(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { selectedCliente.value = { id: c.id, nome: c.nome }; showExcluirModal.value = true }
}
async function confirmExcluir() {
  if (!selectedCliente.value) return
  try {
    await excluirCliente(selectedCliente.value.id)
    toast?.success('Cliente excluído')
  } catch { toast?.error('Erro ao excluir cliente') }
  showExcluirModal.value = false
  selectedCliente.value = null
}

function handleAtribuirParceiro(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { selectedCliente.value = { id: c.id, nome: c.nome }; showAtribuirParceiroModal.value = true }
}

// ───────── Remover o cliente do parceiro ─────────
const showRemoverParceiroModal = ref(false)
const parceiroDoCliente = ref<string | null>(null)

function handleRemoverParceiro(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (!c) return
  selectedCliente.value = { id: c.id, nome: c.nome }
  parceiroDoCliente.value = (c as any).parceiro_nome ?? null
  showRemoverParceiroModal.value = true
}

async function confirmRemoverParceiro() {
  if (!selectedCliente.value) return
  try {
    const resp = await $fetch<{
      success: boolean
      error?: string
      data?: { parceiroNome: string | null; clienteSegueBloqueado: boolean }
    }>('/api/admin/remover-parceiro', {
      method: 'POST',
      body: { empresaId: selectedCliente.value.id },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    toast?.success('Cliente desvinculado do parceiro')
    if (resp.data?.clienteSegueBloqueado) {
      toast?.warning('O cliente continua bloqueado — reative por "Reativar cliente" se for o caso')
    }
    await loadClientes()
  } catch (e: any) {
    toast?.error(e?.data?.statusMessage || e?.message || 'Erro ao remover a atribuição')
  }
  showRemoverParceiroModal.value = false
  selectedCliente.value = null
  parceiroDoCliente.value = null
}

// Tornar parceiro / afiliado (09/10/2026): um papel por vez. Se o dono tem o
// outro papel, o modal mostra a troca automática (o que sai) e faz tudo junto.
const tornarPapel = ref<{ tipo: 'parceiro' | 'afiliado'; empresaId: string; nome: string } | null>(null)
function handleTornarParceiro(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) tornarPapel.value = { tipo: 'parceiro', empresaId: c.id, nome: c.nome_cliente || c.nome }
}
function handleTornarAfiliado(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) tornarPapel.value = { tipo: 'afiliado', empresaId: c.id, nome: c.nome_cliente || c.nome }
}
async function onPapelTrocado() {
  tornarPapel.value = null
  await loadClientes()
}

// Remover parceria / afiliação do dono da empresa (09/10/2026): um papel
// ativo por vez. O modal mostra a prévia e faz a remoção.
const removerPapel = ref<{ tipo: 'parceria' | 'afiliacao'; empresaId: string; nome: string } | null>(null)
function handleRemoverParceria(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) removerPapel.value = { tipo: 'parceria', empresaId: c.id, nome: c.nome_cliente || c.nome }
}
function handleRemoverAfiliacao(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) removerPapel.value = { tipo: 'afiliacao', empresaId: c.id, nome: c.nome_cliente || c.nome }
}
async function onPapelRemovido() {
  removerPapel.value = null
  await loadClientes()
}

function handleLimiteInstancias(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) {
    clienteLimiteInstancias.value = {
      id: c.id,
      nome: c.nome,
      max_instancias: c.max_instancias ?? 1,
      max_agentes: c.max_agentes ?? 1,
      max_webhooks_entrada: c.max_webhooks_entrada ?? 5,
      max_webhooks_saida: c.max_webhooks_saida ?? 5,
    }
    showLimiteInstanciasModal.value = true
  }
}
async function confirmLimiteInstancias(limites: { maxInstancias: number; maxAgentes: number; maxWebhooksEntrada: number; maxWebhooksSaida: number }) {
  if (!clienteLimiteInstancias.value) return
  try {
    const resp = await $fetch<{ success: boolean }>('/api/admin/limite-instancias', {
      method: 'POST',
      body: {
        clienteId: clienteLimiteInstancias.value.id,
        maxInstancias: limites.maxInstancias,
        maxAgentes: limites.maxAgentes,
        maxWebhooksEntrada: limites.maxWebhooksEntrada,
        maxWebhooksSaida: limites.maxWebhooksSaida,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error('Erro')
    const c = clientes.value.find(x => x.id === clienteLimiteInstancias.value!.id)
    if (c) {
      c.max_instancias = limites.maxInstancias
      c.max_agentes = limites.maxAgentes
      c.max_webhooks_entrada = limites.maxWebhooksEntrada
      c.max_webhooks_saida = limites.maxWebhooksSaida
    }
    toast?.success('Limites atualizados')
  } catch { toast?.error('Erro ao atualizar limites') }
  showLimiteInstanciasModal.value = false
  clienteLimiteInstancias.value = null
}

function handleModulos(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) {
    clienteModulos.value = {
      id: c.id,
      nome: c.nome,
      // Add-on pago desde 28/09/2026 (igual envios/delivery): ausente = bloqueado.
      roteamento_habilitado: c.roteamento_habilitado === true,
      agendamentos_habilitado: c.agendamentos_habilitado ?? true,
      pagina_agendamento_habilitada: c.pagina_agendamento_habilitada ?? true,
      api_assistente_habilitada: c.api_assistente_habilitada ?? true,
      webhooks_habilitado: c.webhooks_habilitado ?? true,
      documentacao_habilitada: c.documentacao_habilitada ?? true,
      // Add-on pago: ausente = bloqueado (os outros gates são permissivos).
      envios_habilitado: c.envios_habilitado ?? false,
      max_envios_mes: c.max_envios_mes ?? 0,
      max_profissionais: c.max_profissionais ?? 20,
      max_clientes: c.max_clientes ?? 100000,
      delivery_modulo_ativo: c.delivery_modulo_ativo ?? false,
      max_macros: c.max_macros ?? 5,
      max_acoes_macro: c.max_acoes_macro ?? 5,
      max_pedidos_mes: c.max_pedidos_mes ?? 0,
      max_produtos_vitrine: c.max_produtos_vitrine ?? 0,
      vitrine_habilitada: c.vitrine_habilitada ?? true,
      // Add-on pago (01/10/2026), igual Delivery: ausente = bloqueado.
      imoveis_modulo_ativo: c.imoveis_modulo_ativo ?? false,
      max_imoveis: c.max_imoveis ?? 100,
    }
    showModulosModal.value = true
  }
}
// Espelha ModulosEmpresa do AdminModulosModal (tipo declarado aqui em vez de
// importado do .vue: import de tipo entre SFCs quebra fácil no vue-tsc).
async function confirmModulos(modulos: {
  roteamentoHabilitado: boolean
  agendamentosHabilitado: boolean
  paginaAgendamentoHabilitada: boolean
  apiAssistenteHabilitada: boolean
  webhooksHabilitado: boolean
  documentacaoHabilitada: boolean
  enviosHabilitado: boolean
  maxEnviosMes: number
  maxProfissionais: number
  maxClientes: number
  deliveryModuloAtivo: boolean
  maxMacros: number
  maxAcoesMacro: number
  maxPedidosMes: number
  maxProdutosVitrine: number
  vitrineHabilitada: boolean
  imoveisModuloAtivo: boolean
  maxImoveis: number
}) {
  if (!clienteModulos.value) return
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/modulos', {
      method: 'POST',
      body: { clienteId: clienteModulos.value.id, ...modulos },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error)
    const c = clientes.value.find(x => x.id === clienteModulos.value!.id)
    if (c) {
      c.roteamento_habilitado = modulos.roteamentoHabilitado
      c.agendamentos_habilitado = modulos.agendamentosHabilitado
      c.pagina_agendamento_habilitada = modulos.paginaAgendamentoHabilitada
      c.api_assistente_habilitada = modulos.apiAssistenteHabilitada
      c.webhooks_habilitado = modulos.webhooksHabilitado
      c.documentacao_habilitada = modulos.documentacaoHabilitada
      c.envios_habilitado = modulos.enviosHabilitado
      c.max_envios_mes = modulos.maxEnviosMes
      c.max_profissionais = modulos.maxProfissionais
      c.max_clientes = modulos.maxClientes
      c.delivery_modulo_ativo = modulos.deliveryModuloAtivo
      c.max_macros = modulos.maxMacros
      c.max_acoes_macro = modulos.maxAcoesMacro
      c.max_pedidos_mes = modulos.maxPedidosMes
      c.max_produtos_vitrine = modulos.maxProdutosVitrine
      c.vitrine_habilitada = modulos.vitrineHabilitada
      c.imoveis_modulo_ativo = modulos.imoveisModuloAtivo
      c.max_imoveis = modulos.maxImoveis
    }
    toast?.success('Módulos atualizados')
  } catch { toast?.error('Erro ao atualizar módulos') }
  showModulosModal.value = false
  clienteModulos.value = null
}

function handleVerUso(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) {
    clienteUso.value = c
    showUsoModal.value = true
  }
}
// "Editar limites" dentro do modal de uso: fecha o de uso e abre o de
// módulos direto, sem o usuário precisar fechar/reabrir pela linha.
function abrirModulosDeUso(id: string) {
  showUsoModal.value = false
  clienteUso.value = null
  handleModulos(id)
}
</script>

<template>
  <!-- Topo mais perto da barra (09/10/2026): pouco respiro em cima e o h1
       invisível fora do space-y (antes ele somava margem antes das abas). -->
  <div class="px-4 pt-3 pb-6 sm:px-6 md:px-10 md:pt-4 md:pb-8">
    <h1 class="sr-only">Clientes</h1>
    <div class="max-w-[1400px] mx-auto space-y-4">
      <!-- Abas da página (pedido do dono, 28/09/2026). Sem título "Clientes"
           em cima: as abas já dizem onde se está, e o conteúdo sobe. O
           atualizar virou ícone na ponta da linha das abas. -->
      <div class="flex items-end gap-3 border-b border-slate-200 dark:border-slate-800">
        <nav class="-mb-px flex flex-1 min-w-0 gap-6 overflow-x-auto" role="tablist" aria-label="Seções de clientes">
          <button
            v-for="aba in abas"
            :key="aba.value"
            type="button"
            role="tab"
            :aria-selected="abaAtiva === aba.value"
            @click="selecionarAba(aba.value)"
            class="inline-flex items-center gap-2 border-b-2 px-1 pb-3 text-sm font-semibold transition-colors whitespace-nowrap"
            :class="abaAtiva === aba.value
              ? 'border-purple-600 text-purple-700 dark:text-purple-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700'"
          >
            <i :class="['fa-solid', aba.icon, 'text-xs']" aria-hidden="true" />
            {{ aba.label }}
            <span
              v-if="aba.count !== null"
              class="inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[10px] font-semibold tabular-nums"
              :class="(aba.tone === 'red' && (aba.count ?? 0) > 0)
                ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                : abaAtiva === aba.value
                  ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'"
            >{{ aba.count }}</span>
          </button>
        </nav>
        <button
          @click="refreshData"
          :disabled="isRefreshing"
          type="button"
          title="Atualizar"
          aria-label="Atualizar"
          class="mb-1.5 inline-flex items-center justify-center w-8 h-8 flex-shrink-0 rounded-lg text-slate-500 dark:text-slate-400 hover:text-purple-700 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 disabled:opacity-50 transition-colors"
        >
          <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': isRefreshing }" aria-hidden="true" />
        </button>
      </div>

      <!-- Aba: Estatísticas -->
      <div v-if="abaAtiva === 'estatisticas'" class="space-y-4">
        <!-- KPIs de ação: 2 de visão geral + 2 que exigem atenção -->
        <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminStatsCard
            title="Total de Clientes" :value="stats.totalClientes" icon="fa-users" color="indigo"
            :subtitle="stats.clientesEssaSemana ? `+${stats.clientesEssaSemana} essa semana` : ''"
          />
          <AdminStatsCard
            title="Clientes Ativos" :value="stats.clientesAtivos" icon="fa-circle-check" color="emerald"
            :subtitle="stats.totalClientes ? `${Math.round((stats.clientesAtivos / stats.totalClientes) * 100)}% da base` : ''"
          />
          <AdminStatsCard
            title="Vencendo Hoje" :value="stats.clientesVencendoHoje" icon="fa-bell" color="orange" highlighted
            :subtitle="stats.clientesVencendoHoje ? 'precisa renovar' : 'tudo em dia'"
          />
          <AdminStatsCard
            title="Clientes Vencidos" :value="stats.clientesVencidos" icon="fa-triangle-exclamation" color="red" highlighted
            :subtitle="stats.clientesVencidos ? 'ação urgente' : 'nenhum vencido'"
          />
        </div>

        <!-- Distribuição de planos: barra empilhada (substitui os cards Pro/Básico/Enterprise) -->
        <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm px-4 py-3.5">
          <div class="flex items-center justify-between mb-2.5">
            <p class="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Distribuição por plano</p>
          </div>
          <div class="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
            <div
              v-for="seg in planDistribution.filter(s => s.value > 0)"
              :key="seg.key"
              class="h-full transition-all"
              :class="seg.bar"
              :style="{ width: seg.pct + '%' }"
              :title="`${seg.label}: ${seg.value}`"
            />
          </div>
          <div class="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
            <div v-for="seg in planDistribution" :key="seg.key" class="flex items-center gap-1.5">
              <span class="w-2 h-2 rounded-full" :class="seg.dot" aria-hidden="true" />
              <span class="text-xs text-slate-600 dark:text-slate-400">{{ seg.label }}</span>
              <span class="text-xs font-semibold text-slate-900 dark:text-white tabular-nums">{{ seg.value }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Aba: Token OpenAI global -->
      <AdminTokenGlobalCard v-else-if="abaAtiva === 'token'" />

      <!-- Abas de lista: Clientes em dia / Vencidos -->
      <template v-else>
        <!-- Resumo (redesenho 09/10/2026, organização da referência do dono):
             dois cartões suaves (Clientes e Vencimentos), sempre sobre toda a
             base. O de mensalidades cadastradas foi para o Dashboard. -->
        <section aria-labelledby="resumo-base-titulo" class="space-y-2">
          <p id="resumo-base-titulo" class="text-xs text-slate-500 dark:text-slate-400">
            Resumo de toda a base · as duas abas de lista
          </p>
          <div class="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <AdminResumoCard
              v-for="card in cardsResumo"
              :key="card.key"
              titulo-tag="h2"
              empilhar-em="nunca"
              :titulo="card.titulo"
              :icon="card.icon"
              :tom="card.tom"
              :principal-label="card.principalLabel"
              :principal="card.principal"
              :principal-detalhe="card.principalDetalhe"
              :tiles="card.tiles"
              :pronto="resumoPronto"
            />
          </div>
        </section>

        <div v-if="error" role="alert" class="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md p-4 text-red-700 dark:text-red-400 text-sm">
          {{ error }}
        </div>

        <AdminClientesTable
          :clientes="filteredClientes"
          :loading="loading"
          @desativar="handleDesativar"
          @reativar="handleReativar"
          @renovar="handleRenovar"
          @editar="handleEditar"
          @excluir="handleExcluir"
          @limite-instancias="handleLimiteInstancias"
          @atribuir-parceiro="handleAtribuirParceiro"
          @remover-parceiro="handleRemoverParceiro"
          @tornar-parceiro="handleTornarParceiro"
          @tornar-afiliado="handleTornarAfiliado"
          @remover-parceria="handleRemoverParceria"
          @remover-afiliacao="handleRemoverAfiliacao"
          @modulos="handleModulos"
          @ver-uso="handleVerUso"
          @saldo-indicacao="handleSaldoIndicacao"
          @ver-indicacao="handleVerIndicacao"
        >
          <!-- Cabeçalho do painel da lista: título + contagem, busca, plano e
               chips de status (mesmas funções de antes, agora dentro do painel). -->
          <template #topo>
            <div class="px-4 sm:px-5 pt-4 pb-3.5 space-y-3">
              <div class="flex flex-wrap items-center gap-x-4 gap-y-3">
                <!-- Busca à esquerda e título à direita (pedido do dono, 10/10/2026);
                     no celular o título continua em cima. -->
                <div class="flex items-baseline gap-2 min-w-0 md:order-2 md:ml-auto">
                  <h2 class="text-base font-medium text-slate-900 dark:text-white whitespace-nowrap">
                    {{ abaAtiva === 'vencidos' ? 'Clientes vencidos' : 'Lista de clientes' }}
                  </h2>
                  <span class="text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                    <span class="font-semibold text-slate-700 dark:text-slate-200">{{ filteredClientes.length }}</span>
                    de
                    <span class="font-semibold text-slate-700 dark:text-slate-200">{{ clientesDaAba.length }}</span>
                  </span>
                </div>
                <div class="relative w-full md:w-72 md:order-1">
                  <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm" aria-hidden="true" />
                  <input
                    id="search"
                    v-model="searchQuery"
                    type="search"
                    aria-label="Pesquisar cliente"
                    placeholder="Buscar por nome, email ou whatsapp..."
                    class="w-full h-9 pl-9 pr-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20"
                  />
                </div>
              </div>

              <div class="flex flex-wrap items-center gap-2">
              <!-- Chips de status. Só na aba "Em dia": a lista de vencidos é curta e
                   serve pra cobrar, não pra fatiar por status. -->
              <div v-if="abaAtiva === 'em-dia'" class="flex flex-wrap items-center gap-2 mr-auto" role="group" aria-label="Filtrar por status">
                <button
                  v-for="chip in statusChips"
                  :key="chip.value"
                  type="button"
                  @click="filterStatus = chip.value"
                  :aria-pressed="filterStatus === chip.value"
                  class="inline-flex items-center gap-1.5 h-8 pl-3 pr-1.5 rounded-full text-xs font-medium border transition-colors"
                  :class="filterStatus === chip.value
                    ? 'bg-purple-600 border-purple-600 text-white'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'"
                >
                  {{ chip.label }}
                  <span
                    class="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-semibold tabular-nums"
                    :class="filterStatus === chip.value
                      ? 'bg-white/25 text-white'
                      : (chip.tone === 'orange' && statusCounts[chip.value] > 0) ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'"
                  >{{ statusCounts[chip.value] }}</span>
                </button>
              </div>

              <!-- Plano, parceiro e afiliado. Somam com a aba, os chips e a busca.
                   No celular quebram em linhas, embaixo da busca. -->
              <div class="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                <select
                  id="plan"
                  v-model="filterPlan"
                  aria-label="Filtrar por plano"
                  class="h-9 flex-1 min-w-[9rem] sm:flex-none sm:w-40 px-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20"
                >
                  <option value="all">Todos os planos</option>
                  <option value="free">Gratuito</option>
                  <option value="basic">Básico</option>
                  <option value="pro">Pro</option>
                  <option value="enterprise">Enterprise</option>
                </select>
                <select
                  id="filtro-parceiro"
                  v-model="filterParceiro"
                  aria-label="Filtrar por parceiro"
                  title="Parceiro ao qual o cliente está vinculado"
                  class="h-9 flex-1 min-w-[9rem] sm:flex-none sm:w-48 px-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20"
                >
                  <option value="all">Todos os parceiros</option>
                  <option value="sem">Agzap, sem parceiro ({{ semParceiroNaAba }})</option>
                  <optgroup v-if="opcoesParceiro.length" label="Parceiros com clientes">
                    <option v-for="p in opcoesParceiro" :key="p.id" :value="p.id">{{ p.nome }} ({{ p.total }})</option>
                  </optgroup>
                </select>
                <select
                  id="filtro-afiliado"
                  v-model="filterAfiliado"
                  aria-label="Filtrar pelo afiliado que trouxe o cliente (1ª conexão)"
                  title="Afiliado que trouxe o cliente pelo link dele (1ª conexão)"
                  :disabled="opcoesAfiliado.length === 0"
                  class="h-9 flex-1 min-w-[9rem] sm:flex-none sm:w-48 px-3 bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 rounded-lg text-sm text-slate-900 dark:text-white disabled:opacity-60 focus:outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-500/20"
                >
                  <option value="all">{{ opcoesAfiliado.length ? 'Todos os afiliados' : 'Nenhum cliente via afiliado' }}</option>
                  <optgroup v-if="opcoesAfiliado.length" label="Trouxe o cliente (1ª conexão)">
                    <option v-for="a in opcoesAfiliado" :key="a.id" :value="a.id">{{ a.nome }}{{ a.removido ? ' (removido)' : '' }} ({{ a.total }})</option>
                  </optgroup>
                </select>
                <button
                  v-if="filterPlan !== 'all' || filterParceiro !== 'all' || filterAfiliado !== 'all'"
                  type="button"
                  class="h-9 px-2 text-xs font-medium text-purple-700 dark:text-purple-400 hover:underline whitespace-nowrap"
                  @click="filterPlan = 'all'; filterParceiro = 'all'; filterAfiliado = 'all'"
                >
                  Limpar filtros
                </button>
              </div>
              </div>

              <p v-if="afiliadoSelecionado" class="text-xs text-slate-500 dark:text-slate-400">
                <i class="fa-solid fa-circle-info mr-1 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                Clientes que entraram pelo link de {{ afiliadoSelecionado.nome }}{{ afiliadoSelecionado.removido ? ' (afiliação removida)' : '' }}: só a 1ª conexão. Indicações entre clientes não entram neste filtro.
              </p>
            </div>
          </template>
        </AdminClientesTable>
      </template>

      <AdminEditarClienteModal
        :show="showEditarModal"
        :cliente="clienteParaEditar"
        @close="showEditarModal = false; clienteParaEditar = null"
        @confirm="confirmEditar"
      />

      <AdminRenovarAssinaturaModal
        :show="showRenovarModal"
        :cliente-nome="selectedCliente?.nome || ''"
        :cliente-id="selectedCliente?.id || null"
        :preco-mensal="clienteRenovar?.subscription_price ?? null"
        :preco-anual="clienteRenovar?.subscription_price_anual ?? null"
        :assinatura="clienteRenovar"
        @close="showRenovarModal = false; selectedCliente = null"
        @confirm="confirmRenovar"
      />

      <AdminConfirmacaoModal
        :show="showDesativarModal"
        title="Desativar cliente"
        message="Deseja realmente desativar o cliente"
        :cliente-nome="selectedCliente?.nome"
        confirm-label="Desativar"
        variant="warning"
        @close="showDesativarModal = false; selectedCliente = null"
        @confirm="confirmDesativar"
      />

      <AdminConfirmacaoModal
        :show="showReativarModal"
        title="Reativar cliente"
        message="Deseja reativar o cliente"
        :cliente-nome="selectedCliente?.nome"
        confirm-label="Reativar"
        variant="info"
        @close="showReativarModal = false; selectedCliente = null"
        @confirm="confirmReativar"
      />

      <AdminExcluirClienteModal
        :show="showExcluirModal"
        :cliente-nome="selectedCliente?.nome || ''"
        @close="showExcluirModal = false; selectedCliente = null"
        @confirm="confirmExcluir"
      />

      <AdminAtribuirParceiroModal
        :show="showAtribuirParceiroModal"
        :cliente-id="selectedCliente?.id || ''"
        :cliente-nome="selectedCliente?.nome || ''"
        @close="showAtribuirParceiroModal = false; selectedCliente = null"
        @saved="loadClientes()"
      />

      <AdminConfirmacaoModal
        :show="showRemoverParceiroModal"
        title="Remover do parceiro"
        :message="`Deseja desvincular do parceiro ${parceiroDoCliente || ''} o cliente`"
        :cliente-nome="selectedCliente?.nome"
        confirm-label="Remover atribuição"
        variant="warning"
        @close="showRemoverParceiroModal = false; selectedCliente = null; parceiroDoCliente = null"
        @confirm="confirmRemoverParceiro"
      />


      <AdminTornarPapelModal
        :show="!!tornarPapel"
        :tipo="tornarPapel?.tipo || 'parceiro'"
        :empresa-id="tornarPapel?.empresaId"
        :nome="tornarPapel?.nome"
        @close="tornarPapel = null"
        @feito="onPapelTrocado"
      />

      <AdminRemoverPapelModal
        :show="!!removerPapel"
        :tipo="removerPapel?.tipo || 'parceria'"
        :empresa-id="removerPapel?.empresaId"
        :nome="removerPapel?.nome"
        @close="removerPapel = null"
        @removido="onPapelRemovido"
      />

      <AdminLimiteInstanciasModal
        :show="showLimiteInstanciasModal"
        :cliente-id="clienteLimiteInstancias?.id || ''"
        :cliente-nome="clienteLimiteInstancias?.nome || ''"
        :valor-atual="clienteLimiteInstancias?.max_instancias ?? 1"
        :agentes-atual="clienteLimiteInstancias?.max_agentes ?? 1"
        :webhooks-atual="clienteLimiteInstancias?.max_webhooks_entrada ?? 5"
        :webhooks-saida-atual="clienteLimiteInstancias?.max_webhooks_saida ?? 5"
        @close="showLimiteInstanciasModal = false; clienteLimiteInstancias = null"
        @confirm="confirmLimiteInstancias"
      />

      <AdminModulosModal
        :show="showModulosModal"
        :cliente-id="clienteModulos?.id || ''"
        :cliente-nome="clienteModulos?.nome || ''"
        :roteamento-atual="clienteModulos?.roteamento_habilitado ?? false"
        :agendamentos-atual="clienteModulos?.agendamentos_habilitado ?? true"
        :pagina-agendamento-atual="clienteModulos?.pagina_agendamento_habilitada ?? true"
        :api-assistente-atual="clienteModulos?.api_assistente_habilitada ?? true"
        :webhooks-atual="clienteModulos?.webhooks_habilitado ?? true"
        :documentacao-atual="clienteModulos?.documentacao_habilitada ?? true"
        :envios-atual="clienteModulos?.envios_habilitado ?? false"
        :max-envios-mes-atual="clienteModulos?.max_envios_mes ?? 0"
        :max-profissionais-atual="clienteModulos?.max_profissionais ?? 20"
        :max-clientes-atual="clienteModulos?.max_clientes ?? 100000"
        :delivery-atual="clienteModulos?.delivery_modulo_ativo ?? false"
        :max-macros-atual="clienteModulos?.max_macros ?? 5"
        :max-acoes-macro-atual="clienteModulos?.max_acoes_macro ?? 5"
        :max-pedidos-mes-atual="clienteModulos?.max_pedidos_mes ?? 0"
        :max-produtos-vitrine-atual="clienteModulos?.max_produtos_vitrine ?? 0"
        :vitrine-atual="clienteModulos?.vitrine_habilitada ?? true"
        :imoveis-atual="clienteModulos?.imoveis_modulo_ativo ?? false"
        :max-imoveis-atual="clienteModulos?.max_imoveis ?? 100"
        @close="showModulosModal = false; clienteModulos = null"
        @confirm="confirmModulos"
      />

      <AdminSaldoIndicacaoModal
        :show="showSaldoIndicacao"
        :cliente-id="clienteSaldoIndicacao?.id || null"
        :cliente-nome="clienteSaldoIndicacao?.nome || ''"
        @close="showSaldoIndicacao = false; clienteSaldoIndicacao = null"
        @usado="(v) => toast?.success(`Uso de ${v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} registrado`)"
      />

      <AdminUsoEmpresaModal
        :show="showUsoModal"
        :cliente="clienteUso"
        @close="showUsoModal = false; clienteUso = null"
        @editar-modulos="abrirModulosDeUso"
        @ver-indicacao="handleVerIndicacao"
      />

      <AdminIndicacaoVinculoModal
        :show="showIndicacaoVinculo"
        :cliente-id="clienteIndicacaoVinculo?.id || null"
        :cliente-nome="clienteIndicacaoVinculo?.nome || ''"
        @close="showIndicacaoVinculo = false; clienteIndicacaoVinculo = null"
        @removida="onIndicacaoRemovida"
      />
    </div>
  </div>
</template>
