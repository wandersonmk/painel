<script setup lang="ts">
import { ref, watch, computed } from 'vue'

// 'data' = o administrador escolhe a data do novo vencimento (só nos planos).
type Ancora = 'vencimento' | 'hoje' | 'data'

const props = defineProps<{
  show: boolean
  clienteNome: string
  clienteId?: string | null
  precoMensal?: number | null
  precoAnual?: number | null
  // Situação atual da assinatura (o cliente da lista). Dá o vencimento atual,
  // na mesma regra da coluna "Vencimento" (getDataVencimento).
  // cobranca_stripe = tem assinatura viva no Stripe (`sub_…`).
  assinatura?: { subscription_status?: string | null; subscription_renews_at?: string | null; trial_ends_at?: string | null; cobranca_stripe?: boolean | null } | null
}>()
const emit = defineEmits<{
  close: []
  // abater = quanto do saldo de indicação foi usado nesta renovação (0 = nada)
  // ancora = de onde o novo período conta: vencimento atual ou hoje
  // vencimentoEm = data escolhida do novo vencimento ('AAAA-MM-DD'); null = usa a âncora
  confirm: [plan: string, period: string, abater: number, ancora: 'vencimento' | 'hoje', vencimentoEm: string | null]
}>()

const periodPlanMap: Record<string, { plan: string; label: string }> = {
  trial1d: { plan: 'free', label: 'Gratuito (1 dia)' },
  trial2d: { plan: 'free', label: 'Gratuito (2 dias)' },
  trial3d: { plan: 'free', label: 'Gratuito (3 dias)' },
  trial5d: { plan: 'free', label: 'Gratuito (5 dias)' },
  trial: { plan: 'free', label: 'Gratuito (7 dias)' },
  '1month': { plan: 'basic', label: 'Básico (1 mês)' },
  '6months': { plan: 'pro', label: 'Pro (6 meses)' },
  '12months': { plan: 'enterprise', label: 'Enterprise (12 meses)' },
}
const testes = [
  { key: 'trial1d', label: '1 dia', dias: 1 },
  { key: 'trial2d', label: '2 dias', dias: 2 },
  { key: 'trial3d', label: '3 dias', dias: 3 },
  { key: 'trial5d', label: '5 dias', dias: 5 },
  { key: 'trial', label: '7 dias', dias: 7 },
]
const planos = [
  { key: '1month', nome: 'Básico', periodo: '1 mês', meses: 1 },
  { key: '6months', nome: 'Pro', periodo: '6 meses', meses: 6 },
  { key: '12months', nome: 'Enterprise', periodo: '12 meses', meses: 12 },
]

const selected = ref<string>('1month')

// ── Datas no relógio de São Paulo ──────────────────────────────────────────
// A mesma conta está em server/api/admin/renovar-assinatura.post.ts (quem
// grava de verdade); aqui é só a prévia.
const TZ = 'America/Sao_Paulo'
const fmtPartesSP = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})
const fmtData = new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' })
function paredeSP(t: number): number {
  const p: Record<string, number> = {}
  for (const x of fmtPartesSP.formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!) + (((t % 1000) + 1000) % 1000)
}
function deParedeSP(parede: number): number {
  let t = parede + 3 * 3_600_000
  t += parede - paredeSP(t)
  return t
}
// Meses de calendário (31/01 + 1 mês = último dia de fevereiro) + dias.
function somarPeriodoSP(base: Date, meses: number, dias: number): Date {
  const w = new Date(paredeSP(base.getTime()))
  const ano = w.getUTCFullYear()
  const mesAlvo = w.getUTCMonth() + meses
  const ultimoDia = new Date(Date.UTC(ano, mesAlvo + 1, 0)).getUTCDate()
  const novo = Date.UTC(ano, mesAlvo, Math.min(w.getUTCDate(), ultimoDia),
    w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds(), w.getUTCMilliseconds()) + dias * 86_400_000
  return new Date(deParedeSP(novo))
}
const diaSP = (d: Date) => Math.floor(paredeSP(d.getTime()) / 86_400_000)
const fmt = (d: Date | null) => (d ? fmtData.format(d) : '—')

