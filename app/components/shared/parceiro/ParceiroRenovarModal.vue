<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { LABEL_CREDITO, ehCreditoDelivery, fmtPedidos, linkSuporteAgzap, rotuloDelivery } from '~/composables/useParceiroLicencas'
import type { ClienteCarteira, SaldosCredito, TipoCredito } from '~/composables/useParceiroLicencas'

const props = defineProps<{
  show: boolean
  cliente: ClienteCarteira | null
  saldos: SaldosCredito
}>()

const emit = defineEmits<{ close: []; confirmed: [] }>()

const { renovar, novaIdempotencyKey, registrarTentativaDelivery } = useParceiroLicencas()
let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null
onMounted(async () => { toast = await useToastSafe() })

const tipo = ref<TipoCredito>('mensal_30d')
const salvando = ref(false)
const erro = ref<string | null>(null)
/**
 * Uma chave por tentativa: reenviar depois de uma falha de rede reaproveita a
 * mesma chave e o banco recusa o segundo consumo. Fechar e reabrir gera outra.
 */
const idempotencyKey = ref('')

const OPCOES: { valor: TipoCredito; icone: string }[] = [
  { valor: 'mensal_30d', icone: 'fa-calendar-day' },
  { valor: 'anual_12m', icone: 'fa-calendar-days' },
  { valor: 'delivery_ate500_30d', icone: 'fa-motorcycle' },
  { valor: 'delivery_acima500_30d', icone: 'fa-motorcycle' },
]

const COTA_DO_CREDITO: Partial<Record<TipoCredito, number>> = {
  delivery_ate500_30d: 500,
  delivery_acima500_30d: 5000,
}

const temDelivery = computed(() => props.cliente?.delivery_ativo === true)
const cotaAtual = computed(() => props.cliente?.cota_pedidos ?? 0)
const limiteAtual = computed(() => props.cliente?.limite_pedidos ?? 0)
const pedidosNoCiclo = computed(() => props.cliente?.pedidos_ciclo ?? null)
const uso = computed(() => props.cliente?.uso_delivery ?? null)
const semPedidosEmDoisMeses = computed(() => (uso.value?.pedidos_30d ?? 0) + (uso.value?.pedidos_30_60d ?? 0) === 0)
const linkSuporte = computed(() =>
  linkSuporteAgzap(`Olá! Sou parceiro da Agzap e preciso de ajuda com o Delivery do cliente ${props.cliente?.empresa_nome ?? ''}.`))

/** Mesmas regras da função do banco, que confere de novo ao confirmar. */
function motivoBloqueio(t: TipoCredito): 'sem_modulo' | 'sem_uso' | 'passou_500' | null {
  if (!ehCreditoDelivery(t)) return null
  if (!temDelivery.value) return 'sem_modulo'
  if (uso.value?.situacao === 'bloqueado') return 'sem_uso'
  // Pedido extra pago não conta como passar de 500.
  if (t === 'delivery_ate500_30d' && (pedidosNoCiclo.value ?? 0) > 500 + (props.cliente?.extras_total ?? 0)) return 'passou_500'
  return null
}

const bloqueio = computed(() => motivoBloqueio(tipo.value))

/** Renova, mas o parceiro precisa ler e confirmar. Só vale para crédito de Delivery. */
const avisoUso = computed(() => ehCreditoDelivery(tipo.value) && !bloqueio.value && uso.value?.situacao === 'aviso')
const confirmouAviso = ref(false)
watch(tipo, () => { confirmouAviso.value = false })

function escolher(t: TipoCredito) {
  tipo.value = t
  if (motivoBloqueio(t) === 'sem_modulo' && props.cliente) {
    registrarTentativaDelivery(props.cliente.empresa_id, t)
  }
}

/** Crédito normal mantém a cota; o de Delivery define. */
const cotaDepois = computed(() => COTA_DO_CREDITO[tipo.value] ?? cotaAtual.value)

