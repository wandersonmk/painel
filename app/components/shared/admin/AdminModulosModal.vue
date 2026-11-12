<script setup lang="ts">
import { ref, watch, computed } from 'vue'

// Habilita/desabilita módulos do app por empresa (gate de admin):
// o admin decide se a empresa PODE usar cada módulo.
//
// Desde 11/11/2026 (pedido do dono) módulo desligado SOME do menu do app, sem
// cadeado; ligado aqui, aparece na hora (tempo real).
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
  deliveryModuloAtivo: boolean
  maxAcoesMacro: number
  maxPedidosMes: number
  maxProdutosVitrine: number
  vitrineHabilitada: boolean
  imoveisModuloAtivo: boolean
  maxImoveis: number
  gruposHabilitado: boolean
  formulariosHabilitado: boolean
  clinicaModuloAtivo: boolean
  clinicaEspecialidades: string[]
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
  deliveryAtual: boolean
  maxAcoesMacroAtual: number
  maxPedidosMesAtual: number
  maxProdutosVitrineAtual: number
  vitrineAtual?: boolean
  imoveisAtual?: boolean
  maxImoveisAtual?: number
  gruposAtual?: boolean
  formulariosAtual?: boolean
  clinicaAtual?: boolean
  clinicaEspecialidadesAtual?: string[]
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
// Delivery é add-on pago, mesmo padrão de envios: nasce desligado.
const delivery = ref(false)
const maxAcoesMacro = ref(5)
// 0 = sem limite de pedidos/mês. Mesma faixa usual de maxEnviosMes.
const maxPedidosMes = ref(0)
// Pedidos extras: o saldo passa de um ciclo para o outro; só a Agzap vende.
const extrasSaldo = ref<number | null>(null)
const extrasAdicionar = ref<number | null>(null)
const extrasValor = ref<number | null>(null)
// Produtos da Vitrine ("Produtos" no menu do app). 0 = sem limite.
const maxProdutosVitrine = ref(0)
// Produtos (vitrine): add-on desde 11/11/2026 — nasce desligado.
const vitrine = ref(false)
// Imóveis (01/10/2026): add-on pago, mesmo padrão de Delivery — nasce desligado.
const imoveis = ref(false)
// Limite de imóveis cadastrados. Padrão 100, 0 = sem limite.
const maxImoveis = ref(100)
// Grupos de WhatsApp e Formulários: add-ons, nascem desligados (o Enterprise liga).
const grupos = ref(false)
const formularios = ref(false)
// Módulo Clínica (11/11/2026): add-on, nasce desligado; liga para a empresa que é clínica.
const clinica = ref(false)
// Especialidades da clínica: liberam as funções de cada uma (odontograma,
// mapa facial, receita...). Espelha ESPECIALIDADES do app.
const clinicaEspecialidades = ref<string[]>([])
const ESPECIALIDADES_CLINICA = [
  { chave: 'odontologia', nome: 'Odontologia', icone: 'fa-tooth', ajuda: 'Odontograma, plano e orçamento' },
  { chave: 'estetica', nome: 'Estética', icone: 'fa-wand-magic-sparkles', ajuda: 'Mapa facial, fotos e pacotes' },
  { chave: 'medica', nome: 'Médica', icone: 'fa-stethoscope', ajuda: 'Sinais vitais, receita e exames' },
  { chave: 'psicologia', nome: 'Psicologia', icone: 'fa-brain', ajuda: 'Sessão privada e sessões semanais' },
  { chave: 'fisioterapia', nome: 'Fisioterapia', icone: 'fa-person-walking', ajuda: 'Avaliação e sessões' },
  { chave: 'nutricao', nome: 'Nutrição', icone: 'fa-apple-whole', ajuda: 'Medidas, IMC e retorno' },
  { chave: 'outra', nome: 'Outra', icone: 'fa-notes-medical', ajuda: 'Modelo em branco' },
]
function alternarEspecialidade(chave: string) {
  const lista = clinicaEspecialidades.value
  clinicaEspecialidades.value = lista.includes(chave) ? lista.filter(e => e !== chave) : [...lista, chave]
}
// Tipo de negócio (12/11/2026): "Estética" = só estética (atende clientes,
// sem receita); "Clínica de saúde" = qualquer outra combinação (pacientes,
// prontuário completo). Espelha perfilDaClinica() do app.
type TipoClinica = 'saude' | 'estetica'
const TIPOS_CLINICA: { chave: TipoClinica; nome: string; icone: string; ajuda: string }[] = [
  { chave: 'saude', nome: 'Clínica de saúde', icone: 'fa-user-doctor', ajuda: 'Pacientes e prontuário completo' },
  { chave: 'estetica', nome: 'Estética', icone: 'fa-wand-magic-sparkles', ajuda: 'Clientes e procedimentos' },
]
const tipoClinica = computed<TipoClinica>(() => {
  const l = clinicaEspecialidades.value
  return l.includes('estetica') && l.every(e => e === 'estetica' || e === 'outra') ? 'estetica' : 'saude'
})
// Só para a tela: com nada marcado, vale o tipo escolhido (saúde por padrão).
const tipoEscolhido = ref<TipoClinica>('saude')
const tipoEfetivo = computed<TipoClinica>(() => (clinicaEspecialidades.value.length ? tipoClinica.value : tipoEscolhido.value))
function escolherTipo(t: TipoClinica) {
  tipoEscolhido.value = t
  if (t === 'estetica') clinicaEspecialidades.value = ['estetica']
  else if (tipoClinica.value === 'estetica') clinicaEspecialidades.value = []
}
const ESPECIALIDADES_SAUDE = ESPECIALIDADES_CLINICA.filter(e => e.chave !== 'estetica')
const faltaEspecialidade = computed(() => clinica.value && clinicaEspecialidades.value.length === 0)

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
// Profissionais, contatos, macros e funis ficam no modal Limites e canais
// (dono, 07/11/2026).
const produtosVitrineEmUso = ref<number | null>(null)
const imoveisEmUso = ref<number | null>(null)

