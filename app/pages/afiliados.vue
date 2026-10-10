<script setup lang="ts">
import { ref, watch } from 'vue'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: 'dashboard',
})

/**
 * Programa de afiliados (superAdmin). Três abas, com a aba na URL (?aba=):
 *   - Afiliados: números do programa e a lista (rede de conexões, bloquear,
 *     copiar link, remover afiliação);
 *   - Saques: pedidos de PIX para marcar como pago ou recusar;
 *   - Regras: percentuais e metas por conexão, mínimo e prazo do saque.
 * A barra de cima (abas + link fixo de cadastro + atualizar) vale para as três.
 */
type Aba = 'afiliados' | 'saques' | 'regras'
const ABAS: Aba[] = ['afiliados', 'saques', 'regras']

const route = useRoute()
const router = useRouter()
const abaDaUrl = String(route.query.aba ?? '') as Aba
const abaAtiva = ref<Aba>(ABAS.includes(abaDaUrl) ? abaDaUrl : 'afiliados')
watch(abaAtiva, (aba) => {
  router.replace({ query: { ...route.query, aba: aba === 'afiliados' ? undefined : aba } })
})

// Saques e Regras só montam na primeira visita: a lista já traz quantos
// saques estão abertos para o número da aba.
const visitadas = ref<Set<Aba>>(new Set([abaAtiva.value]))
watch(abaAtiva, (aba) => { visitadas.value.add(aba) })

// Mesmo estado do número ao lado de "Afiliados" no menu lateral (AppSidebar).
const saquesAbertos = useState<number>('afiliados_saques_abertos', () => 0)
const atualizando = ref(false)

const listaRef = ref<{ carregar: () => Promise<void> } | null>(null)
const saquesRef = ref<{ carregar: () => Promise<void> } | null>(null)

// Regras ficam de fora de propósito: recarregar apagaria uma edição não salva.
async function atualizarTudo() {
  if (atualizando.value) return
  atualizando.value = true
  try {
    await Promise.all([listaRef.value?.carregar(), saquesRef.value?.carregar()])
  } finally {
    atualizando.value = false
  }
}

