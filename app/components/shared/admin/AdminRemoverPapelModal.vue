<script setup lang="ts">
import { ref, watch, computed } from 'vue'

/**
 * Confirmação de "Remover parceria" / "Remover afiliação" (pedido do dono,
 * 09/10/2026: cada pessoa é parceiro OU afiliado, um papel ativo por vez).
 * Ao abrir, pede a prévia à rota (clientes devolvidos, créditos congelados,
 * saldo do afiliado) e só remove no clique de confirmar.
 * Na tela Clientes vai com empresaId; nas telas Parceiros e Afiliados, com
 * parceiroId ou afiliadoId.
 */
const props = defineProps<{
  show: boolean
  tipo: 'parceria' | 'afiliacao'
  nome?: string
  empresaId?: string | null
  parceiroId?: string | null
  afiliadoId?: string | null
}>()
const emit = defineEmits<{ close: []; removido: [] }>()

interface Previa {
  nome: string
  clientes: number
  creditos?: number
  retido?: number
  disponivel?: number
  apagaria?: boolean
  banido?: boolean
  motivoBloqueio?: string | null
  bloqueio?: string | null
}

const carregando = ref(false)
const removendo = ref(false)
const previa = ref<Previa | null>(null)
const erro = ref<string | null>(null)

const rota = computed(() => props.tipo === 'parceria' ? '/api/admin/remover-parceria' : '/api/admin/remover-afiliacao')
const corpo = computed(() => props.tipo === 'parceria'
  ? { parceiroId: props.parceiroId || undefined, empresaId: props.empresaId || undefined }
  : { afiliadoId: props.afiliadoId || undefined, empresaId: props.empresaId || undefined })

const titulo = computed(() => props.tipo === 'parceria' ? 'Remover parceria' : 'Remover afiliação')
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

