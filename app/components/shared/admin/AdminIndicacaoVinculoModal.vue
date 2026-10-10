<script setup lang="ts">
import { ref, watch, computed } from 'vue'

// Aberto pelo badge "Indicação de …": mostra quem indicou o cliente, o que a
// indicação já gerou pra indicadora, permite registrar CHARGEBACK de um
// pagamento (o ganho dele fica retido mesmo já liberado) e REMOVER a
// indicação (ex.: quem indicou cancelou a assinatura e foi embora).
const props = defineProps<{ show: boolean; clienteId: string | null; clienteNome: string }>()
const emit = defineEmits<{ close: []; removida: [resultado: { mesesCancelados: number; valorCancelado: number; indicadora: string }] }>()

interface Mes {
  id: string; status: string; tipo: string; parcela: number | null; parcelasTotal: number | null
  percentual: number; valorBase: number; valor: number
  liberarEm: string | null; liberadoEm: string | null; utilizadoEm: string | null; motivo: string | null
  referencia: string | null; origem: string | null; criadoEm: string
}
interface Vinculo {
  indicadora: {
    id: string; nome: string; responsavel: string | null; email: string | null; whatsapp: string | null
    status: string | null; plano: string | null; mensalidade: number | null; ativo: boolean | null
  } | null
  resumo: {
    recebido: number; carencia: number; programado: number; mesesProgramados: number
    aCancelarSeRemover: number; mesesACancelar: number; cancelado: number
  } | null
  meses: Mes[]
}

const vinculo = ref<Vinculo | null>(null)
const carregando = ref(false)
const erro = ref('')
const confirmando = ref(false)
const removendo = ref(false)

function brl(v: number | null | undefined) { return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) }
function data(iso: string | null) { return iso ? new Date(iso).toLocaleDateString('pt-BR') : '' }
function whatsappLink(n: string | null) {
  const d = (n || '').replace(/\D/g, '')
  return d ? `https://wa.me/${d.startsWith('55') ? d : `55${d}`}` : null
}

