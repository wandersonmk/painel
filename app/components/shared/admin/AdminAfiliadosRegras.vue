<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

/**
 * Aba "Regras" da página /afiliados: percentuais e metas por conexão
 * (afiliado_regras) e a configuração do programa (afiliado_config).
 * Salvar = disquete verde flutuante, só aparece quando há alteração.
 */
interface Regra {
  conexao: number
  percentual_primeira: number | ''
  percentual_recorrente: number | ''
  meta_clientes: number | ''
  updated_at?: string | null
}

interface Config {
  ativo: boolean
  saque_minimo: number | ''
  prazo_saque_horas: number | ''
  updated_at?: string | null
}

const PRAZO_MAXIMO_HORAS = 720

const DESCRICAO: Record<number, string> = {
  1: 'Clientes que ele trouxe pelo link',
  2: 'Indicados pelos clientes dele',
  3: 'Indicados pela 2ª conexão',
  4: 'Indicados pela 3ª conexão',
  5: 'Indicados pela 4ª conexão',
}

const toast = useToast()

const regras = ref<Regra[]>([])
const config = ref<Config>({ ativo: true, saque_minimo: 0, prazo_saque_horas: 48 })
const original = ref('')
const carregando = ref(true)
const erro = ref('')
const salvando = ref(false)

function retrato() {
  return JSON.stringify({
    regras: regras.value.map(r => [r.conexao, r.percentual_primeira, r.percentual_recorrente, r.conexao === 1 ? 0 : r.meta_clientes]),
    config: [config.value.ativo, config.value.saque_minimo, config.value.prazo_saque_horas],
  })
}

const alterado = computed(() => original.value !== '' && retrato() !== original.value)

async function carregar() {
  erro.value = ''
  try {
    const resp = await $fetch<{ success: boolean; error?: string; data?: { regras: Regra[]; config: Config } }>(
      '/api/admin/afiliados/regras',
      { headers: await useAdminAuthHeaders() },
    )
    if (!resp.success || !resp.data) throw new Error(resp.error || 'Não foi possível carregar as regras.')
    regras.value = resp.data.regras.map(r => ({ ...r }))
    config.value = { ...resp.data.config }
    original.value = retrato()
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.message || 'Não foi possível carregar as regras.'
  } finally {
    carregando.value = false
  }
}

onMounted(carregar)
defineExpose({ carregar })

// ───────── Validação ─────────
const vazio = (v: unknown) => v === '' || v === null || v === undefined

const validacao = computed(() => {
  const lista: string[] = []
  const invalidos = new Set<string>()

  let pctRuim = false
  let metaRuim = false
  for (const r of regras.value) {
    for (const campo of ['percentual_primeira', 'percentual_recorrente'] as const) {
      const v = r[campo]
      const n = Number(v)
      if (vazio(v) || !Number.isFinite(n) || n < 0 || n > 100) {
        invalidos.add(`${r.conexao}-${campo}`)
        pctRuim = true
      }
    }
    if (r.conexao > 1) {
      const n = Number(r.meta_clientes)
      if (vazio(r.meta_clientes) || !Number.isInteger(n) || n < 0) {
        invalidos.add(`${r.conexao}-meta`)
        metaRuim = true
      }
    }
  }
  if (pctRuim) lista.push('Os percentuais precisam ficar entre 0 e 100.')
  if (metaRuim) lista.push('As metas precisam ser números inteiros, 0 ou mais.')

  if (!metaRuim) {
    const metas = regras.value.filter(r => r.conexao > 1).sort((a, b) => a.conexao - b.conexao)
    for (let i = 1; i < metas.length; i++) {
      const atual = metas[i]!
      const anterior = metas[i - 1]!
      if (Number(atual.meta_clientes) < Number(anterior.meta_clientes)) {
        invalidos.add(`${atual.conexao}-meta`)
        lista.push(`A meta da ${atual.conexao}ª conexão não pode ser menor que a da ${anterior.conexao}ª.`)
      }
    }
  }

  const minimo = Number(config.value.saque_minimo)
  if (vazio(config.value.saque_minimo) || !Number.isFinite(minimo) || minimo < 0) {
    invalidos.add('saque_minimo')
    lista.push('O valor mínimo por saque precisa ser 0 ou mais.')
  }
  const prazo = Number(config.value.prazo_saque_horas)
  if (vazio(config.value.prazo_saque_horas) || !Number.isInteger(prazo) || prazo <= 0 || prazo > PRAZO_MAXIMO_HORAS) {
    invalidos.add('prazo')
    lista.push(`O prazo do PIX precisa ser um número inteiro de horas, de 1 a ${PRAZO_MAXIMO_HORAS}.`)
  }

  return { lista, invalidos }
})

