<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import type { ClienteCarteira, PrecoLicenca } from '~/composables/useParceiroLicencas'

export type TipoSolicitacao = 'creditos' | 'exclusao' | 'instancia' | 'numero' | 'assistente'

const props = defineProps<{
  show: boolean
  tipo: TipoSolicitacao
  cliente?: ClienteCarteira | null
  parceiroNome?: string
  /** Opcional: a tela que já carregou os preços passa e evita nova requisição. */
  precos?: PrecoLicenca[]
}>()

const emit = defineEmits<{ close: [] }>()

const WHATSAPP_AGZAP = '5511914600243'

const CONFIG: Record<TipoSolicitacao, { titulo: string; icone: string; descricao: string; assunto: string }> = {
  creditos: {
    titulo: 'Solicitar novos créditos',
    icone: 'fa-coins',
    descricao: 'A Agzap confirma o pagamento e libera os créditos na sua carteira. Enquanto isso, o saldo não muda.',
    assunto: 'quero comprar novos créditos de licença',
  },
  exclusao: {
    titulo: 'Solicitar exclusão do cliente',
    icone: 'fa-trash-can',
    descricao: 'A exclusão de clientes é feita apenas pela Agzap. Créditos já consumidos não são devolvidos.',
    assunto: 'quero solicitar a exclusão de um cliente',
  },
  instancia: {
    titulo: 'Solicitar instância adicional',
    icone: 'fa-plug',
    descricao: 'A quantidade de instâncias é definida pela Agzap. Você acompanha o uso, mas não altera o limite.',
    assunto: 'quero solicitar uma instância adicional',
  },
  numero: {
    titulo: 'Solicitar número adicional',
    icone: 'fa-hashtag',
    descricao: 'A liberação de números adicionais é feita pela Agzap.',
    assunto: 'quero solicitar um número adicional',
  },
  assistente: {
    titulo: 'Solicitar assistente adicional',
    icone: 'fa-robot',
    descricao: 'A quantidade de assistentes é definida pela Agzap. Você acompanha o uso, mas não altera o limite.',
    assunto: 'quero solicitar um assistente adicional',
  },
}

const config = computed(() => CONFIG[props.tipo])
const observacao = ref('')

// ───────── Pedido de créditos: quantidade e preço ─────────
// Os preços vêm da tabela do banco, não de constante no código: a Agzap muda
// faixa quando quiser e o pedido tem que acompanhar.
//
// A carga acontece no onMounted, e não ao abrir o modal: dentro do watch o
// useSupabaseClient() do useAdminAuthHeaders roda fora do contexto do Nuxt,
// falha calado e o preço aparecia zerado. A tela que já tem os preços pode
// passar por prop e evitar a requisição.
const { precos: precosCarregados, loadCreditos } = useParceiroLicencas()
const precos = computed(() => props.precos?.length ? props.precos : precosCarregados.value)
const qtdMensal = ref(0)
const qtdAnual = ref(0)

onMounted(() => {
  if (props.tipo === 'creditos' && !props.precos?.length) loadCreditos()
})

watch(() => props.show, (aberto) => {
  if (!aberto) return
  observacao.value = ''
  qtdMensal.value = 0
  qtdAnual.value = 0
})

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function definirQtd(tipo: 'mensal' | 'anual', valor: number) {
  const limitado = Math.min(999, Math.max(0, Math.trunc(Number(valor) || 0)))
  if (tipo === 'mensal') qtdMensal.value = limitado
  else qtdAnual.value = limitado
}

function ajustar(tipo: 'mensal' | 'anual', delta: number) {
  definirQtd(tipo, (tipo === 'mensal' ? qtdMensal.value : qtdAnual.value) + delta)
}

/** Faixa aplicada: a de maior quantidade_min que cabe na quantidade pedida. */
function faixaAplicada(tipoCredito: 'mensal_30d' | 'anual_12m', qtd: number) {
  const faixas = precos.value
    .filter(p => p.tipo_credito === tipoCredito)
    .sort((a, b) => a.quantidade_min - b.quantidade_min)
  if (!faixas.length) return null
  let escolhida = faixas[0]!
  for (const f of faixas) if (qtd >= f.quantidade_min) escolhida = f
  return escolhida
}

function linhaDe(tipoCredito: 'mensal_30d' | 'anual_12m', qtd: number) {
  const faixa = faixaAplicada(tipoCredito, qtd)
  const unitario = faixa ? Number(faixa.preco_unitario) : 0
  return { qtd, unitario, total: unitario * qtd }
}

const linhaMensal = computed(() => linhaDe('mensal_30d', Number(qtdMensal.value) || 0))
const linhaAnual = computed(() => linhaDe('anual_12m', Number(qtdAnual.value) || 0))
const totalPedido = computed(() => linhaMensal.value.total + linhaAnual.value.total)
const totalCreditos = computed(() => linhaMensal.value.qtd + linhaAnual.value.qtd)
/** Sem tabela carregada, some com o dinheiro em vez de exibir R$ 0,00. */
const temPrecos = computed(() => precos.value.length > 0)

