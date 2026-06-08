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
const clienteLimiteInstancias = ref<{
  id: string
  nome: string
  max_instancias: number
  max_agentes: number
  max_webhooks_entrada: number
} | null>(null)

const searchQuery = ref('')
const filterStatus = ref('all')
const filterPlan = ref('all')
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
  if (filterPlan.value !== 'all') {
    filtered = filtered.filter(c => c.subscription_plan === filterPlan.value)
  }
  return filtered.slice().sort((a, b) => {
    const dA = diasParaVencimento(a)
    const dB = diasParaVencimento(b)
    if (dA !== dB) return dA - dB
    return a.nome.localeCompare(b.nome, 'pt-BR', { sensitivity: 'base' })
  })
})

// Distribuição de planos (apenas visual — barra empilhada no lugar dos 4 cards de plano)
const planDistribution = computed(() => {
  const list = clientes.value
  const count = (p: string) => list.filter(c => c.subscription_plan === p).length
  const pro = count('pro'), basic = count('basic'), enterprise = count('enterprise'), free = count('free')
  const total = pro + basic + enterprise + free || 1
  return [
    { key: 'pro',        label: 'Pro',        value: pro,        bar: 'bg-purple-500',  dot: 'bg-purple-500',  pct: (pro / total) * 100 },
    { key: 'basic',      label: 'Básico',     value: basic,      bar: 'bg-blue-500',    dot: 'bg-blue-500',    pct: (basic / total) * 100 },
    { key: 'enterprise', label: 'Enterprise', value: enterprise, bar: 'bg-slate-500',   dot: 'bg-slate-500',   pct: (enterprise / total) * 100 },
    { key: 'free',       label: 'Gratuito',   value: free,       bar: 'bg-emerald-500', dot: 'bg-emerald-500', pct: (free / total) * 100 },
  ]
})

// Contagem por status para os chips de filtro (mesma lógica do filteredClientes)
const statusCounts = computed<Record<string, number>>(() => ({
  all: clientes.value.length,
  active: clientes.value.filter(c => c.subscription_status === 'active').length,
  trial: clientes.value.filter(c => c.subscription_status === 'trial').length,
  'vencendo-hoje': clientes.value.filter(c => diasParaVencimento(c) === 0).length,
  expired: clientes.value.filter(c => c.subscription_status === 'expired' || diasParaVencimento(c) < 0).length,
  canceled: clientes.value.filter(c => c.subscription_status === 'canceled').length,
}))

