<script setup lang="ts">
import { ref } from 'vue'
import type { AdminCliente } from '~/composables/useAdminClientes'

interface Props { clientes: AdminCliente[]; loading: boolean }
defineProps<Props>()
const emit = defineEmits<{
  desativar: [clienteId: string]
  reativar: [clienteId: string]
  renovar: [clienteId: string]
  editar: [clienteId: string]
  excluir: [clienteId: string]
  'limite-instancias': [clienteId: string]
}>()

// Bottom sheet de ações (mobile)
const menuCliente = ref<AdminCliente | null>(null)
function openMenu(c: AdminCliente) { menuCliente.value = c }
function closeMenu() { menuCliente.value = null }
function emitAction(action: 'editar' | 'limite-instancias' | 'renovar' | 'desativar' | 'reativar' | 'excluir', id: string) {
  emit(action as any, id)
  closeMenu()
}

const { formatDate, getPlanLabel, isVencido, formatDiasVencimento, diasParaVencimento, getDataVencimento } = useAdminClientes()

const statusConfig: Record<string, { label: string; cls: string; dot: string }> = {
  trial:    { label: 'Trial',     cls: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',     dot: 'bg-amber-500' },
  active:   { label: 'Ativo',    cls: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-400', dot: 'bg-emerald-500' },
  canceled: { label: 'Cancelado', cls: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400',       dot: 'bg-slate-400' },
  expired:  { label: 'Expirado', cls: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',              dot: 'bg-red-500' },
}

function diasRestantesCls(c: AdminCliente) {
  if (c.subscription_status === 'trial' && !getDataVencimento(c))
    return 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300'
  const d = diasParaVencimento(c)
  if (d < 0 || isVencido(c)) return 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300'
  if (d === 0)  return 'bg-purple-100 text-purple-800 dark:bg-purple-500/15 dark:text-purple-300'
  if (d <= 7)   return 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300'
  return 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400'
}

function diasRestantesText(c: AdminCliente) {
  if (c.subscription_status === 'trial' && !getDataVencimento(c)) return 'Assinar'
  return formatDiasVencimento(c)
}

</script>

<template>
  <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md overflow-hidden">

    <!-- Loading -->
    <div v-if="loading" class="p-10 flex items-center justify-center">
      <AppLoading />
    </div>

    <!-- Empty -->
    <div v-else-if="clientes.length === 0" class="p-12 flex flex-col items-center justify-center text-center gap-3">
      <div class="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
        <i class="fa-solid fa-users text-slate-400 dark:text-slate-600 text-xl" aria-hidden="true" />
      </div>
      <div>
        <p class="text-slate-700 dark:text-slate-300 font-semibold text-sm">Nenhum cliente encontrado</p>
        <p class="text-slate-400 dark:text-slate-600 text-xs mt-0.5">Tente ajustar os filtros de busca</p>
      </div>
    </div>

    <!-- Table -->
    <div v-else class="overflow-x-auto">
      <table class="w-full text-sm">
        <thead>
          <tr class="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60">
            <th scope="col" class="px-2 sm:px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Cliente</th>
            <th scope="col" class="hidden md:table-cell px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Status</th>
            <th scope="col" class="px-2 sm:px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Plano</th>
            <th scope="col" class="px-2 sm:px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider whitespace-nowrap">Vencimento</th>
            <th scope="col" class="hidden sm:table-cell px-5 py-3.5 text-left text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Dias Restantes</th>
            <th scope="col" class="hidden lg:table-cell px-5 py-3.5 text-center text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Ativo</th>
            <th scope="col" class="px-2 sm:px-5 py-3.5 text-right text-[11px] font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Ações</th>
          </tr>
        </thead>

        <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
          <tr
            v-for="c in clientes"
            :key="c.id"
            class="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors"
            :class="!c.ativo ? 'opacity-55' : ''"
          >
            <!-- Cliente -->
            <td class="px-2 sm:px-5 py-3 sm:py-4 max-w-[160px] sm:max-w-none">
              <div class="flex items-center gap-2 sm:gap-3 min-w-0">
                <div class="w-8 h-8 sm:w-9 sm:h-9 rounded-full flex items-center justify-center shrink-0 text-xs sm:text-sm font-bold text-white"
                  :class="c.ativo ? 'bg-purple-600' : 'bg-slate-400 dark:bg-slate-600'">
                  {{ c.nome.charAt(0).toUpperCase() }}
                </div>
                <div class="min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-slate-900 dark:text-white leading-tight text-sm truncate">{{ c.nome }}</span>
                    <span
                      v-if="c.role === 'superAdmin'"
                      class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-gradient-to-r from-purple-600 to-blue-600 text-white"
                    >
                      <i class="fa-solid fa-shield-halved" aria-hidden="true" />
                      <span class="hidden sm:inline">Super Admin</span>
                    </span>
                  </div>
                  <p class="hidden md:block text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                    {{ c.email }}<template v-if="formatPhone(c.whatsapp)"> · {{ formatPhone(c.whatsapp) }} <a
                      :href="whatsappLink(c.whatsapp) ?? '#'"
                      target="_blank"
                      rel="noopener noreferrer"
                      class="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 hover:bg-green-500 hover:text-white transition-colors align-middle"
                      :title="`Abrir WhatsApp de ${c.nome}`"
                      aria-label="Abrir WhatsApp"
                      @click.stop
                    ><i class="fa-brands fa-whatsapp text-[11px]" aria-hidden="true" /></a></template>
                  </p>
                  <!-- Mobile: dias restantes inline + status quando o status pill estiver escondido -->
                  <div class="md:hidden mt-1 flex items-center gap-1.5 flex-wrap">
                    <span
                      class="sm:hidden inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-semibold"
                      :class="diasRestantesCls(c)"
                    >{{ diasRestantesText(c) }}</span>
                    <span v-if="!c.ativo" class="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                      Inativo
                    </span>
                  </div>
                </div>
              </div>
            </td>

            <!-- Status (md+) -->
            <td class="hidden md:table-cell px-5 py-4">
              <span
                class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                :class="statusConfig[c.subscription_status]?.cls ?? statusConfig.canceled.cls"
              >
                <span
                  class="w-1.5 h-1.5 rounded-full"
                  :class="statusConfig[c.subscription_status]?.dot ?? 'bg-slate-400'"
                  aria-hidden="true"
                />
                {{ statusConfig[c.subscription_status]?.label ?? c.subscription_status }}
              </span>
            </td>

            <!-- Plano -->
            <td class="px-2 sm:px-5 py-3 sm:py-4">
              <span class="text-slate-700 dark:text-slate-300 font-medium text-xs sm:text-sm whitespace-nowrap">{{ getPlanLabel(c.subscription_plan) }}</span>
            </td>

            <!-- Vencimento -->
            <td class="px-2 sm:px-5 py-3 sm:py-4">
              <span class="text-slate-700 dark:text-slate-300 tabular-nums text-xs sm:text-sm whitespace-nowrap">
                {{ formatDate(getDataVencimento(c)) || '—' }}
              </span>
            </td>

            <!-- Dias Restantes (sm+) -->
            <td class="hidden sm:table-cell px-5 py-4">
              <span
                class="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold"
                :class="diasRestantesCls(c)"
              >
                {{ diasRestantesText(c) }}
              </span>
            </td>

            <!-- Ativo (lg+) -->
            <td class="hidden lg:table-cell px-5 py-4 text-center">
              <span v-if="c.ativo" class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-emerald-100 dark:bg-emerald-500/15">
                <i class="fa-solid fa-check text-emerald-600 dark:text-emerald-400 text-xs" aria-hidden="true" />
              </span>
              <span v-else class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800">
                <i class="fa-solid fa-xmark text-slate-400 text-xs" aria-hidden="true" />
              </span>
            </td>

            <!-- Ações -->
            <td class="px-2 sm:px-5 py-3 sm:py-4">
              <!-- Mobile: kebab menu -->
              <div class="sm:hidden flex justify-end">
                <button
                  @click="openMenu(c)"
                  class="w-8 h-8 flex items-center justify-center rounded text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  aria-label="Mais ações"
                  type="button"
                >
                  <i class="fa-solid fa-ellipsis-vertical text-sm" aria-hidden="true" />
                </button>
              </div>

              <!-- Desktop: ícones inline -->
              <div class="hidden sm:flex items-center justify-end gap-1">
                <button
                  @click="$emit('editar', c.id)"
                  class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded hover:bg-blue-50 dark:hover:bg-blue-500/10 text-blue-600 dark:text-blue-400 transition-colors"
                  title="Editar cliente"
                  aria-label="Editar cliente"
                  type="button"
                >
                  <i class="fa-solid fa-pen-to-square text-sm" aria-hidden="true" />
                </button>

                <button
                  @click="$emit('limite-instancias', c.id)"
                  class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded hover:bg-purple-50 dark:hover:bg-purple-500/10 text-purple-600 dark:text-purple-400 transition-colors"
                  :title="`Canais: ${c.max_instancias ?? 1}`"
                  aria-label="Gerenciar canais"
                  type="button"
                >
                  <i class="fa-solid fa-mobile-screen text-sm" aria-hidden="true" />
                </button>

                <button
                  @click="$emit('renovar', c.id)"
                  class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors"
                  title="Renovar Assinatura"
                  aria-label="Renovar assinatura"
                  type="button"
                >
                  <i class="fa-solid fa-calendar-check text-sm" aria-hidden="true" />
                </button>

                <button
                  v-if="c.ativo && c.role !== 'superAdmin'"
                  @click="$emit('desativar', c.id)"
                  class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-600 dark:text-amber-400 transition-colors"
                  title="Desativar Cliente"
                  aria-label="Desativar cliente"
                  type="button"
                >
                  <i class="fa-solid fa-circle-xmark text-sm" aria-hidden="true" />
                </button>

                <button
                  v-if="!c.ativo && c.role !== 'superAdmin'"
                  @click="$emit('reativar', c.id)"
                  class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded hover:bg-emerald-50 dark:hover:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 transition-colors"
                  title="Reativar Cliente"
                  aria-label="Reativar cliente"
                  type="button"
                >
                  <i class="fa-solid fa-circle-check text-sm" aria-hidden="true" />
                </button>

                <button
                  v-if="c.role !== 'superAdmin'"
                  @click="$emit('excluir', c.id)"
                  class="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors"
                  title="Excluir Cliente"
                  aria-label="Excluir cliente"
                  type="button"
                >
                  <i class="fa-solid fa-trash text-sm" aria-hidden="true" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Bottom sheet de ações (mobile) -->
    <Teleport to="body">
      <Transition name="sheet">
        <div v-if="menuCliente" class="sm:hidden fixed inset-0 z-50 flex flex-col justify-end" role="dialog" aria-modal="true">
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/60" @click="closeMenu" aria-hidden="true" />
          <!-- Sheet -->
          <div class="relative bg-white dark:bg-slate-900 rounded-t-2xl border-t border-slate-200 dark:border-slate-800 shadow-2xl pb-[max(env(safe-area-inset-bottom),1rem)] animate-slide-up">
            <!-- Drag handle -->
            <div class="flex justify-center py-2">
              <div class="w-10 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>
            <!-- Header -->
            <div class="px-5 pb-3 border-b border-slate-100 dark:border-slate-800">
              <div class="flex items-center gap-3">
                <div class="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold text-white"
                  :class="menuCliente.ativo ? 'bg-purple-600' : 'bg-slate-400 dark:bg-slate-600'">
                  {{ menuCliente.nome.charAt(0).toUpperCase() }}
                </div>
                <div class="min-w-0 flex-1">
                  <p class="font-semibold text-slate-900 dark:text-white text-sm truncate">{{ menuCliente.nome }}</p>
                  <p class="text-xs text-slate-500 dark:text-slate-400 truncate">{{ getPlanLabel(menuCliente.subscription_plan) }} · {{ diasRestantesText(menuCliente) }}</p>
                </div>
              </div>
            </div>
            <!-- Action list -->
            <div class="py-2">
              <button
                @click="emitAction('editar', menuCliente.id)"
                class="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                type="button"
              >
                <i class="fa-solid fa-pen-to-square text-blue-600 dark:text-blue-400 w-5" aria-hidden="true" />
                <span class="text-sm font-medium text-slate-800 dark:text-slate-200">Editar cliente</span>
              </button>

              <button
                @click="emitAction('limite-instancias', menuCliente.id)"
                class="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                type="button"
              >
                <i class="fa-solid fa-mobile-screen text-purple-600 dark:text-purple-400 w-5" aria-hidden="true" />
                <span class="text-sm font-medium text-slate-800 dark:text-slate-200">Canais WhatsApp</span>
                <span class="ml-auto text-xs text-slate-500">{{ menuCliente.max_instancias ?? 1 }}</span>
              </button>

              <button
                @click="emitAction('renovar', menuCliente.id)"
                class="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                type="button"
              >
                <i class="fa-solid fa-calendar-check text-emerald-600 dark:text-emerald-400 w-5" aria-hidden="true" />
                <span class="text-sm font-medium text-slate-800 dark:text-slate-200">Renovar assinatura</span>
              </button>

              <button
                v-if="menuCliente.ativo && menuCliente.role !== 'superAdmin'"
                @click="emitAction('desativar', menuCliente.id)"
                class="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                type="button"
              >
                <i class="fa-solid fa-circle-xmark text-amber-600 dark:text-amber-400 w-5" aria-hidden="true" />
                <span class="text-sm font-medium text-slate-800 dark:text-slate-200">Desativar cliente</span>
              </button>

              <button
                v-if="!menuCliente.ativo && menuCliente.role !== 'superAdmin'"
                @click="emitAction('reativar', menuCliente.id)"
                class="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                type="button"
              >
                <i class="fa-solid fa-circle-check text-emerald-600 dark:text-emerald-400 w-5" aria-hidden="true" />
                <span class="text-sm font-medium text-slate-800 dark:text-slate-200">Reativar cliente</span>
              </button>

              <button
                v-if="menuCliente.role !== 'superAdmin'"
                @click="emitAction('excluir', menuCliente.id)"
                class="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                type="button"
              >
                <i class="fa-solid fa-trash text-red-500 dark:text-red-400 w-5" aria-hidden="true" />
                <span class="text-sm font-medium text-red-600 dark:text-red-400">Excluir cliente</span>
              </button>
            </div>
            <!-- Cancel -->
            <div class="px-3 pt-1">
              <button
                @click="closeMenu"
                class="w-full py-3 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-semibold text-sm"
                type="button"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-active .animate-slide-up,
.sheet-leave-active .animate-slide-up {
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
}
.sheet-enter-from .animate-slide-up,
.sheet-leave-to .animate-slide-up {
  transform: translateY(100%);
}
</style>
