<script setup lang="ts">
import { ref, watch, computed } from 'vue'

// Habilita/desabilita módulos do app por empresa (gate de admin):
// o admin decide se a empresa PODE usar cada módulo.
//
// Módulo desligado NÃO some do app: o item aparece com cadeado e o clique
// abre um convite pra contratar. Some só se o usuário não tiver a permissão.
// CRM Kanban não entra: fica sempre liberado, por decisão de produto.
export interface ModulosEmpresa {
  roteamentoHabilitado: boolean
  agendamentosHabilitado: boolean
  paginaAgendamentoHabilitada: boolean
  apiAssistenteHabilitada: boolean
  webhooksHabilitado: boolean
  documentacaoHabilitada: boolean
  dominioAgendaHabilitado: boolean
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
  gruposHabilitado: boolean
  formulariosHabilitado: boolean
  // Só conta com plano: nulo no banco (conta antiga) = sem limite, nem vai.
  maxFunis?: number
}

const props = defineProps<{
  show: boolean
  clienteId?: string
  clienteNome: string
  roteamentoAtual: boolean
  agendamentosAtual: boolean
  paginaAgendamentoAtual: boolean
  apiAssistenteAtual: boolean
  webhooksAtual: boolean
  documentacaoAtual: boolean
  dominioAgendaAtual?: boolean
  enviosAtual: boolean
  maxEnviosMesAtual: number
  maxProfissionaisAtual: number
  maxClientesAtual: number
  deliveryAtual: boolean
  maxMacrosAtual: number
  maxAcoesMacroAtual: number
  maxPedidosMesAtual: number
  maxProdutosVitrineAtual: number
  vitrineAtual?: boolean
  imoveisAtual?: boolean
  maxImoveisAtual?: number
  gruposAtual?: boolean
  formulariosAtual?: boolean
  // Nulo = conta antiga, sem limite de funis: o campo não aparece.
  maxFunisAtual?: number | null
}>()

// Abas (pedido do dono, 28/09/2026): o modal empilhava tudo e precisava rolar.
type Aba = 'modulos' | 'addons' | 'limites'
const aba = ref<Aba>('modulos')
const emit = defineEmits<{
  close: []
  // Só o que mudou desde que o modal abriu: pode vir vazio. A venda de pedidos
  // extras vai à parte: não é configuração, é uma venda registrada.
  confirm: [modulos: Partial<ModulosEmpresa>, extras: { quantidade: number; valor: number } | null]
}>()

// Roteamento virou add-on pago em 28/09/2026: nasce desligado (aba Add-ons).
const roteamento = ref(false)
const agendamentos = ref(true)
const paginaAgendamento = ref(true)
const apiAssistente = ref(true)
const webhooks = ref(true)
const documentacao = ref(true)
// Nasce ligada: conta antiga continua com a URL liberada.
const dominioAgenda = ref(true)
// Envios é add-on pago: nasce desligado, ao contrário dos gates acima.
const envios = ref(false)
const maxEnviosMes = ref(0)
const maxProfissionais = ref(20)
const maxClientes = ref(100000)
// Delivery é add-on pago, mesmo padrão de envios: nasce desligado.
const delivery = ref(false)
const maxMacros = ref(5)
const maxAcoesMacro = ref(5)
// 0 = sem limite de pedidos/mês. Mesma faixa usual de maxEnviosMes.
const maxPedidosMes = ref(0)
// Pedidos extras: o saldo passa de um ciclo para o outro; só a Agzap vende.
const extrasSaldo = ref<number | null>(null)
const extrasAdicionar = ref<number | null>(null)
const extrasValor = ref<number | null>(null)
// Produtos da Vitrine ("Produtos" no menu do app). 0 = sem limite.
const maxProdutosVitrine = ref(0)
// Gate da Vitrine (28/09/2026): comum, nasce ligado — igual Webhooks.
const vitrine = ref(true)
// Imóveis (01/10/2026): add-on pago, mesmo padrão de Delivery — nasce desligado.
const imoveis = ref(false)
// Limite de imóveis cadastrados. Padrão 100, 0 = sem limite.
const maxImoveis = ref(100)
// Grupos de WhatsApp e Formulários: add-ons, nascem desligados (o Enterprise liga).
const grupos = ref(false)
const formularios = ref(false)
// Funis de CRM: só existe em conta com plano (o plano grava, aqui se ajusta).
const maxFunis = ref(6)
const temLimiteFunis = computed(() => props.maxFunisAtual !== null && props.maxFunisAtual !== undefined)