// ───────── Salvar ─────────
async function salvar() {
  if (salvando.value) return
  if (validacao.value.lista.length) {
    toast.error(validacao.value.lista[0]!)
    return
  }
  salvando.value = true
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/afiliados/regras', {
      method: 'POST',
      body: {
        regras: regras.value.map(r => ({
          conexao: r.conexao,
          percentual_primeira: Number(r.percentual_primeira),
          percentual_recorrente: Number(r.percentual_recorrente),
          meta_clientes: r.conexao === 1 ? 0 : Number(r.meta_clientes),
        })),
        config: {
          ativo: config.value.ativo,
          saque_minimo: Number(config.value.saque_minimo),
          prazo_saque_horas: Number(config.value.prazo_saque_horas),
        },
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error || 'Não foi possível salvar as regras.')
    toast.success('Regras do programa salvas')
    await carregar()
  } catch (e: any) {
    toast.error(e?.data?.statusMessage || e?.message || 'Não foi possível salvar as regras.')
  } finally {
    salvando.value = false
  }
}

// ───────── Exibição ─────────
function fmtBRL(v: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
}

/** Exemplo ao vivo numa mensalidade de R$ 100 (1ª conexão). */
const exemplo = computed(() => {
  const r1 = regras.value.find(r => r.conexao === 1)
  if (!r1) return null
  const p = Number(r1.percentual_primeira)
  const s = Number(r1.percentual_recorrente)
  if (!Number.isFinite(p) || !Number.isFinite(s)) return null
  return { primeira: fmtBRL(p), seguintes: fmtBRL(s) }
})

const atualizadoEm = computed(() => {
  const datas = [...regras.value.map(r => r.updated_at), config.value.updated_at]
    .filter((d): d is string => !!d)
    .map(d => new Date(d).getTime())
  if (!datas.length) return null
  return new Date(Math.max(...datas)).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
})

const cardBase = 'rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm dark:shadow-none'
const colHead = 'text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider'
const inputBase = 'w-full py-2 bg-white dark:bg-slate-900 border rounded text-sm text-slate-900 dark:text-white tabular-nums focus:outline-none focus:ring-2 focus:ring-purple-500'
const bordaOk = 'border-slate-200 dark:border-slate-700'
const bordaErro = 'border-red-400 dark:border-red-500/60'
const borda = (chave: string) => (validacao.value.invalidos.has(chave) ? bordaErro : bordaOk)
</script>

