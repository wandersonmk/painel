<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ClienteCarteira, ClienteDetalhe, ComissaoIndicacao } from '~/composables/useParceiroLicencas'
import { rotuloPlanoCliente } from '~/composables/useParceiroLicencas'
import type { TipoSolicitacao } from './ParceiroSolicitarModal.vue'
import { formatPhoneSemDdiBrasil, whatsappLink } from '~/utils/phone'

export type AbaDetalhesCliente = 'dados' | 'plano' | 'indicados' | 'ganhos'

/**
 * Detalhes do cliente em abas. Abre com a linha da carteira (Clientes) ou só
 * com o id (Minha rede, Descontos); o resto sempre vem do cliente-detalhe.
 * Na aba "Ganhos de indicação" o parceiro dá baixa ou estorna o desconto que
 * ele paga para quem indicou.
 */
const props = withDefaults(defineProps<{
  show: boolean
  /** Linha da carteira: habilita editar valor, recursos e renovar. */
  cliente?: ClienteCarteira | null
  /** Para abrir só pelo id, quando a tela não tem a linha da carteira. */
  empresaId?: string | null
  abaInicial?: AbaDetalhesCliente
  /** O pai abre o fluxo de renovação ao receber @renovar. */
  permiteRenovar?: boolean
}>(), {
  cliente: null,
  empresaId: null,
  abaInicial: 'dados',
  permiteRenovar: false,
})

const emit = defineEmits<{
  close: []
  solicitar: [TipoSolicitacao]
  'editar-valor': [ClienteCarteira]
  renovar: [ClienteCarteira]
  /** Um ganho de indicação mudou: o pai recarrega o que estiver mostrando. */
  changed: []
}>()

const { loadClienteDetalhe, acaoDesconto, usarSaldoDesconto } = useParceiroLicencas()
const toast = useToast()

const aba = ref<AbaDetalhesCliente>('dados')
const detalhe = ref<ClienteDetalhe | null>(null)
const carregando = ref(false)
const erroCarga = ref<string | null>(null)

const alvoId = computed(() => props.cliente?.empresa_id ?? props.empresaId ?? null)

// Resposta atrasada de outro cliente não sobrescreve a atual.
let sequencia = 0
async function carregar() {
  const id = alvoId.value
  if (!id) return
  const minha = ++sequencia
  carregando.value = true
  erroCarga.value = null
  try {
    const d = await loadClienteDetalhe(id)
    if (minha !== sequencia) return
    detalhe.value = d
    if (!valorBaixa.value || valorBaixa.value > d.ganhos.liberado) valorBaixa.value = d.ganhos.liberado || null
  }
  catch (e: any) {
    if (minha === sequencia) erroCarga.value = String(e?.message || 'Não foi possível carregar o cliente.')
  }
  finally {
    if (minha === sequencia) carregando.value = false
  }
}