/** "Peça mais 2 e o preço cai": só quando a próxima faixa existe e compensa. */
const proximaFaixaMensal = computed(() => {
  const qtd = linhaMensal.value.qtd
  if (qtd < 1) return null
  const proxima = precos.value
    .filter(p => p.tipo_credito === 'mensal_30d' && p.quantidade_min > qtd)
    .sort((a, b) => a.quantidade_min - b.quantidade_min)[0]
  if (!proxima || Number(proxima.preco_unitario) >= linhaMensal.value.unitario) return null
  return { faltam: proxima.quantidade_min - qtd, preco: Number(proxima.preco_unitario) }
})

const podeEnviar = computed(() => props.tipo !== 'creditos' || totalCreditos.value > 0)

const linkWhatsApp = computed(() => {
  const linhas = [
    `Olá! Sou o parceiro *${props.parceiroNome || ''}* e ${config.value.assunto}.`,
  ]

  // Pedido já formatado: a Agzap recebe quantidade, preço e total sem precisar
  // perguntar nada de volta.
  if (props.tipo === 'creditos' && totalCreditos.value > 0) {
    linhas.push('')
    const detalhe = (qtd: number, rotulo: string, unitario: number, total: number) =>
      temPrecos.value
        ? `• ${qtd} crédito(s) de ${rotulo} — ${fmtBRL(unitario)} cada = ${fmtBRL(total)}`
        : `• ${qtd} crédito(s) de ${rotulo}`
    if (linhaMensal.value.qtd > 0) {
      linhas.push(detalhe(linhaMensal.value.qtd, '30 dias', linhaMensal.value.unitario, linhaMensal.value.total))
    }
    if (linhaAnual.value.qtd > 0) {
      linhas.push(detalhe(linhaAnual.value.qtd, '12 meses', linhaAnual.value.unitario, linhaAnual.value.total))
    }
    if (temPrecos.value) linhas.push('', `*Total: ${fmtBRL(totalPedido.value)}*`)
  }

  if (props.cliente) {
    linhas.push('', `Cliente: *${props.cliente.empresa_nome}*`)
    if (props.cliente.vencimento) {
      linhas.push(`Vencimento: ${new Date(props.cliente.vencimento).toLocaleDateString('pt-BR')}`)
    }
    if (props.tipo === 'instancia' || props.tipo === 'numero') {
      linhas.push(`Instâncias hoje: ${props.cliente.instancias} de ${props.cliente.max_instancias}`)
    }
    if (props.tipo === 'assistente') {
      linhas.push(`Assistentes hoje: ${props.cliente.assistentes} de ${props.cliente.max_assistentes}`)
    }
  }
  if (observacao.value.trim()) linhas.push('', observacao.value.trim())
  return `https://wa.me/${WHATSAPP_AGZAP}?text=${encodeURIComponent(linhas.join('\n'))}`
})

