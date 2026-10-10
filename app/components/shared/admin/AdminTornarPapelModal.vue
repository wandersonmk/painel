<script setup lang="ts">
import { computed, ref, watch } from 'vue'

/**
 * Confirmação de "Tornar empresa parceira" / "Tornar afiliado" (tela Clientes).
 * Regra do dono (09/10/2026): cada pessoa é parceiro OU afiliado. Se o dono já
 * tem o outro papel, a troca é automática: ao abrir, o modal pede a prévia à
 * rota (mesma regra do "Remover parceria/afiliação") e mostra o que sai; o
 * clique de confirmar remove o papel antigo e aplica o novo numa ação só.
 * Saque aberto ou saldo de afiliado não bloqueado travam a troca (a rota manda
 * a mensagem do que fazer antes).
 */
const props = defineProps<{
  show: boolean
  tipo: 'parceiro' | 'afiliado'
  empresaId?: string | null
  nome?: string
}>()
const emit = defineEmits<{ close: []; feito: [] }>()

interface Troca {
  tipo: 'parceria' | 'afiliacao'
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
interface Previa {
  nome: string
  situacaoParceiro?: 'ativo' | 'suspenso' | 'removido' | null
  situacaoAfiliado?: 'ativo' | 'bloqueado' | 'removido' | null
  troca: Troca | null
}

const carregando = ref(false)
const enviando = ref(false)
const previa = ref<Previa | null>(null)
const erro = ref<string | null>(null)

const rota = computed(() => props.tipo === 'parceiro' ? '/api/admin/tornar-parceiro' : '/api/admin/tornar-afiliado')
const troca = computed(() => previa.value?.troca ?? null)
const situacao = computed(() => props.tipo === 'parceiro' ? previa.value?.situacaoParceiro ?? null : previa.value?.situacaoAfiliado ?? null)

const titulo = computed(() => {
  if (troca.value) return props.tipo === 'parceiro' ? 'Trocar afiliação por parceria' : 'Trocar parceria por afiliação'
  return props.tipo === 'parceiro' ? 'Tornar empresa parceira' : 'Tornar afiliado'
})
const rotuloBotao = computed(() => {
  if (troca.value) return props.tipo === 'parceiro' ? 'Trocar para parceiro' : 'Trocar para afiliado'
  return props.tipo === 'parceiro' ? 'Tornar parceira' : 'Tornar afiliado'
})
const bloqueio = computed(() => troca.value?.bloqueio || null)

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

watch(() => props.show, async (aberto) => {
  previa.value = null
  erro.value = null
  if (!aberto || !props.empresaId) return
  carregando.value = true
  try {
    const resp = await $fetch<{ success: boolean; data?: Previa; error?: string }>(rota.value, {
      method: 'POST',
      body: { empresaId: props.empresaId, previa: true },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar.')
    previa.value = resp.data
  }
  catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Não foi possível carregar.'
  }
  finally {
    carregando.value = false
  }
}, { immediate: true })

async function confirmar() {
  if (enviando.value || !previa.value || bloqueio.value || !props.empresaId) return
  enviando.value = true
  const toast = await useToastSafe()
  try {
    const resp = await $fetch<{ success: boolean; data?: any; error?: string }>(rota.value, {
      method: 'POST',
      body: { empresaId: props.empresaId },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Erro')
    const d = resp.data
    const papel = props.tipo === 'parceiro' ? 'parceiro' : 'afiliado'
    const portal = props.tipo === 'parceiro' ? 'portal do parceiro' : 'portal do afiliado'
    let msg: string
    if (d.trocou) {
      const antes = d.trocou.tipo === 'parceria' ? 'A parceria foi removida' : 'A afiliação foi removida'
      msg = `${d.nome} agora é ${papel}. ${antes}.`
    }
    else if (d.reativado) msg = `${d.nome} voltou a ser ${papel}.`
    else if (d.jaEra) msg = `${d.nome} já é ${papel}. Nada foi alterado.`
    else msg = `${d.nome} agora é ${papel}! Ele entra no ${portal} com o login que usa no Agzap.`
    if (d.jaEra && !d.reativado && !d.trocou) toast.warning(msg)
    else toast.success(msg)
    emit('feito')
  }
  catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Não foi possível concluir.')
  }
  finally {
    enviando.value = false
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
        <template v-if="tipo === 'parceiro'">
          vai acessar o portal do parceiro com o mesmo login que já usa no Agzap. O acesso ao aplicativo continua normal.
        </template>
        <template v-else>
          vai acessar o portal do afiliado com o mesmo login que já usa no Agzap e ganha um link fixo de indicação, com comissão em dinheiro. O acesso ao aplicativo continua normal.
        </template>
      </p>

      <p v-if="situacao === 'suspenso' || situacao === 'bloqueado'" class="text-sm rounded-lg p-3 bg-slate-50 dark:bg-white/[0.04] text-slate-600 dark:text-slate-300">
        {{ tipo === 'parceiro' ? 'A parceria dele está suspensa e será reativada.' : 'A afiliação dele está bloqueada e será desbloqueada.' }}
      </p>
      <p v-else-if="situacao === 'removido'" class="text-sm rounded-lg p-3 bg-slate-50 dark:bg-white/[0.04] text-slate-600 dark:text-slate-300">
        {{ tipo === 'parceiro'
          ? 'Ele já foi parceiro: o cadastro antigo volta a valer, com o saldo de créditos que tinha ficado congelado. Os clientes que voltaram para a Agzap continuam na Agzap.'
          : 'Ele já foi afiliado: o cadastro antigo (e o mesmo link) volta a valer.' }}
      </p>

      <!-- Troca automática: o que sai junto -->
      <div v-if="troca" class="rounded-xl border border-amber-200 dark:border-amber-500/30 overflow-hidden">
        <p class="px-3 py-2 text-xs font-medium uppercase tracking-wider bg-amber-50 dark:bg-amber-500/10 text-amber-800 dark:text-amber-300">
          {{ troca.tipo === 'parceria' ? 'Hoje ele é parceiro: a parceria sai antes' : 'Hoje ele é afiliado: a afiliação sai antes' }}
        </p>

        <ul v-if="troca.tipo === 'parceria'" class="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
          <li class="flex items-start gap-3 p-3">
            <i class="fa-solid fa-users mt-0.5 text-slate-400" aria-hidden="true" />
            <span class="text-slate-700 dark:text-slate-300">
              <template v-if="troca.clientes > 0"><span class="font-medium tabular-nums">{{ troca.clientes }}</span> {{ troca.clientes === 1 ? 'cliente da carteira volta' : 'clientes da carteira voltam' }} para a Agzap (fica registrado no histórico).</template>
              <template v-else>A carteira de clientes está vazia.</template>
            </span>
          </li>
          <li class="flex items-start gap-3 p-3">
            <i class="fa-solid fa-ticket mt-0.5 text-slate-400" aria-hidden="true" />
            <span class="text-slate-700 dark:text-slate-300">
              <template v-if="(troca.creditos ?? 0) > 0"><span class="font-medium tabular-nums">{{ troca.creditos }}</span> {{ troca.creditos === 1 ? 'crédito fica congelado' : 'créditos ficam congelados' }} no extrato.</template>
              <template v-else>Sem créditos sobrando.</template>
            </span>
          </li>
          <li class="flex items-start gap-3 p-3">
            <i class="fa-solid fa-door-closed mt-0.5 text-slate-400" aria-hidden="true" />
            <span class="text-slate-700 dark:text-slate-300">Ele sai da tela Parceiros e deixa de acessar o portal do parceiro.</span>
          </li>
        </ul>

        <ul v-else class="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
          <li class="flex items-start gap-3 p-3">
            <i class="fa-solid fa-users mt-0.5 text-slate-400" aria-hidden="true" />
            <span class="text-slate-700 dark:text-slate-300">
              <template v-if="troca.clientes > 0"><span class="font-medium tabular-nums">{{ troca.clientes }}</span> {{ troca.clientes === 1 ? 'cliente trazido continua' : 'clientes trazidos continuam' }} na Agzap; a rede para de gerar comissão.</template>
              <template v-else>Ainda não trouxe nenhum cliente.</template>
            </span>
          </li>
          <li v-if="(troca.retido ?? 0) > 0 || (troca.disponivel ?? 0) > 0" class="flex items-start gap-3 p-3">
            <i class="fa-solid fa-wallet mt-0.5 text-amber-500" aria-hidden="true" />
            <span v-if="troca.banido" class="text-slate-700 dark:text-slate-300">
              Bloqueado por: <span class="italic">{{ troca.motivoBloqueio }}</span>.
              O saldo de <span class="font-medium tabular-nums">{{ brl(troca.disponivel ?? 0) }}</span> disponível
              e <span class="font-medium tabular-nums">{{ brl(troca.retido ?? 0) }}</span> retido
              <span class="font-medium text-red-600 dark:text-red-400">será cancelado e não será pago</span>.
            </span>
            <span v-else class="text-slate-700 dark:text-slate-300">
              Saldo: <span class="font-medium tabular-nums">{{ brl(troca.disponivel ?? 0) }}</span> disponível
              e <span class="font-medium tabular-nums">{{ brl(troca.retido ?? 0) }}</span> retido.
            </span>
          </li>
          <li class="flex items-start gap-3 p-3">
            <i class="fa-solid fa-door-closed mt-0.5 text-slate-400" aria-hidden="true" />
            <span class="text-slate-700 dark:text-slate-300">
              {{ troca.apagaria
                ? 'Sem nenhum histórico: o cadastro de afiliado é apagado.'
                : 'Ele sai da tela Afiliados e deixa de acessar o portal do afiliado; comissões e saques ficam registrados.' }}
            </span>
          </li>
        </ul>
      </div>

      <p v-if="bloqueio" role="alert" class="text-sm rounded-lg p-3 bg-amber-50 text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
        Não dá para trocar agora. {{ bloqueio }}
      </p>
    </div>

    <div class="flex gap-2 pt-5">
      <button type="button" class="flex-1 px-4 py-2.5 rounded-lg font-normal border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800" @click="emit('close')">
        Cancelar
      </button>
      <button
        type="button"
        class="flex-1 px-4 py-2.5 rounded-lg font-normal text-white disabled:opacity-50 disabled:cursor-not-allowed"
        :class="troca ? 'bg-amber-600 hover:bg-amber-700' : 'bg-purple-600 hover:bg-purple-700'"
        :disabled="carregando || enviando || !previa || !!bloqueio"
        @click="confirmar"
      >
        <i v-if="enviando" class="fa-solid fa-spinner fa-spin mr-1" aria-hidden="true" />
        {{ rotuloBotao }}
      </button>
    </div>
  </BaseModal>
</template>
