<script setup lang="ts">
import { ref, watch, computed } from 'vue'

// Habilita/desabilita módulos do app por empresa (gate de admin):
// o admin decide se a empresa PODE usar cada módulo.
//
// Módulo desligado NÃO some do app: o item aparece com cadeado e o clique
// abre um convite pra contratar. Some só se o usuário não tiver a permissão.
// CRM Kanban não entra: fica sempre liberado, por decisão de produto.
export interface ModulosEmpresa {
  roteamentoHabilitado: boolean
  agendamentosHabilitado: boolean
  paginaAgendamentoHabilitada: boolean
  apiAssistenteHabilitada: boolean
  webhooksHabilitado: boolean
  documentacaoHabilitada: boolean
  enviosHabilitado: boolean
  maxEnviosMes: number
  maxProfissionais: number
  maxClientes: number
}

const props = defineProps<{
  show: boolean
  clienteId?: string
  clienteNome: string
  roteamentoAtual: boolean
  agendamentosAtual: boolean
  paginaAgendamentoAtual: boolean
  apiAssistenteAtual: boolean
  webhooksAtual: boolean
  documentacaoAtual: boolean
  enviosAtual: boolean
  maxEnviosMesAtual: number
  maxProfissionaisAtual: number
  maxClientesAtual: number
}>()
const emit = defineEmits<{
  close: []
  confirm: [modulos: ModulosEmpresa]
}>()

const roteamento = ref(true)
const agendamentos = ref(true)
const paginaAgendamento = ref(true)
const apiAssistente = ref(true)
const webhooks = ref(true)
const documentacao = ref(true)
// Envios é add-on pago: nasce desligado, ao contrário dos gates acima.
const envios = ref(false)
const maxEnviosMes = ref(0)
const maxProfissionais = ref(20)
const maxClientes = ref(100000)

// Faixas vendidas hoje. Valor em R$ não aparece aqui de propósito: quem
// contrata fala com a gente no WhatsApp e recebe a tabela na hora, então o
// painel não fixa preço que possa ficar desatualizado.
const FAIXAS_ENVIO = [1000, 5000, 15000]
const FAIXA_PADRAO = 1000
const fmtMil = new Intl.NumberFormat('pt-BR')

// Quanto a empresa já usa — evita salvar um teto abaixo do consumo atual sem
// perceber (nada é removido, mas ela ficaria travada pra cadastrar).
const profissionaisEmUso = ref<number | null>(null)
const clientesEmUso = ref<number | null>(null)

watch(() => props.show, async (open) => {
  if (!open) {
    profissionaisEmUso.value = null
    clientesEmUso.value = null
    return
  }
  roteamento.value = props.roteamentoAtual
  agendamentos.value = props.agendamentosAtual
  paginaAgendamento.value = props.paginaAgendamentoAtual
  apiAssistente.value = props.apiAssistenteAtual
  webhooks.value = props.webhooksAtual
  documentacao.value = props.documentacaoAtual
  envios.value = props.enviosAtual
  maxEnviosMes.value = props.maxEnviosMesAtual ?? 0
  maxProfissionais.value = props.maxProfissionaisAtual ?? 20
  maxClientes.value = props.maxClientesAtual ?? 100000

  if (!props.clienteId) return
  try {
    const resp = await $fetch<{ success: boolean; data?: { profissionais: number; clientes: number } }>('/api/admin/empresa-uso', {
      query: { empresaId: props.clienteId },
      headers: await useAdminAuthHeaders(),
    })
    profissionaisEmUso.value = resp.success && resp.data ? (resp.data.profissionais ?? null) : null
    clientesEmUso.value = resp.success && resp.data ? (resp.data.clientes ?? null) : null
  } catch {
    profissionaisEmUso.value = null
    clientesEmUso.value = null
  }
})

const profAbaixoDoUso = computed(() =>
  profissionaisEmUso.value !== null && maxProfissionais.value < profissionaisEmUso.value
)
const clientesAbaixoDoUso = computed(() =>
  clientesEmUso.value !== null && maxClientes.value < clientesEmUso.value
)

const MODULOS = [
  {
    key: 'agendamentos' as const,
    label: 'Agenda',
    icon: 'fa-calendar-days',
    iconCls: 'text-emerald-500',
    descricao: 'Agendamentos, Serviços e Lembretes no menu lateral',
  },
  {
    key: 'paginaAgendamento' as const,
    label: 'Página de agendamento',
    icon: 'fa-globe',
    iconCls: 'text-sky-500',
    descricao: 'Link público onde o cliente final marca horário',
  },
  {
    key: 'roteamento' as const,
    label: 'Roteamento',
    icon: 'fa-route',
    iconCls: 'text-violet-500',
    descricao: 'Página de Roteamento de Leads no menu lateral do app',
  },
  {
    key: 'apiAssistente' as const,
    label: 'Integração API',
    icon: 'fa-plug',
    iconCls: 'text-cyan-500',
    descricao: 'Aba API dentro dos Assistentes IA (conectores)',
  },
  {
    key: 'webhooks' as const,
    label: 'Webhooks',
    icon: 'fa-bolt',
    iconCls: 'text-amber-500',
    descricao: 'Aba Webhook em Configurações (entrada e saída)',
  },
  {
    key: 'documentacao' as const,
    label: 'Documentação da API',
    icon: 'fa-book',
    iconCls: 'text-rose-500',
    descricao: 'Aba Documentação em Configurações',
  },
]