function abrir() {
  if (!podeEnviar.value) return
  window.open(linkWhatsApp.value, '_blank', 'noopener,noreferrer')
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" :title="config.titulo" :max-width="tipo === 'creditos' ? 'max-w-md' : 'max-w-sm'" @close="emit('close')">
    <div class="space-y-4">
      <div class="text-center py-1">
        <div
          v-if="tipo !== 'creditos'"
          class="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center mx-auto mb-3"
        >
          <i :class="['fa-solid', config.icone, 'text-purple-600 dark:text-purple-400 text-2xl']" aria-hidden="true" />
        </div>
        <p v-if="cliente" class="text-sm font-semibold text-slate-900 dark:text-white">{{ cliente.empresa_nome }}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{{ config.descricao }}</p>
      </div>

      <!-- Quantidade por tipo de crédito, com o preço da faixa já aplicado.
           Antes o parceiro tinha que escrever "10 créditos mensais" num campo
           livre e a Agzap voltava perguntando valor. -->
      <div v-if="tipo === 'creditos'" class="space-y-2">
        <div
          v-for="linha in [
            { id: 'mensal' as const, titulo: 'Créditos de 30 dias', sub: 'Renova um cliente por 30 dias', icone: 'fa-calendar-day', cor: 'purple', dados: linhaMensal },
            { id: 'anual' as const, titulo: 'Créditos de 12 meses', sub: 'Renova um cliente por um ano', icone: 'fa-calendar-days', cor: 'indigo', dados: linhaAnual },
          ]"
          :key="linha.id"
          class="rounded-lg border p-3 transition-colors"
          :class="linha.dados.qtd > 0
            ? 'border-purple-300 dark:border-purple-500/40 bg-purple-50/50 dark:bg-purple-500/[0.07]'
            : 'border-slate-200 dark:border-white/10'"
        >
          <div class="flex items-center gap-3">
            <span
              class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              :class="linha.cor === 'purple'
                ? 'bg-purple-100 dark:bg-purple-500/15 text-purple-600 dark:text-purple-400'
                : 'bg-indigo-100 dark:bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'"
            >
              <i class="fa-solid text-xs" :class="linha.icone" aria-hidden="true" />
            </span>
            <div class="min-w-0 flex-1">
              <p class="text-sm font-semibold text-slate-900 dark:text-white leading-tight">{{ linha.titulo }}</p>
              <p class="text-[11px] text-slate-500 dark:text-slate-400">{{ linha.sub }}</p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <button
                type="button"
                @click="ajustar(linha.id, -1)"
                :disabled="linha.dados.qtd < 1"
                class="w-7 h-7 rounded border border-slate-200 dark:border-white/10 text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 disabled:opacity-40 transition-colors"
                :aria-label="`Remover um ${linha.titulo}`"
              >
                <i class="fa-solid fa-minus text-[10px]" aria-hidden="true" />
              </button>
              <input
                :value="linha.dados.qtd"
                @input="definirQtd(linha.id, Number(($event.target as HTMLInputElement).value))"
                type="number"
                min="0"
                max="999"
                inputmode="numeric"
                class="w-12 h-7 text-center text-sm font-bold tabular-nums bg-white dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 rounded text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                :aria-label="`Quantidade de ${linha.titulo}`"
              />
              <button
                type="button"
                @click="ajustar(linha.id, 1)"
                class="w-7 h-7 rounded border border-slate-200 dark:border-white/10 text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                :aria-label="`Adicionar um ${linha.titulo}`"
              >
                <i class="fa-solid fa-plus text-[10px]" aria-hidden="true" />
              </button>
            </div>
          </div>

          <div v-if="linha.dados.qtd > 0 && temPrecos" class="mt-2 pt-2 border-t border-slate-200/70 dark:border-white/5 flex items-baseline justify-between text-xs">
            <span class="text-slate-500 dark:text-slate-400 tabular-nums">
              {{ linha.dados.qtd }} × {{ fmtBRL(linha.dados.unitario) }}
            </span>
            <span class="font-bold text-slate-900 dark:text-white tabular-nums">{{ fmtBRL(linha.dados.total) }}</span>
          </div>
          <p
            v-if="linha.id === 'mensal' && proximaFaixaMensal"
            class="mt-1.5 text-[11px] text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5"
          >
            <i class="fa-solid fa-arrow-trend-down text-[9px]" aria-hidden="true" />
            Peça mais {{ proximaFaixaMensal.faltam }} e cada um sai por {{ fmtBRL(proximaFaixaMensal.preco) }}
          </p>
        </div>

        <p
          v-if="totalCreditos > 0 && !temPrecos"
          class="text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1.5 px-1"
        >
          <i class="fa-solid fa-triangle-exclamation text-[10px] mt-0.5 shrink-0" aria-hidden="true" />
          Não consegui carregar a tabela de preços agora — o pedido vai só com as quantidades.
        </p>

        <div
          v-if="totalCreditos > 0 && temPrecos"
          class="flex items-baseline justify-between px-3 py-2.5 rounded-lg bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10"
        >
          <div>
            <p class="text-xs font-semibold text-slate-700 dark:text-slate-200">Total do pedido</p>
            <p class="text-[10px] text-slate-400">{{ totalCreditos }} crédito{{ totalCreditos === 1 ? '' : 's' }} · valor de referência</p>
          </div>
          <span class="text-lg font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">{{ fmtBRL(totalPedido) }}</span>
        </div>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
          Detalhes <span class="font-medium normal-case text-slate-400">(opcional)</span>
        </label>
        <textarea
          v-model="observacao"
          rows="3"
          maxlength="500"
          :placeholder="tipo === 'creditos'
            ? 'Ex.: já tenho muitos clientes, consegue aplicar desconto? Me envie o link para pagamento'
            : 'Conte o que você precisa'"
          class="w-full px-3 py-2 bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 rounded text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 resize-none"
        />
      </div>

      <div class="flex gap-2">
        <button
          type="button"
          @click="emit('close')"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Agora não
        </button>
        <button
          type="button"
          @click="abrir"
          :disabled="!podeEnviar"
          :title="podeEnviar ? '' : 'Escolha ao menos um crédito'"
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:hover:bg-emerald-600 disabled:cursor-not-allowed text-white transition-colors flex items-center justify-center gap-2"
        >
          <i class="fa-brands fa-whatsapp" aria-hidden="true" />
          Enviar pedido
        </button>
      </div>
    </div>
  </BaseModal>
</template>
