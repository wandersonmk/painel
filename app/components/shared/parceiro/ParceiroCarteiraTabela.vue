<script setup lang="ts">
import { ref } from 'vue'
import type { ClienteCarteira, SaldosCredito, SituacaoAcesso } from '~/composables/useParceiroLicencas'
import type { TipoSolicitacao } from './ParceiroSolicitarModal.vue'

/**
 * Tabela da carteira + todos os modais de ação. Fica junto de propósito: o
 * dashboard e a página de Clientes usam a mesma coisa sem duplicar a fiação
 * dos modais. O pai só escuta @changed para recarregar os dados.
 */
withDefaults(defineProps<{
  clientes: ClienteCarteira[]
  saldos: SaldosCredito
  loading?: boolean
  parceiroNome?: string
  /** Esconde as colunas de recurso — usado no resumo do dashboard. */
  compacto?: boolean
  mensagemVazio?: string
}>(), {
  loading: false,
  compacto: false,
  mensagemVazio: 'Nenhum cliente por aqui',
})

const emit = defineEmits<{ changed: [] }>()

const SITUACOES: Record<SituacaoAcesso, { label: string; cls: string }> = {
  ativo: { label: 'Ativo', cls: 'bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-500/20' },
  vencido: { label: 'Vencido', cls: 'bg-red-100 dark:bg-red-500/15 text-red-700 dark:text-red-400 border-red-200 dark:border-red-500/20' },
  bloqueado_parceiro: { label: 'Bloqueado por você', cls: 'bg-orange-100 dark:bg-orange-500/15 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-500/20' },
  bloqueado_admin: { label: 'Bloqueado pela Agzap', cls: 'bg-slate-200 dark:bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-600' },
}

function fmtData(s: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function textoDias(c: ClienteCarteira) {
  if (c.dias_restantes === null) return '—'
  if (c.dias_restantes < 0) return `${Math.abs(c.dias_restantes)}d atrás`
  if (c.dias_restantes === 0) return 'hoje'
  return `${c.dias_restantes}d`
}

function corDias(c: ClienteCarteira) {
  if (c.dias_restantes === null) return 'text-slate-400'
  if (c.dias_restantes < 0) return 'text-red-600 dark:text-red-400 font-semibold'
  if (c.dias_restantes <= 7) return 'text-amber-600 dark:text-amber-400 font-semibold'
  return 'text-slate-600 dark:text-slate-400'
}

// ───────── Modais ─────────
const selecionado = ref<ClienteCarteira | null>(null)
const showRenovar = ref(false)
const showBloquear = ref(false)
const acaoBloquear = ref(true)
const showDetalhes = ref(false)
const showValor = ref(false)
const showSolicitar = ref(false)
const tipoSolicitacao = ref<TipoSolicitacao>('creditos')

function abrirRenovar(c: ClienteCarteira) {
  selecionado.value = c
  showRenovar.value = true
}
function abrirBloquear(c: ClienteCarteira, bloquear: boolean) {
  selecionado.value = c
  acaoBloquear.value = bloquear
  showBloquear.value = true
}
function abrirDetalhes(c: ClienteCarteira) {
  selecionado.value = c
  showDetalhes.value = true
}
function abrirValor(c: ClienteCarteira) {
  selecionado.value = c
  showDetalhes.value = false
  showValor.value = true
}

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v)
function abrirSolicitacao(tipo: TipoSolicitacao) {
  tipoSolicitacao.value = tipo
  showDetalhes.value = false
  showSolicitar.value = true
}

const cardBase = 'rounded-md bg-white dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 shadow-sm dark:shadow-none'
</script>

