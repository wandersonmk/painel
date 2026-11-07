<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CREDITOS, LABEL_CREDITO, PLANOS_PARCEIRO, type TipoCredito } from '~/composables/useParceiroLicencas'
import type { RecursosPlano } from '~/utils/planosItens'

/**
 * Preços que o parceiro paga à Agzap e revenda sugerida, com o histórico de quem
 * mudou o quê. As faixas são fixas: aqui só mudam os valores.
 */
interface CreditoPreco {
  tipo_credito: TipoCredito
  faixas: { quantidade_min: number; preco_unitario: number }[]
  revenda: number
  vale_desde: string | null
}

interface Alteracao {
  id: string
  data: string
  tipo_credito: TipoCredito
  campo: string
  de: number
  para: number
  autor: string
}

const emit = defineEmits<{ alterado: [] }>()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const creditos = ref<CreditoPreco[]>([])
const alteracoes = ref<Alteracao[]>([])
// O que cada plano grava na conta (planos_assinatura), para "o que vem no plano".
const planos = ref<RecursosPlano[]>([])
const loading = ref(true)
const erro = ref<string | null>(null)

async function carregar() {
  erro.value = null
  try {
    const headers = await useAdminAuthHeaders()
    const [resp, respPlanos] = await Promise.all([
      $fetch<{ success: boolean; data?: { creditos: CreditoPreco[]; alteracoes: Alteracao[] }; error?: string }>(
        '/api/admin/parceiros/precos',
        { headers },
      ),
      // Sem os planos a tabela de preços ainda funciona; só a janela fica sem lista.
      $fetch<{ planos: RecursosPlano[] }>('/api/admin/planos-assinatura', { headers }).catch(() => null),
    ])
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    creditos.value = resp.data.creditos
    alteracoes.value = resp.data.alteracoes
    if (respPlanos) planos.value = respPlanos.planos
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Erro ao carregar os preços'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  toast = await useToastSafe()
  await carregar()
})

defineExpose({ carregar })

// ───────── Formatação ─────────
const FUSO = 'America/Sao_Paulo'
const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtBRL = (v: number) => moeda.format(v)

function fmtData(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: FUSO })
}
function fmtDataHora(s: string) {
  const hora = new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO })
  return `${fmtData(s)} ${hora}`
}

/** Quanto sobra para o parceiro em cada faixa, vendendo pela revenda sugerida. */
function textoGanho(precos: number[], revenda: number) {
  const ganhos = precos.map(p => Math.round((revenda - p) * 100) / 100)
  const menor = Math.min(...ganhos)
  const maior = Math.max(...ganhos)
  return menor === maior ? fmtBRL(menor) : `${fmtBRL(menor)} a ${fmtBRL(maior)}`
}
const ganhoDe = (c: CreditoPreco) => textoGanho(c.faixas.map(f => f.preco_unitario), c.revenda)

// ───────── O que vem no plano ─────────
const detalhe = ref<CreditoPreco | null>(null)
const planoDoDetalhe = computed(() => {
  const c = detalhe.value
  return c ? planos.value.find(p => p.codigo === CREDITOS[c.tipo_credito].plano) ?? null : null
})
const subtituloDetalhe = computed(() => {
  const c = detalhe.value
  if (!c) return ''
  const credito = CREDITOS[c.tipo_credito]
  const alcance = PLANOS_PARCEIRO.find(p => p.codigo === credito.plano)?.alcance ?? ''
  return `Vale ${credito.meses === 12 ? '12 meses' : '30 dias'}. ${alcance}.`
})
const resumoDetalhe = computed(() => {
  const c = detalhe.value
  if (!c) return []
  const faixas = c.faixas.length > 1
    ? c.faixas.map((f, i) => ({ rotulo: i === 0 ? '1 a 5 licenças' : '6 ou mais', valor: fmtBRL(f.preco_unitario) }))
    : [{ rotulo: 'Preço único', valor: fmtBRL(c.faixas[0]!.preco_unitario) }]
  return [
    ...faixas,
    { rotulo: 'Revenda sugerida', valor: fmtBRL(c.revenda) },
    { rotulo: 'Parceiro ganha', valor: ganhoDe(c), destaque: true },
  ]
})
const NOTA_DETALHE = 'É o que a conta recebe quando o parceiro renova com este crédito ou quando a renovação do painel escolhe este plano. '
  + 'Depois dá para ajustar item por item em Módulos e em Limites: renovar de novo com o mesmo plano mantém o ajuste, e trocar de plano grava os valores do plano novo.'