const valores = {
  roteamento,
  agendamentos,
  paginaAgendamento,
  apiAssistente,
  webhooks,
  documentacao,
}

// Limites numéricos, na mesma lista pra não duplicar markup
const LIMITES = [
  {
    key: 'profissionais' as const,
    modelo: maxProfissionais,
    emUso: profissionaisEmUso,
    alerta: profAbaixoDoUso,
    label: 'Profissionais',
    icon: 'fa-user-tie',
    iconCls: 'text-teal-500',
    min: 1,
    max: 500,
    ajuda: 'Quantos pode cadastrar (1 – 500)',
  },
  {
    key: 'clientes' as const,
    modelo: maxClientes,
    emUso: clientesEmUso,
    alerta: clientesAbaixoDoUso,
    label: 'Clientes',
    icon: 'fa-users',
    iconCls: 'text-blue-500',
    min: 1,
    max: 1000000,
    ajuda: 'Quantos pode cadastrar na mão (padrão 100.000)',
  },
]

// Ligar o add-on já deixa a menor faixa marcada (nunca "ligado sem plano");
// desligar zera a faixa, porque plano sem gate não significa nada.
function alternarEnvios() {
  envios.value = !envios.value
  if (envios.value) {
    if (!FAIXAS_ENVIO.includes(maxEnviosMes.value)) maxEnviosMes.value = FAIXA_PADRAO
  } else {
    maxEnviosMes.value = 0
  }
}

function submeter() {
  emit('confirm', {
    enviosHabilitado: envios.value,
    maxEnviosMes: envios.value ? maxEnviosMes.value : 0,
    roteamentoHabilitado: roteamento.value,
    agendamentosHabilitado: agendamentos.value,
    paginaAgendamentoHabilitada: paginaAgendamento.value,
    apiAssistenteHabilitada: apiAssistente.value,
    webhooksHabilitado: webhooks.value,
    documentacaoHabilitada: documentacao.value,
    maxProfissionais: maxProfissionais.value,
    maxClientes: maxClientes.value,
  })
}
</script>