const avisoCota = computed(() => {
  if (!ehCreditoDelivery(tipo.value) || !temDelivery.value) return null
  if (cotaAtual.value === 0) {
    return `Este cliente está sem limite de pedidos. Ao confirmar, a cota passa a ser de ${fmtPedidos(cotaDepois.value)} pedidos por mês.`
  }
  if (tipo.value === 'delivery_acima500_30d' && cotaAtual.value <= 500) {
    return 'Ao confirmar, a cota deste cliente sobe para 5.000 pedidos por mês. O crédito Delivery até 500 é mais barato e mantém a cota em 500.'
  }
  if (tipo.value === 'delivery_ate500_30d' && cotaAtual.value > 500) {
    const feitos = pedidosNoCiclo.value === null ? '' : ` Neste ciclo ele fez ${fmtPedidos(pedidosNoCiclo.value)} pedidos.`
    return `A cota deste cliente vai baixar de ${fmtPedidos(cotaAtual.value)} para 500 pedidos por mês.${feitos}`
  }
  return null
})

/** Cliente com Delivery abre no crédito da faixa dele, quando tem saldo. */
function tipoInicial(): TipoCredito {
  if (temDelivery.value) {
    const daFaixa: TipoCredito = cotaAtual.value > 500 ? 'delivery_acima500_30d' : 'delivery_ate500_30d'
    if (props.saldos[daFaixa] > 0 && !motivoBloqueio(daFaixa)) return daFaixa
  }
  // Abre já no tipo que ele tem saldo, quando só um dos dois tem.
  return props.saldos.mensal_30d < 1 && props.saldos.anual_12m > 0 ? 'anual_12m' : 'mensal_30d'
}

watch(() => props.show, (aberto) => {
  if (!aberto) return
  erro.value = null
  salvando.value = false
  confirmouAviso.value = false
  idempotencyKey.value = novaIdempotencyKey()
  tipo.value = tipoInicial()
})

const saldoAtual = computed(() => props.saldos[tipo.value] ?? 0)
const saldoDepois = computed(() => Math.max(0, saldoAtual.value - 1))
const temSaldo = computed(() => saldoAtual.value >= 1)
const podeConfirmar = computed(() =>
  !salvando.value && temSaldo.value && !bloqueio.value && (!avisoUso.value || confirmouAviso.value))

/** Só previsão visual — a data que vale é a que o servidor devolve. */
const novaValidadeEstimada = computed(() => {
  const agora = new Date()
  const atual = props.cliente?.vencimento ? new Date(props.cliente.vencimento) : agora
  const base = atual > agora ? new Date(atual) : agora
  if (tipo.value === 'anual_12m') base.setMonth(base.getMonth() + 12)
  else base.setDate(base.getDate() + 30)
  return base
})

