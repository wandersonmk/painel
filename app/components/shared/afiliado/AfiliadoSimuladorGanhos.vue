<script setup lang="ts">
/**
 * Simulador de ganhos do cadastro de afiliado (pedido do dono, 09/10/2026).
 * Só conta no navegador, sem chamada ao servidor: clientes indicados ×
 * mensalidade média × percentual da 1ª conexão.
 */
import { computed, ref, watch } from 'vue'

/** Percentuais da 1ª conexão (regras do programa): 1º pagamento e mensalidades seguintes. */
const COMISSAO_1A_CONEXAO = { primeiroPagamento: 0.3, todoMes: 0.15 } as const

const CLIENTES_MIN = 1
const CLIENTES_MAX = 50
const CLIENTES_PADRAO = 10
const MENSALIDADE_MIN = 1
const MENSALIDADE_MAX = 9999.99
const MENSALIDADE_PADRAO = 397 // plano mais comum hoje

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const decimal = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/* ------------------------------------------------------------- clientes */
const clientes = ref(CLIENTES_PADRAO)
const textoClientes = ref(String(CLIENTES_PADRAO))
watch(clientes, (v) => { textoClientes.value = String(v) })

const limitarClientes = (n: number) => Math.min(CLIENTES_MAX, Math.max(CLIENTES_MIN, Math.round(n)))

function aoDigitarClientes(e: Event) {
  const alvo = e.target as HTMLInputElement
  const digitos = alvo.value.replace(/\D/g, '').slice(0, 2)
  alvo.value = digitos
  textoClientes.value = digitos
  const n = Number(digitos)
  if (digitos && n >= CLIENTES_MIN && n <= CLIENTES_MAX) clientes.value = n
}

function aoSairClientes() {
  if (textoClientes.value) clientes.value = limitarClientes(Number(textoClientes.value))
  textoClientes.value = String(clientes.value)
}

function aoTeclarClientes(e: KeyboardEvent) {
  if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
    e.preventDefault()
    clientes.value = limitarClientes(clientes.value + (e.key === 'ArrowUp' ? 1 : -1))
  }
}

/** Quanto da trilha do slider fica preenchido (0–100%). */
const preenchido = computed(() => `${((clientes.value - CLIENTES_MIN) / (CLIENTES_MAX - CLIENTES_MIN)) * 100}%`)

/* ---------------------------------------------------------- mensalidade */
const mensalidade = ref(MENSALIDADE_PADRAO)
const textoMensalidade = ref(decimal.format(MENSALIDADE_PADRAO))

// Máscara de real (pedido do dono, 09/10/2026): só dígitos, lidos como
// centavos e mostrados já formatados — "39700" vira "397,00", "123456" vira
// "1.234,56". O "R$" fica fixo à esquerda do campo.
const CENTAVOS_MAX = Math.round(MENSALIDADE_MAX * 100)

function aoDigitarMensalidade(e: Event) {
  const alvo = e.target as HTMLInputElement
  const digitos = alvo.value.replace(/\D/g, '').replace(/^0+/, '')
  const centavos = Math.min(Number(digitos || '0'), CENTAVOS_MAX)
  const v = centavos / 100
  const texto = digitos ? decimal.format(v) : ''
  alvo.value = texto
  textoMensalidade.value = texto
  if (v >= MENSALIDADE_MIN) mensalidade.value = v
}

function aoSairMensalidade() {
  // Vazio ou abaixo do mínimo: volta para o último valor válido.
  textoMensalidade.value = decimal.format(mensalidade.value)
}

/* ------------------------------------------------------------ resultado */
const emCentavos = (v: number) => Math.round(v * 100) / 100
const noPrimeiroPagamento = computed(() =>
  moeda.format(emCentavos(clientes.value * mensalidade.value * COMISSAO_1A_CONEXAO.primeiroPagamento)))
const todoMes = computed(() =>
  moeda.format(emCentavos(clientes.value * mensalidade.value * COMISSAO_1A_CONEXAO.todoMes)))
</script>