// ── Data escolhida para o novo vencimento ──────────────────────────────────
// INÍCIO-DATA-ESCOLHIDA: mesma conta do servidor (renovar-assinatura.post.ts),
// mais dataComDia, que só a tela usa para sugerir a data.
// Um "dia" aqui é o dia de calendário de SP como número (dias desde
// 01/01/1970, o mesmo que diaSP devolve) e vira texto 'AAAA-MM-DD'.
const MAX_MESES_DATA_ESCOLHIDA = 13
const DIA_MS = 86_400_000
// 'AAAA-MM-DD' → dia. null se o texto não é uma data que existe (ex.: 30/02).
function diaDeIso(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3])
  const x = new Date(Date.UTC(ano, mes - 1, dia))
  if (x.getUTCFullYear() !== ano || x.getUTCMonth() !== mes - 1 || x.getUTCDate() !== dia) return null
  return x.getTime() / DIA_MS
}
const isoDeDia = (n: number) => new Date(n * DIA_MS).toISOString().slice(0, 10)
const diaDoMes = (n: number) => new Date(n * DIA_MS).getUTCDate()
// Dia `dia` do mês (ano, mes0). Dia que não existe no mês vira o último.
function diaNoMes(ano: number, mes0: number, dia: number): number {
  const ultimo = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate()
  return Date.UTC(ano, mes0, Math.min(dia, ultimo)) / DIA_MS
}
// Soma meses de calendário a um dia (31/01 + 1 mês = último dia de fevereiro).
function somarMesesDia(n: number, meses: number): number {
  const w = new Date(n * DIA_MS)
  return diaNoMes(w.getUTCFullYear(), w.getUTCMonth() + meses, w.getUTCDate())
}
// Data com o dia do mês `dia` mais perto do fim do período normal
// (`referencia`): olha o mês dela, o anterior e o seguinte. Empate fica com a
// mais cedo, para não dar dia de graça.
function dataComDia(referencia: number, dia: number): number {
  const w = new Date(referencia * DIA_MS)
  let melhor = referencia
  let menorDistancia = Infinity
  for (const k of [-1, 0, 1]) {
    const c = diaNoMes(w.getUTCFullYear(), w.getUTCMonth() + k, dia)
    const d = Math.abs(c - referencia)
    if (d < menorDistancia) { melhor = c; menorDistancia = d }
  }
  return melhor
}
// Período da renovação com data escolhida. Começa no vencimento atual se ele
// ainda não passou (o cliente já tem esses dias); senão, hoje. `referencia` é
// o fim do período normal do plano; `limite`, a data mais longe aceita.
function periodoDataEscolhida(hoje: number, vencimento: number | null, meses: number) {
  const inicio = vencimento !== null && vencimento >= hoje ? vencimento : hoje
  return {
    inicio,
    referencia: somarMesesDia(inicio, meses),
    limite: somarMesesDia(inicio, MAX_MESES_DATA_ESCOLHIDA),
  }
}
// FIM-DATA-ESCOLHIDA
const fmtDia = (n: number | null) => (n === null ? '—' : isoDeDia(n).split('-').reverse().join('/'))
const qtdDias = (n: number) => (n === 1 ? '1 dia' : `${n} dias`)

const agora = ref(new Date())
const ancora = ref<Ancora>('hoje')

const vencimentoAtual = computed<Date | null>(() => {
  const a = props.assinatura
  if (!a) return null
  const s = (a.subscription_status === 'active' && a.subscription_renews_at) ? a.subscription_renews_at
    : (a.subscription_status === 'trial' && a.trial_ends_at) ? a.trial_ends_at
    : a.trial_ends_at || a.subscription_renews_at || null
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
})
const diasAteVencimento = computed(() => (vencimentoAtual.value ? diaSP(vencimentoAtual.value) - diaSP(agora.value) : null))
const situacaoVencimento = computed(() => {
  const d = diasAteVencimento.value
  if (d === null) return 'Sem vencimento'
  if (d < -1) return `Venceu há ${-d} dias`
  if (d === -1) return 'Venceu ontem'
  if (d === 0) return 'Vence hoje'
  if (d === 1) return 'Vence amanhã'
  return `Vence em ${d} dias`
})