// Faixas usuais na venda, viram só atalhos: o teto de fato é digitável (como
// profissionais/clientes), pra caber contrato fora das três faixas. Valor em R$
// não aparece aqui de propósito: quem contrata fala com a gente no WhatsApp e
// recebe a tabela na hora, então o painel não fixa preço que possa desatualizar.
const FAIXAS_ENVIO = [1000, 5000, 15000]
const FAIXA_PADRAO = 1000
// Espelha o CHECK da coluna max_envios_mes (server: modulos.post.ts).
const MAX_ENVIOS_TETO = 200000
const fmtMil = new Intl.NumberFormat('pt-BR')

// Quanto a empresa já usa — evita salvar um teto abaixo do consumo atual sem
// perceber (nada é removido, mas ela ficaria travada pra cadastrar).
const profissionaisEmUso = ref<number | null>(null)
const clientesEmUso = ref<number | null>(null)
const produtosVitrineEmUso = ref<number | null>(null)
const imoveisEmUso = ref<number | null>(null)
const funisEmUso = ref<number | null>(null)

watch(() => props.show, async (open) => {
  if (!open) {
    profissionaisEmUso.value = null
    clientesEmUso.value = null
    produtosVitrineEmUso.value = null
    imoveisEmUso.value = null
    funisEmUso.value = null
    extrasSaldo.value = null
    extrasAdicionar.value = null
    extrasValor.value = null
    return
  }
  roteamento.value = props.roteamentoAtual
  agendamentos.value = props.agendamentosAtual
  paginaAgendamento.value = props.paginaAgendamentoAtual
  apiAssistente.value = props.apiAssistenteAtual
  webhooks.value = props.webhooksAtual
  documentacao.value = props.documentacaoAtual
  dominioAgenda.value = props.dominioAgendaAtual ?? true
  envios.value = props.enviosAtual
  maxEnviosMes.value = props.maxEnviosMesAtual ?? 0
  maxProfissionais.value = props.maxProfissionaisAtual ?? 20
  maxClientes.value = props.maxClientesAtual ?? 100000
  delivery.value = props.deliveryAtual
  maxMacros.value = props.maxMacrosAtual ?? 5
  maxAcoesMacro.value = props.maxAcoesMacroAtual ?? 5
  maxPedidosMes.value = props.maxPedidosMesAtual ?? 0
  maxProdutosVitrine.value = props.maxProdutosVitrineAtual ?? 0
  vitrine.value = props.vitrineAtual ?? true
  imoveis.value = props.imoveisAtual ?? false
  maxImoveis.value = props.maxImoveisAtual ?? 100
  grupos.value = props.gruposAtual ?? false
  formularios.value = props.formulariosAtual ?? false
  maxFunis.value = props.maxFunisAtual ?? 6
  aba.value = 'modulos'
  valoresAoAbrir = valoresDoFormulario()

  if (!props.clienteId) return
  try {
    const resp = await $fetch<{ success: boolean; data?: { profissionais: number; clientes: number; produtosVitrine?: number; imoveis?: number; pedidosExtras?: number; funis?: number } }>('/api/admin/empresa-uso', {
      query: { empresaId: props.clienteId },
      headers: await useAdminAuthHeaders(),
    })
    profissionaisEmUso.value = resp.success && resp.data ? (resp.data.profissionais ?? null) : null
    clientesEmUso.value = resp.success && resp.data ? (resp.data.clientes ?? null) : null
    produtosVitrineEmUso.value = resp.success && resp.data ? (resp.data.produtosVitrine ?? null) : null
    imoveisEmUso.value = resp.success && resp.data ? (resp.data.imoveis ?? null) : null
    extrasSaldo.value = resp.success && resp.data ? (resp.data.pedidosExtras ?? 0) : null
    funisEmUso.value = resp.success && resp.data ? (resp.data.funis ?? null) : null
  } catch {
    profissionaisEmUso.value = null
    clientesEmUso.value = null
    produtosVitrineEmUso.value = null
    imoveisEmUso.value = null
    funisEmUso.value = null
  }
})