const STATUS_ASSINATURA: Record<string, { texto: string; cls: string }> = {
  active: { texto: 'Assinatura ativa', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  trial: { texto: 'Em teste', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  canceled: { texto: 'Assinatura cancelada', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  expired: { texto: 'Assinatura vencida', cls: 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
}

function rotuloMes(m: Mes) {
  const total = Number(m.parcelasTotal || 1)
  if (total > 1) return `Mês ${m.parcela}/${total}`
  return m.tipo === 'primeira' ? '1ª mensalidade' : 'Mensalidade'
}
function situacao(m: Mes) {
  if (m.status === 'pendente_liberacao') return Number(m.parcela || 1) > 1 ? `Programado · ${data(m.liberarEm)}` : `Em carência · libera ${data(m.liberarEm)}`
  if (m.status === 'liberado') return `Liberado · ${data(m.liberadoEm)}`
  if (m.status === 'utilizado') return `Utilizado · ${data(m.utilizadoEm)}`
  if (m.status === 'creditado') return 'Aplicado na fatura (Stripe)'
  if (m.status === 'cancelado') return `Cancelado${m.motivo ? ` · ${m.motivo}` : ''}`
  if (m.status === 'estornado') return `Estornado${m.motivo ? ` · ${m.motivo}` : ''}`
  return m.status
}

async function carregar() {
  if (!props.clienteId) return
  carregando.value = true
  erro.value = ''
  try {
    vinculo.value = await $fetch<Vinculo>('/api/admin/indicacao-vinculo', { query: { empresaId: props.clienteId }, headers: await useAdminAuthHeaders() })
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.statusMessage || 'Não foi possível carregar a indicação'
  } finally {
    carregando.value = false
  }
}
watch(() => [props.show, props.clienteId], ([s]) => {
  if (s) { confirmando.value = false; chargebackRef.value = null; avisoChargeback.value = ''; vinculo.value = null; void carregar() }
}, { immediate: true })

async function remover() {
  if (!props.clienteId || removendo.value) return
  removendo.value = true
  erro.value = ''
  try {
    const resp = await $fetch<{ success: boolean; data: { mesesCancelados: number; valorCancelado: number } }>('/api/admin/indicacao-remover', {
      method: 'POST', headers: await useAdminAuthHeaders(), body: { empresaId: props.clienteId },
    })
    emit('removida', { ...resp.data, indicadora: quemIndicou() })
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.statusMessage || 'Não foi possível remover a indicação'
  } finally {
    removendo.value = false
  }
}

// Pagamentos do cliente (o anual inteiro é 1 pagamento com 12 meses): é por
// pagamento que se registra chargeback.
const pagamentos = computed(() => {
  const mapa = new Map<string, Mes[]>()
  for (const m of vinculo.value?.meses || []) {
    const k = m.referencia || m.id
    mapa.set(k, [...(mapa.get(k) || []), m])
  }
  return [...mapa.entries()]
    .map(([referencia, meses]) => ({
      referencia,
      meses,
      criadoEm: meses[0].criadoEm,
      totalMeses: Math.max(...meses.map(x => Number(x.parcelasTotal || 1))),
      stripe: meses[0].origem === 'stripe_invoice',
      retivel: meses.some(x => x.status === 'pendente_liberacao' || x.status === 'liberado'),
      aReter: Math.round(meses.filter(x => x.status === 'pendente_liberacao' || x.status === 'liberado').reduce((a, x) => a + x.valor, 0) * 100) / 100,
      jaUsado: Math.round(meses.filter(x => x.status === 'utilizado' || x.status === 'creditado').reduce((a, x) => a + x.valor, 0) * 100) / 100,
    }))
    .sort((a, b) => (a.criadoEm < b.criadoEm ? 1 : -1))
})

const chargebackRef = ref<string | null>(null)
const registrandoChargeback = ref(false)
const avisoChargeback = ref('')

async function registrarChargeback(referencia: string) {
  if (!props.clienteId || registrandoChargeback.value) return
  registrandoChargeback.value = true
  erro.value = ''
  avisoChargeback.value = ''
  try {
    const resp = await $fetch<{
      success: boolean
      data: { cancelado: number; estornado: number; jaUtilizado: number; afiliado?: { cancelado: number; estornado: number } }
      aviso?: string | null
    }>('/api/admin/indicacao-estornar', {
      method: 'POST', headers: await useAdminAuthHeaders(), body: { empresaId: props.clienteId, referencia, motivo: 'chargeback' },
    })
    const r = resp.data
    const retidoAfiliado = (r.afiliado?.cancelado || 0) + (r.afiliado?.estornado || 0)
    avisoChargeback.value = `Retido ${brl(r.cancelado + r.estornado)} deste pagamento.`
      + (retidoAfiliado > 0 ? ` Comissão do afiliado retida: ${brl(retidoAfiliado)}.` : '')
      + (r.jaUtilizado > 0 ? ` Atenção: ${brl(r.jaUtilizado)} já tinha sido usado como desconto e não dá para desfazer sozinho. Desconte do próximo pedido de desconto dela ou assuma o valor.` : '')
      + (resp.aviso ? ` Atenção: ${resp.aviso}` : '')
    chargebackRef.value = null
    await carregar()
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.statusMessage || 'Não foi possível registrar o chargeback'
  } finally {
    registrandoChargeback.value = false
  }
}

function quemIndicou() {
  const i = vinculo.value?.indicadora
  if (!i) return 'quem indicou'
  return i.responsavel ? `${i.responsavel} (${i.nome})` : i.nome
}
</script>

<template>
  <BaseModal :show="show" title="Indicação" max-width="max-w-lg" @close="$emit('close')">
    <div v-if="carregando && !vinculo" class="py-8 text-center text-sm text-slate-500">Carregando…</div>

    <template v-else-if="vinculo && vinculo.indicadora">
      <!-- Quem indicou -->
      <div class="rounded-xl border border-pink-200 dark:border-pink-500/30 bg-pink-50 dark:bg-pink-500/10 p-4 mb-4">
        <p class="text-sm text-slate-700 dark:text-slate-300">
          <i class="fa-solid fa-gift text-pink-600 dark:text-pink-400 mr-1" aria-hidden="true" />
          <span class="font-bold text-slate-900 dark:text-white">{{ vinculo.indicadora.responsavel || vinculo.indicadora.nome }}</span>
          fez a indicação de <span class="font-bold text-slate-900 dark:text-white">{{ clienteNome }}</span>.
        </p>
        <div class="mt-3 space-y-1 text-xs text-slate-600 dark:text-slate-400">
          <p><span class="text-slate-500">Empresa:</span> <span class="font-medium text-slate-800 dark:text-slate-200">{{ vinculo.indicadora.nome }}</span></p>
          <p v-if="vinculo.indicadora.email"><span class="text-slate-500">E-mail:</span> {{ vinculo.indicadora.email }}</p>
          <p v-if="vinculo.indicadora.whatsapp" class="flex items-center gap-1.5">
            <span class="text-slate-500">WhatsApp:</span> {{ vinculo.indicadora.whatsapp }}
            <a v-if="whatsappLink(vinculo.indicadora.whatsapp)" :href="whatsappLink(vinculo.indicadora.whatsapp)!" target="_blank" rel="noopener noreferrer" class="text-green-600 hover:underline">
              <i class="fa-brands fa-whatsapp" aria-hidden="true" /> abrir
            </a>
          </p>
          <p v-if="vinculo.indicadora.mensalidade"><span class="text-slate-500">Mensalidade dela (base do ganho):</span> {{ brl(vinculo.indicadora.mensalidade) }}</p>
          <p v-if="vinculo.indicadora.status">
            <span class="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold" :class="STATUS_ASSINATURA[vinculo.indicadora.status]?.cls || 'bg-slate-100 text-slate-600'">
              {{ STATUS_ASSINATURA[vinculo.indicadora.status]?.texto || vinculo.indicadora.status }}
            </span>
          </p>
        </div>
      </div>

      <!-- O que a indicação gerou -->
      <p class="text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">Ganhos desta indicação para quem indicou</p>
      <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5">
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Recebido</p>
          <p class="text-base font-bold text-emerald-600">{{ brl(vinculo.resumo?.recebido) }}</p>
        </div>
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5">
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Em carência</p>
          <p class="text-base font-bold text-amber-600">{{ brl(vinculo.resumo?.carencia) }}</p>
        </div>
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5" :title="`${vinculo.resumo?.mesesProgramados || 0} meses programados`">
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Próximos meses</p>
          <p class="text-base font-bold text-violet-600">{{ brl(vinculo.resumo?.programado) }}</p>
        </div>
        <div class="rounded-xl border border-slate-200 dark:border-slate-800 p-2.5">
          <p class="text-[10px] font-bold uppercase tracking-wide text-slate-500">Cancelado</p>
          <p class="text-base font-bold text-slate-500">{{ brl(vinculo.resumo?.cancelado) }}</p>
        </div>
      </div>

      <p v-if="avisoChargeback" class="text-xs rounded-lg border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300 px-3 py-2 mb-3">{{ avisoChargeback }}</p>

      <div v-if="pagamentos.length" class="space-y-3 max-h-72 overflow-y-auto mb-4 pr-0.5">
        <div v-for="p in pagamentos" :key="p.referencia" class="rounded-xl border border-slate-200 dark:border-slate-800">
          <div class="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 dark:bg-slate-800/50 rounded-t-xl">
            <p class="text-xs font-bold text-slate-700 dark:text-slate-300">
              Pagamento de {{ data(p.criadoEm) }}
              <span class="font-normal text-slate-500">· {{ p.totalMeses >= 12 ? 'Plano anual (12 meses)' : p.totalMeses > 1 ? `${p.totalMeses} meses` : 'Mensal' }} · {{ p.stripe ? 'cartão (Stripe)' : 'Pix / painel' }}</span>
            </p>
            <button
              v-if="p.retivel && chargebackRef !== p.referencia"
              type="button"
              class="shrink-0 px-2 py-1 rounded-md text-[11px] font-semibold border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
              @click="chargebackRef = p.referencia"
            >
              <i class="fa-solid fa-hand" aria-hidden="true" /> Registrar chargeback
            </button>
          </div>

          <div v-if="chargebackRef === p.referencia" class="px-3 py-3 border-b border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 space-y-2">
            <p class="text-xs font-bold text-red-700 dark:text-red-400">Registrar chargeback deste pagamento?</p>
            <ul class="text-[11px] text-slate-700 dark:text-slate-300 list-disc pl-4 space-y-1">
              <li><b>{{ brl(p.aReter) }}</b> ficam retidos: o que está em carência ou programado é cancelado, e o que já foi liberado sai do saldo disponível dela.</li>
              <li v-if="p.jaUsado > 0"><b>{{ brl(p.jaUsado) }}</b> já foram usados como desconto e não dá pra desfazer sozinho.</li>
              <li v-if="p.stripe">Pagamento no cartão (Stripe): o chargeback aberto no Stripe já faz isso sozinho. Use aqui só se ele não tiver sido retido.</li>
              <li>Não mexe na assinatura do cliente: se for o caso, desative ou cancele à parte.</li>
            </ul>
            <div class="flex gap-2">
              <button type="button" class="flex-1 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800" :disabled="registrandoChargeback" @click="chargebackRef = null">Cancelar</button>
              <button type="button" class="flex-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold disabled:opacity-50" :disabled="registrandoChargeback" @click="registrarChargeback(p.referencia)">
                {{ registrandoChargeback ? 'Registrando…' : 'Reter ganho deste pagamento' }}
              </button>
            </div>
          </div>

          <div class="divide-y divide-slate-200 dark:divide-slate-800">
            <div v-for="m in p.meses" :key="m.id" class="flex items-center justify-between gap-3 px-3 py-2 text-xs">
              <div class="min-w-0">
                <p class="font-semibold text-slate-800 dark:text-slate-200">{{ rotuloMes(m) }} · {{ m.percentual }}% de {{ brl(m.valorBase) }}</p>
                <p class="text-slate-500 truncate">{{ situacao(m) }}</p>
              </div>
              <span class="font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">{{ brl(m.valor) }}</span>
            </div>
          </div>
        </div>
      </div>
      <p v-else class="text-xs text-slate-500 mb-4">Ainda não gerou ganho: o cliente não teve nenhuma renovação paga desde a indicação.</p>

      <p v-if="erro" class="text-sm text-red-600 mb-3">{{ erro }}</p>

      <!-- Remover indicação -->
      <button
        v-if="!confirmando"
        type="button"
        class="w-full px-4 py-2.5 rounded-lg font-semibold border border-red-300 dark:border-red-500/40 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10"
        @click="confirmando = true"
      >
        <i class="fa-solid fa-link-slash mr-1.5" aria-hidden="true" /> Remover indicação
      </button>

      <div v-else class="rounded-xl border border-red-200 dark:border-red-500/40 bg-red-50 dark:bg-red-500/10 p-4 space-y-3">
        <p class="text-sm font-bold text-red-700 dark:text-red-400">Remover a indicação de {{ quemIndicou() }}?</p>
        <ul class="text-xs text-slate-700 dark:text-slate-300 space-y-1.5 list-disc pl-4">
          <li><b>{{ clienteNome }}</b> deixa de gerar ganho para {{ vinculo.indicadora.responsavel || vinculo.indicadora.nome }} nas próximas renovações.</li>
          <li v-if="(vinculo.resumo?.mesesACancelar || 0) > 0">
            <b>{{ vinculo.resumo?.mesesACancelar }} {{ vinculo.resumo?.mesesACancelar === 1 ? 'mês ainda não liberado' : 'meses ainda não liberados' }} ({{ brl(vinculo.resumo?.aCancelarSeRemover) }})</b> serão cancelados.
          </li>
          <li>O que já foi liberado ou usado ({{ brl(vinculo.resumo?.recebido) }}) continua no histórico dela.</li>
          <li>Não mexe na assinatura de nenhum dos dois clientes.</li>
        </ul>
        <div class="flex gap-2">
          <button type="button" class="flex-1 px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 text-sm text-slate-700 dark:text-slate-300 hover:bg-white/60 dark:hover:bg-slate-800" :disabled="removendo" @click="confirmando = false">
            Cancelar
          </button>
          <button type="button" class="flex-1 px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm font-semibold disabled:opacity-50" :disabled="removendo" @click="remover">
            {{ removendo ? 'Removendo…' : 'Remover indicação' }}
          </button>
        </div>
      </div>
    </template>

    <p v-else-if="vinculo && !vinculo.indicadora" class="text-sm text-slate-500">Este cliente não foi indicado por ninguém.</p>
    <p v-else-if="erro" class="text-sm text-red-600">{{ erro }}</p>
  </BaseModal>
</template>