// ───────── Formatação ─────────
const fmtBRL = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function fmtData(s: string | null | undefined) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'America/Sao_Paulo' })
}
function fmtDiaMes(s: string | null | undefined) {
  if (!s) return ''
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo' })
}
const fmtPct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`

const SITUACOES: Record<string, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  vencido: { label: 'Vencido', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400' },
  bloqueado_parceiro: { label: 'Bloqueado por você', cls: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  bloqueado_admin: { label: 'Bloqueado pela Agzap', cls: 'bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300' },
}

// ───────── Dados que valem para as duas origens (carteira ou só o id) ─────────
const dados = computed(() => detalhe.value?.dados ?? null)
const nome = computed(() => props.cliente?.empresa_nome ?? dados.value?.nome ?? '')
const situacao = computed(() => props.cliente?.situacao ?? dados.value?.situacao ?? null)
const responsavel = computed(() => props.cliente?.responsavel ?? dados.value?.responsavel ?? null)
const telefone = computed(() => props.cliente?.telefone ?? dados.value?.whatsapp ?? null)
const email = computed(() => props.cliente?.email ?? dados.value?.email ?? null)
const vencimento = computed(() => props.cliente?.vencimento ?? dados.value?.vencimento ?? null)
const preco = computed(() => props.cliente ? props.cliente.preco : (dados.value?.preco ?? null))
const precoAnual = computed(() => props.cliente ? props.cliente.preco_anual : (dados.value?.preco_anual ?? null))
const cobrancaAgzap = computed(() => props.cliente?.cobranca_agzap ?? dados.value?.cobranca_agzap ?? false)
const indicadoPor = computed(() => dados.value?.indicado_por_nome ?? props.cliente?.indicado_por_nome ?? null)

const diasRestantes = computed(() => {
  if (!vencimento.value) return null
  return Math.ceil((new Date(vencimento.value).getTime() - Date.now()) / 86_400_000)
})
const textoDias = computed(() => {
  const d = diasRestantes.value
  if (d === null) return ''
  if (d < 0) return `venceu há ${Math.abs(d)} dia${Math.abs(d) === 1 ? '' : 's'}`
  if (d === 0) return 'vence hoje'
  return `em ${d} dia${d === 1 ? '' : 's'}`
})

const podeRenovar = computed(() => props.permiteRenovar && !!props.cliente && !props.cliente.cobranca_agzap)

// ───────── Abas ─────────
const ganhos = computed(() => detalhe.value?.ganhos ?? null)
const abas = computed(() => [
  { id: 'dados' as const, label: 'Dados', icone: 'fa-id-card' },
  { id: 'plano' as const, label: 'Plano', icone: 'fa-calendar-check' },
  { id: 'indicados' as const, label: 'Indicados', icone: 'fa-sitemap', total: detalhe.value?.indicados.length },
  { id: 'ganhos' as const, label: 'Ganhos de indicação', icone: 'fa-gift', alerta: (ganhos.value?.liberado ?? 0) > 0 },
])

// ───────── Ganhos ─────────
function rotuloMes(r: ComissaoIndicacao) {
  const total = Number(r.parcelas_total || 1)
  if (total > 1) return `Mês ${r.parcela}/${total}`
  return r.tipo === 'primeira' ? '1ª mensalidade' : 'Mensalidade'
}

function pill(r: ComissaoIndicacao): { texto: string; cls: string } {
  if (r.status === 'liberado') return { texto: 'Liberado', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' }
  if (r.programado) return { texto: `Programado · ${fmtDiaMes(r.liberar_em)}`, cls: 'bg-violet-100 text-violet-700 dark:bg-violet-500/15 dark:text-violet-400' }
  if (r.status === 'pendente_liberacao') return { texto: `Retido até ${fmtDiaMes(r.liberar_em)}`, cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' }
  if (r.status === 'utilizado' || r.status === 'creditado') {
    const quando = fmtDiaMes(r.utilizado_em)
    return { texto: quando ? `Usado · ${quando}` : 'Usado', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-400' }
  }
  if (r.status === 'estornado') return { texto: 'Estornado', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' }
  return { texto: 'Cancelado', cls: 'bg-slate-100 text-slate-600 dark:bg-white/5 dark:text-slate-400' }
}
const inativo = (r: ComissaoIndicacao) => r.status === 'cancelado' || r.status === 'estornado'

const linhasGanhos = computed(() =>
  [...(ganhos.value?.rows ?? [])].sort((a, b) =>
    String(b.liberar_em ?? b.created_at).localeCompare(String(a.liberar_em ?? a.created_at)),
  ),
)

/** O que o saldo liberado faz na próxima mensalidade deste cliente. */
const efeito = computed(() => {
  const liberado = ganhos.value?.liberado ?? 0
  const mensalidade = preco.value
  if (!(liberado > 0)) return null
  if (!mensalidade || mensalidade <= 0) return { gratis: false, texto: `−${fmtBRL(liberado)} na próxima cobrança` }
  if (liberado + 0.001 >= mensalidade) {
    const sobra = Math.round((liberado - mensalidade) * 100) / 100
    return { gratis: true, texto: sobra > 0 ? `Mensalidade grátis e sobram ${fmtBRL(sobra)}` : 'Mensalidade grátis' }
  }
  return { gratis: false, texto: `−${fmtBRL(liberado)} (${Math.round((liberado / mensalidade) * 100)}% da mensalidade)` }
})

// Baixa por valor (consome os meses liberados do mais antigo; divide se precisar).
const valorBaixa = ref<number | null>(null)
const descricaoBaixa = ref('')
const salvandoBaixa = ref(false)
const erroBaixa = ref('')

const valorBaixaValido = computed(() =>
  !!valorBaixa.value && valorBaixa.value > 0 && valorBaixa.value <= (ganhos.value?.liberado ?? 0) + 0.001,
)

async function darBaixaPorValor() {
  if (!alvoId.value || !valorBaixaValido.value || !descricaoBaixa.value.trim() || salvandoBaixa.value) return
  salvandoBaixa.value = true
  erroBaixa.value = ''
  try {
    const r = await usarSaldoDesconto(alvoId.value, valorBaixa.value!, descricaoBaixa.value.trim())
    toast.success(r.parcial
      ? `Baixa de ${fmtBRL(r.usado)} registrada (o saldo mudou durante a operação)`
      : `Baixa de ${fmtBRL(r.usado)} registrada`)
    descricaoBaixa.value = ''
    valorBaixa.value = null
    emit('changed')
    await carregar()
  }
  catch (e: any) {
    erroBaixa.value = String(e?.message || 'Não foi possível registrar a baixa.')
  }
  finally {
    salvandoBaixa.value = false
  }
}

// Ação em um mês: confirmação dentro do app, com descrição obrigatória.
const acao = ref<{ linha: ComissaoIndicacao; tipo: 'utilizar' | 'cancelar' } | null>(null)
const textoAcao = ref('')
const salvandoAcao = ref(false)
const erroAcao = ref('')

function abrirAcao(linha: ComissaoIndicacao, tipo: 'utilizar' | 'cancelar') {
  acao.value = { linha, tipo }
  textoAcao.value = ''
  erroAcao.value = ''
}
function fecharAcao() {
  if (salvandoAcao.value) return
  acao.value = null
}

async function confirmarAcao() {
  if (!acao.value || !textoAcao.value.trim() || salvandoAcao.value) return
  const { linha, tipo } = acao.value
  salvandoAcao.value = true
  erroAcao.value = ''
  try {
    await acaoDesconto(linha.id, tipo, textoAcao.value.trim())
    toast.success(tipo === 'utilizar'
      ? `Baixa de ${fmtBRL(linha.valor_credito)} registrada`
      : `${fmtBRL(linha.valor_credito)} estornado`)
    salvandoAcao.value = false
    acao.value = null
    emit('changed')
    await carregar()
  }
  catch (e: any) {
    erroAcao.value = String(e?.message || 'Não foi possível salvar.')
  }
  finally {
    salvandoAcao.value = false
  }
}

// No fim: o callback (immediate) usa refs declaradas acima.
watch(() => [props.show, alvoId.value] as const, ([aberto, id], anterior) => {
  if (!aberto || !id) return
  // Abriu agora (ou trocou de cliente): volta para a aba pedida e limpa o resto.
  if (!anterior || !anterior[0] || anterior[1] !== id) {
    aba.value = props.abaInicial
    detalhe.value = null
    acao.value = null
    valorBaixa.value = null
    descricaoBaixa.value = ''
    erroBaixa.value = ''
  }
  void carregar()
}, { immediate: true })

const caixa = 'rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10'
const campo = 'px-3 py-2 rounded-md border border-slate-200 dark:border-white/10 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500'
</script>

<template>
  <BaseModal :show="show" title="Detalhes do cliente" max-width="max-w-3xl" @close="emit('close')">
    <div v-if="alvoId" class="space-y-4">

      <!-- Cabeçalho -->
      <div class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
          <span class="text-white text-sm">{{ (nome || '?').charAt(0).toUpperCase() }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <p v-if="nome" class="text-slate-900 dark:text-white truncate">{{ nome }}</p>
          <div v-else class="h-4 w-40 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
          <div class="mt-0.5 flex items-center gap-2 flex-wrap">
            <span
              v-if="situacao"
              class="inline-block px-2 py-0.5 rounded-full text-[10px]"
              :class="SITUACOES[situacao]?.cls"
            >{{ SITUACOES[situacao]?.label }}</span>
            <span v-if="responsavel" class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ responsavel }}</span>
          </div>
        </div>
        <i v-if="carregando" class="fa-solid fa-circle-notch fa-spin text-slate-400 text-sm" aria-hidden="true" />
      </div>

      <!-- Abas -->
      <div class="flex gap-5 border-b border-slate-200 dark:border-slate-800 overflow-x-auto" role="tablist" aria-label="Detalhes do cliente">
        <button
          v-for="a in abas"
          :key="a.id"
          type="button"
          role="tab"
          :aria-selected="aba === a.id"
          class="-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 py-2.5 text-[13px] font-normal whitespace-nowrap transition-colors"
          :class="aba === a.id
            ? 'border-purple-600 text-purple-700 dark:text-purple-400'
            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
          @click="aba = a.id"
        >
          <i :class="['fa-solid', a.icone, 'text-[11px]']" aria-hidden="true" />
          {{ a.label }}
          <span v-if="a.total !== undefined" class="text-[11px] tabular-nums opacity-70">{{ a.total }}</span>
          <span v-if="a.alerta" class="w-1.5 h-1.5 rounded-full bg-amber-500" aria-label="Tem saldo liberado" />
        </button>
      </div>

      <div
        v-if="erroCarga"
        class="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-3 py-2.5 text-xs text-red-700 dark:text-red-400 flex items-center gap-2"
      >
        <i class="fa-solid fa-triangle-exclamation" aria-hidden="true" />
        <span class="flex-1">{{ erroCarga }}</span>
        <button type="button" class="underline hover:no-underline" @click="carregar">Tentar de novo</button>
      </div>

      <div class="min-h-[300px]">

        <!-- ═════════ Dados ═════════ -->
        <div v-if="aba === 'dados'" class="space-y-4">
          <dl :class="[caixa, 'divide-y divide-slate-200 dark:divide-white/5 text-sm']">
            <div v-if="responsavel" class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">Responsável</dt>
              <dd class="text-slate-800 dark:text-white truncate ml-3">{{ responsavel }}</dd>
            </div>
            <div v-if="telefone" class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">Telefone</dt>
              <dd class="flex items-center gap-2 text-slate-800 dark:text-white text-xs tabular-nums">
                {{ formatPhoneSemDdiBrasil(telefone) ?? telefone }}
                <a
                  v-if="whatsappLink(telefone)"
                  :href="whatsappLink(telefone)!"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white transition-colors"
                  :title="`Abrir WhatsApp de ${nome}`"
                  aria-label="Abrir WhatsApp"
                >
                  <i class="fa-brands fa-whatsapp text-[11px]" aria-hidden="true" />
                </a>
              </dd>
            </div>
            <div v-if="email" class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">E-mail</dt>
              <dd class="text-slate-800 dark:text-white truncate ml-3 text-xs">{{ email }}</dd>
            </div>
            <div v-if="dados" class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">Cliente desde</dt>
              <dd class="text-slate-800 dark:text-white tabular-nums">{{ fmtData(dados.created_at) }}</dd>
            </div>
            <div class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">Vinculado a você em</dt>
              <dd class="text-slate-800 dark:text-white tabular-nums">{{ fmtData(cliente?.vinculado_em ?? dados?.vinculado_em) }}</dd>
            </div>
            <div class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">Indicado por</dt>
              <dd class="text-slate-800 dark:text-white truncate ml-3">{{ indicadoPor ?? '—' }}</dd>
            </div>
          </dl>

          <!-- Limites: leitura apenas (só a carteira traz o uso) -->
          <div v-if="cliente">
            <p class="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
              Recursos <span class="normal-case text-slate-400">— definidos pela Agzap</span>
            </p>
            <div class="grid grid-cols-2 gap-2">
              <div class="rounded-md border border-slate-200 dark:border-white/10 px-3 py-2.5">
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Instâncias</p>
                <p class="text-lg font-medium text-slate-800 dark:text-white tabular-nums">
                  {{ cliente.instancias }}<span class="text-xs text-slate-400 font-normal"> / {{ cliente.max_instancias }}</span>
                </p>
              </div>
              <div class="rounded-md border border-slate-200 dark:border-white/10 px-3 py-2.5">
                <p class="text-[11px] text-slate-500 dark:text-slate-400">Assistentes</p>
                <p class="text-lg font-medium text-slate-800 dark:text-white tabular-nums">
                  {{ cliente.assistentes }}<span class="text-xs text-slate-400 font-normal"> / {{ cliente.max_assistentes }}</span>
                </p>
              </div>
            </div>
          </div>

          <!-- Tudo que é exclusivo da Agzap vira solicitação -->
          <div>
            <p class="text-[11px] text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Solicitar à Agzap</p>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <button
                v-for="acaoAgzap in ([
                  { tipo: 'instancia', label: 'Instância adicional', icone: 'fa-plug' },
                  { tipo: 'numero', label: 'Número adicional', icone: 'fa-hashtag' },
                  { tipo: 'assistente', label: 'Assistente adicional', icone: 'fa-robot' },
                  { tipo: 'exclusao', label: 'Excluir cliente', icone: 'fa-trash-can' },
                ] as const)"
                :key="acaoAgzap.tipo"
                type="button"
                class="px-3 py-2 rounded border border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors text-left flex items-center gap-2"
                @click="emit('solicitar', acaoAgzap.tipo)"
              >
                <i :class="['fa-solid', acaoAgzap.icone, 'text-[11px] text-slate-400']" aria-hidden="true" />
                <span class="text-xs text-slate-700 dark:text-slate-300">{{ acaoAgzap.label }}</span>
              </button>
            </div>
          </div>
        </div>

        <!-- ═════════ Plano ═════════ -->
        <div v-else-if="aba === 'plano'" class="space-y-4">
          <dl :class="[caixa, 'divide-y divide-slate-200 dark:divide-white/5 text-sm']">
            <div class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">Plano</dt>
              <dd class="text-slate-800 dark:text-white">
                {{ dados ? rotuloPlanoCliente(dados.plano, dados.periodo, dados.status_assinatura) : (cliente?.plano ?? '—') }}
              </dd>
            </div>
            <div class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">Situação</dt>
              <dd>
                <span v-if="situacao" class="inline-block px-2 py-0.5 rounded-full text-[11px]" :class="SITUACOES[situacao]?.cls">
                  {{ SITUACOES[situacao]?.label }}
                </span>
                <span v-else class="text-slate-400">—</span>
              </dd>
            </div>
            <div class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">Vencimento</dt>
              <dd class="text-slate-800 dark:text-white tabular-nums text-right">
                {{ fmtData(vencimento) }}
                <span
                  v-if="textoDias"
                  class="block text-[11px]"
                  :class="(diasRestantes ?? 0) < 0 ? 'text-red-600 dark:text-red-400' : (diasRestantes ?? 99) <= 7 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'"
                >{{ textoDias }}</span>
              </dd>
            </div>
            <!-- Valor que o cliente vê na assinatura: quem revende define. -->
            <div class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">Valor mensal cobrado</dt>
              <dd>
                <span v-if="cobrancaAgzap" class="text-xs text-slate-400">Cobrado pela Agzap</span>
                <button
                  v-else-if="cliente"
                  type="button"
                  class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm tabular-nums text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
                  @click="emit('editar-valor', cliente)"
                >
                  {{ preco !== null ? fmtBRL(preco) : 'definir' }}
                  <i class="fa-solid fa-pen text-[9px]" aria-hidden="true" />
                </button>
                <span v-else class="text-sm tabular-nums text-slate-800 dark:text-white">{{ fmtBRL(preco) }}</span>
              </dd>
            </div>
            <!-- Plano de 12 meses tem preço fechado, não 12× o mensal. -->
            <div v-if="!cobrancaAgzap" class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">Valor do plano anual</dt>
              <dd>
                <button
                  v-if="cliente"
                  type="button"
                  class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm tabular-nums transition-colors hover:bg-purple-50 dark:hover:bg-purple-500/10"
                  :class="precoAnual !== null ? 'text-purple-700 dark:text-purple-400' : 'text-slate-400'"
                  :title="precoAnual !== null ? 'Alterar o valor do plano de 12 meses' : 'Definir o valor do plano de 12 meses'"
                  @click="emit('editar-valor', cliente)"
                >
                  {{ precoAnual !== null ? fmtBRL(precoAnual) : 'definir' }}
                  <i class="fa-solid fa-pen text-[9px]" aria-hidden="true" />
                </button>
                <span v-else class="text-sm tabular-nums text-slate-800 dark:text-white">{{ fmtBRL(precoAnual) }}</span>
              </dd>
            </div>
            <div v-if="cliente" class="flex items-center justify-between px-4 py-2.5">
              <dt class="text-xs text-slate-500 dark:text-slate-400">Última renovação</dt>
              <dd class="text-slate-800 dark:text-white tabular-nums">
                <template v-if="cliente.ultima_renovacao">
                  {{ fmtData(cliente.ultima_renovacao.em) }}
                  <span class="text-[11px] text-slate-400 ml-1">({{ cliente.ultima_renovacao.origem === 'admin' ? 'Agzap' : 'você' }})</span>
                </template>
                <template v-else>—</template>
              </dd>
            </div>
          </dl>

          <div
            v-if="cobrancaAgzap"
            class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 px-3 py-2.5 text-xs text-slate-600 dark:text-slate-400 flex items-start gap-2"
          >
            <i class="fa-solid fa-circle-info text-[11px] mt-0.5" aria-hidden="true" />
            <span>Este cliente é cobrado diretamente pela Agzap e não consome seu crédito.</span>
          </div>

          <div v-if="podeRenovar" class="flex justify-end">
            <button
              type="button"
              class="inline-flex items-center gap-2 px-4 py-2 rounded text-sm font-normal bg-purple-600 hover:bg-purple-700 text-white transition-colors"
              @click="emit('renovar', cliente!)"
            >
              <i class="fa-solid fa-rotate text-xs" aria-hidden="true" />
              Renovar
            </button>
          </div>
        </div>

        <!-- ═════════ Indicados ═════════ -->
        <div v-else-if="aba === 'indicados'" class="space-y-3">
          <div v-if="!detalhe && carregando" class="space-y-2">
            <div v-for="i in 3" :key="i" class="h-12 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse" />
          </div>
          <template v-else-if="detalhe">
            <p class="text-xs text-slate-500 dark:text-slate-400">
              Clientes da sua rede que entraram pelo link de <span class="text-slate-800 dark:text-slate-200">{{ nome }}</span>.
            </p>
            <div v-if="detalhe.indicados.length" class="rounded-md border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5 overflow-hidden">
              <div v-for="ind in detalhe.indicados" :key="ind.empresa_id" class="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
                <div class="min-w-0 flex-1">
                  <p class="text-sm text-slate-800 dark:text-white truncate">{{ ind.nome }}</p>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    <template v-if="ind.responsavel">{{ ind.responsavel }} · </template>
                    Entrou em {{ fmtData(ind.created_at) }} · {{ rotuloPlanoCliente(ind.plano, ind.periodo) }}
                  </p>
                </div>
                <span class="self-start sm:self-auto shrink-0 px-2 py-0.5 rounded-full text-[11px]" :class="SITUACOES[ind.situacao]?.cls">
                  {{ SITUACOES[ind.situacao]?.label }}
                </span>
                <span class="shrink-0 sm:w-44 sm:text-right text-xs tabular-nums">
                  <template v-if="ind.gera">
                    <span class="text-slate-700 dark:text-slate-200">Gera {{ fmtPct(ind.gera.percentual) }} · {{ fmtBRL(ind.gera.valor) }}</span>
                    <span class="block text-[11px] text-slate-400">
                      {{ ind.gera.previsto ? 'previsto quando pagar este mês' : (ind.gera.tipo === 'primeira' ? '1º mês, neste mês' : 'neste mês') }}
                    </span>
                  </template>
                  <span v-else class="text-slate-400">Nada neste mês</span>
                </span>
              </div>
            </div>
            <div v-else class="py-10 text-center">
              <i class="fa-solid fa-sitemap text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
              <p class="text-sm text-slate-500">Este cliente ainda não indicou ninguém.</p>
            </div>
            <p class="text-[11px] text-slate-400 dark:text-slate-500">
              Cada indicado gera {{ fmtPct(detalhe.percentuais.primeira) }} no 1º mês e {{ fmtPct(detalhe.percentuais.recorrente) }} nos seguintes,
              sobre a mensalidade de {{ nome }} ({{ fmtBRL(preco) }}).
            </p>
          </template>
        </div>

        <!-- ═════════ Ganhos de indicação ═════════ -->
        <div v-else class="space-y-3">
          <div v-if="!detalhe && carregando" class="space-y-2">
            <div class="h-16 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse" />
            <div v-for="i in 3" :key="i" class="h-10 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse" />
          </div>
          <template v-else-if="ganhos">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div class="rounded-md border border-amber-200 dark:border-amber-500/25 bg-amber-50 dark:bg-amber-500/10 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-amber-700 dark:text-amber-400">Retido</p>
                <p class="text-base font-medium text-amber-700 dark:text-amber-400 tabular-nums">{{ fmtBRL(ganhos.retido) }}</p>
                <p class="text-[11px] text-amber-700/80 dark:text-amber-400/80">
                  7 dias depois do pagamento<template v-if="ganhos.programado > 0"> · +{{ fmtBRL(ganhos.programado) }} programado</template>
                </p>
              </div>
              <div class="rounded-md border border-emerald-200 dark:border-emerald-500/25 bg-emerald-50 dark:bg-emerald-500/10 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Liberado</p>
                <p class="text-base font-medium text-emerald-700 dark:text-emerald-400 tabular-nums">{{ fmtBRL(ganhos.liberado) }}</p>
                <p class="text-[11px] text-emerald-700/80 dark:text-emerald-400/80">você aplica na cobrança dele</p>
              </div>
              <div class="rounded-md border border-sky-200 dark:border-sky-500/25 bg-sky-50 dark:bg-sky-500/10 px-3 py-2">
                <p class="text-[11px] uppercase tracking-wide text-sky-700 dark:text-sky-400">Já usado</p>
                <p class="text-base font-medium text-sky-700 dark:text-sky-400 tabular-nums">{{ fmtBRL(ganhos.utilizado) }}</p>
                <p class="text-[11px] text-sky-700/80 dark:text-sky-400/80">baixas registradas</p>
              </div>
            </div>

            <p v-if="efeito" class="text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2 flex-wrap">
              <i class="fa-solid fa-receipt text-[11px] text-slate-400" aria-hidden="true" />
              Na próxima cobrança:
              <span
                v-if="efeito.gratis"
                class="px-2 py-0.5 rounded-full text-[11px] bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
              >{{ efeito.texto }}</span>
              <span v-else class="text-slate-800 dark:text-slate-100 tabular-nums">{{ efeito.texto }}</span>
            </p>

            <!-- Dar baixa por valor -->
            <form
              v-if="ganhos.liberado > 0"
              :class="[caixa, 'p-3 space-y-2']"
              @submit.prevent="darBaixaPorValor"
            >
              <p class="text-xs text-slate-600 dark:text-slate-300">
                Dar baixa por valor
                <span class="text-slate-400">— usa o saldo liberado do mês mais antigo para o mais novo</span>
              </p>
              <div class="flex flex-col sm:flex-row gap-2">
                <AppCurrencyInput v-model="valorBaixa" :class="[campo, 'sm:w-36 tabular-nums']" aria-label="Valor da baixa" />
                <input
                  v-model="descricaoBaixa"
                  type="text"
                  maxlength="200"
                  placeholder="Em quê? Ex.: Desconto na mensalidade de novembro/2026"
                  :class="[campo, 'flex-1 min-w-0']"
                  aria-label="Onde o desconto foi aplicado"
                >
                <button
                  type="submit"
                  class="inline-flex items-center justify-center gap-2 px-4 py-2 rounded text-sm font-normal bg-purple-600 hover:bg-purple-700 text-white whitespace-nowrap disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  :disabled="salvandoBaixa || !valorBaixaValido || !descricaoBaixa.trim()"
                >
                  <i class="fa-solid text-xs" :class="salvandoBaixa ? 'fa-circle-notch fa-spin' : 'fa-check'" aria-hidden="true" />
                  {{ salvandoBaixa ? 'Registrando…' : `Dar baixa de ${fmtBRL(valorBaixa || 0)}` }}
                </button>
              </div>
              <p v-if="valorBaixa && !valorBaixaValido" class="text-[11px] text-red-600 dark:text-red-400">
                O máximo é o saldo liberado: {{ fmtBRL(ganhos.liberado) }}.
              </p>
              <p v-if="erroBaixa" class="text-[11px] text-red-600 dark:text-red-400">{{ erroBaixa }}</p>
            </form>

            <div v-if="linhasGanhos.length" class="rounded-md border border-slate-200 dark:border-white/10 divide-y divide-slate-100 dark:divide-white/5 overflow-hidden">
              <div
                v-for="r in linhasGanhos"
                :key="r.id"
                class="px-3 py-2.5 flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-xs"
              >
                <div class="min-w-0 flex-1" :class="inativo(r) ? 'opacity-60' : ''">
                  <p class="text-slate-800 dark:text-slate-100 truncate">
                    {{ rotuloMes(r) }} <span class="text-slate-400">·</span> {{ r.indicada_nome || 'Indicado' }}
                  </p>
                  <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate" :title="r.utilizado_descricao || r.motivo_estorno || ''">
                    {{ fmtPct(r.percentual_aplicado) }} de {{ fmtBRL(r.valor_base) }}
                    <template v-if="r.utilizado_descricao || r.motivo_estorno"> · {{ r.utilizado_descricao || r.motivo_estorno }}</template>
                  </p>
                </div>
                <div class="flex items-center gap-3 sm:contents">
                  <span class="shrink-0 px-2 py-0.5 rounded-full text-[11px] whitespace-nowrap" :class="pill(r).cls">{{ pill(r).texto }}</span>
                  <span class="shrink-0 sm:w-24 text-right tabular-nums text-slate-800 dark:text-slate-100" :class="inativo(r) ? 'line-through opacity-60' : ''">
                    {{ fmtBRL(r.valor_credito) }}
                  </span>
                  <div class="ml-auto sm:ml-0 shrink-0 sm:w-[150px] flex justify-end gap-1.5">
                    <button
                      v-if="r.status === 'liberado'"
                      type="button"
                      class="px-2.5 py-1 rounded border border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                      @click="abrirAcao(r, 'utilizar')"
                    >
                      Dar baixa
                    </button>
                    <button
                      v-if="r.status === 'liberado' || r.status === 'pendente_liberacao'"
                      type="button"
                      class="px-2.5 py-1 rounded border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:text-red-600 hover:border-red-300 dark:hover:border-red-500/40 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      @click="abrirAcao(r, 'cancelar')"
                    >
                      Estornar
                    </button>
                  </div>
                </div>
              </div>
            </div>
            <div v-else class="py-10 text-center">
              <i class="fa-solid fa-gift text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
              <p class="text-sm text-slate-500">Este cliente ainda não ganhou desconto por indicação.</p>
            </div>

            <p class="text-[11px] text-slate-400 dark:text-slate-500">
              Quem paga o desconto dos seus clientes é você. A descrição da baixa ou o motivo do estorno aparecem para o cliente no Registro de ganhos.
            </p>
          </template>
        </div>
      </div>

      <div class="flex justify-end pt-1">
        <button
          type="button"
          class="px-4 py-2 rounded text-sm font-normal border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          @click="emit('close')"
        >
          Fechar
        </button>
      </div>
    </div>
  </BaseModal>

  <!-- Confirmação da ação no mês (depois do modal principal: abre por cima) -->
  <BaseModal
    :show="show && !!acao"
    :title="acao?.tipo === 'utilizar' ? 'Dar baixa no desconto' : 'Estornar ganho'"
    max-width="max-w-md"
    @close="fecharAcao"
  >
    <form v-if="acao" class="space-y-4" @submit.prevent="confirmarAcao">
      <div :class="[caixa, 'px-4 py-3']">
        <p class="text-sm text-slate-800 dark:text-white">
          {{ rotuloMes(acao.linha) }} · {{ acao.linha.indicada_nome || 'Indicado' }}
        </p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
          {{ fmtPct(acao.linha.percentual_aplicado) }} de {{ fmtBRL(acao.linha.valor_base) }} =
          <span class="text-slate-800 dark:text-slate-100">{{ fmtBRL(acao.linha.valor_credito) }}</span>
        </p>
      </div>

      <p class="text-sm text-slate-600 dark:text-slate-400">
        <template v-if="acao.tipo === 'utilizar'">
          Confirme que você já aplicou este desconto na cobrança de <span class="text-slate-900 dark:text-white">{{ nome }}</span>. O valor sai do saldo liberado e fica como usado.
        </template>
        <template v-else-if="acao.linha.status === 'liberado'">
          O valor sai do saldo liberado de <span class="text-slate-900 dark:text-white">{{ nome }}</span> e fica marcado como estornado.
        </template>
        <template v-else>
          Este ganho deixa de valer e não será liberado para <span class="text-slate-900 dark:text-white">{{ nome }}</span>.
        </template>
      </p>

      <div>
        <label for="desconto-acao-texto" class="block text-xs text-slate-600 dark:text-slate-300 mb-1.5">
          {{ acao.tipo === 'utilizar' ? 'Onde o desconto foi aplicado' : 'Motivo do estorno' }}
          <span class="text-red-500">*</span>
        </label>
        <input
          id="desconto-acao-texto"
          v-model="textoAcao"
          type="text"
          maxlength="200"
          :placeholder="acao.tipo === 'utilizar' ? 'Ex.: Desconto na mensalidade de novembro/2026' : 'Ex.: O indicado pediu reembolso'"
          :class="[campo, 'w-full']"
        >
        <p class="text-[11px] text-slate-400 mt-1">O cliente vê este texto no Registro de ganhos.</p>
      </div>

      <p v-if="erroAcao" class="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
        <i class="fa-solid fa-circle-exclamation text-[10px]" aria-hidden="true" />
        {{ erroAcao }}
      </p>

      <div class="flex gap-2">
        <button
          type="button"
          :disabled="salvandoAcao"
          class="flex-1 px-4 py-2.5 rounded text-sm font-normal border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          @click="fecharAcao"
        >
          Voltar
        </button>
        <button
          type="submit"
          :disabled="salvandoAcao || !textoAcao.trim()"
          class="flex-1 px-4 py-2.5 rounded text-sm font-normal text-white disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
          :class="acao.tipo === 'utilizar' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'"
        >
          <i class="fa-solid text-xs" :class="salvandoAcao ? 'fa-circle-notch fa-spin' : (acao.tipo === 'utilizar' ? 'fa-circle-check' : 'fa-rotate-left')" aria-hidden="true" />
          {{ salvandoAcao ? 'Salvando…' : acao.tipo === 'utilizar' ? `Dar baixa de ${fmtBRL(acao.linha.valor_credito)}` : `Estornar ${fmtBRL(acao.linha.valor_credito)}` }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