const ehTeste = computed(() => selected.value.startsWith('trial'))
const passo = computed(() => {
  const t = testes.find(x => x.key === selected.value)
  if (t) return { meses: 0, dias: t.dias }
  return { meses: planos.find(x => x.key === selected.value)?.meses ?? 1, dias: 0 }
})
const novoPorVencimento = computed(() => (vencimentoAtual.value ? somarPeriodoSP(vencimentoAtual.value, passo.value.meses, passo.value.dias) : null))
const novoPorHoje = computed(() => somarPeriodoSP(agora.value, passo.value.meses, passo.value.dias))
// Motivo de "Vencimento atual" estar indisponível (null = disponível).
const vencimentoBloqueado = computed<string | null>(() => {
  if (!vencimentoAtual.value) return 'Sem vencimento cadastrado: conta a partir de hoje.'
  if (!novoPorVencimento.value || diaSP(novoPorVencimento.value) <= diaSP(agora.value)) {
    return 'O vencimento atual ficou para trás: contando dele, a nova data já teria passado.'
  }
  return null
})

// ── Escolher data ──────────────────────────────────────────────────────────
// Cliente do Stripe: o webhook regrava o vencimento com a data da cobrança,
// então uma data escolhida aqui não muda nada no Stripe e, se cair antes da
// cobrança, bloqueia o cliente antes de o Stripe cobrar.
const cobrancaStripe = computed(() => props.assinatura?.cobranca_stripe === true)
const dataBloqueada = computed<string | null>(() => {
  if (cobrancaStripe.value) return 'Cobrança pelo Stripe: o vencimento segue o dia da cobrança no Stripe, por isso a data não se escolhe aqui.'
  if (ehTeste.value) return 'Escolher data vale só para os planos.'
  return null
})
const hojeDia = computed(() => diaSP(agora.value))
const vencimentoDia = computed(() => (vencimentoAtual.value ? diaSP(vencimentoAtual.value) : null))
const periodoData = computed(() => (ehTeste.value ? null : periodoDataEscolhida(hojeDia.value, vencimentoDia.value, passo.value.meses)))
const modoData = computed(() => ancora.value === 'data' && !dataBloqueada.value)

// Campo "Dia do mês" (atalho: calcula a data) e a data em si ('AAAA-MM-DD').
const diaTexto = ref('')
const dataEscolhida = ref('')
const diaDigitado = computed(() => {
  const n = Number(diaTexto.value)
  return diaTexto.value !== '' && Number.isInteger(n) && n >= 1 && n <= 31 ? n : null
})
const escolhidoDia = computed(() => diaDeIso(dataEscolhida.value))

function sugerirData(dia: number) {
  const p = periodoData.value
  if (p) dataEscolhida.value = isoDeDia(dataComDia(p.referencia, dia))
}
// Ao abrir: o dia do vencimento atual (ou de hoje, sem vencimento) dentro do
// período do plano. O administrador troca para o dia habitual do cliente.
function iniciarData() {
  const dia = diaDoMes(vencimentoDia.value ?? hojeDia.value)
  diaTexto.value = String(dia)
  sugerirData(dia)
}
function onDia(e: Event) {
  diaTexto.value = (e.target as HTMLInputElement).value
  if (diaDigitado.value !== null) sugerirData(diaDigitado.value)
}
function onData(e: Event) {
  dataEscolhida.value = (e.target as HTMLInputElement).value
  if (escolhidoDia.value !== null) diaTexto.value = String(diaDoMes(escolhidoDia.value))
}
// Trocou de plano: mantém o dia do mês escolhido, dentro do novo período.
watch(() => periodoData.value?.referencia, (r) => {
  if (r == null) return
  const dia = diaDigitado.value ?? (escolhidoDia.value !== null ? diaDoMes(escolhidoDia.value) : null)
  if (dia !== null) sugerirData(dia)
  else iniciarData()
})
// Teste grátis não escolhe data: volta para a âncora padrão.
watch(ehTeste, (t) => { if (t && ancora.value === 'data') ancora.value = ancoraPadrao() })