// ───────── Editar ─────────
const alvo = ref<CreditoPreco | null>(null)
const valores = ref<(number | null)[]>([])
const revenda = ref<number | null>(null)
const salvando = ref(false)

function abrir(c: CreditoPreco) {
  alvo.value = c
  valores.value = c.faixas.map(f => f.preco_unitario)
  revenda.value = c.revenda
}

function fechar() {
  if (!salvando.value) alvo.value = null
}

const campos = computed(() => {
  const faixas = alvo.value?.faixas ?? []
  return faixas.map((f, i) => ({
    id: `preco-faixa-${f.quantidade_min}`,
    rotulo: faixas.length === 1 ? 'Preço único' : i === 0 ? '1 a 5 licenças' : '6 ou mais',
    atual: f.preco_unitario,
  }))
})

const faixaMudou = (i: number) => valores.value[i] !== alvo.value?.faixas[i]?.preco_unitario
const revendaMudou = computed(() => revenda.value !== alvo.value?.revenda)
const mudou = computed(() => revendaMudou.value || valores.value.some((_, i) => faixaMudou(i)))

const erroForm = computed(() => {
  const precos = valores.value
  if (precos.some(p => !p || p <= 0) || !revenda.value || revenda.value <= 0) return 'Preencha todos os valores.'
  const numeros = precos as number[]
  if (numeros.some((p, i) => i > 0 && p > numeros[i - 1]!)) return '"6 ou mais" não pode custar mais que "1 a 5 licenças".'
  if (revenda.value < Math.max(...numeros)) return 'A revenda sugerida não pode ser menor que o preço pago à Agzap.'
  return null
})

const ganhoNovo = computed(() => erroForm.value ? '—' : textoGanho(valores.value as number[], revenda.value as number))

async function salvar() {
  if (!alvo.value || salvando.value || erroForm.value || !mudou.value) return
  salvando.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/parceiros/precos', {
      method: 'POST',
      body: {
        tipoCredito: alvo.value.tipo_credito,
        faixas: alvo.value.faixas.map((f, i) => ({ quantidade_min: f.quantidade_min, preco_unitario: valores.value[i] })),
        revenda: revenda.value,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error)
    toast?.success('Preços salvos')
    alvo.value = null
    await carregar()
    emit('alterado')
  } catch (e: any) {
    toast?.error(e?.data?.statusMessage || e?.message || 'Erro ao salvar os preços')
  } finally {
    salvando.value = false
  }
}

const cartao = 'rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none overflow-hidden'
const cabecalho = 'px-5 py-3.5 border-b border-slate-200 dark:border-slate-800'
const th = 'px-3.5 py-2.5 text-left text-[11px] font-medium leading-tight text-slate-500 dark:text-slate-400 uppercase tracking-wider whitespace-nowrap'
const td = 'px-3.5 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap'
const linhaTabela = 'border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-white/[0.02]'
// A tabela pode passar da largura em notebook: Ações fica presa à direita.
const colAcoes = 'lg:sticky lg:right-0 lg:bg-white lg:dark:bg-slate-900'
const campoValor = 'w-full h-10 px-3 bg-white dark:bg-white/[0.04] border rounded-xl text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 transition-colors'
const campoNormal = 'border-slate-200 dark:border-white/10'
const campoAlterado = 'border-purple-400 dark:border-purple-500/60'
</script>

