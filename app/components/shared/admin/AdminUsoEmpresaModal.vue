<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { AdminCliente } from '~/composables/useAdminClientes'

// Detalhes da empresa — abre ao clicar na linha do cliente na tabela. Em abas
// (pedido do dono, 28/09/2026): Contato, Cobrança e Uso, com altura fixa pra
// o modal não pular de tamanho ao trocar de aba. O uso reaproveita
// /api/admin/empresa-uso (o mesmo dos avisos de "abaixo do uso atual" do
// AdminModulosModal).
const props = defineProps<{
  show: boolean
  cliente: AdminCliente | null
}>()
const emit = defineEmits<{
  close: []
  // Deixa abrir direto o modal de edição de módulos a partir daqui.
  editarModulos: [clienteId: string]
}>()

const { formatDate, getPlanLabel, getDataVencimento, formatDiasVencimento } = useAdminClientes()
const { init: initHideValues, mask } = useHideValues()

type Aba = 'contato' | 'cobranca' | 'uso'
const ABAS: { value: Aba; label: string; icon: string }[] = [
  { value: 'contato', label: 'Contato', icon: 'fa-address-card' },
  { value: 'cobranca', label: 'Cobrança', icon: 'fa-receipt' },
  { value: 'uso', label: 'Uso', icon: 'fa-chart-simple' },
]
const aba = ref<Aba>('contato')

interface Uso {
  assistentes: number
  webhooks: number
  webhooksSaida: number
  profissionais: number
  clientes: number
  instancias: number
  macros: number
  enviosMes: number
  pedidosMes: number
  produtosVitrine?: number
  imoveis?: number
}

const uso = ref<Uso | null>(null)
const carregando = ref(false)
const erro = ref(false)

watch(() => props.show, async (open) => {
  uso.value = null
  erro.value = false
  if (!open || !props.cliente?.id) return
  aba.value = 'contato'
  // O "ocultar valores" do dashboard vale aqui também (valor cobrado).
  initHideValues()
  carregando.value = true
  try {
    const resp = await $fetch<{ success: boolean; data?: Uso }>('/api/admin/empresa-uso', {
      query: { empresaId: props.cliente.id },
      headers: await useAdminAuthHeaders(),
    })
    uso.value = resp.success && resp.data ? resp.data : null
    if (!uso.value) erro.value = true
  } catch {
    erro.value = true
  } finally {
    carregando.value = false
  }
})

// ---------- Uso ----------

interface Metrica {
  key: string
  label: string
  icon: string
  iconCls: string
  usado: number
  // null = sem teto (ex.: clientes cadastrados na mão tem teto alto, envios
  // com maxEnviosMes=0 é add-on desligado). 0 com semSemLimite=true = "0 = sem limite".
  max: number | null
  semLimiteQuando0?: boolean
}

const metricas = computed<Metrica[]>(() => {
  const c = props.cliente
  const u = uso.value
  if (!c || !u) return []

  const lista: Metrica[] = [
    { key: 'profissionais', label: 'Profissionais', icon: 'fa-user-tie', iconCls: 'text-teal-500', usado: u.profissionais, max: c.max_profissionais ?? 20 },
    { key: 'clientes', label: 'Clientes', icon: 'fa-users', iconCls: 'text-blue-500', usado: u.clientes, max: c.max_clientes ?? 100000 },
    { key: 'instancias', label: 'Canais WhatsApp', icon: 'fa-mobile-screen', iconCls: 'text-purple-500', usado: u.instancias, max: c.max_instancias ?? 1 },
    { key: 'macros', label: 'Macros', icon: 'fa-bolt', iconCls: 'text-amber-500', usado: u.macros, max: c.max_macros ?? 5 },
    // Vitrine ("Produtos" no menu do app) não é add-on: aparece sempre. 0 = sem limite.
    { key: 'produtosVitrine', label: 'Produtos (Vitrine)', icon: 'fa-store', iconCls: 'text-emerald-500', usado: u.produtosVitrine ?? 0, max: c.max_produtos_vitrine ?? 0, semLimiteQuando0: true },
  ]

  // Envios e Pedidos só aparecem se o add-on estiver ligado — senão a
  // barra de "0/0" só confunde quem está lendo.
  if (c.envios_habilitado) {
    lista.push({ key: 'envios', label: 'Disparos (mês)', icon: 'fa-paper-plane', iconCls: 'text-fuchsia-500', usado: u.enviosMes, max: c.max_envios_mes ?? 0, semLimiteQuando0: true })
  }
  if (c.delivery_modulo_ativo) {
    lista.push({ key: 'pedidos', label: 'Pedidos Delivery (mês)', icon: 'fa-motorcycle', iconCls: 'text-orange-500', usado: u.pedidosMes, max: c.max_pedidos_mes ?? 0, semLimiteQuando0: true })
  }
  // Imóveis: add-on pago (01/10/2026), mesmo critério — só com o módulo ligado.
  // Padrão 100, 0 = sem limite.
  if (c.imoveis_modulo_ativo) {
    lista.push({ key: 'imoveis', label: 'Imóveis', icon: 'fa-house', iconCls: 'text-sky-500', usado: u.imoveis ?? 0, max: c.max_imoveis ?? 100, semLimiteQuando0: true })
  }

  return lista
})