const avisoDia = computed<{ texto: string; erro: boolean } | null>(() => {
  if (!modoData.value) return null
  if (diaDigitado.value === null) return { texto: 'O dia vai de 1 a 31.', erro: true }
  const n = escolhidoDia.value
  // Só quando a data caiu mesmo no último dia do mês (o dia digitado não existe nele).
  if (n !== null && diaDoMes(n) < diaDigitado.value && diaDoMes(n + 1) === 1) {
    return { texto: `Esse mês não tem dia ${diaDigitado.value}: ficou no último dia (${fmtDia(n)}).`, erro: false }
  }
  return null
})
// Trava: sem data, data de hoje para trás ou longe demais não renova.
const erroData = computed<string | null>(() => {
  const p = periodoData.value
  if (!modoData.value || !p) return null
  const n = escolhidoDia.value
  if (n === null) return 'Escolha a data do novo vencimento.'
  if (n <= hojeDia.value) return 'O novo vencimento precisa ser depois de hoje.'
  if (n > p.limite) return `Passa de ${MAX_MESES_DATA_ESCOLHIDA} meses: escolha até ${fmtDia(p.limite)}.`
  return null
})
// Quantos dias o cliente vai ter e a comparação com o período normal do plano.
const resumoData = computed(() => {
  const p = periodoData.value
  const n = escolhidoDia.value
  if (!modoData.value || !p || n === null || erroData.value) return null
  const dias = n - p.inicio
  const diferenca = n - p.referencia
  const aPartirDe = p.inicio === hojeDia.value ? 'a partir de hoje' : `a partir do vencimento atual (${fmtDia(p.inicio)})`
  if (dias <= 0) {
    return {
      dias, aPartirDe, alerta: true,
      comparacao: dias === 0
        ? 'É a data do vencimento atual: o cliente não ganha nenhum dia.'
        : `É antes do vencimento atual (${fmtDia(p.inicio)}): o cliente fica com ${qtdDias(-dias)} a menos do que já tem.`,
    }
  }
  return {
    dias, aPartirDe, alerta: diferenca > 0,
    comparacao: diferenca === 0
      ? 'igual ao período normal'
      : `${qtdDias(Math.abs(diferenca))} a ${diferenca < 0 ? 'menos' : 'mais'} que o período normal (${fmtDia(p.referencia)})`,
  }
})

const novoVencimento = computed<Date | null>(() => {
  if (modoData.value) {
    const n = escolhidoDia.value
    return n !== null && !erroData.value ? new Date(deParedeSP(n * DIA_MS + (23 * 3600 + 59 * 60 + 59) * 1000)) : null
  }
  return ancora.value === 'vencimento' ? novoPorVencimento.value : novoPorHoje.value
})

// Âncora padrão: vencimento atual quando ele é hoje ou no futuro; senão, hoje.
function ancoraPadrao(): 'vencimento' | 'hoje' {
  const d = diasAteVencimento.value
  return d !== null && d >= 0 && !vencimentoBloqueado.value ? 'vencimento' : 'hoje'
}
const enviando = ref(false)
watch(() => [props.show, props.clienteId], ([s]) => {
  enviando.value = false
  if (!s) return
  agora.value = new Date()
  ancora.value = ancoraPadrao()
  iniciarData()
}, { immediate: true })
watch(vencimentoBloqueado, (b) => { if (b && ancora.value === 'vencimento') ancora.value = 'hoje' })

// Saldo de indicação disponível (cliente de Pix): dá pra abater aqui na
// renovação — o painel registra o uso e você cobra só a diferença.
const saldoDisponivel = ref(0)
const usarSaldo = ref(false)
const valorAbater = ref<number | null>(null)
watch(() => [props.show, props.clienteId], async ([s]) => {
  saldoDisponivel.value = 0
  usarSaldo.value = false
  if (!s || !props.clienteId) return
  try {
    const r = await $fetch<{ disponivel: number }>('/api/admin/indicacao-saldo', { query: { empresaId: props.clienteId }, headers: await useAdminAuthHeaders() })
    saldoDisponivel.value = r.disponivel || 0
    usarSaldo.value = saldoDisponivel.value > 0
  } catch { saldoDisponivel.value = 0 }
}, { immediate: true })
const precoPeriodo = computed(() => {
  if (selected.value === '1month') return Number(props.precoMensal || 0)
  if (selected.value === '6months' || selected.value === '12months') return Number(props.precoAnual || 0)
  return 0
})
watch([saldoDisponivel, () => selected.value], () => {
  valorAbater.value = precoPeriodo.value > 0 ? Math.min(saldoDisponivel.value, precoPeriodo.value) : saldoDisponivel.value
})
function brl(v: number) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
// Preço curto no card do plano (sem centavos quando é valor redondo).
function brlCurto(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 })
}
function precoPlano(key: string): string | null {
  const mensal = Number(props.precoMensal || 0)
  const anual = Number(props.precoAnual || 0)
  if (key === '1month' && mensal > 0) return `${brlCurto(mensal)}/mês`
  if (key === '12months' && anual > 0) return brlCurto(anual)
  return null
}

