<script setup lang="ts">
import { ref, reactive, watch, computed } from 'vue'

/**
 * Limites e canais da empresa (pedido do dono, 07/11/2026): canais por tipo
 * (WhatsApp, Instagram, chat do site) e os limites de quantidade do plano numa
 * tela só. Salvar manda só o que mudou.
 *
 * Conta antiga (max_canais_* nulo) só passa a ter limite por tipo se um campo
 * de canal mudar; aí vão os três. Sem mexer nos canais, ela segue como está:
 * Instagram sem limite e o chat do site contando junto com o WhatsApp.
 */
interface Instancia {
  id: string
  provider: 'uazapi' | 'meta' | 'instagram'
  nome_instancia: string
  status: string
  created_at: string
  phone: string | null
  username: string | null
}

export interface LimitesEmpresa {
  maxCanaisWhatsapp: number
  maxCanaisInstagram: number
  maxCanaisWebchat: number
  maxAgentes: number
  maxProfissionais: number
  maxClientes: number
  maxFunis: number
  maxMacros: number
  maxWebhooksEntrada: number
  maxWebhooksSaida: number
}
type Campo = keyof LimitesEmpresa

const props = defineProps<{
  show: boolean
  clienteId: string
  clienteNome: string
  // max_instancias: base do WhatsApp em conta antiga.
  valorAtual: number
  agentesAtual: number
  webhooksAtual: number
  webhooksSaidaAtual: number
  // Nulo = conta antiga, sem limite por tipo de canal.
  canaisWhatsappAtual?: number | null
  canaisInstagramAtual?: number | null
  canaisWebchatAtual?: number | null
  profissionaisAtual?: number | null
  clientesAtual?: number | null
  macrosAtual?: number | null
  // Nulo = sem limite de funis.
  funisAtual?: number | null
}>()
const emit = defineEmits<{
  close: []
  confirm: [limites: Partial<LimitesEmpresa>]
}>()

const CANAIS: Campo[] = ['maxCanaisWhatsapp', 'maxCanaisInstagram', 'maxCanaisWebchat']
const OUTROS: Campo[] = ['maxAgentes', 'maxProfissionais', 'maxClientes', 'maxFunis', 'maxMacros', 'maxWebhooksEntrada', 'maxWebhooksSaida']

const form = reactive<Record<Campo, number | null>>({
  maxCanaisWhatsapp: 1, maxCanaisInstagram: 0, maxCanaisWebchat: 0,
  maxAgentes: 1, maxProfissionais: 20, maxClientes: 100000, maxFunis: null,
  maxMacros: 5, maxWebhooksEntrada: 5, maxWebhooksSaida: 5,
})
// Foto do formulário depois de carregar o uso: salvar manda só a diferença.
const aoAbrir = ref<Record<Campo, number | null> | null>(null)
const pronto = ref(false)

const porTipo = computed(() => props.canaisWhatsappAtual !== null && props.canaisWhatsappAtual !== undefined)
const instancias = ref<Instancia[]>([])
const loadingInstancias = ref(false)
const uso = ref<{ assistentes: number; webhooks: number; webhooksSaida: number; profissionais: number; clientes: number; macros: number; funis: number; webchats: number } | null>(null)
const idExpandido = ref<string | null>(null)
const idCopiado = ref<string | null>(null)
const acaoConfirmacao = ref<{ tipo: 'desconectar' | 'excluir'; instancia: Instancia } | null>(null)
const processandoAcao = ref(false)
const abaAtiva = ref<'instancias' | 'limites'>('instancias')

let toast: Awaited<ReturnType<typeof useToastSafe>> | null = null