<template>
  <BaseModal :show="show" title="Módulos do app" max-width="max-w-md" @close="$emit('close')">

    <!-- Header do cliente -->
    <div class="flex items-center gap-2.5 pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
      <div class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
        <span class="text-white font-bold text-xs">{{ clienteNome.charAt(0).toUpperCase() }}</span>
      </div>
      <div class="min-w-0">
        <p class="text-sm font-semibold text-slate-900 dark:text-white truncate">{{ clienteNome }}</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Controle quais módulos esta empresa pode acessar</p>
      </div>
    </div>

    <form @submit.prevent="submeter" class="space-y-3">
      <div class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 divide-y divide-slate-200 dark:divide-slate-800">
        <div
          v-for="m in MODULOS"
          :key="m.key"
          class="flex items-center justify-between gap-3 px-3 py-2.5"
        >
          <div class="min-w-0 flex-1">
            <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <i :class="['fa-solid', m.icon, m.iconCls, 'text-[10px]']" aria-hidden="true" />
              {{ m.label }}
            </p>
            <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">{{ m.descricao }}</p>
          </div>
          <button
            type="button"
            role="switch"
            :aria-checked="valores[m.key].value"
            :aria-label="`${valores[m.key].value ? 'Desabilitar' : 'Habilitar'} módulo ${m.label}`"
            @click="valores[m.key].value = !valores[m.key].value"
            class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
            :class="valores[m.key].value ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-700'"
          >
            <span
              class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
              :class="valores[m.key].value ? 'translate-x-[18px]' : 'translate-x-0.5'"
            />
          </button>
        </div>

        <!-- Envios: fica na mesma lista, mas com selo, porque é o único módulo
             que nasce bloqueado e só abre depois da contratação. -->
        <div class="px-3 py-2.5">
          <div class="flex items-center justify-between gap-3">
            <div class="min-w-0 flex-1">
              <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 flex-wrap">
                <i class="fa-solid fa-paper-plane text-fuchsia-500 text-[10px]" aria-hidden="true" />
                Envios (régua de cobrança)
                <span class="px-1.5 py-px rounded-full bg-fuchsia-100 dark:bg-fuchsia-500/15 text-fuchsia-700 dark:text-fuchsia-300 text-[9px] font-bold uppercase tracking-wide">Add-on</span>
              </p>
              <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">
                Módulo pago. Nasce bloqueado: só ligue depois que a empresa contratar.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              :aria-checked="envios"
              :aria-label="`${envios ? 'Bloquear' : 'Liberar'} módulo de Envios`"
              @click="alternarEnvios"
              class="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900"
              :class="envios ? 'bg-fuchsia-500' : 'bg-slate-300 dark:bg-slate-700'"
            >
              <span
                class="inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform"
                :class="envios ? 'translate-x-[18px]' : 'translate-x-0.5'"
              />
            </button>
          </div>

          <!-- Faixa contratada: só existe com o gate ligado. -->
          <div v-if="envios" class="mt-2.5">
            <p id="faixa-envios-label" class="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Faixa contratada</p>
            <div role="radiogroup" aria-labelledby="faixa-envios-label" class="grid grid-cols-3 gap-1.5 mt-1.5">
              <button
                v-for="f in FAIXAS_ENVIO"
                :key="f"
                type="button"
                role="radio"
                :aria-checked="maxEnviosMes === f"
                @click="maxEnviosMes = f"
                class="rounded border px-2 py-1.5 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
                :class="maxEnviosMes === f
                  ? 'border-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-600'"
              >
                <span class="block text-[13px] font-bold tabular-nums leading-tight">{{ fmtMil.format(f) }}</span>
                <span class="block text-[9px] uppercase tracking-wide opacity-70">msg/mês</span>
              </button>
            </div>
            <p class="text-[10px] leading-snug text-slate-400 dark:text-slate-600 mt-1.5">
              Teto de mensagens por mês. Os valores de cada faixa são passados no WhatsApp na contratação.
            </p>
          </div>
        </div>

        <!-- Limites: moram aqui e não em "Canais WhatsApp" porque na venda são
             negociados junto com os módulos. -->
        <div
          v-for="l in LIMITES"
          :key="l.key"
          class="flex items-center justify-between gap-3 px-3 py-2.5"
        >
          <div class="min-w-0 flex-1">
            <label :for="`max-${l.key}`" class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
              <i :class="['fa-solid', l.icon, l.iconCls, 'text-[10px]']" aria-hidden="true" />
              {{ l.label }}
            </label>
            <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 mt-0.5">
              <template v-if="l.emUso.value !== null">
                Em uso: <span class="tabular-nums font-semibold text-slate-600 dark:text-slate-400">{{ l.emUso.value }}</span> ·
              </template>
              {{ l.ajuda }}
            </p>
          </div>
          <input
            :id="`max-${l.key}`"
            v-model.number="l.modelo.value"
            type="number"
            :min="l.min"
            :max="l.max"
            required
            class="w-20 px-2 py-1.5 bg-white dark:bg-slate-900 border rounded text-[13px] text-slate-900 dark:text-white tabular-nums text-center font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
            :class="l.alerta.value ? 'border-amber-400 dark:border-amber-500' : 'border-slate-200 dark:border-slate-700'"
          />
        </div>
      </div>

      <p v-if="profAbaixoDoUso" class="text-[11px] leading-snug text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
        <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
        <span>Abaixo dos {{ profissionaisEmUso }} profissionais já cadastrados. Ninguém é removido, mas a empresa não poderá cadastrar novos até ficar dentro do limite.</span>
      </p>

      <p v-if="clientesAbaixoDoUso" class="text-[11px] leading-snug text-amber-600 dark:text-amber-400 flex items-start gap-1.5">
        <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
        <span>Abaixo dos {{ clientesEmUso }} clientes já cadastrados. Nada é removido, mas a empresa não poderá cadastrar novos na mão até ficar dentro do limite.</span>
      </p>

      <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
        <i class="fa-solid fa-circle-info mt-0.5" aria-hidden="true" />
        <span>Ao desabilitar, o item continua visível no app com um cadeado e o clique convida a contratar. Pode reabilitar a qualquer momento.</span>
      </p>

      <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-600 flex items-start gap-1.5">
        <i class="fa-solid fa-comment-dots mt-0.5" aria-hidden="true" />
        <span>O limite de clientes vale só para cadastro manual. Contato que chega sozinho por mensagem no WhatsApp nunca é bloqueado.</span>
      </p>

      <div class="flex gap-2 pt-1">
        <button
          type="button"
          @click="$emit('close')"
          class="flex-1 px-4 py-2 rounded font-semibold text-[13px] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          Cancelar
        </button>
        <button
          type="submit"
          class="flex-1 px-4 py-2 rounded font-semibold text-[13px] bg-purple-600 hover:bg-purple-700 text-white transition-colors"
        >
          Salvar
        </button>
      </div>
    </form>
  </BaseModal>
</template>