// ───────── Link fixo de cadastro ─────────
const toast = useToast()
const LINK_CADASTRO = 'https://painel.agzap.com.br/afiliado/cadastro'
const linkExibido = LINK_CADASTRO.replace(/^https?:\/\//, '')
const copiado = ref(false)

async function copiarLink() {
  try {
    await navigator.clipboard.writeText(LINK_CADASTRO)
    copiado.value = true
    toast.success('Link de cadastro copiado')
    setTimeout(() => { copiado.value = false }, 2000)
  } catch {
    toast.error('Não foi possível copiar')
  }
}

const abas: Array<{ valor: Aba; rotulo: string; icone: string }> = [
  { valor: 'afiliados', rotulo: 'Afiliados', icone: 'fa-people-arrows text-purple-500' },
  { valor: 'saques', rotulo: 'Saques', icone: 'fa-money-bill-transfer text-emerald-500' },
  { valor: 'regras', rotulo: 'Regras', icone: 'fa-sliders text-blue-500' },
]

const botaoSecundario = 'inline-flex items-center justify-center gap-2 h-10 rounded-md text-sm font-normal border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-colors shrink-0'
</script>

<template>
  <div class="p-4 sm:p-6">
    <div class="w-full space-y-4">

      <!-- Barra de cima: abas + link de cadastro + atualizar -->
      <div class="flex flex-col xl:flex-row xl:items-center gap-3">
        <div class="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-lg w-full xl:w-auto shrink-0" role="tablist" aria-label="Seções do programa de afiliados">
          <button
            v-for="a in abas"
            :key="a.valor"
            type="button"
            role="tab"
            :aria-selected="abaAtiva === a.valor"
            class="flex-1 xl:flex-initial px-3 sm:px-4 py-2 rounded-md text-sm font-normal transition-colors flex items-center justify-center gap-2 min-w-0"
            :class="abaAtiva === a.valor
              ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
              : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'"
            @click="abaAtiva = a.valor"
          >
            <i :class="['fa-solid hidden sm:inline', a.icone]" aria-hidden="true" />
            <span class="truncate">{{ a.rotulo }}</span>
            <span
              v-if="a.valor === 'saques' && saquesAbertos > 0"
              class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full text-[10px] font-medium tabular-nums bg-red-500 text-white"
              :title="`${saquesAbertos} ${saquesAbertos === 1 ? 'saque aberto' : 'saques abertos'}`"
            >{{ saquesAbertos }}</span>
          </button>
        </div>

        <div class="flex items-center gap-2 min-w-0 xl:flex-1 xl:justify-end">
          <div
            class="flex-1 xl:flex-initial xl:w-[26rem] 2xl:w-[30rem] min-w-0 flex items-center gap-2 h-10 px-3 rounded-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
            title="Link fixo. Quem se cadastra por ele vira afiliado na hora e já recebe o próprio link de indicação."
          >
            <i class="fa-solid fa-link text-purple-500 dark:text-purple-400 text-xs shrink-0" aria-hidden="true" />
            <span class="hidden sm:inline text-xs text-slate-500 dark:text-slate-400 shrink-0">Cadastro de afiliados</span>
            <span class="hidden sm:inline text-slate-300 dark:text-slate-700 shrink-0" aria-hidden="true">|</span>
            <span class="min-w-0 truncate text-sm text-slate-800 dark:text-slate-200 select-all">{{ linkExibido }}</span>
          </div>
          <a
            :href="LINK_CADASTRO"
            target="_blank"
            rel="noopener"
            :class="[botaoSecundario, 'w-10 sm:w-auto sm:px-3.5']"
            aria-label="Abrir link de cadastro"
            title="Abrir link de cadastro"
          >
            <i class="fa-solid fa-arrow-up-right-from-square text-xs" aria-hidden="true" />
            <span class="hidden sm:inline">Abrir</span>
          </a>
          <button
            type="button"
            class="inline-flex items-center justify-center gap-2 h-10 px-3.5 rounded-md text-sm font-normal bg-purple-600 hover:bg-purple-700 text-white transition-colors shrink-0"
            @click="copiarLink"
          >
            <i class="fa-solid text-xs" :class="copiado ? 'fa-check' : 'fa-copy'" aria-hidden="true" />
            {{ copiado ? 'Copiado' : 'Copiar' }}
          </button>
          <button
            type="button"
            :disabled="atualizando"
            :class="[botaoSecundario, 'w-10 disabled:opacity-60']"
            aria-label="Atualizar"
            title="Atualizar"
            @click="atualizarTudo"
          >
            <i class="fa-solid fa-arrows-rotate text-sm" :class="{ 'animate-spin': atualizando }" aria-hidden="true" />
          </button>
        </div>
      </div>

      <!-- ══════════════ ABA AFILIADOS ══════════════ -->
      <div v-show="abaAtiva === 'afiliados'">
        <AdminAfiliadosLista
          ref="listaRef"
          @totais="saquesAbertos = $event.saques_abertos"
          @abrir-saques="abaAtiva = 'saques'"
        />
      </div>

      <!-- ══════════════ ABA SAQUES ══════════════ -->
      <div v-if="visitadas.has('saques')" v-show="abaAtiva === 'saques'">
        <AdminAfiliadosSaques
          ref="saquesRef"
          @contagem="saquesAbertos = $event"
          @alterado="listaRef?.carregar()"
        />
      </div>

      <!-- ══════════════ ABA REGRAS ══════════════ -->
      <div v-if="visitadas.has('regras')" v-show="abaAtiva === 'regras'">
        <AdminAfiliadosRegras />
      </div>

    </div>
  </div>
</template>