<template>
  <div class="space-y-4">

    <!-- Como funciona -->
    <div class="rounded-md bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 px-4 py-2.5 text-xs text-purple-800 dark:text-purple-200 flex items-start gap-2">
      <i class="fa-solid fa-circle-info mt-0.5" aria-hidden="true" />
      <span class="min-w-0">Modelo A: a conexão libera quando o afiliado tem a meta de clientes ativos que ele mesmo trouxe. Retenção: 7 dias no PIX, 15 no cartão.</span>
    </div>

    <div v-if="erro" class="p-3 rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 text-red-700 dark:text-red-400 text-sm flex items-center justify-between gap-3">
      <span class="min-w-0">{{ erro }}</span>
      <button type="button" class="text-xs font-normal underline shrink-0" @click="carregar">Tentar de novo</button>
    </div>

    <div v-if="carregando" class="grid gap-4 xl:grid-cols-3 items-start">
      <div class="xl:col-span-2 h-72 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse border border-slate-200 dark:border-slate-800" />
      <div class="h-72 rounded-md bg-slate-100 dark:bg-white/5 animate-pulse border border-slate-200 dark:border-slate-800" />
    </div>

    <div v-else-if="regras.length" class="grid gap-4 xl:grid-cols-3 items-start">

      <!-- Comissão por conexão -->
      <div :class="[cardBase, 'xl:col-span-2 min-w-0']">
        <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 class="text-sm font-medium text-slate-900 dark:text-white">Comissão por conexão</h2>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Percentual sobre a mensalidade do cliente que pagou, enquanto ele continuar pagando.</p>
        </div>

        <!-- Cabeçalho das colunas (telas largas); nas estreitas cada campo traz o próprio rótulo -->
        <div class="hidden lg:grid grid-cols-[minmax(0,1fr)_8rem_8rem_10rem] gap-x-4 px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-white/[0.02]">
          <span :class="colHead">Conexão</span>
          <span :class="colHead">% no 1º pagamento</span>
          <span :class="colHead">% nos seguintes</span>
          <span :class="colHead">Meta (ativos trazidos)</span>
        </div>

        <ul class="divide-y divide-slate-100 dark:divide-slate-800">
          <li
            v-for="r in regras"
            :key="r.conexao"
            class="px-4 py-3 grid grid-cols-3 gap-x-3 gap-y-2 lg:grid-cols-[minmax(0,1fr)_8rem_8rem_10rem] lg:gap-x-4 lg:items-center"
          >
            <div class="col-span-3 lg:col-span-1 min-w-0 flex items-center gap-3">
              <span class="size-8 rounded-md bg-purple-100 dark:bg-purple-500/15 text-purple-700 dark:text-purple-300 flex items-center justify-center text-xs font-medium tabular-nums shrink-0">{{ r.conexao }}ª</span>
              <div class="min-w-0">
                <p class="text-sm font-medium text-slate-900 dark:text-white">{{ r.conexao }}ª conexão</p>
                <p class="text-[11px] text-slate-400 dark:text-slate-500 truncate">{{ DESCRICAO[r.conexao] }}</p>
              </div>
            </div>

            <div class="min-w-0">
              <label :for="`regra-${r.conexao}-primeira`" class="lg:hidden block text-[11px] text-slate-500 dark:text-slate-400 mb-1">1º pagamento</label>
              <div class="relative">
                <input
                  :id="`regra-${r.conexao}-primeira`"
                  v-model.number="r.percentual_primeira"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputmode="decimal"
                  :aria-label="`Percentual no 1º pagamento da ${r.conexao}ª conexão`"
                  :class="[inputBase, borda(`${r.conexao}-percentual_primeira`), 'pl-3 pr-7']"
                >
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">%</span>
              </div>
            </div>

            <div class="min-w-0">
              <label :for="`regra-${r.conexao}-recorrente`" class="lg:hidden block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Seguintes</label>
              <div class="relative">
                <input
                  :id="`regra-${r.conexao}-recorrente`"
                  v-model.number="r.percentual_recorrente"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  inputmode="decimal"
                  :aria-label="`Percentual nos pagamentos seguintes da ${r.conexao}ª conexão`"
                  :class="[inputBase, borda(`${r.conexao}-percentual_recorrente`), 'pl-3 pr-7']"
                >
                <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">%</span>
              </div>
            </div>

            <div class="min-w-0">
              <label :for="`regra-${r.conexao}-meta`" class="lg:hidden block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Meta (ativos)</label>
              <p v-if="r.conexao === 1" class="text-sm text-slate-500 dark:text-slate-400 py-2">
                <span class="tabular-nums text-slate-900 dark:text-white">0</span> · na entrada
              </p>
              <div v-else class="relative">
                <input
                  :id="`regra-${r.conexao}-meta`"
                  v-model.number="r.meta_clientes"
                  type="number"
                  min="0"
                  step="1"
                  inputmode="numeric"
                  :aria-label="`Meta de clientes ativos para liberar a ${r.conexao}ª conexão`"
                  :class="[inputBase, borda(`${r.conexao}-meta`), 'pl-3 pr-3 sm:pr-14']"
                >
                <span class="hidden sm:inline absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">ativos</span>
              </div>
            </div>
          </li>
        </ul>
        <p v-if="exemplo" class="px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
          Exemplo: numa mensalidade de R$ 100,00, a 1ª conexão rende {{ exemplo.primeira }} no 1º pagamento e {{ exemplo.seguintes }} nos seguintes.
        </p>
      </div>

      <!-- Programa e saques -->
      <div :class="[cardBase, 'min-w-0']">
        <div class="px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 class="text-sm font-medium text-slate-900 dark:text-white">Programa e saques</h2>
        </div>
        <div class="p-4 sm:p-5 space-y-5">
          <!-- Programa ativo -->
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <p class="text-sm text-slate-800 dark:text-slate-200">Programa ativo</p>
              <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-500 mt-0.5">
                Desligado, os pagamentos param de gerar comissão nova. O que já foi ganho continua valendo.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="config.ativo"
              :aria-label="config.ativo ? 'Desligar o programa de afiliados' : 'Ligar o programa de afiliados'"
              class="relative inline-flex h-5 w-9 shrink-0 mt-0.5 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              :class="config.ativo ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'"
              @click="config.ativo = !config.ativo"
            >
              <span
                class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                :class="config.ativo ? 'translate-x-[18px]' : 'translate-x-0.5'"
              />
            </button>
          </div>

          <!-- Valor mínimo -->
          <div>
            <label for="afiliado-saque-minimo" class="block text-sm text-slate-800 dark:text-slate-200 mb-1.5">Valor mínimo por saque</label>
            <div class="relative">
              <span class="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">R$</span>
              <input
                id="afiliado-saque-minimo"
                v-model.number="config.saque_minimo"
                type="number"
                min="0"
                step="0.01"
                inputmode="decimal"
                :class="[inputBase, borda('saque_minimo'), 'pl-9 pr-3']"
              >
            </div>
            <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">0 = sem mínimo.</p>
          </div>

          <!-- Prazo do PIX -->
          <div>
            <label for="afiliado-prazo-pix" class="block text-sm text-slate-800 dark:text-slate-200 mb-1.5">Prazo do PIX</label>
            <div class="relative">
              <input
                id="afiliado-prazo-pix"
                v-model.number="config.prazo_saque_horas"
                type="number"
                min="1"
                :max="PRAZO_MAXIMO_HORAS"
                step="1"
                inputmode="numeric"
                :class="[inputBase, borda('prazo'), 'pl-3 pr-16']"
              >
              <span class="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">horas</span>
            </div>
            <p class="text-[11px] text-slate-400 dark:text-slate-500 mt-1">Em quanto tempo o PIX cai depois do pedido de saque. Padrão: 48 horas.</p>
          </div>

          <p v-if="atualizadoEm" class="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500">
            Última alteração em {{ atualizadoEm }}
          </p>
        </div>
      </div>
    </div>

    <!-- Problemas que impedem salvar -->
    <div
      v-if="alterado && validacao.lista.length"
      class="rounded-md bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20 px-4 py-3 text-xs text-red-700 dark:text-red-400 space-y-1"
    >
      <p v-for="msg in validacao.lista" :key="msg" class="flex items-start gap-1.5">
        <i class="fa-solid fa-circle-exclamation text-[10px] mt-0.5" aria-hidden="true" />
        <span>{{ msg }}</span>
      </p>
    </div>

    <!-- espaço pro botão flutuante não cobrir os últimos campos -->
    <div class="h-16" aria-hidden="true" />

    <!-- Salvar: disquete verde flutuante, com bolinha laranja quando há alteração. -->
    <Transition name="scale">
      <button
        v-if="alterado || salvando"
        type="button"
        class="fixed z-30 bottom-6 right-4 sm:right-6 w-12 h-12 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg shadow-green-600/30 transition-all active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        :disabled="salvando"
        :title="salvando ? 'Salvando…' : 'Salvar regras'"
        :aria-label="salvando ? 'Salvando' : 'Salvar regras'"
        @click="salvar"
      >
        <span v-if="salvando" class="inline-block w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
        <i v-else class="fa-solid fa-floppy-disk text-lg" aria-hidden="true" />
        <span v-if="alterado && !salvando" class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-orange-500 border-2 border-white dark:border-slate-900 rounded-full animate-ping" />
        <span v-if="alterado && !salvando" class="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-orange-500 border-2 border-white dark:border-slate-900 rounded-full" />
      </button>
    </Transition>
  </div>
</template>

<style scoped>
.scale-enter-active,
.scale-leave-active {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.scale-enter-from,
.scale-leave-to {
  transform: scale(0.9);
  opacity: 0;
}
</style>