<template>
  <!-- Compacto (10/10/2026, pedido do dono): menos altura pra página caber em
       notebook — mensalidade na mesma linha do rótulo, cantos menos redondos. -->
  <section class="border-t border-white/[0.07] pt-3.5" aria-labelledby="afs-titulo">
    <div class="flex items-center gap-2">
      <span class="grid place-items-center w-6 h-6 shrink-0 rounded-md bg-amber-400/10 ring-1 ring-inset ring-amber-300/20 text-amber-300" aria-hidden="true">
        <i class="fa-solid fa-calculator text-[11px]" />
      </span>
      <h3 id="afs-titulo" class="text-sm font-medium text-white">Simule seus ganhos</h3>
    </div>

    <div class="mt-2.5 space-y-2.5">
      <!-- Clientes indicados -->
      <div>
        <div class="flex items-center justify-between gap-3 mb-0.5 px-0.5">
          <label for="afs-clientes" class="text-xs text-gray-300">Clientes indicados</label>
          <input
            :value="textoClientes"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            maxlength="2"
            aria-label="Clientes indicados (número)"
            class="w-12 h-8 rounded-lg border border-white/10 bg-white/[0.04] text-center text-sm font-display font-medium tabular-nums text-white hover:bg-white/[0.06] focus:bg-white/[0.07] focus:outline-none focus:ring-[3px] focus:ring-purple-500/25 transition-all"
            @input="aoDigitarClientes"
            @blur="aoSairClientes"
            @keydown="aoTeclarClientes"
          >
        </div>
        <input
          id="afs-clientes"
          v-model.number="clientes"
          type="range"
          :min="CLIENTES_MIN"
          :max="CLIENTES_MAX"
          step="1"
          :aria-valuetext="`${clientes} ${clientes === 1 ? 'cliente' : 'clientes'}`"
          class="afs-faixa block w-full"
          :style="{ '--preenchido': preenchido }"
        >
        <div class="flex justify-between px-0.5 text-[11px] text-gray-500 tabular-nums" aria-hidden="true">
          <span>{{ CLIENTES_MIN }}</span>
          <span>{{ CLIENTES_MAX }}</span>
        </div>
      </div>

      <!-- Mensalidade média (rótulo e campo na mesma linha) -->
      <div class="flex items-center justify-between gap-3 px-0.5">
        <label for="afs-mensalidade" class="text-xs text-gray-300">Mensalidade média</label>
        <div class="relative w-36 shrink-0">
          <span class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-gray-400" aria-hidden="true">R$</span>
          <input
            id="afs-mensalidade"
            :value="textoMensalidade"
            type="text"
            inputmode="numeric"
            autocomplete="off"
            placeholder="0,00"
            class="w-full h-8 pl-9 pr-3 rounded-lg border border-white/10 bg-white/[0.04] text-sm text-right text-white tabular-nums shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] hover:bg-white/[0.06] focus:bg-white/[0.07] focus:outline-none focus:ring-[3px] focus:ring-purple-500/25 transition-all"
            @input="aoDigitarMensalidade"
            @blur="aoSairMensalidade"
          >
        </div>
      </div>

      <!-- Resultado -->
      <div class="grid grid-cols-2 gap-1.5" aria-live="polite" aria-atomic="true">
        <div class="min-w-0 rounded-lg px-3 py-2 bg-gradient-to-b from-amber-300/[0.13] to-amber-500/[0.03] ring-1 ring-inset ring-amber-300/25">
          <p class="text-[11px] leading-tight text-amber-100/70">No 1º pagamento</p>
          <p class="mt-0.5 font-display font-medium tabular-nums leading-tight text-amber-200 text-base [overflow-wrap:anywhere]">
            {{ noPrimeiroPagamento }}
          </p>
        </div>
        <div class="min-w-0 rounded-lg px-3 py-2 bg-white/[0.035] ring-1 ring-inset ring-white/[0.07]">
          <p class="text-[11px] leading-tight text-gray-400">Depois, todo mês</p>
          <p class="mt-0.5 font-display font-medium tabular-nums leading-tight text-amber-200 text-base [overflow-wrap:anywhere]">
            {{ todoMes }}<span class="font-sans font-normal text-xs text-gray-400">/mês</span>
          </p>
        </div>
      </div>

      <p class="px-0.5 text-[11px] leading-snug text-gray-500">
        Simulação só com a 1ª conexão; da 2ª à 5ª conexão o ganho é extra.
      </p>
    </div>
  </section>
</template>

<style scoped>
/* Slider dourado, trilha arredondada e preenchida até o valor. */
.afs-faixa {
  -webkit-appearance: none;
  appearance: none;
  height: 22px;
  background: transparent;
  cursor: pointer;
}

.afs-faixa:focus {
  outline: none;
}

.afs-faixa::-webkit-slider-runnable-track {
  height: 6px;
  border-radius: 9999px;
  background: linear-gradient(to right, #fcd34d 0, #f59e0b var(--preenchido), rgba(255, 255, 255, 0.09) var(--preenchido));
}

.afs-faixa::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  margin-top: -7px;
  border: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff6c8, #fbbf24 55%, #d97706);
  box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.16), 0 4px 10px rgba(0, 0, 0, 0.45);
  transition: box-shadow 0.15s;
}

.afs-faixa::-moz-range-track {
  height: 6px;
  border-radius: 9999px;
  background: rgba(255, 255, 255, 0.09);
}

.afs-faixa::-moz-range-progress {
  height: 6px;
  border-radius: 9999px;
  background: linear-gradient(to right, #fcd34d, #f59e0b);
}

.afs-faixa::-moz-range-thumb {
  width: 20px;
  height: 20px;
  border: 0;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 30%, #fff6c8, #fbbf24 55%, #d97706);
  box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.16), 0 4px 10px rgba(0, 0, 0, 0.45);
  transition: box-shadow 0.15s;
}

.afs-faixa:hover::-webkit-slider-thumb {
  box-shadow: 0 0 0 6px rgba(251, 191, 36, 0.2), 0 4px 10px rgba(0, 0, 0, 0.45);
}

.afs-faixa:hover::-moz-range-thumb {
  box-shadow: 0 0 0 6px rgba(251, 191, 36, 0.2), 0 4px 10px rgba(0, 0, 0, 0.45);
}

.afs-faixa:focus-visible::-webkit-slider-thumb {
  box-shadow: 0 0 0 6px rgba(139, 92, 246, 0.4), 0 4px 10px rgba(0, 0, 0, 0.45);
}

.afs-faixa:focus-visible::-moz-range-thumb {
  box-shadow: 0 0 0 6px rgba(139, 92, 246, 0.4), 0 4px 10px rgba(0, 0, 0, 0.45);
}
</style>