function semLimite(m: Metrica): boolean {
  return m.semLimiteQuando0 === true && (m.max ?? 0) === 0
}
function pct(m: Metrica): number {
  if (semLimite(m) || !m.max) return 0
  return Math.min(100, (m.usado / m.max) * 100)
}
function tom(m: Metrica): 'ok' | 'atencao' | 'cheio' {
  if (semLimite(m) || !m.max) return 'ok'
  const p = m.usado / m.max
  if (p >= 1) return 'cheio'
  if (p >= 0.9) return 'atencao'
  return 'ok'
}

// ---------- Contato ----------

// Dados de contato do dono da empresa, com cópia em um clique: ao abrir a
// empresa, quem atende já quer falar com o cliente. O WhatsApp copia só os
// dígitos de DDD + número, SEM o 55 (pedido do dono: o 55 já é padrão pra
// eles); número estrangeiro continua com o próprio DDI, senão fica ambíguo.
// O formatado (+55) é só pra leitura. O nome da empresa copia pelo botão do
// cabeçalho.
const contatos = computed(() => {
  const c = props.cliente
  if (!c) return []
  const digitos = (formatPhoneSemDdiBrasil(c.whatsapp) || '').replace(/\D/g, '')
  return [
    { key: 'dono', label: 'Responsável', icon: 'fa-user', valor: c.nome_cliente || null, exibir: c.nome_cliente || null },
    { key: 'email', label: 'E-mail', icon: 'fa-envelope', valor: c.email || null, exibir: c.email || null },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'fa-whatsapp', marca: true, valor: digitos || null, exibir: formatPhone(c.whatsapp) || null },
  ]
})

const copiado = ref<string | null>(null)
async function copiar(key: string, valor: string | null | undefined) {
  if (!valor) return
  try {
    await navigator.clipboard.writeText(valor)
  } catch {
    // Navegador sem permissão de clipboard: seleciona na mão via textarea.
    const ta = document.createElement('textarea')
    ta.value = valor
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* noop */ }
    ta.remove()
  }
  copiado.value = key
  setTimeout(() => { if (copiado.value === key) copiado.value = null }, 1800)
}

// ---------- Cobrança ----------

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const PERIODO: Record<string, string> = { '1month': '1 mês', '6months': '6 meses', '12months': '12 meses' }
const STATUS: Record<string, string> = { trial: 'Em teste', active: 'Ativo', canceled: 'Cancelado', expired: 'Vencido' }

// O valor é o de empresas: subscription_price (mensal, o que o checkout da
// Stripe cobra) e subscription_price_anual (plano de 12 meses). Quem define é
// a Agzap (Editar cliente) ou o parceiro, pro cliente dele.
const cobranca = computed(() => {
  const c = props.cliente
  if (!c) return null
  const positivo = (v: unknown) => (v != null && Number(v) > 0 ? Number(v) : null)
  const mensal = positivo(c.subscription_price)
  const anual = positivo(c.subscription_price_anual)
  const ehAnual = c.subscription_period === '12months'
  // Só o status diz se está em teste: há empresa ATIVA com período ainda
  // "trial"/"trial1d" gravado (28/09/2026) — pelo período ela sairia como teste.
  const teste = c.subscription_status === 'trial'
  const periodo = PERIODO[c.subscription_period]
    || (String(c.subscription_period).startsWith('trial') ? 'Teste' : c.subscription_period)
  return {
    mensal,
    anual,
    ehAnual,
    teste,
    valor: ehAnual ? anual : mensal,
    sufixo: ehAnual ? '/ano' : '/mês',
    periodo,
    status: STATUS[c.subscription_status] || c.subscription_status,
    vencimento: formatDate(getDataVencimento(c)),
    dias: formatDiasVencimento(c),
  }
})

const dinheiro = (v: number | null) => (v == null ? 'Não definido' : mask(brl(v)))
</script>