<template>
  <div class="space-y-4">
    <div v-if="erro" role="alert" class="px-4 py-3 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-700 dark:text-red-400">
      {{ erro }}
    </div>

    <section :class="cartao">
      <div :class="cabecalho">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-white">Preços dos créditos</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">O que o parceiro paga à Agzap por licença e a revenda sugerida. Clique no crédito para ver o que vem no plano.</p>
      </div>

      <div v-if="loading" class="p-5 space-y-3">
        <div v-for="i in 4" :key="i" class="h-9 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr :class="linhaTabela">
              <th :class="[th, 'pl-5']">Crédito</th>
              <th :class="[th, '!text-right']">1 a 5 licenças</th>
              <th :class="[th, '!text-right']">6 ou mais</th>
              <th :class="[th, '!text-right']">Revenda sugerida</th>
              <th :class="[th, '!text-right']">Quanto o parceiro ganha</th>
              <th :class="th">Vale desde</th>
              <th :class="[th, '!text-right pr-5 lg:sticky lg:right-0 lg:bg-slate-50 lg:dark:bg-slate-900']">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="c in creditos" :key="c.tipo_credito">
              <td :class="[td, 'pl-5']">
                <button
                  type="button"
                  class="group inline-flex items-center gap-1.5 rounded text-left font-medium text-slate-900 hover:text-purple-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500/60 dark:text-white dark:hover:text-purple-300"
                  :aria-label="`Ver o que vem no ${LABEL_CREDITO[c.tipo_credito]}`"
                  @click="detalhe = c"
                >
                  {{ LABEL_CREDITO[c.tipo_credito] }}
                  <i class="fa-solid fa-circle-info text-[11px] text-slate-400 group-hover:text-purple-500" aria-hidden="true" />
                </button>
              </td>
              <template v-if="c.faixas.length > 1">
                <td :class="[td, 'text-right tabular-nums']">{{ fmtBRL(c.faixas[0]!.preco_unitario) }}</td>
                <td :class="[td, 'text-right tabular-nums']">{{ fmtBRL(c.faixas[1]!.preco_unitario) }}</td>
              </template>
              <td v-else colspan="2" :class="[td, 'text-right tabular-nums']">
                {{ fmtBRL(c.faixas[0]!.preco_unitario) }}
                <span class="text-xs text-slate-500 dark:text-slate-400">preço único</span>
              </td>
              <td :class="[td, 'text-right tabular-nums']">{{ fmtBRL(c.revenda) }}</td>
              <td :class="[td, 'text-right tabular-nums !text-emerald-700 dark:!text-emerald-400']">{{ ganhoDe(c) }}</td>
              <td :class="[td, 'tabular-nums !text-slate-500 dark:!text-slate-400']">{{ fmtData(c.vale_desde) }}</td>
              <td :class="[td, 'text-right pr-5', colAcoes]">
                <button
                  type="button"
                  :aria-label="`Editar preço de ${LABEL_CREDITO[c.tipo_credito]}`"
                  @click="abrir(c)"
                  class="px-3 py-1 rounded border text-xs font-medium border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                >Editar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <p class="px-5 py-3 border-t border-slate-200 dark:border-slate-800 bg-sky-50 dark:bg-sky-500/10 text-[13px] leading-relaxed text-sky-900 dark:text-sky-300">
        O preço novo vale para as próximas compras. Créditos já comprados não mudam, e o que cada parceiro pagou continua igual no extrato e no Financeiro.
        Valores estimados a preço de tabela, como as cortesias no Financeiro, acompanham o preço novo.
      </p>
    </section>

    <section :class="cartao">
      <div :class="cabecalho">
        <h2 class="text-sm font-semibold text-slate-900 dark:text-white">Alterações de preço</h2>
        <p class="text-xs text-slate-500 dark:text-slate-400">Histórico de quem mudou o quê</p>
      </div>

      <div v-if="loading" class="p-5 space-y-3">
        <div v-for="i in 2" :key="i" class="h-9 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
      </div>

      <p v-else-if="!alteracoes.length" class="px-5 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
        Nenhuma alteração de preço até agora
      </p>

      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr :class="linhaTabela">
              <th :class="[th, 'pl-5']">Data</th>
              <th :class="th">Crédito</th>
              <th :class="th">O que mudou</th>
              <th :class="[th, 'pr-5']">Quem alterou</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="a in alteracoes" :key="a.id">
              <td :class="[td, 'pl-5 tabular-nums !text-slate-500 dark:!text-slate-400']">{{ fmtDataHora(a.data) }}</td>
              <td :class="[td, 'font-medium text-slate-900 dark:text-white']">{{ LABEL_CREDITO[a.tipo_credito] ?? a.tipo_credito }}</td>
              <td :class="[td, 'tabular-nums']">{{ a.campo }}: {{ fmtBRL(a.de) }} para {{ fmtBRL(a.para) }}</td>
              <td :class="[td, 'pr-5']">{{ a.autor }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <PlanoDetalhesModal
      :show="!!detalhe"
      :plano="planoDoDetalhe"
      :titulo="detalhe ? `O que vem no ${LABEL_CREDITO[detalhe.tipo_credito]}` : ''"
      :subtitulo="subtituloDetalhe"
      :resumo="resumoDetalhe"
      :nota="NOTA_DETALHE"
      @close="detalhe = null"
    />

    <BaseModal
      :show="!!alvo"
      :title="alvo ? `Editar preço: ${LABEL_CREDITO[alvo.tipo_credito]}` : ''"
      max-width="max-w-2xl"
      @close="fechar"
    >
      <form v-if="alvo" class="space-y-4" @submit.prevent="salvar">
        <div class="grid grid-cols-1 gap-3" :class="campos.length > 1 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'">
          <div v-for="(c, i) in campos" :key="c.id">
            <label :for="c.id" class="block mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">{{ c.rotulo }}</label>
            <AppCurrencyInput :id="c.id" v-model="valores[i]" :class="[campoValor, faixaMudou(i) ? campoAlterado : campoNormal]" />
            <p class="mt-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">Hoje: {{ fmtBRL(c.atual) }}</p>
          </div>
          <div>
            <label for="preco-revenda" class="block mb-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">Revenda sugerida</label>
            <AppCurrencyInput id="preco-revenda" v-model="revenda" :class="[campoValor, revendaMudou ? campoAlterado : campoNormal]" />
            <p class="mt-1 text-[11px] tabular-nums text-slate-500 dark:text-slate-400">Hoje: {{ fmtBRL(alvo.revenda) }}</p>
          </div>
        </div>

        <div class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5">
          <div class="flex items-center justify-between gap-3 px-4 py-2.5">
            <span class="text-[13px] text-slate-500 dark:text-slate-400">O parceiro ganha hoje</span>
            <span class="text-sm font-medium tabular-nums text-slate-800 dark:text-white">{{ ganhoDe(alvo) }}</span>
          </div>
          <div class="flex items-center justify-between gap-3 px-4 py-2.5">
            <span class="text-[13px] text-slate-500 dark:text-slate-400">Com o preço novo</span>
            <span class="text-sm font-medium tabular-nums text-emerald-700 dark:text-emerald-400">{{ ganhoNovo }}</span>
          </div>
        </div>

        <p v-if="erroForm" role="alert" class="text-[13px] text-red-700 dark:text-red-400">{{ erroForm }}</p>

        <div class="flex items-start gap-2.5 p-3 rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
          <i class="fa-solid fa-triangle-exclamation mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
          <p class="text-[13px] leading-snug text-amber-800 dark:text-amber-300">
            Os parceiros veem o preço novo na hora, em Créditos e ao solicitar. Quem já pediu pelo WhatsApp pode ter recebido o valor antigo: confira o pedido ao lançar.
          </p>
        </div>

        <div class="flex gap-2 pt-1">
          <button
            type="button"
            @click="fechar"
            :disabled="salvando"
            class="flex-1 px-4 py-2.5 rounded font-medium text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >Cancelar</button>
          <button
            type="submit"
            :disabled="salvando || !mudou || !!erroForm"
            class="flex-1 px-4 py-2.5 rounded font-medium text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors"
          >{{ salvando ? 'Salvando…' : 'Salvar preços' }}</button>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
