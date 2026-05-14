<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

const {
  clientes, stats, loading, error,
  loadClientes, desativarCliente, reativarCliente, renovarAssinatura,
  excluirCliente, editarCliente, diasParaVencimento,
} = useAdminClientes()

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null
onMounted(async () => {
  toast = await useToastSafe()
  await loadClientes()
})

const showRenovarModal = ref(false)
const showExcluirModal = ref(false)
const showEditarModal = ref(false)
const showDesativarModal = ref(false)
const showReativarModal = ref(false)
const showLimiteInstanciasModal = ref(false)

const selectedCliente = ref<{ id: string; nome: string } | null>(null)
const clienteParaEditar = ref<any>(null)
const clienteLimiteInstancias = ref<{ id: string; nome: string; max_instancias: number } | null>(null)

const searchQuery = ref('')
const filterStatus = ref('all')
const statsExpanded = ref(true)
const isRefreshing = ref(false)

async function refreshData() {
  isRefreshing.value = true
  await loadClientes()
  isRefreshing.value = false
}

const filteredClientes = computed(() => {
  let filtered = clientes.value
  if (searchQuery.value) {
    const q = searchQuery.value.toLowerCase()
    filtered = filtered.filter(c =>
      c.nome.toLowerCase().includes(q) ||
      c.email.toLowerCase().includes(q) ||
      c.whatsapp?.includes(q),
    )
  }
  if (filterStatus.value !== 'all') {
    if (filterStatus.value === 'expired') {
      filtered = filtered.filter(c => c.subscription_status === 'expired' || diasParaVencimento(c) < 0)
    } else if (filterStatus.value === 'vencendo-hoje') {
      filtered = filtered.filter(c => diasParaVencimento(c) === 0)
    } else {
      filtered = filtered.filter(c => c.subscription_status === filterStatus.value)
    }
  }
  return filtered.slice().sort((a, b) => {
    const dA = diasParaVencimento(a)
    const dB = diasParaVencimento(b)
    if (dA !== dB) return dA - dB
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
  })
})

function handleDesativar(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { selectedCliente.value = { id: c.id, nome: c.nome }; showDesativarModal.value = true }
}
async function confirmDesativar() {
  if (!selectedCliente.value) return
  try {
    await desativarCliente(selectedCliente.value.id)
    toast?.success('Cliente desativado')
  } catch { toast?.error('Erro ao desativar cliente') }
  showDesativarModal.value = false
  selectedCliente.value = null
}

function handleReativar(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { selectedCliente.value = { id: c.id, nome: c.nome }; showReativarModal.value = true }
}
async function confirmReativar() {
  if (!selectedCliente.value) return
  try {
    await reativarCliente(selectedCliente.value.id)
    toast?.success('Cliente reativado')
  } catch { toast?.error('Erro ao reativar cliente') }
  showReativarModal.value = false
  selectedCliente.value = null
}

function handleRenovar(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { selectedCliente.value = { id: c.id, nome: c.nome }; showRenovarModal.value = true }
}
async function confirmRenovar(plan: string, period: string) {
  if (!selectedCliente.value) return
  try {
    await renovarAssinatura(selectedCliente.value.id, plan as any, period as any)
    toast?.success('Assinatura renovada')
  } catch { toast?.error('Erro ao renovar assinatura') }
  showRenovarModal.value = false
  selectedCliente.value = null
}

function handleEditar(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { clienteParaEditar.value = c; showEditarModal.value = true }
}
async function confirmEditar(dados: any) {
  if (!clienteParaEditar.value) return
  try {
    await editarCliente(clienteParaEditar.value.id, dados)
    toast?.success('Cliente editado')
  } catch { toast?.error('Erro ao editar cliente') }
  showEditarModal.value = false
  clienteParaEditar.value = null
}

function handleExcluir(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) { selectedCliente.value = { id: c.id, nome: c.nome }; showExcluirModal.value = true }
}
async function confirmExcluir() {
  if (!selectedCliente.value) return
  try {
    await excluirCliente(selectedCliente.value.id)
    toast?.success('Cliente excluído')
  } catch { toast?.error('Erro ao excluir cliente') }
  showExcluirModal.value = false
  selectedCliente.value = null
}