const profAbaixoDoUso = computed(() =>
  profissionaisEmUso.value !== null && maxProfissionais.value < profissionaisEmUso.value
)
const clientesAbaixoDoUso = computed(() =>
  clientesEmUso.value !== null && maxClientes.value < clientesEmUso.value
)
// 0 = sem limite, então só alerta com teto de verdade abaixo do que já existe.
const produtosVitrineAbaixoDoUso = computed(() =>
  produtosVitrineEmUso.value !== null && maxProdutosVitrine.value > 0 && maxProdutosVitrine.value < produtosVitrineEmUso.value
)
// Mesma regra (0 = sem limite) pros imóveis.
const imoveisAbaixoDoUso = computed(() =>
  imoveisEmUso.value !== null && maxImoveis.value > 0 && maxImoveis.value < imoveisEmUso.value
)
// Funis: o trigger conta o quadro Geral junto, e o "em uso" também.
const funisAbaixoDoUso = computed(() =>
  temLimiteFunis.value && funisEmUso.value !== null && maxFunis.value < funisEmUso.value
)

const MODULOS = [
  {
    key: 'agendamentos' as const,
    label: 'Agenda',
    icon: 'fa-calendar-days',
    iconCls: 'text-emerald-500',
    descricao: 'Agendamentos, Serviços e Lembretes no menu lateral',
  },
  {
    key: 'paginaAgendamento' as const,
    label: 'Página de agendamento',
    icon: 'fa-globe',
    iconCls: 'text-sky-500',
    descricao: 'Link público onde o cliente final marca horário',
  },
  {
    key: 'dominioAgenda' as const,
    label: 'URL personalizada da agenda',
    icon: 'fa-link',
    iconCls: 'text-violet-500',
    descricao: 'Domínio próprio da agenda em Configurações › Personalização',
  },
  {
    key: 'apiAssistente' as const,
    label: 'Integração API',
    icon: 'fa-plug',
    iconCls: 'text-cyan-500',
    descricao: 'Aba API dentro dos Assistentes IA (conectores)',
  },
  {
    key: 'webhooks' as const,
    label: 'Webhooks',
    icon: 'fa-bolt',
    iconCls: 'text-amber-500',
    descricao: 'Aba Webhook em Configurações (entrada e saída)',
  },
  {
    key: 'documentacao' as const,
    label: 'Documentação da API',
    icon: 'fa-book',
    iconCls: 'text-rose-500',
    descricao: 'Aba Documentação em Configurações',
  },
  {
    key: 'vitrine' as const,
    label: 'Produtos (Vitrine)',
    icon: 'fa-store',
    iconCls: 'text-emerald-500',
    descricao: 'Catálogo "Produtos", vitrine online e produtos no assistente',
  },
]

const valores = {
  roteamento,
  agendamentos,
  paginaAgendamento,
  dominioAgenda,
  apiAssistente,
  webhooks,
  documentacao,
  vitrine,
}

// Selo nas abas: quantos add-ons ligados / limite abaixo do uso atual.
const addonsLigados = computed(() =>
  Number(roteamento.value) + Number(envios.value) + Number(delivery.value) + Number(imoveis.value)
  + Number(grupos.value) + Number(formularios.value))
const algumLimiteAbaixo = computed(() =>
  profAbaixoDoUso.value || clientesAbaixoDoUso.value || produtosVitrineAbaixoDoUso.value || imoveisAbaixoDoUso.value
  || funisAbaixoDoUso.value)

// Add-ons simples (só o liga/desliga), na mesma lista pra não duplicar markup.
const ADDONS_SIMPLES = [
  {
    key: 'grupos' as const,
    modelo: grupos,
    label: 'Grupos de WhatsApp',
    icon: 'fa-users-rectangle',
    iconCls: 'text-emerald-500',
    descricao: 'Gerenciar os grupos do WhatsApp pelo app. Nasce bloqueado.',
  },
  {
    key: 'formularios' as const,
    modelo: formularios,
    label: 'Formulários',
    icon: 'fa-rectangle-list',
    iconCls: 'text-indigo-500',
    descricao: 'Formulários do WhatsApp, só em número da API Oficial. Nasce bloqueado.',
  },
]

// Funis de CRM entra na lista só em conta com plano.
const LIMITE_FUNIS = {
  key: 'funis' as const,
  modelo: maxFunis,
  emUso: funisEmUso,
  alerta: funisAbaixoDoUso,
  label: 'Funis de CRM',
  icon: 'fa-table-columns',
  iconCls: 'text-purple-500',
  min: 1,
  max: 500,
  ajuda: 'Quantos funis pode ter, contando o Geral (1 – 500)',
}