watch(() => props.show, async (open) => {
  if (!open) {
    produtosVitrineEmUso.value = null
    imoveisEmUso.value = null
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
  delivery.value = props.deliveryAtual
  maxAcoesMacro.value = props.maxAcoesMacroAtual ?? 5
  maxPedidosMes.value = props.maxPedidosMesAtual ?? 0
  maxProdutosVitrine.value = props.maxProdutosVitrineAtual ?? 0
  vitrine.value = props.vitrineAtual ?? false
  imoveis.value = props.imoveisAtual ?? false
  maxImoveis.value = props.maxImoveisAtual ?? 100
  grupos.value = props.gruposAtual ?? false
  formularios.value = props.formulariosAtual ?? false
  clinica.value = props.clinicaAtual ?? false
  clinicaEspecialidades.value = [...(props.clinicaEspecialidadesAtual ?? [])]
  tipoEscolhido.value = tipoClinica.value
  aba.value = 'modulos'
  valoresAoAbrir = valoresDoFormulario()

  if (!props.clienteId) return
  try {
    const resp = await $fetch<{ success: boolean; data?: { produtosVitrine?: number; imoveis?: number; pedidosExtras?: number } }>('/api/admin/empresa-uso', {
      query: { empresaId: props.clienteId },
      headers: await useAdminAuthHeaders(),
    })
    produtosVitrineEmUso.value = resp.success && resp.data ? (resp.data.produtosVitrine ?? null) : null
    imoveisEmUso.value = resp.success && resp.data ? (resp.data.imoveis ?? null) : null
    extrasSaldo.value = resp.success && resp.data ? (resp.data.pedidosExtras ?? 0) : null
  } catch {
    produtosVitrineEmUso.value = null
    imoveisEmUso.value = null
  }
})

// 0 = sem limite, então só alerta com teto de verdade abaixo do que já existe.
const produtosVitrineAbaixoDoUso = computed(() =>
  produtosVitrineEmUso.value !== null && maxProdutosVitrine.value > 0 && maxProdutosVitrine.value < produtosVitrineEmUso.value
)
// Mesma regra (0 = sem limite) pros imóveis.
const imoveisAbaixoDoUso = computed(() =>
  imoveisEmUso.value !== null && maxImoveis.value > 0 && maxImoveis.value < imoveisEmUso.value
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
]

const valores = {
  roteamento,
  agendamentos,
  paginaAgendamento,
  dominioAgenda,
  apiAssistente,
  webhooks,
  documentacao,
}

// Selo nas abas: quantos add-ons ligados / limite abaixo do uso atual.
const addonsLigados = computed(() =>
  Number(roteamento.value) + Number(envios.value) + Number(delivery.value) + Number(imoveis.value)
  + Number(grupos.value) + Number(formularios.value) + Number(clinica.value) + Number(vitrine.value))
const algumLimiteAbaixo = computed(() =>
  produtosVitrineAbaixoDoUso.value || imoveisAbaixoDoUso.value)

// Add-ons simples (só o liga/desliga), na mesma lista pra não duplicar markup.
const ADDONS_SIMPLES = [
  {
    key: 'vitrine' as const,
    modelo: vitrine,
    label: 'Produtos',
    icon: 'fa-store',
    iconCls: 'text-emerald-500',
    descricao: 'Catálogo "Produtos", vitrine online e produtos no assistente. Desligado, some do menu.',
  },
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
  {
    key: 'clinica' as const,
    modelo: clinica,
    label: 'Módulo Clínica e Estética',
    icon: 'fa-stethoscope',
    iconCls: 'text-violet-500',
    descricao: 'Ficha com prontuário por especialidade, Atendimentos, Financeiro com caixa e Estoque. Para clínicas de saúde e de estética.',
  },
]

// Limites numéricos que ficam aqui, na mesma lista pra não duplicar markup.
// Profissionais, contatos, macros e funis foram para Limites e canais.
const LIMITES = [
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
  const limiteInvalido = LIMITES.some(l => {
    const v = l.modelo.value
    return !Number.isInteger(v) || v < l.min || v > l.max
  })
  if (limiteInvalido && aba.value !== 'limites') {
    aba.value = 'limites'
    return
  }
  // Clínica ligada sem especialidade não libera nada: mostra o aviso no card.
  if (faltaEspecialidade.value) {
    aba.value = 'addons'
    return
  }
  const atuais = valoresDoFormulario()
  const campos = Object.keys(atuais) as (keyof ModulosEmpresa)[]
  const quantidade = Math.trunc(Number(extrasAdicionar.value) || 0)
  const extras = delivery.value && quantidade > 0
    ? { quantidade, valor: Number(extrasValor.value) || 0 }
    : null
  emit('confirm', Object.fromEntries(
    campos.filter(c => JSON.stringify(atuais[c]) !== JSON.stringify(valoresAoAbrir?.[c])).map(c => [c, atuais[c]]),
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
    deliveryModuloAtivo: delivery.value,
    maxAcoesMacro: maxAcoesMacro.value,
    maxPedidosMes: delivery.value ? pedidosMesValido() : 0,
    maxProdutosVitrine: produtosVitrineValido(),
    vitrineHabilitada: vitrine.value,
    imoveisModuloAtivo: imoveis.value,
    maxImoveis: imoveisValido(),
    gruposHabilitado: grupos.value,
    formulariosHabilitado: formularios.value,
    clinicaModuloAtivo: clinica.value,
    clinicaEspecialidades: [...clinicaEspecialidades.value].sort(),
  }
}

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

          <!-- Especialidades da clínica (11/11/2026): o que o dono da empresa
               disse que ela é. Cada uma libera as funções dela no app. -->
          <div
            v-if="clinica"
            class="rounded-md border px-3 py-2.5"
            :class="faltaEspecialidade ? 'border-amber-300 bg-amber-50/60 dark:border-amber-700/60 dark:bg-amber-950/20' : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'"
          >
            <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <i class="fa-solid fa-stethoscope text-violet-500 text-[10px]" aria-hidden="true" />
              Tipo de negócio
            </p>
            <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">
              Pergunte ao dono o que a empresa atende. Isso decide as telas, as funções e se o app fala "Pacientes" ou "Clientes".
            </p>
            <div class="mt-2 grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Tipo de negócio">
              <button
                v-for="t in TIPOS_CLINICA"
                :key="t.chave"
                type="button"
                role="radio"
                :aria-checked="tipoEfetivo === t.chave"
                @click="escolherTipo(t.chave)"
                class="flex items-start gap-2 rounded-md border px-2.5 py-2 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                :class="tipoEfetivo === t.chave
                  ? 'border-violet-400 bg-violet-50 dark:border-violet-500/60 dark:bg-violet-500/10'
                  : 'border-slate-200 bg-white hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900'"
              >
                <i :class="['fa-solid', t.icone, 'mt-0.5 text-[12px] w-4 text-center', tipoEfetivo === t.chave ? 'text-violet-600 dark:text-violet-300' : 'text-slate-400']" aria-hidden="true" />
                <span class="min-w-0">
                  <span class="block text-[12px]" :class="tipoEfetivo === t.chave ? 'text-violet-700 dark:text-violet-300' : 'text-slate-700 dark:text-slate-300'">{{ t.nome }}</span>
                  <span class="block text-[11px] text-slate-400 dark:text-slate-500">{{ t.ajuda }}</span>
                </span>
              </button>
            </div>

            <template v-if="tipoEfetivo === 'saude'">
              <p class="mt-2.5 text-[11px] text-slate-500 dark:text-slate-400">Especialidades (pode marcar mais de uma; cada uma libera as funções dela):</p>
              <div class="mt-1.5 grid grid-cols-2 sm:grid-cols-3 gap-1.5" role="group" aria-label="Especialidades da clínica">
                <button
                  v-for="e in ESPECIALIDADES_SAUDE"
                  :key="e.chave"
                  type="button"
                  :aria-pressed="clinicaEspecialidades.includes(e.chave)"
                  :title="e.ajuda"
                  @click="alternarEspecialidade(e.chave)"
                  class="flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-left text-[12px] transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                  :class="clinicaEspecialidades.includes(e.chave)
                    ? 'border-violet-400 bg-violet-50 text-violet-700 dark:border-violet-500/60 dark:bg-violet-500/10 dark:text-violet-300'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400'"
                >
                  <i :class="['fa-solid', e.icone, 'text-[11px] w-3.5 text-center']" aria-hidden="true" />
                  <span class="truncate">{{ e.nome }}</span>
                  <i v-if="clinicaEspecialidades.includes(e.chave)" class="fa-solid fa-check ml-auto text-[10px]" aria-hidden="true" />
                </button>
              </div>
              <label class="mt-2 inline-flex items-center gap-2 text-[12px] text-slate-600 dark:text-slate-400 cursor-pointer">
                <input type="checkbox" class="h-3.5 w-3.5 accent-violet-600" :checked="clinicaEspecialidades.includes('estetica')" @change="alternarEspecialidade('estetica')">
                Também faz estética (mapa facial, fotos de antes e depois)
              </label>
              <p class="mt-1.5 text-[11px] leading-snug text-slate-400 dark:text-slate-500">
                No app: menu "Pacientes", prontuário completo e Atendimentos com o registro da consulta (receita na médica e na odontologia).
              </p>
            </template>
            <p v-else class="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400">
              No app: menu "Clientes", ficha de anamnese estética, procedimentos com produto e lote, mapa facial, fotos de antes e depois, sessões e pacotes, termos. Sem receita e sem sinais vitais.
            </p>
            <p v-if="faltaEspecialidade" class="mt-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              Marque pelo menos uma especialidade de saúde para salvar.
            </p>
          </div>
        </template>

        <template v-else>
          <!-- Limites ligados aos módulos (macros, Vitrine, Imóveis). Os de quantidade
               do plano ficam em Limites e canais. 2 colunas, mesma pegada dos gates. -->
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

          <p v-if="produtosVitrineAbaixoDoUso" class="text-[11px] leading-snug text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
            <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
            <span>Abaixo dos {{ produtosVitrineEmUso }} produtos já cadastrados na Vitrine. Nenhum é removido, mas a empresa não poderá cadastrar novos até ficar dentro do limite.</span>
          </p>

          <p v-if="imoveisAbaixoDoUso" class="text-[11px] leading-snug text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
            <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
            <span>Abaixo dos {{ imoveisEmUso }} imóveis já cadastrados. Nenhum é removido, mas a empresa não poderá cadastrar novos até ficar dentro do limite.</span>
          </p>

          <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
            <i class="fa-solid fa-circle-info mt-0.5" aria-hidden="true" />
            <span>Canais, assistentes, profissionais, contatos, funis, macros e webhooks ficam em Limites e canais, no menu do cliente.</span>
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
