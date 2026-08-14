<script setup lang="ts">
import type { ClienteCarteira } from '~/composables/useParceiroLicencas'
import type { TipoSolicitacao } from './ParceiroSolicitarModal.vue'

defineProps<{ show: boolean; cliente: ClienteCarteira | null }>()
const emit = defineEmits<{ close: []; solicitar: [TipoSolicitacao]; 'editar-valor': [ClienteCarteira] }>()

const fmtBRL = (v: number | null) =>
  v === null ? '—' : new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)

function fmtData(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

const SITUACOES: Record<string, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400' },
  vencido: { label: 'Vencido', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400' },
  bloqueado_parceiro: { label: 'Bloqueado por você', cls: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400' },
  bloqueado_admin: { label: 'Bloqueado pela Agzap', cls: 'bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300' },
}
</script>

<template>
  <BaseModal :show="show" title="Detalhes do cliente" max-width="max-w-md" @close="emit('close')">
    <div v-if="cliente" class="space-y-4">

      <div class="flex items-center gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
          <span class="text-white font-bold text-sm">{{ cliente.empresa_nome.charAt(0).toUpperCase() }}</span>
        </div>
        <div class="min-w-0 flex-1">
          <p class="font-semibold text-slate-900 dark:text-white truncate">{{ cliente.empresa_nome }}</p>
          <span
            class="inline-block mt-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold"
            :class="SITUACOES[cliente.situacao]?.cls"
          >{{ SITUACOES[cliente.situacao]?.label }}</span>
        </div>
      </div>

      <dl class="rounded-md bg-slate-50 dark:bg-white/[0.03] border border-slate-200 dark:border-white/10 divide-y divide-slate-200 dark:divide-white/5 text-sm">
        <div v-if="cliente.responsavel" class="flex items-center justify-between px-4 py-2.5">
          <dt class="text-xs text-slate-500 dark:text-slate-400">Responsável</dt>
          <dd class="text-slate-800 dark:text-white truncate ml-3">{{ cliente.responsavel }}</dd>
        </div>
        <div v-if="cliente.telefone" class="flex items-center justify-between px-4 py-2.5">
          <dt class="text-xs text-slate-500 dark:text-slate-400">Telefone</dt>
          <dd class="text-slate-800 dark:text-white font-mono text-xs">{{ formatPhone(cliente.telefone) ?? cliente.telefone }}</dd>
        </div>
        <div v-if="cliente.email" class="flex items-center justify-between px-4 py-2.5">
          <dt class="text-xs text-slate-500 dark:text-slate-400">E-mail</dt>
          <dd class="text-slate-800 dark:text-white truncate ml-3 text-xs">{{ cliente.email }}</dd>
        </div>
        <div class="flex items-center justify-between px-4 py-2.5">
          <dt class="text-xs text-slate-500 dark:text-slate-400">Vinculado a você em</dt>
          <dd class="text-slate-800 dark:text-white tabular-nums">{{ fmtData(cliente.vinculado_em) }}</dd>
        </div>
        <div class="flex items-center justify-between px-4 py-2.5">
          <dt class="text-xs text-slate-500 dark:text-slate-400">Vencimento</dt>
          <dd class="text-slate-800 dark:text-white tabular-nums">{{ fmtData(cliente.vencimento) }}</dd>
        </div>
        <!-- Valor que o cliente vê na assinatura: quem revende define. -->
        <div v-if="!cliente.cobranca_agzap" class="flex items-center justify-between px-4 py-2.5">
          <dt class="text-xs text-slate-500 dark:text-slate-400">Valor mensal cobrado</dt>
          <dd>
            <button
              type="button"
              @click="emit('editar-valor', cliente)"
              class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm tabular-nums font-semibold text-purple-700 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
            >
              {{ fmtBRL(cliente.preco) }}
              <i class="fa-solid fa-pen text-[9px]" aria-hidden="true" />
            </button>
          </dd>
        </div>
        <!-- Plano de 12 meses tem preço fechado, não 12× o mensal. -->
        <div v-if="!cliente.cobranca_agzap" class="flex items-center justify-between px-4 py-2.5">
          <dt class="text-xs text-slate-500 dark:text-slate-400">Valor do plano anual</dt>
          <dd>
            <button
              type="button"
              @click="emit('editar-valor', cliente)"
              class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-sm tabular-nums font-semibold transition-colors hover:bg-purple-50 dark:hover:bg-purple-500/10"
              :class="cliente.preco_anual !== null ? 'text-purple-700 dark:text-purple-400' : 'text-slate-400'"
              :title="cliente.preco_anual !== null ? 'Alterar o valor do plano de 12 meses' : 'Definir o valor do plano de 12 meses'"
            >
              {{ cliente.preco_anual !== null ? fmtBRL(cliente.preco_anual) : 'definir' }}
              <i class="fa-solid fa-pen text-[9px]" aria-hidden="true" />
            </button>
          </dd>
        </div>
        <div class="flex items-center justify-between px-4 py-2.5">
          <dt class="text-xs text-slate-500 dark:text-slate-400">Última renovação</dt>
          <dd class="text-slate-800 dark:text-white tabular-nums">
            <template v-if="cliente.ultima_renovacao">
              {{ fmtData(cliente.ultima_renovacao.em) }}
              <span class="text-[10px] text-slate-400 ml-1">
                ({{ cliente.ultima_renovacao.origem === 'admin' ? 'Agzap' : 'você' }})
              </span>
            </template>
            <template v-else>—</template>
          </dd>
        </div>
      </dl>

      <!-- Limites: leitura apenas -->
      <div>
        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
          Recursos <span class="font-medium normal-case text-slate-400">— definidos pela Agzap</span>
        </p>
        <div class="grid grid-cols-2 gap-2">
          <div class="rounded-md border border-slate-200 dark:border-white/10 px-3 py-2.5">
            <p class="text-[10px] text-slate-500 dark:text-slate-400">Instâncias</p>
            <p class="text-lg font-bold text-slate-800 dark:text-white tabular-nums">
              {{ cliente.instancias }}<span class="text-xs text-slate-400 font-medium"> / {{ cliente.max_instancias }}</span>
            </p>
          </div>
          <div class="rounded-md border border-slate-200 dark:border-white/10 px-3 py-2.5">
            <p class="text-[10px] text-slate-500 dark:text-slate-400">Assistentes</p>
            <p class="text-lg font-bold text-slate-800 dark:text-white tabular-nums">
              {{ cliente.assistentes }}<span class="text-xs text-slate-400 font-medium"> / {{ cliente.max_assistentes }}</span>
            </p>
          </div>
        </div>
      </div>

      <!-- Tudo que é exclusivo da Agzap vira solicitação -->
      <div>
        <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">
          Solicitar à Agzap
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="acao in ([
              { tipo: 'instancia', label: 'Instância adicional', icone: 'fa-plug' },
              { tipo: 'numero', label: 'Número adicional', icone: 'fa-hashtag' },
              { tipo: 'assistente', label: 'Assistente adicional', icone: 'fa-robot' },
              { tipo: 'exclusao', label: 'Excluir cliente', icone: 'fa-trash-can' },
            ] as const)"
            :key="acao.tipo"
            type="button"
            @click="emit('solicitar', acao.tipo)"
            class="px-3 py-2 rounded border border-slate-200 dark:border-slate-700 hover:border-purple-400 dark:hover:border-purple-500 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors text-left flex items-center gap-2"
          >
            <i :class="['fa-solid', acao.icone, 'text-[11px] text-slate-400']" aria-hidden="true" />
            <span class="text-xs font-medium text-slate-700 dark:text-slate-300">{{ acao.label }}</span>
          </button>
        </div>
      </div>

      <button
        type="button"
        @click="emit('close')"
        class="w-full px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors"
      >
        Fechar
      </button>
    </div>
  </BaseModal>
</template>