watch(() => props.show, async (aberto) => {
  previa.value = null
  erro.value = null
  if (!aberto) return
  carregando.value = true
  try {
    const resp = await $fetch<{ success: boolean; data?: Previa; error?: string }>(rota.value, {
      method: 'POST',
      body: { ...corpo.value, previa: true },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar.')
    previa.value = resp.data
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Não foi possível carregar.'
  } finally {
    carregando.value = false
  }
}, { immediate: true })

async function confirmar() {
  if (removendo.value || !previa.value || previa.value.bloqueio) return
  removendo.value = true
  const toast = await useToastSafe()
  try {
    const resp = await $fetch<{ success: boolean; data?: any; error?: string }>(rota.value, {
      method: 'POST',
      body: corpo.value,
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Erro')
    if (props.tipo === 'parceria') {
      const n = resp.data?.clientes ?? 0
      toast.success(n > 0
        ? `Parceria de ${resp.data?.nome} removida. ${n} ${n === 1 ? 'cliente voltou' : 'clientes voltaram'} para a Agzap.`
        : `Parceria de ${resp.data?.nome} removida.`)
    } else {
      const cancelado = Number(resp.data?.saldoCancelado || 0)
      toast.success(cancelado > 0
        ? `Afiliação de ${resp.data?.nome} removida. Saldo de ${brl(cancelado)} cancelado.`
        : `Afiliação de ${resp.data?.nome} removida.`)
    }
    emit('removido')
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || `Erro ao ${titulo.value.toLowerCase()}`)
  } finally {
    removendo.value = false
  }
}
</script>

<template>
  <BaseModal :show="show" :title="titulo" max-width="max-w-lg" @close="emit('close')">
    <div v-if="carregando" class="py-8 flex justify-center text-slate-400">
      <i class="fa-solid fa-spinner fa-spin" aria-hidden="true" />
    </div>

    <p v-else-if="erro" role="alert" class="text-sm text-red-600 dark:text-red-400">{{ erro }}</p>

    <div v-else-if="previa" class="space-y-4">
      <p class="text-sm text-slate-600 dark:text-slate-400">
        <span class="font-medium text-slate-900 dark:text-white">{{ previa.nome || nome }}</span>
        {{ tipo === 'parceria' ? 'deixa de ser parceiro' : 'deixa de ser afiliado' }} e volta a ser um cliente normal. O login e a empresa dele no app continuam normais.
      </p>

      <ul v-if="tipo === 'parceria'" class="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-sm">
        <li class="flex items-start gap-3 p-3">
          <i class="fa-solid fa-users mt-0.5 text-slate-400" aria-hidden="true" />
          <span class="text-slate-700 dark:text-slate-300">
            <template v-if="previa.clientes > 0"><span class="font-medium tabular-nums">{{ previa.clientes }}</span> {{ previa.clientes === 1 ? 'cliente da carteira volta' : 'clientes da carteira voltam' }} para a Agzap (fica registrado no histórico).</template>
            <template v-else>A carteira está vazia.</template>
          </span>
        </li>
        <li class="flex items-start gap-3 p-3">
          <i class="fa-solid fa-ticket mt-0.5 text-slate-400" aria-hidden="true" />
          <span class="text-slate-700 dark:text-slate-300">
            <template v-if="(previa.creditos ?? 0) > 0"><span class="font-medium tabular-nums">{{ previa.creditos }}</span> {{ previa.creditos === 1 ? 'crédito fica congelado' : 'créditos ficam congelados' }} no extrato.</template>
            <template v-else>Sem créditos sobrando.</template>
          </span>
        </li>
        <li class="flex items-start gap-3 p-3">
          <i class="fa-solid fa-lock mt-0.5 text-slate-400" aria-hidden="true" />
          <span class="text-slate-700 dark:text-slate-300">Ele sai da tela Parceiros e não entra mais no portal do parceiro. Isto é diferente de suspender. Para voltar, use "Tornar empresa parceira".</span>
        </li>
      </ul>

      <ul v-else class="rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-200 dark:divide-slate-800 text-sm">
        <li class="flex items-start gap-3 p-3">
          <i class="fa-solid fa-users mt-0.5 text-slate-400" aria-hidden="true" />
          <span class="text-slate-700 dark:text-slate-300">
            <template v-if="previa.clientes > 0"><span class="font-medium tabular-nums">{{ previa.clientes }}</span> {{ previa.clientes === 1 ? 'cliente trazido continua' : 'clientes trazidos continuam' }} na Agzap; a rede para de gerar comissão.</template>
            <template v-else>Ainda não trouxe nenhum cliente.</template>
          </span>
        </li>
        <li v-if="(previa.retido ?? 0) > 0 || (previa.disponivel ?? 0) > 0" class="flex items-start gap-3 p-3">
          <i class="fa-solid fa-wallet mt-0.5 text-amber-500" aria-hidden="true" />
          <span v-if="previa.banido" class="text-slate-700 dark:text-slate-300">
            Bloqueado por: <span class="italic">{{ previa.motivoBloqueio }}</span>.
            O saldo de <span class="font-medium tabular-nums">{{ brl(previa.disponivel ?? 0) }}</span> disponível
            e <span class="font-medium tabular-nums">{{ brl(previa.retido ?? 0) }}</span> retido
            <span class="font-medium text-red-600 dark:text-red-400">será cancelado e não será pago</span>.
          </span>
          <span v-else class="text-slate-700 dark:text-slate-300">
            Saldo: <span class="font-medium tabular-nums">{{ brl(previa.disponivel ?? 0) }}</span> disponível
            e <span class="font-medium tabular-nums">{{ brl(previa.retido ?? 0) }}</span> retido.
          </span>
        </li>
        <li class="flex items-start gap-3 p-3">
          <i class="fa-solid fa-lock mt-0.5 text-slate-400" aria-hidden="true" />
          <span class="text-slate-700 dark:text-slate-300">
            {{ previa.apagaria
              ? 'Sem nenhum histórico: o cadastro de afiliado é apagado.'
              : 'Ele sai da tela Afiliados e não entra mais no portal do afiliado; comissões e saques ficam registrados. Isto é diferente de bloquear.' }}
          </span>
        </li>
      </ul>

      <p v-if="previa.bloqueio" role="alert" class="text-sm rounded-lg p-3 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        {{ previa.bloqueio }}
      </p>
    </div>

    <div class="flex gap-2 pt-5">
      <button type="button" class="flex-1 px-4 py-2.5 rounded-lg font-normal border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800" @click="emit('close')">
        Cancelar
      </button>
      <button
        type="button"
        class="flex-1 px-4 py-2.5 rounded-lg font-normal text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
        :disabled="carregando || removendo || !previa || !!previa.bloqueio"
        @click="confirmar"
      >
        <i v-if="removendo" class="fa-solid fa-spinner fa-spin mr-1" aria-hidden="true" />
        {{ titulo }}
      </button>
    </div>
  </BaseModal>
</template>