watch(() => props.show, async (open) => {
  if (!open) {
    instancias.value = []
    uso.value = null
    idExpandido.value = null
    idCopiado.value = null
    acaoConfirmacao.value = null
    pronto.value = false
    aoAbrir.value = null
    return
  }
  abaAtiva.value = 'instancias'
  pronto.value = false
  form.maxAgentes = props.agentesAtual || 1
  form.maxWebhooksEntrada = props.webhooksAtual ?? 5
  form.maxWebhooksSaida = props.webhooksSaidaAtual ?? 5
  form.maxProfissionais = props.profissionaisAtual ?? 20
  form.maxClientes = props.clientesAtual ?? 100000
  form.maxMacros = props.macrosAtual ?? 5
  form.maxFunis = props.funisAtual ?? null
  form.maxCanaisWhatsapp = props.canaisWhatsappAtual ?? (props.valorAtual || 1)
  form.maxCanaisInstagram = props.canaisInstagramAtual ?? 0
  form.maxCanaisWebchat = props.canaisWebchatAtual ?? 0
  toast = await useToastSafe()
  await Promise.all([carregarInstancias(), carregarUso()])
  // Conta antiga: Instagram e site partem do que já está em uso, para não
  // travar quem já tem canal caso o admin mude só o WhatsApp.
  if (!porTipo.value) {
    form.maxCanaisInstagram = usoInstagram.value
    form.maxCanaisWebchat = uso.value?.webchats ?? 0
  }
  aoAbrir.value = { ...form }
  pronto.value = true
})

async function carregarUso() {
  if (!props.clienteId) return
  try {
    const resp = await $fetch<{ success: boolean; data?: Record<string, number> }>('/api/admin/empresa-uso', {
      query: { empresaId: props.clienteId },
      headers: await useAdminAuthHeaders(),
    })
    const d = resp.success ? resp.data : null
    uso.value = d
      ? {
          assistentes: d.assistentes ?? 0,
          webhooks: d.webhooks ?? 0,
          webhooksSaida: d.webhooksSaida ?? 0,
          profissionais: d.profissionais ?? 0,
          clientes: d.clientes ?? 0,
          macros: d.macros ?? 0,
          funis: d.funis ?? 0,
          webchats: d.webchats ?? 0,
        }
      : null
  } catch {
    uso.value = null
  }
}

async function carregarInstancias() {
  if (!props.clienteId) return
  loadingInstancias.value = true
  try {
    const resp = await $fetch<{ success: boolean; data?: Instancia[]; error?: string }>('/api/admin/instancias', {
      query: { empresaId: props.clienteId },
      headers: await useAdminAuthHeaders(),
    })
    instancias.value = resp.success && resp.data ? resp.data.filter(i => i.status !== 'deleted') : []
  } catch {
    instancias.value = []
  } finally {
    loadingInstancias.value = false
  }
}