const podeRenovar = computed(() => !enviando.value && !erroData.value)
function handleSubmit() {
  if (!podeRenovar.value) return
  const { plan } = periodPlanMap[selected.value] || { plan: 'basic' }
  const abater = !ehTeste.value && usarSaldo.value && valorAbater.value
    ? Math.min(Math.round(Number(valorAbater.value) * 100) / 100, saldoDisponivel.value)
    : 0
  const n = modoData.value ? escolhidoDia.value : null
  // Com data escolhida, o servidor ignora a âncora; vai a padrão por garantia.
  const a: 'vencimento' | 'hoje' = n !== null ? ancoraPadrao()
    : ancora.value === 'vencimento' && !vencimentoBloqueado.value ? 'vencimento' : 'hoje'
  // O modal fecha quando a renovação termina; até lá, sem segundo clique.
  enviando.value = true
  emit('confirm', plan, selected.value, abater > 0 ? abater : 0, a, n !== null ? isoDeDia(n) : null)
}

const classeOpcao = (ativa: boolean) => (ativa
  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
  : 'text-slate-600 dark:text-slate-400 enabled:hover:text-slate-900 dark:enabled:hover:text-white')
const classeCampo = 'h-9 w-full rounded-lg border bg-white px-2.5 text-sm tabular-nums text-slate-900 transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 dark:bg-slate-900 dark:text-white dark:[color-scheme:dark]'
</script>

