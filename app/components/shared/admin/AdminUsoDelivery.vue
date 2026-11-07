<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import type { UsoDelivery } from '~/composables/useParceiroLicencas'

/**
 * Pedidos por mês de cada cliente com Delivery. É aqui que a Agzap vê quem usa
 * crédito de Delivery sem vender pelo módulo, alerta o parceiro e, se preciso,
 * desliga o Delivery do cliente. Quem assinou o plano Delivery direto pelo app
 * também aparece: a troca dele para o Start é feita à mão pela equipe.
 */
interface LinhaUso {
  empresa_id: string
  empresa_nome: string
  parceiro_id: string | null
  parceiro_nome: string
  direto?: boolean
  modulo_ativo: boolean
  pedidos_mes_atual: number
  pedidos_mes_anterior: number
  pedidos_dois_meses_atras: number
  clientes_diferentes: number
  primeiro_pedido: string | null
  uso: UsoDelivery
  alertas: { total: number; ultimo_em: string | null; ultimo_lido_em: string | null }
}

type Grupo = 'em_uso' | 'comecando' | 'sem_uso'
type Filtro = 'todos' | Grupo

const emit = defineEmits<{ 'count-change': [total: number] }>()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

const linhas = ref<LinhaUso[]>([])
const loading = ref(true)
const erro = ref<string | null>(null)
const filtro = ref<Filtro>('todos')