// Limites numéricos, na mesma lista pra não duplicar markup
const LIMITES_FIXOS = [
  {
    key: 'profissionais' as const,
    modelo: maxProfissionais,
    emUso: profissionaisEmUso,
    alerta: profAbaixoDoUso,
    label: 'Profissionais',
    icon: 'fa-user-tie',
    iconCls: 'text-teal-500',
    min: 1,
    max: 500,
    ajuda: 'Quantos pode cadastrar (1 – 500)',
  },
  {
    key: 'clientes' as const,
    modelo: maxClientes,
    emUso: clientesEmUso,
    alerta: clientesAbaixoDoUso,
    label: 'Clientes',
    icon: 'fa-users',
    iconCls: 'text-blue-500',
    min: 1,
    max: 1000000,
    ajuda: 'Quantos pode cadastrar na mão (padrão 100.000)',
  },
  {
    key: 'macros' as const,
    modelo: maxMacros,
    emUso: ref(null),
    alerta: ref(false),
    label: 'Macros',
    icon: 'fa-bolt',
    iconCls: 'text-amber-500',
    min: 0,
    max: 100,
    ajuda: 'Quantos macros a empresa pode ter (padrão 5)',
  },
  {
    key: 'acoesMacro' as const,
    modelo: maxAcoesMacro,
    emUso: ref(null),
    alerta: ref(false),
    label: 'Ações por macro',
    icon: 'fa-list-ol',
    iconCls: 'text-amber-500',
    min: 0,
    max: 50,
    ajuda: 'Quantas ações cada macro pode ter (padrão 5)',
  },
  {
    key: 'produtosVitrine' as const,
    modelo: maxProdutosVitrine,
    emUso: produtosVitrineEmUso,
    alerta: produtosVitrineAbaixoDoUso,
    label: 'Produtos (Vitrine)',
    icon: 'fa-store',
    iconCls: 'text-emerald-500',
    min: 0,
    max: 100000,
    ajuda: 'Quantos produtos pode cadastrar em "Produtos" (0 = sem limite)',
  },
  {
    key: 'imoveis' as const,
    modelo: maxImoveis,
    emUso: imoveisEmUso,
    alerta: imoveisAbaixoDoUso,
    label: 'Imóveis',
    icon: 'fa-house',
    iconCls: 'text-sky-500',
    min: 0,
    max: 100000,
    ajuda: 'Quantos imóveis pode cadastrar (padrão 100, 0 = sem limite)',
  },
]
const LIMITES = computed(() => (temLimiteFunis.value ? [LIMITE_FUNIS, ...LIMITES_FIXOS] : LIMITES_FIXOS))

// Ligar o add-on já preenche a faixa padrão (nunca "ligado sem teto"); desligar
// zera, porque plano sem gate não significa nada.
function alternarEnvios() {
  envios.value = !envios.value
  if (envios.value) {
    if (!Number.isInteger(maxEnviosMes.value) || maxEnviosMes.value < 1) maxEnviosMes.value = FAIXA_PADRAO
  } else {
    maxEnviosMes.value = 0
  }
}

// Campo livre agora: se vier vazio/fora da faixa (validação nativa burlada),
// cai na faixa padrão em vez de mandar lixo pro servidor.
function tetoEnviosValido() {
  const n = Math.trunc(Number(maxEnviosMes.value))
  if (!Number.isFinite(n) || n < 1) return FAIXA_PADRAO
  return Math.min(n, MAX_ENVIOS_TETO)
}

function submeter() {
  // Os campos de limite só existem no DOM na aba Limites: valida aqui e, se
  // algum estiver fora da faixa, abre a aba pra mostrar o erro no campo.
  const limiteInvalido = LIMITES.value.some(l => {
    const v = l.modelo.value
    return !Number.isInteger(v) || v < l.min || v > l.max
  })
  if (limiteInvalido && aba.value !== 'limites') {
    aba.value = 'limites'
    return
  }
  const atuais = valoresDoFormulario()
  const campos = Object.keys(atuais) as (keyof ModulosEmpresa)[]
  const quantidade = Math.trunc(Number(extrasAdicionar.value) || 0)
  const extras = delivery.value && quantidade > 0
    ? { quantidade, valor: Number(extrasValor.value) || 0 }
    : null
  emit('confirm', Object.fromEntries(
    campos.filter(c => atuais[c] !== valoresAoAbrir?.[c]).map(c => [c, atuais[c]]),
  ) as Partial<ModulosEmpresa>, extras)
}

// Foto do formulário ao abrir. Salvar manda só a diferença: a lista do admin pode
// estar velha, e regravar tudo devolvia, por exemplo, a cota que o parceiro acabou
// de mudar numa renovação.
let valoresAoAbrir: ModulosEmpresa | null = null