function fmtData(d: Date | string | null) {
  if (!d) return '—'
  return new Date(d).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

async function confirmar() {
  if (!props.cliente || !podeConfirmar.value) return
  salvando.value = true
  erro.value = null
  try {
    const r = await renovar(props.cliente.empresa_id, tipo.value, idempotencyKey.value, confirmouAviso.value)
    toast?.success(`Renovado até ${fmtData(r.vencimento_novo)}`)
    emit('confirmed')
    emit('close')
  } catch (e: any) {
    erro.value = String(e?.message || 'Não foi possível renovar')
  } finally {
    salvando.value = false
  }
}
</script>

<template>
  <BaseModal :show="show" title="Renovar cliente" max-width="max-w-2xl" @close="emit('close')">
    <div v-if="cliente" class="space-y-4">

      <!-- Cliente -->
      <div class="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
          <span class="text-white font-bold text-sm">{{ cliente.empresa_nome.charAt(0).toUpperCase() }}</span>
        </div>
        <div class="min-w-0">
          <p class="flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-0">
            <span class="font-semibold text-slate-900 dark:text-white truncate">{{ cliente.empresa_nome }}</span>
            <span
              v-if="temDelivery"
              class="inline-flex items-center gap-1 px-1.5 py-px rounded-full text-[11px] font-semibold whitespace-nowrap bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400"
            >
              <i class="fa-solid fa-motorcycle text-[9px]" aria-hidden="true" />
              {{ rotuloDelivery(cotaAtual) }}
            </span>
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400">
            Vence hoje em {{ fmtData(cliente.vencimento) }}
            <template v-if="temDelivery && uso?.situacao === 'bloqueado'">
              · {{ semPedidosEmDoisMeses ? 'sem pedidos' : 'sem movimento' }} há 2 meses
            </template>
            <template v-else-if="temDelivery && uso?.situacao === 'aviso'">
              · {{ fmtPedidos(uso.pedidos_30d) }} pedidos nos últimos 30 dias
            </template>
            <template v-else-if="temDelivery && pedidosNoCiclo !== null">
              · {{ fmtPedidos(pedidosNoCiclo) }}<template v-if="limiteAtual > 0"> de {{ fmtPedidos(limiteAtual) }}</template> pedidos neste ciclo
            </template>
          </p>
        </div>
      </div>

      <!-- Tipo de crédito -->
      <div>
        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
          Crédito a consumir
        </p>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button
            v-for="opcao in OPCOES"
            :key="opcao.valor"
            type="button"
            @click="escolher(opcao.valor)"
            class="px-3 py-2.5 rounded-md border text-left transition-colors"
            :class="tipo !== opcao.valor
              ? 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
              : motivoBloqueio(opcao.valor)
                ? 'border-red-400 bg-red-50 dark:bg-red-500/10'
                : 'border-purple-500 bg-purple-50 dark:bg-purple-500/10'"
          >
            <span class="flex items-start gap-2">
              <i :class="['fa-solid', opcao.icone, 'text-xs mt-1', tipo !== opcao.valor ? 'text-slate-400' : motivoBloqueio(opcao.valor) ? 'text-red-500' : 'text-purple-600 dark:text-purple-400']" aria-hidden="true" />
              <span class="text-sm font-semibold leading-snug text-slate-800 dark:text-white">{{ LABEL_CREDITO[opcao.valor] }}</span>
            </span>
            <span v-if="motivoBloqueio(opcao.valor)" class="block text-[11px] mt-0.5 text-red-600 dark:text-red-400">Não serve aqui</span>
            <span v-else class="block text-[11px] mt-0.5" :class="saldos[opcao.valor] > 0 ? 'text-slate-500 dark:text-slate-400' : 'text-red-500 dark:text-red-400'">
              {{ saldos[opcao.valor] }} disponíve{{ saldos[opcao.valor] === 1 ? 'l' : 'is' }}
            </span>
          </button>
        </div>
      </div>

      <!-- Crédito que não serve para este cliente: nada é consumido -->
      <div v-if="bloqueio" class="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 space-y-1.5">
        <template v-if="bloqueio === 'sem_modulo'">
          <p class="text-sm font-semibold text-red-800 dark:text-red-300">Esta empresa não pode ser renovada com crédito de Delivery</p>
          <p class="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            O crédito de Delivery só renova empresas com o módulo Delivery ativo, e a {{ cliente.empresa_nome }} não tem esse módulo.
          </p>
          <p class="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            Nenhum crédito foi consumido. Para renovar, escolha um crédito de 30 dias ou de 12 meses.
          </p>
        </template>
        <template v-else-if="bloqueio === 'sem_uso'">
          <p class="text-sm font-semibold text-red-800 dark:text-red-300">Crédito de Delivery bloqueado para este cliente</p>
          <p class="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            A {{ cliente.empresa_nome }} está há 2 meses {{ semPedidosEmDoisMeses ? 'sem pedidos' : 'sem movimento' }} no Delivery.
            Usar crédito de Delivery em empresa que não usa o módulo é proibido pelo Termo do Parceiro e pode gerar penalidades.
          </p>
          <p class="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            Nenhum crédito foi consumido. Para renovar, escolha um crédito de 30 dias ou de 12 meses. Se houve engano, fale com o suporte.
          </p>
          <a :href="linkSuporte" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-xs font-semibold text-red-800 dark:text-red-300 underline underline-offset-2">
            <i class="fa-brands fa-whatsapp" aria-hidden="true" />
            Falar com o suporte
          </a>
        </template>
        <template v-else>
          <p class="text-sm font-semibold text-red-800 dark:text-red-300">Este cliente passou de 500 pedidos neste ciclo</p>
          <p class="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            A {{ cliente.empresa_nome }} fez {{ fmtPedidos(pedidosNoCiclo ?? 0) }} pedidos. Com o crédito Delivery até 500, a cota cairia para 500 e a loja pararia de receber pedidos.
          </p>
          <p class="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            Nenhum crédito foi consumido. Para renovar, escolha o crédito Delivery acima de 500, de 30 dias ou de 12 meses.
          </p>
        </template>
      </div>

      <!-- O que muda na cota: só quando muda -->
      <div
        v-else-if="avisoCota"
        class="rounded-md bg-sky-50 dark:bg-sky-500/10 border border-sky-200 dark:border-sky-500/20 p-3 flex items-start gap-2.5"
      >
        <i class="fa-solid fa-circle-info text-sky-600 dark:text-sky-400 text-sm mt-0.5" aria-hidden="true" />
        <p class="text-xs text-sky-900 dark:text-sky-300 leading-relaxed">{{ avisoCota }}</p>
      </div>

      <!-- Sem movimento no último mês: renova, com aviso e confirmação -->
      <template v-if="avisoUso && uso">
        <div class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 space-y-1">
          <template v-if="uso.pedidos_30d === 0">
            <p class="text-sm font-semibold text-amber-900 dark:text-amber-300">Este cliente não teve pedidos nos últimos 30 dias</p>
            <p class="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              Se continuar sem pedidos no próximo mês, o crédito de Delivery será bloqueado para este cliente.
            </p>
          </template>
          <template v-else>
            <p class="text-sm font-semibold text-amber-900 dark:text-amber-300">Este cliente teve pouco movimento nos últimos 30 dias</p>
            <p class="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
              Foram {{ fmtPedidos(uso.pedidos_30d) }} pedidos de {{ fmtPedidos(uso.clientes_30d) }} {{ uso.clientes_30d === 1 ? 'cliente' : 'clientes' }}.
              Se continuar assim no próximo mês, o crédito de Delivery será bloqueado para este cliente.
            </p>
          </template>
        </div>

        <div class="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 space-y-1.5">
          <p class="text-sm font-semibold text-red-800 dark:text-red-300">Evite a suspensão da sua conta</p>
          <p class="text-xs text-red-800 dark:text-red-300 leading-relaxed">
            Se você renovar por mais 30 dias, a Agzap vai verificar se esta empresa é mesmo de delivery. Constatado que não é,
            você pode ser penalizado conforme o Termo do Parceiro, inclusive com o banimento da sua conta.
          </p>
          <a :href="linkSuporte" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 text-xs font-semibold text-red-800 dark:text-red-300 underline underline-offset-2">
            <i class="fa-brands fa-whatsapp" aria-hidden="true" />
            Falar com o suporte
          </a>
        </div>
      </template>

      <!-- Resumo com crédito bloqueado: deixa claro que nada mudou -->
      <div v-if="bloqueio" class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5">
        <div class="flex items-center justify-between px-4 py-2.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">Saldo de {{ LABEL_CREDITO[tipo] }}</span>
          <span class="text-sm font-semibold text-slate-800 dark:text-white tabular-nums">{{ saldoAtual }} (não muda)</span>
        </div>
        <div class="flex items-center justify-between px-4 py-2.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">Vencimento do cliente</span>
          <span class="text-sm font-semibold text-slate-800 dark:text-white tabular-nums">{{ fmtData(cliente.vencimento) }} (não muda)</span>
        </div>
      </div>

      <!-- Resumo da operação -->
      <div v-else class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5">
        <div v-if="!avisoUso" class="flex items-center justify-between px-4 py-2.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">Saldo atual</span>
          <span class="text-sm font-semibold text-slate-800 dark:text-white tabular-nums">{{ saldoAtual }}</span>
        </div>
        <div class="flex items-center justify-between px-4 py-2.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">Saldo após confirmar</span>
          <span
            class="text-sm font-semibold tabular-nums"
            :class="temSaldo ? 'text-amber-600 dark:text-amber-400' : 'text-red-500'"
          >{{ temSaldo ? saldoDepois : '—' }}</span>
        </div>
        <div class="flex items-center justify-between px-4 py-2.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">Novo vencimento (estimado)</span>
          <span class="text-sm font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {{ fmtData(novaValidadeEstimada) }}
          </span>
        </div>
        <div v-if="temDelivery && !avisoUso" class="flex items-center justify-between px-4 py-2.5">
          <span class="text-xs text-slate-500 dark:text-slate-400">Pedidos depois de renovar</span>
          <span class="text-sm font-semibold text-slate-800 dark:text-white tabular-nums">
            {{ cotaDepois > 0 ? `0 de ${fmtPedidos(cotaDepois + (cliente.extras_pedidos ?? 0))}` : 'Sem limite' }}
          </span>
        </div>
      </div>

      <!-- Sem saldo -->
      <div
        v-if="!temSaldo && !bloqueio"
        class="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 p-3 flex items-start gap-2.5"
      >
        <i class="fa-solid fa-circle-exclamation text-red-500 text-sm mt-0.5" aria-hidden="true" />
        <p class="text-xs text-red-700 dark:text-red-300 leading-relaxed">
          Você não tem crédito de <strong>{{ LABEL_CREDITO[tipo] }}</strong> disponível.
          Solicite novos créditos à Agzap na página <strong>Créditos</strong>.
        </p>
      </div>

      <!-- Aviso obrigatório de irreversibilidade -->
      <div
        v-else-if="!bloqueio"
        class="rounded-md bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 p-3 flex items-start gap-2.5"
      >
        <i class="fa-solid fa-triangle-exclamation text-amber-600 dark:text-amber-400 text-sm mt-0.5" aria-hidden="true" />
        <p class="text-xs text-amber-800 dark:text-amber-300 leading-relaxed">
          Após a confirmação, o crédito será consumido definitivamente e não retornará ao saldo
          em caso de cancelamento, bloqueio, estorno ou inadimplência do cliente final.
        </p>
      </div>

      <label v-if="avisoUso" class="flex items-start gap-2.5 text-xs text-slate-700 dark:text-slate-300 leading-relaxed cursor-pointer">
        <input v-model="confirmouAviso" type="checkbox" class="mt-0.5 w-4 h-4 shrink-0 rounded border-slate-300 text-purple-600 focus:ring-purple-500" />
        <span>Li os avisos e confirmo que este cliente vende pelo Delivery.</span>
      </label>

      <p v-if="erro" class="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
        <i class="fa-solid fa-circle-exclamation text-[10px]" aria-hidden="true" />
        {{ erro }}
      </p>

      <div class="flex gap-2 pt-1">
        <button
          type="button"
          @click="emit('close')"
          :disabled="salvando"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="button"
          @click="confirmar"
          :disabled="!podeConfirmar"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
        >
          <i :class="['fa-solid', salvando ? 'fa-circle-notch fa-spin' : 'fa-circle-check', 'text-xs']" aria-hidden="true" />
          {{ salvando ? 'Renovando…' : 'Confirmar e consumir' }}
        </button>
      </div>
    </div>
  </BaseModal>
</template>
