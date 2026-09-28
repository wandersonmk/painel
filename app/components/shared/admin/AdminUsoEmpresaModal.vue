<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { AdminCliente } from '~/composables/useAdminClientes'

// Visão só-leitura de limites x uso atual — abre ao clicar na linha do
// cliente na tabela (não é mais uma ação do menu "⋮", é o próprio clique na
// linha). Reusa /api/admin/empresa-uso (mesmo endpoint que já alimenta os
// avisos de "abaixo do uso atual" do AdminModulosModal), estendido com
// instancias/macros/enviosMes/pedidosMes.
const props = defineProps<{
  show: boolean
  cliente: AdminCliente | null
}>()
const emit = defineEmits<{
  close: []
  // Deixa abrir direto o modal de edição de módulos a partir daqui.
  editarModulos: [clienteId: string]
}>()

interface Uso {
  assistentes: number
  webhooks: number
  webhooksSaida: number
  profissionais: number
  clientes: number
  instancias: number
  macros: number
  enviosMes: number
  pedidosMes: number
  produtosVitrine?: number
}

const uso = ref<Uso | null>(null)
const carregando = ref(false)
const erro = ref(false)

watch(() => props.show, async (open) => {
  uso.value = null
  erro.value = false
  if (!open || !props.cliente?.id) return
  carregando.value = true
  try {
    const resp = await $fetch<{ success: boolean; data?: Uso }>('/api/admin/empresa-uso', {
      query: { empresaId: props.cliente.id },
      headers: await useAdminAuthHeaders(),
    })
    uso.value = resp.success && resp.data ? resp.data : null
    if (!uso.value) erro.value = true
  } catch {
    erro.value = true
  } finally {
    carregando.value = false
  }
})

interface Metrica {
  key: string
  label: string
  icon: string
  iconCls: string
  usado: number
  // null = sem teto (ex.: clientes cadastrados na mão tem teto alto, envios
  // com maxEnviosMes=0 é add-on desligado). 0 com semSemLimite=true = "0 = sem limite".
  max: number | null
  semLimiteQuando0?: boolean
}

const metricas = computed<Metrica[]>(() => {
  const c = props.cliente
  const u = uso.value
  if (!c || !u) return []

  const lista: Metrica[] = [
    { key: 'profissionais', label: 'Profissionais', icon: 'fa-user-tie', iconCls: 'text-teal-500', usado: u.profissionais, max: c.max_profissionais ?? 20 },
    { key: 'clientes', label: 'Clientes', icon: 'fa-users', iconCls: 'text-blue-500', usado: u.clientes, max: c.max_clientes ?? 100000 },
    { key: 'instancias', label: 'Canais WhatsApp', icon: 'fa-mobile-screen', iconCls: 'text-purple-500', usado: u.instancias, max: c.max_instancias ?? 1 },
    { key: 'macros', label: 'Macros', icon: 'fa-bolt', iconCls: 'text-amber-500', usado: u.macros, max: c.max_macros ?? 5 },
    // Vitrine ("Produtos" no menu do app) não é add-on: aparece sempre. 0 = sem limite.
    { key: 'produtosVitrine', label: 'Produtos (Vitrine)', icon: 'fa-store', iconCls: 'text-emerald-500', usado: u.produtosVitrine ?? 0, max: c.max_produtos_vitrine ?? 0, semLimiteQuando0: true },
  ]

  // Envios e Pedidos só aparecem se o add-on estiver ligado — senão a
  // barra de "0/0" só confunde quem está lendo.
  if (c.envios_habilitado) {
    lista.push({ key: 'envios', label: 'Disparos (mês)', icon: 'fa-paper-plane', iconCls: 'text-fuchsia-500', usado: u.enviosMes, max: c.max_envios_mes ?? 0, semLimiteQuando0: true })
  }
  if (c.delivery_modulo_ativo) {
    lista.push({ key: 'pedidos', label: 'Pedidos Delivery (mês)', icon: 'fa-motorcycle', iconCls: 'text-orange-500', usado: u.pedidosMes, max: c.max_pedidos_mes ?? 0, semLimiteQuando0: true })
  }

  return lista
})

// Dados de contato do dono da empresa, com cópia em um clique (pedido do dono,
// 28/09/2026): ao abrir o uso da empresa, quem atende já quer falar com o
// cliente. O WhatsApp copia só os dígitos (com DDI) — é o que se cola no
// WhatsApp/wa.me; o formatado é só pra leitura.
const contatos = computed(() => {
  const c = props.cliente
  if (!c) return []
  const digitos = (c.whatsapp || '').replace(/\D/g, '')
  return [
    { key: 'dono', label: 'Responsável', icon: 'fa-user', valor: c.nome_cliente || null, exibir: c.nome_cliente || null },
    { key: 'email', label: 'E-mail', icon: 'fa-envelope', valor: c.email || null, exibir: c.email || null },
    { key: 'whatsapp', label: 'WhatsApp', icon: 'fa-whatsapp', marca: true, valor: digitos || null, exibir: formatPhone(c.whatsapp) || null },
  ]
})

const copiado = ref<string | null>(null)
async function copiar(key: string, valor: string | null) {
  if (!valor) return
  try {
    await navigator.clipboard.writeText(valor)
  } catch {
    // Navegador sem permissão de clipboard: seleciona na mão via textarea.
    const ta = document.createElement('textarea')
    ta.value = valor
    ta.style.cssText = 'position:fixed;opacity:0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy') } catch { /* noop */ }
    ta.remove()
  }
  copiado.value = key
  setTimeout(() => { if (copiado.value === key) copiado.value = null }, 1800)
}