function valoresDoFormulario(): ModulosEmpresa {
  return {
    enviosHabilitado: envios.value,
    maxEnviosMes: envios.value ? tetoEnviosValido() : 0,
    roteamentoHabilitado: roteamento.value,
    agendamentosHabilitado: agendamentos.value,
    paginaAgendamentoHabilitada: paginaAgendamento.value,
    apiAssistenteHabilitada: apiAssistente.value,
    webhooksHabilitado: webhooks.value,
    documentacaoHabilitada: documentacao.value,
    dominioAgendaHabilitado: dominioAgenda.value,
    maxProfissionais: maxProfissionais.value,
    maxClientes: maxClientes.value,
    deliveryModuloAtivo: delivery.value,
    maxMacros: maxMacros.value,
    maxAcoesMacro: maxAcoesMacro.value,
    maxPedidosMes: delivery.value ? pedidosMesValido() : 0,
    maxProdutosVitrine: produtosVitrineValido(),
    vitrineHabilitada: vitrine.value,
    imoveisModuloAtivo: imoveis.value,
    maxImoveis: imoveisValido(),
    gruposHabilitado: grupos.value,
    formulariosHabilitado: formularios.value,
    ...(temLimiteFunis.value ? { maxFunis: maxFunis.value } : {}),
  }
}

// Campo livre (0 = sem limite): fora da faixa cai em 0, nunca manda lixo.
// Campo livre (0 = sem limite): fora da faixa cai em 0, nunca manda lixo.
function produtosVitrineValido() {
  const n = Math.trunc(Number(maxProdutosVitrine.value))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, 100_000)
}

// Mesmo tratamento (0 = sem limite) pro limite de imóveis.
function imoveisValido() {
  const n = Math.trunc(Number(maxImoveis.value))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, 100_000)
}

function pedidosMesValido() {
  const n = Math.trunc(Number(maxPedidosMes.value))
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(n, 200_000)
}
</script>