<template>
  <BaseModal :show="show" title="Detalhes da empresa" max-width="max-w-3xl" @close="$emit('close')">
    <!-- Cabeçalho: empresa (com copiar) + valor cobrado, visível em todas as abas -->
    <div v-if="cliente" class="flex items-center gap-3 pb-2">
      <div class="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
        <span class="text-white font-bold text-sm">{{ (cliente.nome || '?').charAt(0).toUpperCase() }}</span>
      </div>
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-1 min-w-0">
          <p class="text-[15px] font-semibold text-slate-900 dark:text-white truncate">{{ cliente.nome }}</p>
          <button
            type="button"
            :title="copiado === 'empresa' ? 'Copiado!' : 'Copiar nome da empresa'"
            aria-label="Copiar nome da empresa"
            class="shrink-0 w-7 h-7 rounded-md flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
            :class="copiado === 'empresa'
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-500/10'"
            @click="copiar('empresa', cliente.nome)"
          >
            <i :class="['fa-solid', copiado === 'empresa' ? 'fa-check' : 'fa-copy', 'text-[12px]']" aria-hidden="true" />
          </button>
        </div>
        <p class="text-[11px] text-slate-500 dark:text-slate-400 truncate">
          {{ getPlanLabel(cliente.subscription_plan) }} · {{ cobranca?.periodo }}<template v-if="cliente.parceiro_nome"> · via {{ cliente.parceiro_nome }}</template>
        </p>
      </div>
      <div v-if="cobranca" class="shrink-0 text-right">
        <p class="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500">{{ cobranca.teste ? 'Após o teste' : 'Valor cobrado' }}</p>
        <p class="text-[15px] font-bold tabular-nums" :class="cobranca.valor == null ? 'text-slate-400 dark:text-slate-600 italic font-medium text-[13px]' : 'text-slate-900 dark:text-white'">
          {{ dinheiro(cobranca.valor) }}<span v-if="cobranca.valor != null" class="text-[11px] font-medium text-slate-500 dark:text-slate-400">{{ cobranca.sufixo }}</span>
        </p>
      </div>
    </div>

    <!-- Abas -->
    <div class="flex gap-5 border-b border-slate-200 dark:border-slate-800 mb-3" role="tablist" aria-label="Detalhes da empresa">
      <button
        v-for="a in ABAS"
        :key="a.value"
        type="button"
        role="tab"
        :aria-selected="aba === a.value"
        class="-mb-px inline-flex items-center gap-1.5 border-b-2 px-0.5 py-2.5 text-[13px] font-semibold transition-colors"
        :class="aba === a.value
          ? 'border-purple-600 text-purple-700 dark:text-purple-400'
          : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
        @click="aba = a.value"
      >
        <i :class="['fa-solid', a.icon, 'text-[11px]']" aria-hidden="true" />
        {{ a.label }}
      </button>
    </div>

    <!-- Corpo com altura fixa: trocar de aba não muda o tamanho do modal -->
    <div class="h-[280px] overflow-y-auto pr-0.5">
      <!-- ===== Contato ===== -->
      <div v-if="aba === 'contato' && cliente" class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 divide-y divide-slate-200 dark:divide-slate-800">
        <div v-for="ct in contatos" :key="ct.key" class="flex items-center justify-between gap-3 px-3 py-2.5">
          <div class="min-w-0 flex items-center gap-2.5">
            <i :class="[ct.marca ? 'fa-brands' : 'fa-solid', ct.icon, ct.key === 'whatsapp' ? 'text-emerald-500' : 'text-slate-400', 'text-[13px] w-4 text-center shrink-0']" aria-hidden="true" />
            <div class="min-w-0">
              <p class="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500">{{ ct.label }}</p>
              <p class="text-[13px] font-medium truncate" :class="ct.exibir ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600 italic'">
                {{ ct.exibir || 'Não informado' }}
              </p>
            </div>
          </div>
          <button
            v-if="ct.valor"
            type="button"
            :title="copiado === ct.key ? 'Copiado!' : `Copiar ${ct.label.toLowerCase()}`"
            :aria-label="`Copiar ${ct.label.toLowerCase()}`"
            class="shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
            :class="copiado === ct.key
              ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
              : 'text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-500/10'"
            @click="copiar(ct.key, ct.valor)"
          >
            <i :class="['fa-solid', copiado === ct.key ? 'fa-check' : 'fa-copy', 'text-[13px]']" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- ===== Cobrança ===== -->
      <div v-else-if="aba === 'cobranca' && cliente && cobranca" class="space-y-3">
        <!-- Os dois valores; o que está valendo agora fica destacado -->
        <div class="grid grid-cols-2 gap-2">
          <div
            v-for="v in [
              { key: 'mensal', rotulo: 'Mensal', valor: cobranca.mensal, sufixo: '/mês', ativo: !cobranca.ehAnual },
              { key: 'anual', rotulo: 'Anual (12 meses)', valor: cobranca.anual, sufixo: '/ano', ativo: cobranca.ehAnual },
            ]"
            :key="v.key"
            class="rounded-md border px-3 py-2.5"
            :class="v.ativo
              ? 'border-purple-300 dark:border-purple-500/40 bg-purple-50/60 dark:bg-purple-500/10'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40'"
          >
            <div class="flex items-center justify-between gap-2">
              <p class="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500">{{ v.rotulo }}</p>
              <span
                v-if="v.ativo"
                class="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-purple-600 text-white"
              >{{ cobranca.teste ? 'após o teste' : 'cobrado' }}</span>
            </div>
            <p class="mt-0.5 text-lg font-bold tabular-nums" :class="v.valor == null ? 'text-slate-400 dark:text-slate-600 italic font-medium text-sm' : 'text-slate-900 dark:text-white'">
              {{ dinheiro(v.valor) }}<span v-if="v.valor != null" class="text-xs font-medium text-slate-500 dark:text-slate-400">{{ v.sufixo }}</span>
            </p>
            <p v-if="v.key === 'anual' && v.valor != null" class="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
              ≈ {{ mask(brl(v.valor / 12)) }}/mês
            </p>
          </div>
        </div>

        <!-- Situação da assinatura -->
        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <div
            v-for="l in [
              { rotulo: 'Plano', valor: getPlanLabel(cliente.subscription_plan) },
              { rotulo: 'Período', valor: cobranca.periodo },
              { rotulo: 'Situação', valor: cobranca.status + (cliente.cancel_at_period_end ? ' · cancela no fim' : '') },
              { rotulo: 'Vencimento', valor: cobranca.vencimento + (cobranca.dias !== '—' ? ` · ${cobranca.dias}` : '') },
              { rotulo: 'Quem define o valor', valor: cliente.parceiro_nome ? `Parceiro ${cliente.parceiro_nome}` : 'Agzap' },
            ]"
            :key="l.rotulo"
            class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2"
          >
            <p class="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500">{{ l.rotulo }}</p>
            <p class="text-[13px] font-medium text-slate-800 dark:text-slate-200 truncate" :title="l.valor">{{ l.valor }}</p>
          </div>
        </div>

        <p v-if="cobranca.mensal == null" class="text-[11px] text-slate-500 dark:text-slate-400">
          Sem valor mensal definido: o checkout do app usa R$ 397,00. Dá pra definir em <strong>Editar cliente</strong>.
        </p>
      </div>

      <!-- ===== Uso ===== -->
      <template v-else-if="aba === 'uso'">
        <div v-if="carregando" class="h-full flex items-center justify-center">
          <AppLoading />
        </div>

        <div v-else-if="erro" class="h-full flex items-center justify-center text-sm text-slate-500 dark:text-slate-400">
          Não foi possível carregar o uso desta empresa.
        </div>

        <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div
            v-for="m in metricas"
            :key="m.key"
            class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2.5"
          >
            <div class="flex items-center justify-between gap-3 mb-1.5">
              <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 min-w-0">
                <i :class="['fa-solid', m.icon, m.iconCls, 'text-[10px]']" aria-hidden="true" />
                <span class="truncate">{{ m.label }}</span>
              </p>
              <span
                class="text-[12px] font-bold tabular-nums shrink-0"
                :class="{
                  'text-emerald-600 dark:text-emerald-400': tom(m) === 'ok',
                  'text-amber-600 dark:text-amber-400': tom(m) === 'atencao',
                  'text-red-600 dark:text-red-400': tom(m) === 'cheio',
                }"
              >
                {{ m.usado }}<span v-if="!semLimite(m)"> / {{ m.max }}</span><span v-else class="text-slate-400 dark:text-slate-600 font-normal"> · sem limite</span>
              </span>
            </div>
            <div v-if="!semLimite(m)" class="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
              <div
                class="h-full rounded-full transition-all"
                :class="{
                  'bg-emerald-500': tom(m) === 'ok',
                  'bg-amber-500': tom(m) === 'atencao',
                  'bg-red-500': tom(m) === 'cheio',
                }"
                :style="{ width: `${pct(m)}%` }"
              />
            </div>
          </div>

          <p v-if="metricas.length === 0" class="sm:col-span-2 py-6 text-center text-sm text-slate-500 dark:text-slate-400">
            Sem dados de uso pra mostrar.
          </p>
        </div>
      </template>
    </div>

    <div class="flex gap-2 pt-3 mt-3 border-t border-slate-200 dark:border-slate-800">
      <button
        type="button"
        @click="$emit('close')"
        class="flex-1 px-4 py-2 rounded font-semibold text-[13px] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        Fechar
      </button>
      <button
        v-if="cliente"
        type="button"
        @click="$emit('editarModulos', cliente.id)"
        class="flex-1 px-4 py-2 rounded font-semibold text-[13px] bg-purple-600 hover:bg-purple-700 text-white transition-colors"
      >
        Editar limites
      </button>
    </div>
  </BaseModal>
</template>