function semLimite(m: Metrica): boolean {
  return m.semLimiteQuando0 === true && (m.max ?? 0) === 0
}
function pct(m: Metrica): number {
  if (semLimite(m) || !m.max) return 0
  return Math.min(100, (m.usado / m.max) * 100)
}
function tom(m: Metrica): 'ok' | 'atencao' | 'cheio' {
  if (semLimite(m) || !m.max) return 'ok'
  const p = m.usado / m.max
  if (p >= 1) return 'cheio'
  if (p >= 0.9) return 'atencao'
  return 'ok'
}
</script>

<template>
  <BaseModal :show="show" title="Uso da empresa" max-width="max-w-2xl" @close="$emit('close')">
    <div class="flex items-center gap-2.5 pb-3 mb-3 border-b border-slate-200 dark:border-slate-800">
      <div class="w-8 h-8 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
        <span class="text-white font-bold text-xs">{{ (cliente?.nome || '?').charAt(0).toUpperCase() }}</span>
      </div>
      <div class="min-w-0">
        <p class="text-sm font-semibold text-slate-900 dark:text-white truncate">{{ cliente?.nome }}</p>
        <p class="text-[11px] text-slate-500 dark:text-slate-400">Limites contratados x uso atual</p>
      </div>
    </div>

    <!-- Contato do dono: cada linha com botão de copiar -->
    <div v-if="cliente" class="mb-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 divide-y divide-slate-200 dark:divide-slate-800">
      <div v-for="ct in contatos" :key="ct.key" class="flex items-center justify-between gap-3 px-3 py-2">
        <div class="min-w-0 flex items-center gap-2">
          <i :class="[ct.marca ? 'fa-brands' : 'fa-solid', ct.icon, ct.key === 'whatsapp' ? 'text-emerald-500' : 'text-slate-400', 'text-[12px] w-4 text-center shrink-0']" aria-hidden="true" />
          <div class="min-w-0">
            <p class="text-[10px] uppercase tracking-wide font-semibold text-slate-400 dark:text-slate-500">{{ ct.label }}</p>
            <p class="text-[13px] font-medium truncate" :class="ct.exibir ? 'text-slate-800 dark:text-slate-200' : 'text-slate-400 dark:text-slate-600 italic'">
              {{ ct.exibir || 'Não informado' }}
            </p>
          </div>
        </div>
        <button
          v-if="ct.valor"
          type="button"
          :title="copiado === ct.key ? 'Copiado!' : `Copiar ${ct.label.toLowerCase()}`"
          :aria-label="`Copiar ${ct.label.toLowerCase()}`"
          class="shrink-0 w-8 h-8 rounded-md flex items-center justify-center transition-colors focus:outline-none focus:ring-2 focus:ring-purple-500"
          :class="copiado === ct.key
            ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
            : 'text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-500/10'"
          @click="copiar(ct.key, ct.valor)"
        >
          <i :class="['fa-solid', copiado === ct.key ? 'fa-check' : 'fa-copy', 'text-[13px]']" aria-hidden="true" />
        </button>
      </div>
    </div>

    <div v-if="carregando" class="py-10 flex items-center justify-center">
      <AppLoading />
    </div>

    <div v-else-if="erro" class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
      Não foi possível carregar o uso desta empresa.
    </div>

    <div v-else class="space-y-2">
      <div
        v-for="m in metricas"
        :key="m.key"
        class="rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2.5"
      >
        <div class="flex items-center justify-between gap-3 mb-1.5">
          <p class="text-[13px] font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <i :class="['fa-solid', m.icon, m.iconCls, 'text-[10px]']" aria-hidden="true" />
            {{ m.label }}
          </p>
          <span
            class="text-[12px] font-bold tabular-nums"
            :class="{
              'text-emerald-600 dark:text-emerald-400': tom(m) === 'ok',
              'text-amber-600 dark:text-amber-400': tom(m) === 'atencao',
              'text-red-600 dark:text-red-400': tom(m) === 'cheio',
            }"
          >
            {{ m.usado }}<span v-if="!semLimite(m)"> / {{ m.max }}</span><span v-else class="text-slate-400 dark:text-slate-600 font-normal"> · sem limite</span>
          </span>
        </div>
        <div v-if="!semLimite(m)" class="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
          <div
            class="h-full rounded-full transition-all"
            :class="{
              'bg-emerald-500': tom(m) === 'ok',
              'bg-amber-500': tom(m) === 'atencao',
              'bg-red-500': tom(m) === 'cheio',
            }"
            :style="{ width: `${pct(m)}%` }"
          />
        </div>
      </div>

      <p v-if="metricas.length === 0" class="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Sem dados de uso pra mostrar.
      </p>
    </div>

    <div class="flex gap-2 pt-3 mt-1 border-t border-slate-200 dark:border-slate-800">
      <button
        type="button"
        @click="$emit('close')"
        class="flex-1 px-4 py-2 rounded font-semibold text-[13px] border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
      >
        Fechar
      </button>
      <button
        v-if="cliente"
        type="button"
        @click="$emit('editarModulos', cliente.id)"
        class="flex-1 px-4 py-2 rounded font-semibold text-[13px] bg-purple-600 hover:bg-purple-700 text-white transition-colors"
      >
        Editar limites
      </button>
    </div>
  </BaseModal>
</template>
