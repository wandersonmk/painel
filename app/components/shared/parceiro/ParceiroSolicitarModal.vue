<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { ClienteCarteira } from '~/composables/useParceiroLicencas'

export type TipoSolicitacao = 'creditos' | 'exclusao' | 'instancia' | 'numero' | 'assistente'

const props = defineProps<{
  show: boolean
  tipo: TipoSolicitacao
  cliente?: ClienteCarteira | null
  parceiroNome?: string
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

watch(() => props.show, (aberto) => { if (aberto) observacao.value = '' })

const linkWhatsApp = computed(() => {
  const linhas = [
    `Olá! Sou o parceiro *${props.parceiroNome || ''}* e ${config.value.assunto}.`,
  ]
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
  window.open(linkWhatsApp.value, '_blank', 'noopener,noreferrer')
  emit('close')
}
</script>

<template>
  <BaseModal :show="show" :title="config.titulo" max-width="max-w-sm" @close="emit('close')">
    <div class="space-y-4">
      <div class="text-center py-1">
        <div class="w-14 h-14 rounded-full bg-purple-100 dark:bg-purple-500/15 flex items-center justify-center mx-auto mb-3">
          <i :class="['fa-solid', config.icone, 'text-purple-600 dark:text-purple-400 text-2xl']" aria-hidden="true" />
        </div>
        <p v-if="cliente" class="text-sm font-semibold text-slate-900 dark:text-white">{{ cliente.empresa_nome }}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 mt-2 leading-relaxed">{{ config.descricao }}</p>
      </div>

      <div>
        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1.5">
          Detalhes <span class="font-medium normal-case text-slate-400">(opcional)</span>
        </label>
        <textarea
          v-model="observacao"
          rows="3"
          maxlength="500"
          :placeholder="tipo === 'creditos' ? 'Ex.: 10 créditos mensais' : 'Conte o que você precisa'"
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
          class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center justify-center gap-2"
        >
          <i class="fa-brands fa-whatsapp" aria-hidden="true" />
          Enviar
        </button>
      </div>
    </div>
  </BaseModal>
</template>