function handleLimiteInstancias(id: string) {
  const c = clientes.value.find(x => x.id === id)
  if (c) {
    clienteLimiteInstancias.value = { id: c.id, nome: c.nome, max_instancias: c.max_instancias ?? 1 }
    showLimiteInstanciasModal.value = true
  }
}
async function confirmLimiteInstancias(quantidade: number) {
  if (!clienteLimiteInstancias.value) return
  try {
    const resp = await $fetch<{ success: boolean }>('/api/admin/limite-instancias', {
      method: 'POST',
      body: { clienteId: clienteLimiteInstancias.value.id, maxInstancias: quantidade },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error('Erro')
    const c = clientes.value.find(x => x.id === clienteLimiteInstancias.value!.id)
    if (c) c.max_instancias = quantidade
    toast?.success(`Limite alterado para ${quantidade} canal${quantidade > 1 ? 'is' : ''}`)
  } catch { toast?.error('Erro ao atualizar limite de canais') }
  showLimiteInstanciasModal.value = false
  clienteLimiteInstancias.value = null
}
</script>

<template>
  <div class="p-4 sm:p-6 md:p-10">
    <div class="max-w-[1400px] mx-auto space-y-6 sm:space-y-8">
      <!-- Header da página -->
      <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div class="space-y-1">
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Clientes</h1>
          <p class="text-slate-500 dark:text-slate-400 text-sm">Gerencie clientes e assinaturas em tempo real.</p>
        </div>
        <div class="flex items-center gap-3">
          <button
            @click="refreshData"
            :disabled="isRefreshing"
            class="inline-flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white rounded text-sm font-semibold transition-colors"
            type="button"
          >
            <i class="fa-solid fa-arrows-rotate" :class="{ 'animate-spin': isRefreshing }" aria-hidden="true" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div>
        <button
          @click="statsExpanded = !statsExpanded"
          class="flex items-center gap-2 text-sm font-semibold text-slate-500 dark:text-slate-400 mb-4 hover:text-slate-700 dark:hover:text-slate-200"
          type="button"
          :aria-expanded="statsExpanded"
        >
          <i class="fa-solid text-xs" :class="statsExpanded ? 'fa-chevron-down' : 'fa-chevron-right'" aria-hidden="true" />
          <span>Estatísticas</span>
          <span class="text-xs bg-slate-200 dark:bg-slate-800 px-2.5 py-0.5 rounded-full font-medium tabular-nums">
            {{ stats.totalClientes }} clientes
          </span>
        </button>
        <div v-show="statsExpanded" class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <AdminStatsCard title="Total de Clientes" :value="stats.totalClientes" icon="fa-users" color="indigo" />
          <AdminStatsCard title="Clientes Trial" :value="stats.clientesTrial" icon="fa-hourglass-half" color="amber" />
          <AdminStatsCard title="Clientes Pro" :value="stats.clientesPro" icon="fa-star" color="purple" />
          <AdminStatsCard title="Clientes Vencidos" :value="stats.clientesVencidos" icon="fa-triangle-exclamation" color="red" highlighted />
          <AdminStatsCard title="Clientes Básicos" :value="stats.clientesBasic" icon="fa-box" color="blue" />
          <AdminStatsCard title="Clientes Enterprise" :value="stats.clientesEnterprise" icon="fa-building" color="slate" />
          <AdminStatsCard title="Novos essa Semana" :value="stats.clientesEssaSemana" icon="fa-chart-line" color="emerald" />
          <AdminStatsCard title="Vencendo Hoje" :value="stats.clientesVencendoHoje" icon="fa-bell" color="orange" highlighted />
        </div>
      </div>

      <AdminTokenGlobalCard />

      <!-- Filtros -->
      <div class="flex flex-col lg:flex-row gap-4 items-end lg:items-end justify-between">
        <div class="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
          <div class="relative flex-1 sm:w-80">
            <label for="search" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Pesquisar</label>
            <div class="relative">
              <i class="fa-solid fa-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
              <input
                id="search"
                v-model="searchQuery"
                type="search"
                placeholder="Buscar por nome, email ou whatsapp..."
                class="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-sm text-slate-900 dark:text-white"
              />
            </div>
          </div>
          <div class="sm:w-48">
            <label for="status" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Status</label>
            <select
              id="status"
              v-model="filterStatus"
              class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-sm text-slate-900 dark:text-white"
            >
              <option value="all">Todos</option>
              <option value="trial">Trial</option>
              <option value="active">Ativo</option>
              <option value="expired">Expirado</option>
              <option value="vencendo-hoje">Vence hoje</option>
              <option value="canceled">Cancelado</option>
            </select>
          </div>
        </div>
        <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          Mostrando <span class="font-semibold text-slate-900 dark:text-white tabular-nums">{{ filteredClientes.length }}</span>
          de <span class="font-semibold text-slate-900 dark:text-white tabular-nums">{{ clientes.length }}</span>
        </div>
      </div>

      <div v-if="error" role="alert" class="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-md p-4 text-red-700 dark:text-red-400 text-sm">
        {{ error }}
      </div>

      <AdminClientesTable
        :clientes="filteredClientes"
        :loading="loading"
        @desativar="handleDesativar"
        @reativar="handleReativar"
        @renovar="handleRenovar"
        @editar="handleEditar"
        @excluir="handleExcluir"
        @limite-instancias="handleLimiteInstancias"
      />

      <AdminEditarClienteModal
        :show="showEditarModal"
        :cliente="clienteParaEditar"
        @close="showEditarModal = false; clienteParaEditar = null"
        @confirm="confirmEditar"
      />

      <AdminRenovarAssinaturaModal
        :show="showRenovarModal"
        :cliente-nome="selectedCliente?.nome || ''"
        @close="showRenovarModal = false; selectedCliente = null"
        @confirm="confirmRenovar"
      />

      <AdminConfirmacaoModal
        :show="showDesativarModal"
        title="Desativar cliente"
        message="Deseja realmente desativar o cliente"
        :cliente-nome="selectedCliente?.nome"
        confirm-label="Desativar"
        variant="warning"
        @close="showDesativarModal = false; selectedCliente = null"
        @confirm="confirmDesativar"
      />

      <AdminConfirmacaoModal
        :show="showReativarModal"
        title="Reativar cliente"
        message="Deseja reativar o cliente"
        :cliente-nome="selectedCliente?.nome"
        confirm-label="Reativar"
        variant="info"
        @close="showReativarModal = false; selectedCliente = null"
        @confirm="confirmReativar"
      />

      <AdminExcluirClienteModal
        :show="showExcluirModal"
        :cliente-nome="selectedCliente?.nome || ''"
        @close="showExcluirModal = false; selectedCliente = null"
        @confirm="confirmExcluir"
      />

      <AdminLimiteInstanciasModal
        :show="showLimiteInstanciasModal"
        :cliente-id="clienteLimiteInstancias?.id || ''"
        :cliente-nome="clienteLimiteInstancias?.nome || ''"
        :valor-atual="clienteLimiteInstancias?.max_instancias ?? 1"
        @close="showLimiteInstanciasModal = false; clienteLimiteInstancias = null"
        @confirm="confirmLimiteInstancias"
      />
    </div>
  </div>
</template>