// ── Canais conectados ──────────────────────────────────────────────────────
const statusMap: Record<string, { label: string; dot: string; badge: string }> = {
  connected:    { label: 'Conectado',    dot: 'bg-emerald-500',             badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  connecting:   { label: 'Conectando',   dot: 'bg-amber-400 animate-pulse', badge: 'bg-amber-50 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400' },
  disconnected: { label: 'Desconectado', dot: 'bg-slate-400',               badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400' },
  deleted:      { label: 'Excluída',     dot: 'bg-red-400',                 badge: 'bg-red-50 text-red-700 dark:bg-red-500/15 dark:text-red-400' },
  ativo:        { label: 'Ativo',        dot: 'bg-emerald-500',             badge: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400' },
  inativo:      { label: 'Inativo',      dot: 'bg-slate-400',               badge: 'bg-slate-100 text-slate-600 dark:bg-slate-700/50 dark:text-slate-400' },
}
function getStatus(s: string) {
  return statusMap[s] ?? statusMap.disconnected!
}
const ligado = (s: string) => s === 'connected' || s === 'ativo'

type Provider = 'uazapi' | 'meta' | 'instagram'
const providerMap: Record<Provider, { label: string; icon: string; avatar: string }> = {
  uazapi:    { label: 'UAzAPI',      icon: 'fa-brands fa-whatsapp',  avatar: 'bg-emerald-500' },
  meta:      { label: 'API Oficial', icon: 'fa-brands fa-meta',      avatar: 'bg-blue-500' },
  instagram: { label: 'Instagram',   icon: 'fa-brands fa-instagram', avatar: 'bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600' },
}
function getProvider(p: Provider) {
  return providerMap[p] ?? providerMap.uazapi
}

// WhatsApp = número nativo + API Oficial, como o app conta.
const listaWhatsapp = computed(() => instancias.value.filter(i => i.provider !== 'instagram'))
const listaInstagram = computed(() => instancias.value.filter(i => i.provider === 'instagram'))
const usoWhatsapp = computed(() => listaWhatsapp.value.length)
const usoInstagram = computed(() => listaInstagram.value.length)
const totalCanais = computed(() => instancias.value.length + (uso.value?.webchats ?? 0))

// Limite salvo hoje, para o cabeçalho e os grupos da aba Canais.
const limiteSalvo = computed(() => ({
  whatsapp: props.canaisWhatsappAtual ?? (props.valorAtual || 1),
  instagram: porTipo.value ? (props.canaisInstagramAtual ?? 0) : null,
  site: porTipo.value ? (props.canaisWebchatAtual ?? 0) : null,
}))
const GRUPOS_CANAL = computed(() => [
  { id: 'whatsapp', titulo: 'WhatsApp', icon: 'fa-brands fa-whatsapp text-emerald-500', lista: listaWhatsapp.value, limite: limiteSalvo.value.whatsapp, vazio: 'Nenhum número conectado' },
  { id: 'instagram', titulo: 'Instagram', icon: 'fa-brands fa-instagram text-pink-500', lista: listaInstagram.value, limite: limiteSalvo.value.instagram, vazio: 'Nenhuma conta conectada' },
])

function toggleId(id: string) {
  idExpandido.value = idExpandido.value === id ? null : id
}
async function copiarId(id: string) {
  try {
    await navigator.clipboard.writeText(id)
    idCopiado.value = id
    setTimeout(() => { if (idCopiado.value === id) idCopiado.value = null }, 2000)
  } catch {}
}

function abrirConfirmacao(tipo: 'desconectar' | 'excluir', instancia: Instancia) {
  acaoConfirmacao.value = { tipo, instancia }
}

async function executarAcao() {
  if (!acaoConfirmacao.value) return
  const { tipo, instancia } = acaoConfirmacao.value
  processandoAcao.value = true
  try {
    if (tipo === 'desconectar') {
      const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/desconectar-instancia', {
        method: 'POST',
        body: { instanciaId: instancia.id },
        headers: await useAdminAuthHeaders(),
      })
      if (resp.success) {
        const i = instancias.value.find(x => x.id === instancia.id)
        if (i) i.status = 'disconnected'
        toast?.success('Instância desconectada com sucesso')
      } else {
        toast?.error(resp.error || 'Falha ao desconectar')
      }
    } else {
      const resp = await $fetch<{ success: boolean; error?: string }>('/api/admin/excluir-instancia', {
        method: 'POST',
        body: { instanciaId: instancia.id },
        headers: await useAdminAuthHeaders(),
      })
      if (resp.success) {
        instancias.value = instancias.value.filter(x => x.id !== instancia.id)
        toast?.success('Instância removida')
      } else {
        toast?.error(resp.error || 'Falha ao excluir')
      }
    }
  } catch {
    toast?.error('Erro inesperado ao executar ação')
  } finally {
    processandoAcao.value = false
    acaoConfirmacao.value = null
  }
}

// ── Limites ────────────────────────────────────────────────────────────────
interface DefCampo { key: Campo; label: string; icon: string; min: number; max: number; ajuda: string; emUso: number | null }
const numero = new Intl.NumberFormat('pt-BR')

const GRUPOS_LIMITE = computed<{ titulo: string; campos: DefCampo[] }[]>(() => [
  {
    titulo: 'Canais',
    campos: [
      { key: 'maxCanaisWhatsapp', label: 'WhatsApp', icon: 'fa-brands fa-whatsapp text-emerald-500', min: 0, max: 20, ajuda: 'Nativo e API Oficial somados', emUso: loadingInstancias.value ? null : usoWhatsapp.value },
      { key: 'maxCanaisInstagram', label: 'Instagram', icon: 'fa-brands fa-instagram text-pink-500', min: 0, max: 5, ajuda: '0 = não inclui', emUso: loadingInstancias.value ? null : usoInstagram.value },
      { key: 'maxCanaisWebchat', label: 'Chat do site', icon: 'fa-solid fa-comment-dots text-sky-500', min: 0, max: 5, ajuda: '0 = não inclui', emUso: uso.value?.webchats ?? null },
    ],
  },
  {
    titulo: 'Equipe e IA',
    campos: [
      { key: 'maxAgentes', label: 'Assistentes de IA', icon: 'fa-solid fa-robot text-purple-500', min: 1, max: 50, ajuda: 'Cada canal precisa de um assistente', emUso: uso.value?.assistentes ?? null },
      { key: 'maxProfissionais', label: 'Atendentes/profissionais', icon: 'fa-solid fa-user-tie text-teal-500', min: 1, max: 500, ajuda: 'Conta só os ativos', emUso: uso.value?.profissionais ?? null },
    ],
  },
  {
    titulo: 'CRM',
    campos: [
      { key: 'maxClientes', label: 'Contatos', icon: 'fa-solid fa-users text-blue-500', min: 1, max: 1_000_000, ajuda: 'Cadastro manual e importação', emUso: uso.value?.clientes ?? null },
      { key: 'maxFunis', label: 'Funis de CRM', icon: 'fa-solid fa-table-columns text-purple-500', min: 1, max: 500, ajuda: props.funisAtual == null ? 'Funis que pode criar, além do Geral. Vazio = sem limite' : 'Funis que pode criar, além do Geral', emUso: uso.value?.funis ?? null },
      { key: 'maxMacros', label: 'Macros', icon: 'fa-solid fa-bolt text-amber-500', min: 0, max: 100, ajuda: 'Ativas e inativas', emUso: uso.value?.macros ?? null },
    ],
  },
  {
    titulo: 'Integrações',
    campos: [
      { key: 'maxWebhooksEntrada', label: 'Webhooks de entrada', icon: 'fa-solid fa-arrow-right-to-bracket text-amber-500', min: 0, max: 100, ajuda: 'Que a empresa pode criar', emUso: uso.value?.webhooks ?? null },
      { key: 'maxWebhooksSaida', label: 'Webhooks de saída', icon: 'fa-solid fa-arrow-up-right-from-square text-sky-500', min: 0, max: 100, ajuda: 'Destinos que a empresa pode notificar', emUso: uso.value?.webhooksSaida ?? null },
    ],
  },
])
const TODOS_CAMPOS = computed(() => GRUPOS_LIMITE.value.flatMap(g => g.campos))

function definir(key: Campo, e: Event) {
  const texto = (e.target as HTMLInputElement).value.trim()
  form[key] = texto === '' ? null : Number(texto)
}

// Funis vazio só vale quando a conta já não tem limite; os outros são obrigatórios.
function invalido(c: DefCampo) {
  const v = form[c.key]
  if (v === null) return !(c.key === 'maxFunis' && props.funisAtual == null)
  return !Number.isInteger(v) || v < c.min || v > c.max
}
const camposInvalidos = computed(() => TODOS_CAMPOS.value.filter(invalido))
const abaixoDoUso = (c: DefCampo) => {
  const v = form[c.key]
  return c.emUso !== null && v !== null && Number.isFinite(v) && v < c.emUso
}
const camposAbaixo = computed(() => TODOS_CAMPOS.value.filter(abaixoDoUso))

const mudou = (c: Campo) => form[c] !== aoAbrir.value?.[c]
const canaisMudaram = computed(() => pronto.value && CANAIS.some(mudou))
const algoMudou = computed(() => pronto.value && [...CANAIS, ...OUTROS].some(mudou))

function enviar() {
  if (!pronto.value || camposInvalidos.value.length) return
  const saida: Partial<LimitesEmpresa> = {}
  // Canal mudou: vão os três, e a conta passa a ter limite por tipo.
  if (canaisMudaram.value) for (const c of CANAIS) saida[c] = form[c] as number
  for (const c of OUTROS) if (mudou(c) && form[c] !== null) saida[c] = form[c] as number
  if (!Object.keys(saida).length) {
    emit('close')
    return
  }
  emit('confirm', saida)
}

const classeCampo = 'w-24 shrink-0 rounded-md border bg-white px-2 py-1.5 text-center text-[13px] font-medium tabular-nums text-slate-900 placeholder:text-[11px] placeholder:font-normal placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:bg-slate-900 dark:text-white'
</script>

<template>
  <BaseModal :show="show" title="Limites e canais" max-width="max-w-3xl" @close="$emit('close')">

    <!-- Cabeçalho do cliente: uso por tipo de canal -->
    <div class="flex items-center gap-3 pb-4 mb-4 border-b border-slate-200 dark:border-slate-800">
      <div class="w-10 h-10 rounded-full bg-purple-600 flex items-center justify-center shrink-0 shadow">
        <span class="text-white font-medium text-sm">{{ clienteNome.charAt(0).toUpperCase() }}</span>
      </div>
      <div class="min-w-0">
        <p class="font-medium text-slate-900 dark:text-white truncate">{{ clienteNome }}</p>
        <p class="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
          {{ usoWhatsapp }} de {{ limiteSalvo.whatsapp }} WhatsApp
          · {{ usoInstagram }}<template v-if="limiteSalvo.instagram !== null"> de {{ limiteSalvo.instagram }}</template> Instagram
          <template v-if="uso"> · {{ uso.webchats }}<template v-if="limiteSalvo.site !== null"> de {{ limiteSalvo.site }}</template> site</template>
          <span v-if="!porTipo" class="text-slate-400 dark:text-slate-500"> · sem limite por tipo</span>
        </p>
      </div>
    </div>

    <!-- Abas -->
    <div class="flex items-center gap-1 p-1 mb-4 bg-slate-100 dark:bg-slate-800/60 rounded-lg" role="tablist">
      <button
        v-for="t in ([
          { id: 'instancias', label: 'Canais', icon: 'fa-tower-broadcast' },
          { id: 'limites', label: 'Limites', icon: 'fa-sliders' },
        ] as const)"
        :key="t.id"
        type="button"
        role="tab"
        :aria-selected="abaAtiva === t.id"
        class="flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors flex items-center justify-center gap-2"
        :class="abaAtiva === t.id
          ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
        @click="abaAtiva = t.id"
      >
        <i :class="['fa-solid', t.icon, 'text-purple-500']" aria-hidden="true" />
        {{ t.label }}
        <span
          v-if="t.id === 'instancias'"
          class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-medium tabular-nums"
          :class="abaAtiva === t.id ? 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-400'"
        >{{ totalCanais }}</span>
        <i v-if="t.id === 'limites' && camposAbaixo.length" class="fa-solid fa-triangle-exclamation text-amber-500 text-[10px]" aria-hidden="true" />
      </button>
    </div>

    <!-- Canais conectados, por tipo -->
    <section v-show="abaAtiva === 'instancias'" class="space-y-5">
      <div class="flex items-center justify-end -mb-2">
        <button
          type="button"
          :disabled="loadingInstancias"
          class="text-xs text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors flex items-center gap-1"
          title="Recarregar"
          @click="carregarInstancias"
        >
          <i class="fa-solid fa-arrows-rotate text-[10px]" :class="{ 'animate-spin': loadingInstancias }" aria-hidden="true" />
          Recarregar
        </button>
      </div>

      <div v-if="loadingInstancias" class="py-8 flex items-center justify-center gap-3 text-slate-400 dark:text-slate-600">
        <i class="fa-solid fa-circle-notch animate-spin" aria-hidden="true" />
        <span class="text-sm">Buscando canais…</span>
      </div>

      <template v-else>
        <div v-for="g in GRUPOS_CANAL" :key="g.id">
          <div class="flex items-center justify-between mb-2">
            <h3 class="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <i :class="[g.icon, 'text-xs']" aria-hidden="true" />
              {{ g.titulo }}
            </h3>
            <span class="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
              {{ g.lista.length }}<template v-if="g.limite !== null"> de {{ g.limite }}</template><template v-else> · sem limite</template>
            </span>
          </div>

          <p v-if="!g.lista.length" class="rounded-md border border-dashed border-slate-200 dark:border-slate-800 px-3 py-3 text-xs text-slate-400 dark:text-slate-500">
            {{ g.vazio }}
          </p>

          <ul v-else class="divide-y divide-slate-100 dark:divide-slate-800 rounded-md border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <li v-for="inst in g.lista" :key="inst.id" class="flex items-center gap-3 px-3 py-2.5">
              <div
                class="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
                :class="ligado(inst.status) ? getProvider(inst.provider).avatar : 'bg-slate-300 dark:bg-slate-700'"
              >
                <i :class="[getProvider(inst.provider).icon, 'text-white text-base']" aria-hidden="true" />
              </div>

              <div class="min-w-0 flex-1">
                <div class="flex items-center gap-1.5 flex-wrap">
                  <span class="text-sm font-medium text-slate-900 dark:text-white truncate max-w-[220px]">{{ inst.nome_instancia }}</span>
                  <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium" :class="getStatus(inst.status).badge">
                    <span class="w-1.5 h-1.5 rounded-full" :class="getStatus(inst.status).dot" aria-hidden="true" />
                    {{ getStatus(inst.status).label }}
                  </span>
                  <span v-if="inst.provider !== 'instagram'" class="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                    {{ getProvider(inst.provider).label }}
                  </span>
                </div>
                <div class="mt-0.5 flex items-center gap-3 flex-wrap text-xs text-slate-500 dark:text-slate-400">
                  <span v-if="inst.provider === 'instagram'" :class="inst.username ? '' : 'italic'">{{ inst.username ? `@${inst.username}` : 'Perfil não identificado' }}</span>
                  <span v-else class="tabular-nums" :class="inst.phone ? '' : 'italic'">{{ inst.phone || 'Número não disponível' }}</span>
                  <button
                    type="button"
                    class="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400 dark:text-slate-500 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                    @click="toggleId(inst.id)"
                  >
                    <i class="fa-solid fa-fingerprint text-[10px]" aria-hidden="true" />
                    <span>{{ idExpandido === inst.id ? inst.id : inst.id.slice(0, 8) + '…' }}</span>
                    <span
                      v-if="idExpandido === inst.id"
                      class="ml-0.5 p-0.5 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      :class="idCopiado === inst.id ? 'text-emerald-500' : 'text-slate-400'"
                      role="button"
                      :aria-label="idCopiado === inst.id ? 'Copiado' : 'Copiar ID'"
                      @click.stop="copiarId(inst.id)"
                    >
                      <i :class="['fa-solid text-[10px]', idCopiado === inst.id ? 'fa-check' : 'fa-copy']" aria-hidden="true" />
                    </span>
                  </button>
                </div>
              </div>

              <!-- Ações: só número nativo (UAzAPI) -->
              <div v-if="inst.provider === 'uazapi'" class="flex items-center gap-1 shrink-0">
                <button
                  v-if="inst.status === 'connected' || inst.status === 'disconnected'"
                  type="button"
                  class="w-8 h-8 flex items-center justify-center rounded transition-colors"
                  :class="inst.status === 'connected'
                    ? 'hover:bg-amber-50 dark:hover:bg-amber-500/10 text-amber-500 dark:text-amber-400'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 dark:text-slate-600'"
                  :title="inst.status === 'connected' ? 'Desconectar WhatsApp' : 'Forçar desconexão (status pode estar dessincronizado)'"
                  aria-label="Desconectar instância"
                  @click="abrirConfirmacao('desconectar', inst)"
                >
                  <i class="fa-solid fa-power-off text-sm" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  class="w-8 h-8 flex items-center justify-center rounded hover:bg-red-50 dark:hover:bg-red-500/10 text-red-500 dark:text-red-400 transition-colors"
                  title="Remover instância"
                  aria-label="Remover instância"
                  @click="abrirConfirmacao('excluir', inst)"
                >
                  <i class="fa-solid fa-trash text-sm" aria-hidden="true" />
                </button>
              </div>
            </li>
          </ul>
        </div>

        <!-- Chat do site não vem na lista de canais: só o uso -->
        <div class="flex items-center justify-between rounded-md border border-slate-200 dark:border-slate-800 px-3 py-2.5">
          <span class="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <i class="fa-solid fa-comment-dots text-sky-500 text-xs" aria-hidden="true" />
            Chat do site
          </span>
          <span class="text-[11px] tabular-nums text-slate-500 dark:text-slate-400">
            <template v-if="uso">{{ uso.webchats }}<template v-if="limiteSalvo.site !== null"> de {{ limiteSalvo.site }}</template><template v-else> · conta junto com o WhatsApp</template></template>
            <template v-else>—</template>
            · configurado no app
          </span>
        </div>
      </template>
    </section>

    <!-- Limites -->
    <section v-show="abaAtiva === 'limites'">
      <form class="space-y-5" @submit.prevent="enviar">
        <div v-for="g in GRUPOS_LIMITE" :key="g.titulo">
          <p class="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{{ g.titulo }}</p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div
              v-for="c in g.campos"
              :key="c.key"
              class="flex items-center justify-between gap-3 rounded-md border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/40 px-3 py-2.5"
            >
              <div class="min-w-0 flex-1">
                <label :for="`limite-${c.key}`" class="text-[13px] font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                  <i :class="[c.icon, 'text-[11px]']" aria-hidden="true" />
                  {{ c.label }}
                </label>
                <p class="text-[11px] leading-snug text-slate-400 dark:text-slate-500 mt-0.5">
                  <template v-if="c.emUso !== null">Em uso: <span class="tabular-nums font-medium text-slate-600 dark:text-slate-400">{{ numero.format(c.emUso) }}</span> · </template>{{ c.ajuda }} ({{ numero.format(c.min) }} – {{ numero.format(c.max) }})
                </p>
              </div>
              <input
                :id="`limite-${c.key}`"
                :value="form[c.key] ?? ''"
                type="number"
                inputmode="numeric"
                :min="c.min"
                :max="c.max"
                step="1"
                :placeholder="c.key === 'maxFunis' ? 'Sem limite' : undefined"
                :aria-invalid="invalido(c)"
                :class="[classeCampo, invalido(c)
                  ? 'border-rose-400 dark:border-rose-500/60'
                  : abaixoDoUso(c) ? 'border-amber-400 dark:border-amber-500' : 'border-slate-200 dark:border-slate-700']"
                @input="definir(c.key, $event)"
              />
            </div>
          </div>

          <p v-if="g.titulo === 'Canais' && !porTipo" class="mt-2 text-[11px] leading-snug text-slate-500 dark:text-slate-400 flex items-start gap-1.5">
            <i class="fa-solid fa-circle-info mt-0.5" aria-hidden="true" />
            <span>
              Hoje esta conta não tem limite por tipo: o Instagram não tem limite e o chat do site conta junto com o WhatsApp.
              <strong v-if="canaisMudaram" class="font-medium text-purple-700 dark:text-purple-300">Ao salvar, os três passam a valer separados.</strong>
              <template v-else>Se você mudar um dos três, os três passam a valer separados.</template>
            </span>
          </p>
          <p v-if="g.titulo === 'Canais' && porTipo" class="mt-2 text-[11px] leading-snug text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
            <i class="fa-solid fa-circle-info mt-0.5" aria-hidden="true" />
            <span>Cada tipo tem limite próprio. Baixar o limite não desconecta nenhum canal; só impede conectar um novo.</span>
          </p>
          <p v-if="g.titulo === 'CRM'" class="mt-2 text-[11px] leading-snug text-slate-400 dark:text-slate-500 flex items-start gap-1.5">
            <i class="fa-solid fa-comment-dots mt-0.5" aria-hidden="true" />
            <span>O limite de contatos vale só para cadastro manual e importação. Contato que chega sozinho por mensagem nunca é bloqueado.</span>
          </p>
        </div>

        <p v-if="camposAbaixo.length" class="text-[11px] leading-snug text-amber-700 dark:text-amber-400 flex items-start gap-1.5">
          <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
          <span>
            Abaixo do que já está em uso: {{ camposAbaixo.map(c => `${c.label} (${numero.format(c.emUso ?? 0)})`).join(', ') }}.
            Nada é removido nem desconectado; a empresa só não consegue criar novos até ficar dentro do limite.
          </span>
        </p>
        <p v-if="pronto && camposInvalidos.length" role="alert" class="text-[11px] text-rose-600 dark:text-rose-400">
          Confira os campos em vermelho: {{ camposInvalidos.map(c => c.label).join(', ') }}.
        </p>

        <div class="flex gap-2 pt-1">
          <button
            type="button"
            class="flex-1 px-4 py-2.5 rounded font-normal text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            @click="$emit('close')"
          >
            Cancelar
          </button>
          <button
            type="submit"
            :disabled="!pronto || camposInvalidos.length > 0"
            class="flex-1 px-4 py-2.5 rounded font-normal text-sm bg-purple-600 hover:bg-purple-700 text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {{ !pronto ? 'Carregando…' : algoMudou ? 'Salvar limites' : 'Fechar sem mudanças' }}
          </button>
        </div>
      </form>
    </section>

    <!-- Confirmação de desconectar / remover -->
    <Teleport to="body">
      <div
        v-if="acaoConfirmacao"
        class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
      >
        <div class="w-full max-w-sm bg-white dark:bg-slate-900 rounded-md shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div
            class="px-5 py-4 flex items-center gap-3"
            :class="acaoConfirmacao.tipo === 'desconectar'
              ? 'bg-amber-50 dark:bg-amber-500/10 border-b border-amber-200 dark:border-amber-500/20'
              : 'bg-red-50 dark:bg-red-500/10 border-b border-red-200 dark:border-red-500/20'"
          >
            <div
              class="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              :class="acaoConfirmacao.tipo === 'desconectar' ? 'bg-amber-100 dark:bg-amber-500/20' : 'bg-red-100 dark:bg-red-500/20'"
            >
              <i
                class="fa-solid text-sm"
                :class="acaoConfirmacao.tipo === 'desconectar'
                  ? 'fa-power-off text-amber-600 dark:text-amber-400'
                  : 'fa-trash text-red-600 dark:text-red-400'"
                aria-hidden="true"
              />
            </div>
            <h3 class="font-semibold text-slate-900 dark:text-white text-base">
              {{ acaoConfirmacao.tipo === 'desconectar' ? 'Desconectar canal' : 'Remover canal' }}
            </h3>
          </div>

          <div class="px-5 py-4 space-y-1">
            <p class="text-sm font-medium text-slate-800 dark:text-slate-200">
              {{ acaoConfirmacao.instancia.nome_instancia }}
            </p>
            <p v-if="acaoConfirmacao.instancia.phone" class="text-sm text-slate-500 dark:text-slate-400 tabular-nums">
              {{ acaoConfirmacao.instancia.phone }}
            </p>
            <p class="text-sm text-slate-500 dark:text-slate-400 pt-1">
              <template v-if="acaoConfirmacao.tipo === 'desconectar'">
                O número será desconectado do WhatsApp. Um novo QR Code será necessário para reconectar.
              </template>
              <template v-else>
                O canal será <strong class="font-medium text-red-600 dark:text-red-400">removido permanentemente</strong> do sistema. O WhatsApp será desconectado e o histórico mantido.
              </template>
            </p>
          </div>

          <div class="px-5 py-3 flex gap-2 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/50">
            <button
              type="button"
              :disabled="processandoAcao"
              class="flex-1 px-4 py-2 rounded text-sm font-normal border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 transition-colors"
              @click="acaoConfirmacao = null"
            >
              Cancelar
            </button>
            <button
              type="button"
              :disabled="processandoAcao"
              class="flex-1 px-4 py-2 rounded text-sm font-normal text-white disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              :class="acaoConfirmacao.tipo === 'desconectar' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-red-600 hover:bg-red-700'"
              @click="executarAcao"
            >
              <i v-if="processandoAcao" class="fa-solid fa-circle-notch animate-spin text-xs" aria-hidden="true" />
              {{ processandoAcao ? 'Aguarde…' : 'Confirmar' }}
            </button>
          </div>
        </div>
      </div>
    </Teleport>

  </BaseModal>
</template>