const statusChips = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Ativos' },
  { value: 'trial', label: 'Trial' },
  { value: 'vencendo-hoje', label: 'Vencendo hoje', tone: 'orange' },
  { value: 'expired', label: 'Vencidos', tone: 'red' },
  { value: 'canceled', label: 'Cancelados' },
] as const

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
    clienteLimiteInstancias.value = {
      id: c.id,
      nome: c.nome,
      max_instancias: c.max_instancias ?? 1,
      max_agentes: c.max_agentes ?? 1,
      max_webhooks_entrada: c.max_webhooks_entrada ?? 5,
    }
    showLimiteInstanciasModal.value = true
  }
}
async function confirmLimiteInstancias(limites: { maxInstancias: number; maxAgentes: number; maxWebhooksEntrada: number }) {
  if (!clienteLimiteInstancias.value) return
  try {
    const resp = await $fetch<{ success: boolean }>('/api/admin/limite-instancias', {
      method: 'POST',
      body: {
        clienteId: clienteLimiteInstancias.value.id,
        maxInstancias: limites.maxInstancias,
        maxAgentes: limites.maxAgentes,
        maxWebhooksEntrada: limites.maxWebhooksEntrada,
      },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error('Erro')
    const c = clientes.value.find(x => x.id === clienteLimiteInstancias.value!.id)
    if (c) {
      c.max_instancias = limites.maxInstancias
      c.max_agentes = limites.maxAgentes
      c.max_webhooks_entrada = limites.maxWebhooksEntrada
    }
    toast?.success('Limites atualizados')
  } catch { toast?.error('Erro ao atualizar limites') }
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
        <div v-show="statsExpanded" class="space-y-4">
          <!-- KPIs de ação: 2 de visão geral + 2 que exigem atenção -->
          <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <AdminStatsCard
              title="Total de Clientes" :value="stats.totalClientes" icon="fa-users" color="indigo"
              :subtitle="stats.clientesEssaSemana ? `+${stats.clientesEssaSemana} essa semana` : ''"
            />
            <AdminStatsCard
              title="Clientes Ativos" :value="stats.clientesAtivos" icon="fa-circle-check" color="emerald"
              :subtitle="stats.totalClientes ? `${Math.round((stats.clientesAtivos / stats.totalClientes) * 100)}% da base` : ''"
            />
            <AdminStatsCard
              title="Vencendo Hoje" :value="stats.clientesVencendoHoje" icon="fa-bell" color="orange" highlighted
              :subtitle="stats.clientesVencendoHoje ? 'precisa renovar' : 'tudo em dia'"
            />
            <AdminStatsCard
              title="Clientes Vencidos" :value="stats.clientesVencidos" icon="fa-triangle-exclamation" color="red" highlighted
              :subtitle="stats.clientesVencidos ? 'ação urgente' : 'nenhum vencido'"
            />
          </div>

          <!-- Distribuição de planos: barra empilhada (substitui os cards Pro/Básico/Enterprise) -->
          <div class="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm px-4 py-3.5">
            <div class="flex items-center justify-between mb-2.5">
              <p class="text-[11px] sm:text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Distribuição por plano</p>
            </div>
            <div class="flex h-2.5 w-full rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800">
              <div
                v-for="seg in planDistribution.filter(s => s.value > 0)"
                :key="seg.key"
                class="h-full transition-all"
                :class="seg.bar"
                :style="{ width: seg.pct + '%' }"
                :title="`${seg.label}: ${seg.value}`"
              />
            </div>
            <div class="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
              <div v-for="seg in planDistribution" :key="seg.key" class="flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full" :class="seg.dot" aria-hidden="true" />
                <span class="text-xs text-slate-600 dark:text-slate-400">{{ seg.label }}</span>
                <span class="text-xs font-semibold text-slate-900 dark:text-white tabular-nums">{{ seg.value }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <AdminTokenGlobalCard />

      <!-- Filtros -->
      <div class="space-y-4">
        <!-- Busca + plano + contagem -->
        <div class="flex flex-col sm:flex-row gap-4 sm:items-end justify-between">
          <div class="relative flex-1 sm:max-w-md">
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
          <div class="flex items-end gap-4">
            <div class="w-44 sm:w-48">
              <label for="plan" class="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Plano</label>
              <select
                id="plan"
                v-model="filterPlan"
                class="w-full px-4 py-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded text-sm text-slate-900 dark:text-white"
              >
                <option value="all">Todos</option>
                <option value="free">Gratuito</option>
                <option value="basic">Básico</option>
                <option value="pro">Pro</option>
                <option value="enterprise">Enterprise</option>
              </select>
            </div>
            <div class="hidden sm:flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 pb-2.5 whitespace-nowrap">
              <span class="font-semibold text-slate-900 dark:text-white tabular-nums">{{ filteredClientes.length }}</span>
              de
              <span class="font-semibold text-slate-900 dark:text-white tabular-nums">{{ clientes.length }}</span>
            </div>
          </div>
        </div>

        <!-- Chips de status (substituem o select) -->
        <div class="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
          <button
            v-for="chip in statusChips"
            :key="chip.value"
            type="button"
            @click="filterStatus = chip.value"
            :aria-pressed="filterStatus === chip.value"
            class="inline-flex items-center gap-1.5 pl-3 pr-2 py-1.5 rounded-full text-xs font-semibold border transition-colors"
            :class="filterStatus === chip.value
              ? 'bg-purple-600 border-purple-600 text-white'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800/60'"
          >
            {{ chip.label }}
            <span
              class="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full text-[10px] font-bold tabular-nums"
              :class="filterStatus === chip.value
                ? 'bg-white/25 text-white'
                : (chip.tone === 'red' && statusCounts[chip.value] > 0) ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-400'
                : (chip.tone === 'orange' && statusCounts[chip.value] > 0) ? 'bg-orange-100 text-orange-700 dark:bg-orange-500/15 dark:text-orange-400'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'"
            >{{ statusCounts[chip.value] }}</span>
          </button>
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
        :agentes-atual="clienteLimiteInstancias?.max_agentes ?? 1"
        :webhooks-atual="clienteLimiteInstancias?.max_webhooks_entrada ?? 5"
        @close="showLimiteInstanciasModal = false; clienteLimiteInstancias = null"
        @confirm="confirmLimiteInstancias"
      />
    </div>
  </div>
</template>