async function carregar() {
  erro.value = null
  try {
    const resp = await $fetch<{ success: boolean; data?: { clientes: LinhaUso[] }; error?: string }>(
      '/api/admin/parceiros/uso-delivery',
      { headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    linhas.value = resp.data.clientes
    emit('count-change', linhas.value.length)
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Erro ao carregar o uso do Delivery'
  } finally {
    loading.value = false
  }
}

onMounted(async () => {
  toast = await useToastSafe()
  await carregar()
})

defineExpose({ carregar })

const semPedidosEmDoisMeses = (l: LinhaUso) => l.uso.pedidos_30d + l.uso.pedidos_30_60d === 0

/** Mesma classificação nos filtros, na coluna Situação e nas ações. */
function situacaoDe(l: LinhaUso): { grupo: Grupo; rotulo: string } {
  const u = l.uso
  if (u.movimento_30d) return { grupo: 'em_uso', rotulo: 'Em uso' }
  if (u.situacao === 'livre') return { grupo: 'comecando', rotulo: 'Começando' }
  if (!semPedidosEmDoisMeses(l) && l.clientes_diferentes <= 1) return { grupo: 'sem_uso', rotulo: 'Suspeito: mesmo cliente' }
  if (u.situacao === 'bloqueado') {
    return { grupo: 'sem_uso', rotulo: semPedidosEmDoisMeses(l) ? '2 meses sem pedidos' : '2 meses sem movimento' }
  }
  return { grupo: 'sem_uso', rotulo: u.pedidos_30d === 0 ? '1 mês sem pedidos' : 'Pouco movimento' }
}

const CLASSE_GRUPO: Record<Grupo, string> = {
  em_uso: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400',
  comecando: 'bg-sky-100 dark:bg-sky-500/15 text-sky-700 dark:text-sky-400',
  sem_uso: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400',
}

const contagem = computed(() => {
  const c = { todos: linhas.value.length, em_uso: 0, comecando: 0, sem_uso: 0 }
  for (const l of linhas.value) c[situacaoDe(l).grupo] += 1
  return c
})

const filtros = computed<{ id: Filtro; rotulo: string }[]>(() => [
  { id: 'todos', rotulo: 'Todos' },
  { id: 'em_uso', rotulo: 'Em uso' },
  { id: 'comecando', rotulo: 'Começando' },
  { id: 'sem_uso', rotulo: 'Sem uso ou suspeito' },
])

const visiveis = computed(() => {
  const lista = filtro.value === 'todos'
    ? [...linhas.value]
    : linhas.value.filter(l => situacaoDe(l).grupo === filtro.value)
  // Quem precisa de atenção primeiro.
  const peso: Record<Grupo, number> = { sem_uso: 0, comecando: 1, em_uso: 2 }
  return lista.sort((a, b) => peso[situacaoDe(a).grupo] - peso[situacaoDe(b).grupo])
})

const alertasDoPainel = computed(() => linhas.value
  .filter(l => l.uso.situacao === 'bloqueado' && semPedidosEmDoisMeses(l))
  .map(l => l.direto
    ? `${l.empresa_nome} assinou o plano Delivery e está há 2 meses sem pedidos.`
    : `${l.empresa_nome} está há 2 meses sem pedidos e foi renovada ${l.uso.renovacoes_delivery} vezes com crédito de Delivery por ${l.parceiro_nome}.`))

// ───────── Meses da tabela ─────────
const FUSO = 'America/Sao_Paulo'
function inicioDoMes(mesesAtras: number) {
  const hoje = new Date()
  return new Date(hoje.getFullYear(), hoje.getMonth() - mesesAtras, 1)
}
const rotuloMes = (mesesAtras: number) =>
  inicioDoMes(mesesAtras).toLocaleDateString('pt-BR', { month: 'short', timeZone: FUSO }).replace('.', '')

/** Traço para o mês antes de o cliente começar: zero ali sugeriria que ele já usava. */
function celulaMes(l: LinhaUso, mesesAtras: number, valor: number) {
  if (valor > 0 || mesesAtras === 0) return valor.toLocaleString('pt-BR')
  const datas = [l.uso.primeira_renovacao, l.primeiro_pedido].filter(Boolean).map(d => new Date(d as string).getTime())
  if (!datas.length) return '—'
  const fimDoMes = inicioDoMes(mesesAtras - 1).getTime()
  return Math.min(...datas) >= fimDoMes ? '—' : '0'
}

function fmtData(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', timeZone: FUSO })
}
function fmtDiaMes(s: string) {
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', timeZone: FUSO })
}
function ultimoPedido(l: LinhaUso) {
  if (!l.uso.ultimo_pedido) return 'Nunca'
  const dia = (d: Date) => d.toLocaleDateString('pt-BR', { timeZone: FUSO })
  return dia(new Date(l.uso.ultimo_pedido)) === dia(new Date()) ? 'Hoje' : fmtData(l.uso.ultimo_pedido)
}
function textoAlertas(l: LinhaUso) {
  if (!l.alertas.total) return situacaoDe(l).grupo === 'sem_uso' ? 'Nenhum' : '—'
  return `${l.alertas.total}º enviado ${fmtDiaMes(l.alertas.ultimo_em as string)}, ${l.alertas.ultimo_lido_em ? 'lido' : 'não lido'}`
}

// ───────── Enviar alerta ─────────
const alvoAlerta = ref<LinhaUso | null>(null)
const mensagem = ref('')
const enviando = ref(false)

function mensagemPadrao(l: LinhaUso) {
  const pedidos = l.uso.pedidos_30d + l.uso.pedidos_30_60d
  const motivo = pedidos === 0
    ? (l.uso.situacao === 'bloqueado' ? 'não teve pedidos nos últimos 2 meses' : 'não teve pedidos nos últimos 30 dias')
    : `teve só ${pedidos} ${pedidos === 1 ? 'pedido' : 'pedidos'} de ${l.clientes_diferentes} ${l.clientes_diferentes === 1 ? 'cliente' : 'clientes'} nos últimos 2 meses`
  return `Identificamos uma anomalia nas renovações da ${l.empresa_nome}: ela foi renovada com crédito de Delivery e ${motivo}.\n\n`
    + 'Verifique por que esse crédito está sendo usado nesse cliente e fale com o suporte da Agzap. Se o uso indevido continuar, sua conta pode ser banida, conforme o Termo do Parceiro.'
}

function abrirAlerta(l: LinhaUso) {
  alvoAlerta.value = l
  mensagem.value = mensagemPadrao(l)
}

async function enviarAlerta() {
  if (!alvoAlerta.value || enviando.value || mensagem.value.trim().length < 10) return
  enviando.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/parceiros/alerta', {
      method: 'POST',
      body: { empresaId: alvoAlerta.value.empresa_id, mensagem: mensagem.value },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error)
    toast?.success('Alerta enviado ao parceiro')
    alvoAlerta.value = null
    await carregar()
  } catch (e: any) {
    toast?.error(e?.data?.statusMessage || e?.message || 'Erro ao enviar o alerta')
  } finally {
    enviando.value = false
  }
}

// ───────── Desligar Delivery ─────────
const alvoDesligar = ref<LinhaUso | null>(null)
const desligando = ref(false)

async function desligar() {
  if (!alvoDesligar.value || desligando.value) return
  desligando.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/parceiros/delivery-desligar', {
      method: 'POST',
      body: { empresaId: alvoDesligar.value.empresa_id },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error)
    toast?.success('Delivery desligado')
    alvoDesligar.value = null
    await carregar()
  } catch (e: any) {
    toast?.error(e?.data?.statusMessage || e?.message || 'Erro ao desligar o Delivery')
  } finally {
    desligando.value = false
  }
}

const th = 'px-3 py-2.5 text-left text-[11px] font-medium leading-tight text-slate-500 dark:text-slate-400 uppercase tracking-wider'
const td = 'px-3 py-3 text-sm text-slate-700 dark:text-slate-300 whitespace-nowrap'
// A tabela pode passar da largura em notebook: Ações fica presa à direita.
const colAcoes = 'lg:sticky lg:right-0 lg:bg-white lg:dark:bg-slate-900'
const linhaResumo = 'flex items-center justify-between gap-3 px-4 py-2.5'
</script>