<template>
  <BaseModal :show="show" title="Módulos do app" max-width="max-w-2xl" @close="$emit('close')">

    <!-- Header do cliente -->
    <div class="flex items-center gap-2.5 pb-1">
      <div class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
        <span class="text-white font-bold text-xs">{{ clienteNome.charAt(0).toUpperCase() }}</span>
      </div>
      <div class="min-w-0">
        <p class="text-sm font-semibold text-slate-900 dark:text-white truncate">{{ clienteNome }}</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Controle quais módulos esta empresa pode acessar</p>
      </div>
    </div>

    <form @submit.prevent="submeter" class="space-y-3">
      <!-- Abas (28/09/2026): o modal empilhava tudo e precisava rolar -->
      <div class="flex gap-5 border-b border-slate-200 dark:border-slate-800" role="tablist" aria-label="Seções dos módulos">
        <button
          v-for="t in [
            { id: 'modulos', label: 'Módulos', icon: 'fa-toggle-on' },
            { id: 'addons', label: 'Add-ons', icon: 'fa-puzzle-piece' },
            { id: 'limites', label: 'Limites', icon: 'fa-sliders' },
          ]"
          :key="t.id"
          type="button"
          role="tab"
          :aria-selected="aba === t.id"
          class="-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 py-2.5 text-[13px] font-semibold transition-colors"
          :class="aba === t.id
            ? 'border-purple-600 text-purple-700 dark:text-purple-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
          @click="aba = t.id as Aba"
        >
          <i :class="['fa-solid', t.icon, 'text-[11px]']" aria-hidden="true" />
          {{ t.label }}
          <span
            v-if="t.id === 'addons' && addonsLigados > 0"
            class="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full text-[10px] font-bold bg-purple-100 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300"
          >{{ addonsLigados }}</span>
          <i v-if="t.id === 'limites' && algumLimiteAbaixo" class="fa-solid fa-triangle-exclamation text-amber-500 text-[10px]" aria-hidden="true" />
        </button>
      </div>

      <!-- Corpo com altura fixa: trocar de aba não muda o tamanho do modal -->
      <div class="h-[380px] max-h-[55vh] overflow-y-auto pr-1 space-y-3">
        <template v-if="aba === 'modulos'">
          <!-- Gates simples do app: 2 colunas pra deixar o modal mais baixo. -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div
              v-for="m in MODULOS"
              :key="m.key"
              class="flex items-center justify-between gap-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2.5"
            >
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <i :class="['fa-solid', m.icon, m.iconCls, 'text-[10px]']" aria-hidden="true" />
                  {{ m.label }}
                </p>
                <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">{{ m.descricao }}</p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="valores[m.key].value"
                :aria-label="`${valores[m.key].value ? 'Desabilitar' : 'Habilitar'} módulo ${m.label}`"
                @click="valores[m.key].value = !valores[m.key].value"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                :class="valores[m.key].value ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'"
              >
                <span
                  class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                  :class="valores[m.key].value ? 'translate-x-[18px]' : 'translate-x-0.5'"
                />
              </button>
            </div>
          </div>
          <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
            <i class="fa-solid fa-circle-info mt-0.5" aria-hidden="true" />
            <span>Ao desabilitar, o item continua visível no app com um cadeado e o clique convida a contratar. Pode reabilitar a qualquer momento.</span>
          </p>
        </template>

        <template v-else-if="aba === 'addons'">
          <!-- Roteamento: add-on pago desde 28/09/2026 (nasce bloqueado). -->
          <div class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2.5">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
                  <i class="fa-solid fa-route text-violet-500 text-[10px]" aria-hidden="true" />
                  Roteamento
                  <span class="px-1.5 py-px rounded-full bg-violet-100 dark:bg-violet-500/15 text-violet-700 dark:text-violet-300 text-[9px] font-bold uppercase tracking-wide">Add-on</span>
                </p>
                <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">
                  Distribui os leads entre franquias (Configurações › Sistema no app). Módulo pago, nasce bloqueado.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="roteamento"
                :aria-label="`${roteamento ? 'Bloquear' : 'Liberar'} módulo de Roteamento`"
                @click="roteamento = !roteamento"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                :class="roteamento ? 'bg-violet-500' : 'bg-slate-300 dark:bg-slate-700'"
              >
                <span
                  class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                  :class="roteamento ? 'translate-x-[18px]' : 'translate-x-0.5'"
                />
              </button>
            </div>
          </div>

          <!-- Disparos: card à parte — add-on pago, nasce bloqueado. -->
          <div class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2.5">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
                  <i class="fa-solid fa-paper-plane text-fuchsia-500 text-[10px]" aria-hidden="true" />
                  Disparos
                  <span class="px-1.5 py-px rounded-full bg-fuchsia-100 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 text-[9px] font-bold uppercase tracking-wide">Add-on</span>
                </p>
                <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">
                  Módulo pago. Nasce bloqueado: só ligue depois que a empresa contratar.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="envios"
                :aria-label="`${envios ? 'Bloquear' : 'Liberar'} módulo de Disparos`"
                @click="alternarEnvios"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                :class="envios ? 'bg-fuchsia-500' : 'bg-slate-300 dark:bg-slate-700'"
              >
                <span
                  class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                  :class="envios ? 'translate-x-[18px]' : 'translate-x-0.5'"
                />
              </button>
            </div>

            <!-- Faixa contratada: teto digitável (mesma pegada de profissionais),
                 com as faixas usuais viradas em atalho. Só com o gate ligado. -->
            <div v-if="envios" class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <label for="max-envios-mes" class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <i class="fa-solid fa-gauge-high text-fuchsia-500 text-[10px]" aria-hidden="true" />
                    Faixa contratada
                  </label>
                  <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">
                    Teto de mensagens por mês (via API oficial da Meta). Os valores de cada faixa são passados no WhatsApp na contratação.
                  </p>
                </div>
                <div class="shrink-0 text-center">
                  <input
                    id="max-envios-mes"
                    v-model.number="maxEnviosMes"
                    type="number"
                    :min="1"
                    :max="MAX_ENVIOS_TETO"
                    required
                    class="w-24 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[13px] text-slate-900 dark:text-white tabular-nums text-center font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <span class="block text-[9px] uppercase tracking-wide text-slate-400 dark:text-slate-600 mt-0.5">msg/mês</span>
                </div>
              </div>
              <div class="flex items-center flex-wrap gap-1.5 mt-2">
                <span class="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-600">Faixas usuais</span>
                <button
                  v-for="f in FAIXAS_ENVIO"
                  :key="f"
                  type="button"
                  @click="maxEnviosMes = f"
                  class="rounded border px-2 py-0.5 text-[11px] font-semibold tabular-nums transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                  :class="maxEnviosMes === f
                    ? 'border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'"
                >
                  {{ fmtMil.format(f) }}
                </button>
              </div>
            </div>
          </div>
          <!-- Delivery: card à parte, mesmo padrão de add-on pago dos Disparos. -->
          <div class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2.5">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
                  <i class="fa-solid fa-motorcycle text-orange-500 text-[10px]" aria-hidden="true" />
                  Delivery
                  <span class="px-1.5 py-px rounded-full bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-300 text-[9px] font-bold uppercase tracking-wide">Add-on</span>
                </p>
                <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">
                  Cardápio, pedidos e pizza com múltiplos sabores. Módulo pago, nasce bloqueado.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="delivery"
                :aria-label="`${delivery ? 'Bloquear' : 'Liberar'} módulo de Delivery`"
                @click="delivery = !delivery"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                :class="delivery ? 'bg-orange-500' : 'bg-slate-300 dark:bg-slate-700'"
              >
                <span
                  class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                  :class="delivery ? 'translate-x-[18px]' : 'translate-x-0.5'"
                />
              </button>
            </div>

            <!-- Cota de pedidos/mês: soma WhatsApp + site (mesma função de
                 criação nos dois canais). 0 = sem limite. Só com o gate ligado. -->
            <div v-if="delivery" class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
              <div class="flex items-center justify-between gap-3">
                <div class="min-w-0 flex-1">
                  <label for="max-pedidos-mes" class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <i class="fa-solid fa-cart-shopping text-orange-500 text-[10px]" aria-hidden="true" />
                    Pedidos por mês
                  </label>
                  <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">
                    Teto de pedidos por ciclo. A renovação com crédito de Delivery define este valor. 0 = sem limite.
                  </p>
                </div>
                <div class="shrink-0 text-center">
                  <input
                    id="max-pedidos-mes"
                    v-model.number="maxPedidosMes"
                    type="number"
                    :min="0"
                    :max="200000"
                    required
                    class="w-24 px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[13px] text-slate-900 dark:text-white tabular-nums text-center font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                  <span class="block text-[9px] uppercase tracking-wide text-slate-400 dark:text-slate-600 mt-0.5">pedidos/mês</span>
                </div>
              </div>

              <!-- Venda de pedidos extras: só a Agzap faz, e fica registrada. -->
              <div class="mt-3 pt-3 border-t border-slate-200 dark:border-slate-800">
                <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <i class="fa-solid fa-plus text-orange-500 text-[10px]" aria-hidden="true" />
                  Pedidos extras
                </p>
                <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">
                  Comprados à parte. O saldo não usado passa para o próximo ciclo.
                </p>
                <div class="mt-2 grid grid-cols-3 gap-2">
                  <div>
                    <span class="block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-600 mb-1">Saldo</span>
                    <span class="block py-1.5 text-[13px] font-semibold text-slate-900 dark:text-white tabular-nums">{{ extrasSaldo === null ? '—' : fmtMil.format(extrasSaldo) }}</span>
                  </div>
                  <div>
                    <label for="extras-adicionar" class="block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-600 mb-1">Adicionar</label>
                    <input
                      id="extras-adicionar"
                      v-model.number="extrasAdicionar"
                      type="number"
                      min="0"
                      max="200000"
                      class="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[13px] text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                  <div>
                    <label for="extras-valor" class="block text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-600 mb-1">Valor cobrado</label>
                    <AppCurrencyInput
                      id="extras-valor"
                      v-model="extrasValor"
                      placeholder="R$ 0,00"
                      class="w-full px-2 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded text-[13px] text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500"
                    />
                  </div>
                </div>
                <p class="mt-2 text-[11px] leading-snug text-slate-400 dark:text-slate-600">
                  Exemplo: cota de 500 mais 100 extras dá 600 no ciclo. A loja faz 520 pedidos e sobram 80 extras.
                  No reset, a contagem volta a zero e o ciclo novo fica com 500 + 80 = 580.
                </p>
              </div>
            </div>
          </div>

          <!-- Imóveis (01/10/2026): add-on pago, mesmo padrão do Delivery.
               O limite de imóveis fica na aba Limites (0 = sem limite). -->
          <div class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2.5">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
                  <i class="fa-solid fa-house text-sky-500 text-[10px]" aria-hidden="true" />
                  Imóveis
                  <span class="px-1.5 py-px rounded-full bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-300 text-[9px] font-bold uppercase tracking-wide">Add-on</span>
                </p>
                <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">
                  Cadastro de imóveis, página da imobiliária com filtros por cidade e bairro, e IA que qualifica o lead e passa pro corretor. Módulo pago, nasce bloqueado.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="imoveis"
                :aria-label="`${imoveis ? 'Bloquear' : 'Liberar'} módulo de Imóveis`"
                @click="imoveis = !imoveis"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                :class="imoveis ? 'bg-sky-500' : 'bg-slate-300 dark:bg-slate-700'"
              >
                <span
                  class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                  :class="imoveis ? 'translate-x-[18px]' : 'translate-x-0.5'"
                />
              </button>
            </div>
          </div>

          <!-- Grupos e Formulários: add-ons só de liga/desliga (o Enterprise liga os dois). -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div
              v-for="a in ADDONS_SIMPLES"
              :key="a.key"
              class="flex items-center justify-between gap-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2.5"
            >
              <div class="min-w-0 flex-1">
                <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
                  <i :class="['fa-solid', a.icon, a.iconCls, 'text-[10px]']" aria-hidden="true" />
                  {{ a.label }}
                </p>
                <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">{{ a.descricao }}</p>
              </div>
              <button
                type="button"
                role="switch"
                :aria-checked="a.modelo.value"
                :aria-label="`${a.modelo.value ? 'Bloquear' : 'Liberar'} ${a.label}`"
                @click="a.modelo.value = !a.modelo.value"
                class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
                :class="a.modelo.value ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'"
              >
                <span
                  class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                  :class="a.modelo.value ? 'translate-x-[18px]' : 'translate-x-0.5'"
                />
              </button>
            </div>
          </div>
        </template>

        <template v-else>
          <!-- Limites: moram aqui (e não em "Canais WhatsApp") porque na venda são
               negociados junto dos módulos. 2 colunas, mesma pegada dos gates. -->
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div
              v-for="l in LIMITES"
              :key="l.key"
              class="flex items-center justify-between gap-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2.5"
            >
              <div class="min-w-0 flex-1">
                <label :for="`max-${l.key}`" class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <i :class="['fa-solid', l.icon, l.iconCls, 'text-[10px]']" aria-hidden="true" />
                  {{ l.label }}
                </label>
                <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">
                  <template v-if="l.emUso.value !== null">
                    Em uso: <span class="tabular-nums font-semibold text-slate-600 dark:text-slate-400">{{ l.emUso.value }}</span> ·
                  </template>
                  {{ l.ajuda }}
                </p>
              </div>
              <input
                :id="`max-${l.key}`"
                v-model.number="l.modelo.value"
                type="number"
                :min="l.min"
                :max="l.max"
                required
                class="w-20 px-2 py-1.5 bg-white dark:bg-slate-900 border rounded text-[13px] text-slate-900 dark:text-white tabular-nums text-center font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
                :class="l.alerta.value ? 'border-amber-400 dark:border-amber-500' : 'border-slate-200 dark:border-slate-700'"
              />
            </div>
          </div>

          <p v-if="funisAbaixoDoUso" class="text-[11px] leading-snug text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
            <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
            <span>Abaixo dos {{ funisEmUso }} funis que a empresa já tem (o Geral conta). Nenhum é removido, mas ela não poderá criar novos até ficar dentro do limite.</span>
          </p>

          <p v-if="profAbaixoDoUso" class="text-[11px] leading-snug text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
            <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
            <span>Abaixo dos {{ profissionaisEmUso }} profissionais já cadastrados. Ninguém é removido, mas a empresa não poderá cadastrar novos até ficar dentro do limite.</span>
          </p>

          <p v-if="produtosVitrineAbaixoDoUso" class="text-[11px] leading-snug text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
            <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
            <span>Abaixo dos {{ produtosVitrineEmUso }} produtos já cadastrados na Vitrine. Nenhum é removido, mas a empresa não poderá cadastrar novos até ficar dentro do limite.</span>
          </p>

          <p v-if="imoveisAbaixoDoUso" class="text-[11px] leading-snug text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
            <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
            <span>Abaixo dos {{ imoveisEmUso }} imóveis já cadastrados. Nenhum é removido, mas a empresa não poderá cadastrar novos até ficar dentro do limite.</span>
          </p>

          <p v-if="clientesAbaixoDoUso" class="text-[11px] leading-snug text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
            <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
            <span>Abaixo dos {{ clientesEmUso }} clientes já cadastrados. Nada é removido, mas a empresa não poderá cadastrar novos na mão até ficar dentro do limite.</span>
          </p>
          <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
            <i class="fa-solid fa-comment-dots mt-0.5" aria-hidden="true" />
            <span>O limite de clientes vale só para cadastro manual. Contato que chega sozinho por mensagem no WhatsApp nunca é bloqueado.</span>
          </p>
        </template>
      </div>

      <div class="flex gap-2 pt-1">
        <button
          type="button"
          @click="$emit('close')"
          class="flex-1 px-4 py-2 rounded font-semibold text-[13px] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="flex-1 px-4 py-2 rounded font-semibold text-[13px] bg-purple-600 hover:bg-purple-700 text-white transition-colors"
        >
          Salvar
        </button>
      </div>
    </form>
  </BaseModal>
</template>