<template>
  <div>
    <div :class="['overflow-hidden', cardBase]">
      <!-- Carregando -->
      <div v-if="loading" class="p-5 space-y-3">
        <div v-for="i in 4" :key="i" class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-lg bg-slate-100 dark:bg-white/5 animate-pulse shrink-0" />
          <div class="flex-1 space-y-1.5">
            <div class="h-3 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-2/3" />
            <div class="h-2.5 bg-slate-100 dark:bg-white/5 rounded animate-pulse w-1/3" />
          </div>
        </div>
      </div>

      <!-- Vazio -->
      <div v-else-if="clientes.length === 0" class="px-5 py-12 text-center">
        <i class="fa-solid fa-user-group text-slate-300 dark:text-slate-700 text-2xl mb-2 block" aria-hidden="true" />
        <p class="text-slate-500 text-sm">{{ mensagemVazio }}</p>
        <slot name="vazio" />
      </div>

      <div v-else class="overflow-x-auto">
        <table class="w-full text-sm">
          <thead>
            <tr class="border-b border-slate-200 dark:border-white/5 bg-slate-50/60 dark:bg-white/[0.02]">
              <th class="text-left px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Cliente</th>
              <th class="hidden md:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Vencimento</th>
              <th class="hidden sm:table-cell text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Restam</th>
              <th class="hidden sm:table-cell text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Situação</th>
              <th v-if="!compacto" class="hidden md:table-cell text-right px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider whitespace-nowrap">Valor cobrado</th>
              <th v-if="!compacto" class="hidden lg:table-cell text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Instâncias</th>
              <th v-if="!compacto" class="hidden lg:table-cell text-center px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Assistentes</th>
              <th v-if="!compacto" class="hidden xl:table-cell text-left px-5 py-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">Últ. renovação</th>
              <th class="text-right px-3 sm:px-5 py-3 text-[11px] sm:text-xs font-semibold text-slate-500 uppercase tracking-wider">Ações</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-100 dark:divide-white/5">
            <tr
              v-for="c in clientes"
              :key="c.vinculo_id"
              class="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] transition-colors"
            >
              <!-- Cliente -->
              <td class="px-3 sm:px-5 py-3">
                <div class="flex items-center gap-3 min-w-0">
                  <div class="w-8 h-8 rounded bg-purple-100 dark:bg-purple-500/15 border border-purple-200 dark:border-purple-500/20 flex items-center justify-center shrink-0">
                    <span class="text-purple-700 dark:text-purple-400 text-xs font-bold">{{ c.empresa_nome.charAt(0).toUpperCase() }}</span>
                  </div>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-slate-800 dark:text-white truncate">{{ c.empresa_nome }}</p>
                    <div class="mt-0.5 space-y-0.5">
                      <p v-if="c.responsavel" class="text-xs text-slate-500 truncate max-w-[220px]">{{ c.responsavel }}</p>
                      <div v-if="c.telefone" class="flex items-center gap-1.5">
                        <span class="text-xs text-slate-500 tabular-nums whitespace-nowrap">{{ formatPhoneSemDdiBrasil(c.telefone) }}</span>
                        <a
                          v-if="whatsappLink(c.telefone)"
                          :href="whatsappLink(c.telefone)!"
                          target="_blank"
                          rel="noopener noreferrer"
                          class="inline-flex items-center justify-center w-4 h-4 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white transition-colors shrink-0"
                          :title="`Abrir WhatsApp de ${c.empresa_nome}`"
                          aria-label="Abrir WhatsApp"
                        >
                          <i class="fa-brands fa-whatsapp text-[10px]" aria-hidden="true" />
                        </a>
                      </div>
                    </div>
                    <!-- Mobile -->
                    <div class="sm:hidden mt-1 flex items-center gap-1.5 flex-wrap">
                      <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border" :class="SITUACOES[c.situacao].cls">
                        {{ SITUACOES[c.situacao].label }}
                      </span>
                      <span class="text-[10px]" :class="corDias(c)">{{ fmtData(c.vencimento) }} · {{ textoDias(c) }}</span>
                    </div>
                  </div>
                </div>
              </td>

              <td class="hidden md:table-cell px-5 py-3 text-slate-600 dark:text-slate-400 text-xs whitespace-nowrap tabular-nums">
                {{ fmtData(c.vencimento) }}
              </td>

              <td class="hidden sm:table-cell px-5 py-3 text-center text-xs whitespace-nowrap tabular-nums" :class="corDias(c)">
                {{ textoDias(c) }}
              </td>

              <td class="hidden sm:table-cell px-5 py-3 text-center">
                <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border whitespace-nowrap" :class="SITUACOES[c.situacao].cls">
                  <span class="w-1.5 h-1.5 rounded-full bg-current" aria-hidden="true" />
                  {{ SITUACOES[c.situacao].label }}
                </span>
              </td>

              <!-- Valor da revenda: clicar edita. É o que o cliente vê na tela
                   de assinatura dele, então precisa estar à mão. -->
              <td v-if="!compacto" class="hidden md:table-cell px-5 py-3 text-right whitespace-nowrap">
                <button
                  v-if="!c.cobranca_agzap"
                  type="button"
                  @click="abrirValor(c)"
                  class="inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs tabular-nums transition-colors group"
                  :class="c.preco !== null
                    ? 'text-slate-700 dark:text-slate-200 font-semibold hover:bg-purple-50 dark:hover:bg-purple-500/10'
                    : 'text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10'"
                  :title="c.preco_anual !== null
                    ? `Mensal ${fmtBRL(c.preco ?? 0)} · anual ${fmtBRL(c.preco_anual)} — clique para alterar`
                    : 'Clique para definir o valor mensal e o do plano anual'"
                >
                  {{ c.preco !== null ? fmtBRL(c.preco) : 'definir' }}
                  <i class="fa-solid fa-pen text-[9px] opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
                </button>
                <span v-else class="text-xs text-slate-400">Agzap</span>
              </td>

              <td v-if="!compacto" class="hidden lg:table-cell px-5 py-3 text-center text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                {{ c.instancias }}<span class="text-slate-400">/{{ c.max_instancias }}</span>
              </td>
              <td v-if="!compacto" class="hidden lg:table-cell px-5 py-3 text-center text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                {{ c.assistentes }}<span class="text-slate-400">/{{ c.max_assistentes }}</span>
              </td>
              <td v-if="!compacto" class="hidden xl:table-cell px-5 py-3 text-xs text-slate-500 whitespace-nowrap tabular-nums">
                <template v-if="c.ultima_renovacao">
                  {{ fmtData(c.ultima_renovacao.em) }}
                  <span class="text-[10px] text-slate-400">({{ c.ultima_renovacao.origem === 'admin' ? 'Agzap' : 'você' }})</span>
                </template>
                <template v-else>—</template>
              </td>

              <!-- Ações -->
              <td class="px-3 sm:px-5 py-3">
                <div class="flex items-center justify-end gap-1.5">
                  <span
                    v-if="c.cobranca_agzap"
                    class="px-2 py-1 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-500/15 text-slate-500 dark:text-slate-400 whitespace-nowrap"
                    title="Este cliente é cobrado diretamente pela Agzap e não consome seu crédito"
                  >Cobrança Agzap</span>

                  <button
                    v-else
                    type="button"
                    @click="abrirRenovar(c)"
                    class="px-2.5 py-1.5 rounded text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors whitespace-nowrap"
                    title="Renovar consumindo um crédito"
                  >
                    <i class="fa-solid fa-rotate text-[10px] sm:mr-1" aria-hidden="true" />
                    <span class="hidden sm:inline">Renovar</span>
                  </button>

                  <button
                    v-if="c.situacao === 'bloqueado_parceiro'"
                    type="button"
                    @click="abrirBloquear(c, false)"
                    class="w-7 h-7 inline-flex items-center justify-center rounded text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                    title="Desbloquear acesso"
                    aria-label="Desbloquear acesso"
                  >
                    <i class="fa-solid fa-lock-open text-xs" aria-hidden="true" />
                  </button>
                  <button
                    v-else-if="c.situacao !== 'bloqueado_admin'"
                    type="button"
                    @click="abrirBloquear(c, true)"
                    class="w-7 h-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                    title="Bloquear acesso"
                    aria-label="Bloquear acesso"
                  >
                    <i class="fa-solid fa-lock text-xs" aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    @click="abrirDetalhes(c)"
                    class="w-7 h-7 inline-flex items-center justify-center rounded text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-500/10 transition-colors"
                    title="Ver detalhes"
                    aria-label="Ver detalhes"
                  >
                    <i class="fa-solid fa-ellipsis text-xs" aria-hidden="true" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <ParceiroRenovarModal
      :show="showRenovar"
      :cliente="selecionado"
      :saldos="saldos"
      @close="showRenovar = false"
      @confirmed="emit('changed')"
    />
    <ParceiroBloquearModal
      :show="showBloquear"
      :cliente="selecionado"
      :bloquear="acaoBloquear"
      @close="showBloquear = false"
      @confirmed="emit('changed')"
    />
    <ParceiroClienteDetalhesModal
      :show="showDetalhes"
      :cliente="selecionado"
      @close="showDetalhes = false"
      @solicitar="abrirSolicitacao"
      @editar-valor="abrirValor"
    />
    <ParceiroValorAssinaturaModal
      :show="showValor"
      :cliente="selecionado"
      @close="showValor = false"
      @saved="emit('changed')"
    />
    <ParceiroSolicitarModal
      :show="showSolicitar"
      :tipo="tipoSolicitacao"
      :cliente="selecionado"
      :parceiro-nome="parceiroNome"
      @close="showSolicitar = false"
    />
  </div>
</template>