<template>
  <BaseModal :show="show" title="Renovar assinatura" max-width="max-w-4xl" @close="$emit('close')">
    <form class="space-y-5" @submit.prevent="handleSubmit">
      <p class="-mt-1 text-sm text-slate-600 dark:text-slate-400">
        Renovando para <span class="font-medium text-slate-900 dark:text-white break-words">{{ clienteNome }}</span>
      </p>

      <div class="grid gap-5 md:grid-cols-2 md:gap-6">
        <!-- Coluna 1: o que renovar -->
        <div class="min-w-0 space-y-5">
          <!-- Teste grátis -->
          <div>
            <p id="renovar-testes" class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Teste grátis</p>
            <div class="grid grid-cols-5 gap-2" role="radiogroup" aria-labelledby="renovar-testes">
              <button
                v-for="t in testes"
                :key="t.key"
                type="button"
                role="radio"
                :aria-checked="selected === t.key"
                class="h-9 rounded-lg border text-sm whitespace-nowrap transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
                :class="selected === t.key
                  ? 'border-purple-500 bg-purple-50 text-purple-700 dark:bg-purple-500/15 dark:text-purple-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'"
                @click="selected = t.key"
              >
                {{ t.label }}
              </button>
            </div>
          </div>

          <!-- Planos -->
          <div>
            <p id="renovar-planos" class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Planos</p>
            <div class="grid grid-cols-3 gap-2.5" role="radiogroup" aria-labelledby="renovar-planos">
              <button
                v-for="p in planos"
                :key="p.key"
                type="button"
                role="radio"
                :aria-checked="selected === p.key"
                class="flex min-w-0 flex-col items-start rounded-xl border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 sm:px-3.5"
                :class="selected === p.key
                  ? 'border-purple-500 bg-purple-50 ring-1 ring-purple-500 dark:bg-purple-500/15'
                  : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'"
                @click="selected = p.key"
              >
                <span class="text-sm font-medium text-slate-900 dark:text-white">{{ p.nome }}</span>
                <span class="text-xs text-slate-500 dark:text-slate-400">{{ p.periodo }}</span>
                <span v-if="precoPlano(p.key)" class="mt-1 max-w-full truncate text-xs tabular-nums text-slate-700 dark:text-slate-300">{{ precoPlano(p.key) }}</span>
              </button>
            </div>
          </div>

          <div v-if="saldoDisponivel > 0 && !ehTeste" class="rounded-xl border border-emerald-300 dark:border-emerald-500/40 bg-emerald-50 dark:bg-emerald-500/10 px-4 py-3 space-y-2">
            <label class="flex items-center gap-2 text-sm font-medium text-emerald-800 dark:text-emerald-300">
              <input v-model="usarSaldo" type="checkbox" class="text-emerald-600" />
              Abater o saldo de indicação ({{ brl(saldoDisponivel) }} disponível)
            </label>
            <div v-if="usarSaldo" class="flex flex-wrap items-center gap-2 text-sm">
              <span class="text-emerald-800 dark:text-emerald-300">Abater</span>
              <input v-model.number="valorAbater" type="number" min="0.01" step="0.01" :max="saldoDisponivel" class="w-28 px-2 py-1.5 rounded-md border border-emerald-300 dark:border-emerald-500/40 bg-white dark:bg-slate-900 text-sm" />
              <span v-if="precoPeriodo > 0" class="text-xs text-emerald-800 dark:text-emerald-300">→ cobrar {{ brl(Math.max(0, precoPeriodo - (valorAbater || 0))) }} de {{ brl(precoPeriodo) }}</span>
            </div>
          </div>
        </div>

        <!-- Coluna 2: quando vence -->
        <div class="min-w-0">
          <p id="renovar-ancora" class="mb-2 text-xs font-medium uppercase tracking-wide text-slate-500 dark:text-slate-400">Contar a partir de</p>
          <div class="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800/70" role="radiogroup" aria-labelledby="renovar-ancora">
            <button
              type="button"
              role="radio"
              :aria-checked="ancora === 'vencimento'"
              :disabled="!!vencimentoBloqueado"
              class="flex min-w-0 flex-col items-center rounded-lg px-1.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 disabled:cursor-not-allowed disabled:opacity-50"
              :class="classeOpcao(ancora === 'vencimento')"
              @click="ancora = 'vencimento'"
            >
              <span class="max-w-full truncate font-medium">Vencimento atual</span>
              <span class="text-xs tabular-nums text-slate-500 dark:text-slate-400">{{ vencimentoAtual ? fmt(vencimentoAtual) : 'sem data' }}</span>
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="ancora === 'hoje'"
              class="flex min-w-0 flex-col items-center rounded-lg px-1.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60"
              :class="classeOpcao(ancora === 'hoje')"
              @click="ancora = 'hoje'"
            >
              <span class="font-medium">Hoje</span>
              <span class="text-xs tabular-nums text-slate-500 dark:text-slate-400">{{ fmt(agora) }}</span>
            </button>
            <button
              type="button"
              role="radio"
              :aria-checked="ancora === 'data'"
              :disabled="!!dataBloqueada"
              :title="dataBloqueada || undefined"
              class="flex min-w-0 flex-col items-center rounded-lg px-1.5 py-1.5 text-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 disabled:cursor-not-allowed disabled:opacity-50"
              :class="classeOpcao(ancora === 'data')"
              @click="ancora = 'data'"
            >
              <span class="max-w-full truncate font-medium">Escolher data</span>
              <span class="text-xs tabular-nums text-slate-500 dark:text-slate-400">{{ dataBloqueada ? (cobrancaStripe ? 'Stripe' : 'só planos') : escolhidoDia !== null ? `dia ${diaDoMes(escolhidoDia)}` : '—' }}</span>
            </button>
          </div>
          <p v-if="vencimentoBloqueado && ancora !== 'data'" class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{{ vencimentoBloqueado }}</p>
          <p v-if="dataBloqueada" class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{{ dataBloqueada }}</p>

          <!-- Escolher data: dia do mês (atalho) ou a data direto -->
          <div v-if="modoData" class="mt-3">
            <div class="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2">
              <div>
                <label for="renovar-dia" class="mb-1 block text-xs text-slate-500 dark:text-slate-400">Dia do mês</label>
                <input
                  id="renovar-dia"
                  type="number"
                  inputmode="numeric"
                  min="1"
                  max="31"
                  step="1"
                  :value="diaTexto"
                  :class="[classeCampo, avisoDia?.erro ? 'border-rose-400 dark:border-rose-500/60' : 'border-slate-200 dark:border-slate-700']"
                  @input="onDia"
                />
              </div>
              <div>
                <label for="renovar-data" class="mb-1 block text-xs text-slate-500 dark:text-slate-400">Data do novo vencimento</label>
                <input
                  id="renovar-data"
                  type="date"
                  :min="isoDeDia(hojeDia + 1)"
                  :max="periodoData ? isoDeDia(periodoData.limite) : undefined"
                  :value="dataEscolhida"
                  :class="[classeCampo, erroData ? 'border-rose-400 dark:border-rose-500/60' : 'border-slate-200 dark:border-slate-700']"
                  @input="onData"
                />
              </div>
            </div>
            <p v-if="erroData" role="alert" class="mt-1.5 text-xs text-rose-600 dark:text-rose-400">{{ erroData }}</p>
            <p v-else-if="avisoDia" class="mt-1.5 text-xs" :class="avisoDia.erro ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'">{{ avisoDia.texto }}</p>
          </div>

          <!-- Prévia -->
          <div class="mt-3 rounded-xl border border-purple-200 bg-purple-50/60 px-4 py-2.5 dark:border-purple-500/30 dark:bg-purple-500/10">
            <div class="flex items-center justify-between gap-3">
              <div class="min-w-0">
                <p class="text-xs" :class="diasAteVencimento !== null && diasAteVencimento < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'">{{ situacaoVencimento }}</p>
                <p class="text-sm tabular-nums text-slate-700 dark:text-slate-300">{{ fmt(vencimentoAtual) }}</p>
              </div>
              <i class="fa-solid fa-arrow-right shrink-0 text-sm text-purple-500 dark:text-purple-400" aria-hidden="true" />
              <div class="min-w-0 text-right">
                <p class="text-xs text-slate-500 dark:text-slate-400">Novo vencimento</p>
                <p class="text-base font-medium tabular-nums text-purple-700 dark:text-purple-300" aria-live="polite">{{ fmt(novoVencimento) }}</p>
              </div>
            </div>
            <p v-if="resumoData" class="mt-2 border-t border-purple-200/70 pt-2 text-xs text-slate-600 dark:border-purple-500/20 dark:text-slate-300" aria-live="polite">
              <template v-if="resumoData.dias > 0">
                <span class="font-medium tabular-nums text-slate-900 dark:text-white">{{ qtdDias(resumoData.dias) }}</span>
                {{ resumoData.aPartirDe }} ·
                <span :class="resumoData.alerta ? 'text-amber-700 dark:text-amber-300' : ''">{{ resumoData.comparacao }}</span>
              </template>
              <span v-else class="text-amber-700 dark:text-amber-300">{{ resumoData.comparacao }}</span>
            </p>
          </div>
          <p v-if="ancora === 'vencimento' && diasAteVencimento !== null && diasAteVencimento < 0" class="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
            Os dias desde o vencimento contam dentro do novo período.
          </p>
        </div>
      </div>

      <div class="flex gap-2 sm:justify-end">
        <button type="button" class="flex-1 px-4 py-2.5 rounded-lg font-normal border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 sm:w-40 sm:flex-none" @click="$emit('close')">
          Cancelar
        </button>
        <button
          type="submit"
          :disabled="!podeRenovar"
          class="flex-1 px-4 py-2.5 rounded-lg font-normal bg-purple-600 hover:bg-purple-700 text-white disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-purple-600 sm:w-40 sm:flex-none"
        >
          <i v-if="enviando" class="fa-solid fa-spinner fa-spin mr-1.5" aria-hidden="true" />
          {{ enviando ? 'Renovando…' : 'Renovar' }}
        </button>
      </div>
    </form>
  </BaseModal>
</template>