<template>
  <div class="space-y-4">
    <div>
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white">Uso do Delivery</h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">Pedidos por mês de cada cliente com Delivery, de parceiro ou de assinatura direta</p>
    </div>

    <div class="flex flex-wrap gap-2">
      <button
        v-for="f in filtros"
        :key="f.id"
        type="button"
        @click="filtro = f.id"
        class="px-3 py-1.5 rounded-full border text-xs font-medium transition-colors"
        :class="filtro === f.id
          ? 'border-purple-400 bg-purple-50 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300'
          : 'border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-white/20'"
      >
        {{ f.rotulo }} · <span class="tabular-nums">{{ contagem[f.id] }}</span>
      </button>
    </div>

    <div
      v-for="texto in alertasDoPainel"
      :key="texto"
      role="alert"
      class="px-4 py-3 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 flex items-start gap-2.5 text-sm text-red-800 dark:text-red-300"
    >
      <i class="fa-solid fa-triangle-exclamation mt-0.5 shrink-0" aria-hidden="true" />
      <span>{{ texto }}</span>
    </div>

    <div v-if="erro" role="alert" class="px-4 py-3 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-sm text-red-700 dark:text-red-400">
      {{ erro }}
    </div>

    <div class="rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none overflow-hidden">
      <div v-if="loading" class="p-5 space-y-3">
        <div v-for="i in 4" :key="i" class="h-9 rounded bg-slate-100 dark:bg-white/5 animate-pulse" />
      </div>

      <p v-else-if="!visiveis.length" class="px-5 py-12 text-center text-sm text-slate-500 dark:text-slate-400">
        {{ linhas.length ? 'Nenhum cliente neste filtro' : 'Nenhum cliente com Delivery' }}
      </p>

      <div v-else class="overflow-x-auto">
        <table class="w-full">
          <thead>
            <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-white/[0.02]">
              <th :class="th">Cliente</th>
              <th :class="th">Origem</th>
              <th :class="[th, 'text-right']">Pedidos {{ rotuloMes(0) }}</th>
              <th :class="[th, 'text-right']">Pedidos {{ rotuloMes(1) }}</th>
              <th :class="[th, 'text-right']">Pedidos {{ rotuloMes(2) }}</th>
              <th :class="[th, 'text-right']">Clientes diferentes</th>
              <th :class="th">Último pedido</th>
              <th :class="th">Situação</th>
              <th :class="th">Alertas</th>
              <th :class="[th, 'text-right lg:sticky lg:right-0 lg:bg-slate-50 lg:dark:bg-slate-900']">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
            <tr v-for="l in visiveis" :key="l.empresa_id">
              <td :class="[td, 'font-medium text-slate-900 dark:text-white']">
                {{ l.empresa_nome }}
                <span v-if="!l.modulo_ativo" class="block text-[11px] font-normal text-slate-500 dark:text-slate-400">Delivery removido</span>
              </td>
              <td :class="td">{{ l.parceiro_nome }}</td>
              <td :class="[td, 'text-right tabular-nums']">{{ celulaMes(l, 0, l.pedidos_mes_atual) }}</td>
              <td :class="[td, 'text-right tabular-nums']">{{ celulaMes(l, 1, l.pedidos_mes_anterior) }}</td>
              <td :class="[td, 'text-right tabular-nums']">{{ celulaMes(l, 2, l.pedidos_dois_meses_atras) }}</td>
              <td :class="[td, 'text-right tabular-nums']">{{ l.clientes_diferentes.toLocaleString('pt-BR') }}</td>
              <td :class="[td, 'tabular-nums']">{{ ultimoPedido(l) }}</td>
              <td :class="td">
                <span class="inline-flex px-2 py-0.5 rounded-full text-xs font-medium" :class="CLASSE_GRUPO[situacaoDe(l).grupo]">
                  {{ situacaoDe(l).rotulo }}
                </span>
              </td>
              <td :class="[td, 'text-xs !whitespace-normal min-w-[6.5rem]']">{{ textoAlertas(l) }}</td>
              <td :class="[td, 'text-right', colAcoes]">
                <span v-if="l.direto && situacaoDe(l).grupo === 'sem_uso'" class="text-xs text-slate-500 dark:text-slate-400">Avisar e trocar para Start</span>
                <div v-else-if="situacaoDe(l).grupo === 'sem_uso'" class="flex justify-end gap-1.5">
                  <button
                    type="button"
                    @click="abrirAlerta(l)"
                    class="px-2.5 py-1 rounded border text-xs font-medium border-orange-300 dark:border-orange-500/40 bg-orange-50 dark:bg-orange-500/10 text-orange-700 dark:text-orange-400 hover:bg-orange-100 dark:hover:bg-orange-500/20 transition-colors"
                  >Enviar alerta</button>
                  <button
                    v-if="l.modulo_ativo"
                    type="button"
                    @click="alvoDesligar = l"
                    class="px-2.5 py-1 rounded border text-xs font-medium border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                  >Desligar Delivery</button>
                </div>
                <span v-else class="text-slate-400">—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Enviar alerta -->
    <BaseModal :show="!!alvoAlerta" title="Enviar alerta ao parceiro" max-width="max-w-2xl" @close="alvoAlerta = null">
      <div v-if="alvoAlerta" class="space-y-4">
        <div class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5">
          <div :class="linhaResumo">
            <span class="text-xs text-slate-500 dark:text-slate-400">Parceiro</span>
            <span class="text-sm font-medium text-slate-800 dark:text-white">{{ alvoAlerta.parceiro_nome }}</span>
          </div>
          <div :class="linhaResumo">
            <span class="text-xs text-slate-500 dark:text-slate-400">Cliente</span>
            <span class="text-sm font-medium text-slate-800 dark:text-white">{{ alvoAlerta.empresa_nome }}</span>
          </div>
          <div :class="linhaResumo">
            <span class="text-xs text-slate-500 dark:text-slate-400">Pedidos em 2 meses</span>
            <span class="text-sm font-medium text-slate-800 dark:text-white tabular-nums">{{ alvoAlerta.uso.pedidos_30d + alvoAlerta.uso.pedidos_30_60d }}</span>
          </div>
          <div :class="linhaResumo">
            <span class="text-xs text-slate-500 dark:text-slate-400">Renovações com crédito de Delivery</span>
            <span class="text-sm font-medium text-slate-800 dark:text-white tabular-nums">{{ alvoAlerta.uso.renovacoes_delivery }}</span>
          </div>
          <div :class="linhaResumo">
            <span class="text-xs text-slate-500 dark:text-slate-400">Alertas já enviados</span>
            <span class="text-sm font-medium text-slate-800 dark:text-white tabular-nums">{{ alvoAlerta.alertas.total }}</span>
          </div>
        </div>

        <div>
          <label for="uso-alerta-mensagem" class="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1.5">Mensagem para o parceiro</label>
          <textarea
            id="uso-alerta-mensagem"
            v-model="mensagem"
            rows="7"
            maxlength="2000"
            class="w-full px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded-xl text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500/40 focus:border-purple-500 resize-none"
          />
          <p class="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
            Você pode editar o texto antes de enviar. O alerta fica registrado com data, autor e confirmação de leitura.
          </p>
        </div>

        <div class="flex gap-2">
          <button
            type="button"
            @click="alvoAlerta = null"
            :disabled="enviando"
            class="flex-1 px-4 py-2.5 rounded font-medium text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >Cancelar</button>
          <button
            type="button"
            @click="enviarAlerta"
            :disabled="enviando || mensagem.trim().length < 10"
            class="flex-1 px-4 py-2.5 rounded font-medium text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors"
          >{{ enviando ? 'Enviando…' : 'Enviar alerta' }}</button>
        </div>
      </div>
    </BaseModal>

    <!-- Desligar Delivery -->
    <BaseModal :show="!!alvoDesligar" title="Desligar Delivery" max-width="max-w-2xl" @close="alvoDesligar = null">
      <div v-if="alvoDesligar" class="space-y-4">
        <p class="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          O cardápio online de <strong class="font-medium text-slate-900 dark:text-white">{{ alvoDesligar.empresa_nome }}</strong> sai do ar na hora,
          e o cliente deixa de receber pedidos pelo site e pela IA.
        </p>
        <p class="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Cardápio e pedidos ficam guardados. O crédito não volta e o vencimento não muda. O parceiro {{ alvoDesligar.parceiro_nome }} pode liberar o módulo de novo.
        </p>
        <div class="flex gap-2">
          <button
            type="button"
            @click="alvoDesligar = null"
            :disabled="desligando"
            class="flex-1 px-4 py-2.5 rounded font-medium text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
          >Cancelar</button>
          <button
            type="button"
            @click="desligar"
            :disabled="desligando"
            class="flex-1 px-4 py-2.5 rounded font-medium text-sm bg-red-700 hover:bg-red-800 disabled:opacity-50 text-white transition-colors"
          >{{ desligando ? 'Desligando…' : 'Desligar Delivery' }}</button>
        </div>
      </div>
    </BaseModal>
  </div>
</template>
