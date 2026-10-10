<template>
  <Teleport to="body">
    <div v-if="exige" class="fixed inset-0 z-[500] flex items-center justify-center p-2 sm:p-4" role="dialog" aria-modal="true" aria-label="Termo do Afiliado">
      <!-- Fundo sem clique: o portal só é liberado depois do aceite -->
      <div class="absolute inset-0 bg-slate-900/75 backdrop-blur-sm" />

      <div class="relative bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl flex flex-col max-h-[96vh] overflow-hidden" @wheel.passive="encaminharRolagem">
        <!-- Cabeçalho -->
        <div class="flex-shrink-0 px-5 sm:px-7 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-xl bg-purple-600 flex items-center justify-center flex-shrink-0">
                <i class="fa-solid fa-file-contract text-white" aria-hidden="true" />
              </div>
              <div class="min-w-0">
                <h2 class="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">Termo do Afiliado da Agzap</h2>
                <p class="text-xs text-slate-500 dark:text-slate-400">Programa de Afiliados · versão {{ VERSAO_TERMO_AFILIADO }}</p>
              </div>
            </div>
            <button
              type="button"
              class="flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-normal text-slate-500 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              :disabled="enviando"
              @click="sair"
            >
              Sair
            </button>
          </div>
          <!-- Aviso de leitura (destaque) + progresso -->
          <div class="mt-4">
            <div
              v-if="!rolouAteFim"
              class="aviso-leitura flex items-center gap-3 rounded-xl border-2 border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/40 px-3.5 py-2.5"
            >
              <span class="flex-shrink-0 w-8 h-8 rounded-full bg-amber-400 text-white flex items-center justify-center">
                <i class="fa-solid fa-arrow-down animate-bounce text-sm" aria-hidden="true" />
              </span>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-amber-900 dark:text-amber-300">Role o texto até o fim para liberar a confirmação</p>
                <p class="text-xs text-amber-800/80 dark:text-amber-400/80">Use a roda do mouse, a barra roxa ao lado ou o botão "Role para baixo".</p>
              </div>
              <span class="flex-shrink-0 text-xs font-medium text-amber-900 dark:text-amber-300 tabular-nums">{{ progresso }}% lido</span>
            </div>
            <div v-else class="flex items-center gap-3 rounded-xl border-2 border-emerald-300 bg-emerald-50 dark:bg-emerald-500/10 dark:border-emerald-500/40 px-3.5 py-2.5">
              <span class="flex-shrink-0 w-8 h-8 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                <i class="fa-solid fa-check text-sm" aria-hidden="true" />
              </span>
              <p class="text-sm font-medium text-emerald-800 dark:text-emerald-300">Leitura concluída. Agora marque as opções abaixo e salve.</p>
            </div>
            <div class="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
              <div class="h-full rounded-full transition-all duration-200" :class="rolouAteFim ? 'bg-emerald-500' : 'bg-amber-400'" :style="{ width: `${progresso}%` }" />
            </div>
          </div>
        </div>

        <!-- Corpo rolável (com indicador "role para baixo") -->
        <div class="relative flex-1 min-h-0 flex flex-col">
          <div ref="corpoEl" tabindex="0" class="termos-scroll flex-1 overflow-y-auto overscroll-contain px-5 sm:px-7 py-5 space-y-6 focus:outline-none" @scroll.passive="aoRolar">
            <p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
              Leia o Termo do Afiliado até o fim. Ele rege a sua afiliação com a Agzap: o link, as comissões da Rede, o saldo e o saque por PIX, e o cuidado com os dados.
              O aceite fica registrado como prova.
            </p>

            <div class="space-y-6">
              <section v-for="cat in CATEGORIAS_TERMO_AFILIADO" :key="cat.id">
                <p :class="['text-[11px] font-medium uppercase tracking-wider mb-3 pb-1 border-b', cat.destaque ? 'text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-500/30' : 'text-slate-500 dark:text-slate-400 border-slate-100 dark:border-slate-800']">
                  {{ cat.titulo }}
                </p>
                <div class="space-y-4">
                  <div v-for="s in cat.secoes" :key="s.id">
                    <h3 class="text-sm font-medium text-slate-900 dark:text-white mb-1.5">{{ s.numero }}. {{ s.titulo }}</h3>
                    <div class="text-sm leading-relaxed text-slate-700 dark:text-slate-300 space-y-2" v-html="s.conteudo" />
                  </div>
                </div>
              </section>
              <div ref="fimTermosEl" class="text-xs text-slate-400 text-center py-2">— Fim do Termo do Afiliado —</div>
            </div>
          </div>
          <!-- Degradê + botão flutuante: deixa claro que há mais texto abaixo -->
          <div v-if="!rolouAteFim" class="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white dark:from-slate-900 to-transparent" />
          <button
            v-if="!rolouAteFim"
            type="button"
            class="absolute bottom-3 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-600 hover:bg-purple-700 text-white text-sm font-normal shadow-lg"
            @click="rolarMais"
          >
            Role para baixo
            <i class="fa-solid fa-chevron-down animate-bounce text-xs" aria-hidden="true" />
          </button>
        </div>

        <!-- Rodapé: confirmação -->
        <div class="flex-shrink-0 px-5 sm:px-7 py-4 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
          <p v-if="!rolouAteFim" class="flex items-center gap-2 text-xs font-normal text-amber-700 dark:text-amber-400">
            <i class="fa-solid fa-lock text-[11px]" aria-hidden="true" />
            As opções abaixo são liberadas depois que você ler o Termo até o fim.
          </p>
          <!-- Textos vindos do servidor: são os mesmos gravados como prova -->
          <label :class="['flex items-start gap-3', rolouAteFim ? 'cursor-pointer' : 'cursor-not-allowed opacity-50']">
            <input v-model="liTermos" type="checkbox" :disabled="!rolouAteFim" class="mt-0.5 w-4 h-4 accent-emerald-600 flex-shrink-0" />
            <span class="text-sm text-slate-700 dark:text-slate-300">{{ confirmacoes[0] }}</span>
          </label>
          <label :class="['flex items-start gap-3', rolouAteFim ? 'cursor-pointer' : 'cursor-not-allowed opacity-50']">
            <input v-model="aceitoTermos" type="checkbox" :disabled="!rolouAteFim" class="mt-0.5 w-4 h-4 accent-emerald-600 flex-shrink-0" />
            <span class="text-sm text-slate-700 dark:text-slate-300">{{ confirmacoes[1] }}</span>
          </label>

          <p v-if="erro" class="text-sm text-red-600 dark:text-red-400">{{ erro }}</p>

          <div class="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3 pt-1">
            <a href="/termos-afiliado" target="_blank" rel="noopener" class="text-xs font-normal text-purple-600 dark:text-purple-400 hover:underline">
              Abrir o Termo em outra aba
            </a>
            <button
              type="button"
              :disabled="!podeSalvar || enviando"
              class="px-5 py-2.5 rounded-lg text-sm font-normal text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 dark:disabled:bg-slate-700 disabled:cursor-not-allowed transition-colors"
              @click="salvar"
            >
              {{ enviando ? 'Registrando...' : 'Salvar e continuar' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
// Aceite do Termo do Afiliado (09/10/2026): mesmo modelo do Termo do Parceiro e
// da tela de aceite dos Termos do app — bloqueia o portal até ler até o fim e
// marcar "li" e "aceito"; a prova (IP, navegador, data/hora, texto exato) fica
// em afiliado_termos_aceites pelo /api/afiliado/termos-aceite. Reaparece a
// cada nova versão (VERSAO_TERMO_AFILIADO). O afiliado NUNCA vê o Termo do
// Parceiro: este modal só existe no layout do afiliado.
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  CATEGORIAS_TERMO_AFILIADO, VERSAO_TERMO_AFILIADO, textoCanonicoTermoAfiliado, textosConfirmacaoAfiliado,
} from '~/constants/termosAfiliado'
import { sairDaContaAfiliado } from '~/composables/useAfiliado'

const supabase = useSupabaseClient()

const exige = ref(false)
const confirmacoesServidor = ref<string[] | null>(null)
const confirmacoes = computed(() =>
  confirmacoesServidor.value && confirmacoesServidor.value.length === 2 ? confirmacoesServidor.value : textosConfirmacaoAfiliado(),
)

const corpoEl = ref<HTMLElement | null>(null)
const fimTermosEl = ref<HTMLElement | null>(null)
const progresso = ref(0)
const rolouAteFim = ref(false)
const liTermos = ref(false)
const aceitoTermos = ref(false)
const enviando = ref(false)
const erro = ref<string | null>(null)
let abertoEm = 0
let observador: IntersectionObserver | null = null

const podeSalvar = computed(() => rolouAteFim.value && liTermos.value && aceitoTermos.value)

async function verificar() {
  try {
    const r = await $fetch<any>('/api/afiliado/termos-aceite', { headers: await useAdminAuthHeaders() })
    confirmacoesServidor.value = r?.confirmacoes || null
    exige.value = !!r?.exige
  } catch {
    // Sem cadastro de afiliado ou erro de rede: o middleware cuida do acesso.
  }
}

// Botão "Role para baixo": desce ~80% da altura visível do texto.
function rolarMais() {
  const el = corpoEl.value
  if (!el) return
  el.scrollBy({ top: Math.round(el.clientHeight * 0.8), behavior: 'smooth' })
}

function marcarFim() {
  rolouAteFim.value = true
  progresso.value = 100
  observador?.disconnect()
}

function aoRolar() {
  const el = corpoEl.value
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  progresso.value = max <= 0 ? 100 : Math.min(100, Math.round((el.scrollTop / max) * 100))
  // 2º jeito de detectar o fim (além do IntersectionObserver): posição da
  // rolagem a menos de 40px do fim, ou texto que nem precisa rolar.
  if (max <= 0 || el.scrollTop + el.clientHeight >= el.scrollHeight - 40) marcarFim()
}

// Roda do mouse em qualquer parte da janela (cabeçalho, rodapé) rola o texto.
function encaminharRolagem(e: WheelEvent) {
  const el = corpoEl.value
  if (!el || el.contains(e.target as Node)) return
  el.scrollBy({ top: e.deltaY })
}

function observarFim() {
  observador?.disconnect()
  if (!fimTermosEl.value || !corpoEl.value) return
  observador = new IntersectionObserver((entradas) => {
    if (entradas.some(e => e.isIntersecting)) marcarFim()
  }, { root: corpoEl.value, threshold: 0.1 })
  observador.observe(fimTermosEl.value)
}

watch(exige, async (v) => {
  if (!v) return
  abertoEm = Date.now()
  rolouAteFim.value = false
  liTermos.value = false
  aceitoTermos.value = false
  progresso.value = 0
  await nextTick()
  observarFim()
  aoRolar()
  // Foco no texto: setas, PageDown e espaço também rolam.
  corpoEl.value?.focus({ preventScroll: true })
})

async function salvar() {
  if (!podeSalvar.value || enviando.value) return
  enviando.value = true
  erro.value = null
  try {
    await $fetch('/api/afiliado/termos-aceite', {
      method: 'POST',
      headers: await useAdminAuthHeaders(),
      body: {
        versao: VERSAO_TERMO_AFILIADO,
        texto: textoCanonicoTermoAfiliado(),
        li_termos: liTermos.value,
        aceito_termos: aceitoTermos.value,
        rolou_ate_o_fim: rolouAteFim.value,
        tempo_leitura_seg: abertoEm ? Math.round((Date.now() - abertoEm) / 1000) : null,
      },
    })
    exige.value = false
    await navigateTo('/afiliado')
  } catch (e: any) {
    erro.value = e?.data?.statusMessage || e?.data?.message || e?.message || 'Não foi possível registrar o aceite. Tente de novo.'
  } finally {
    enviando.value = false
  }
}

// Sai só desta sessão (scope local): o mesmo login pode estar aberto no app.
async function sair() {
  await sairDaContaAfiliado(supabase)
  exige.value = false
  await navigateTo('/login', { replace: true })
}

onMounted(verificar)
onBeforeUnmount(() => observador?.disconnect())
</script>

<style scoped>
/* Aviso "role até o fim": brilho âmbar pulsando para chamar a atenção. */
.aviso-leitura {
  animation: aviso-pulsar 1.8s ease-in-out infinite;
}
@keyframes aviso-pulsar {
  0%, 100% { box-shadow: 0 0 0 0 rgba(251, 191, 36, 0.55); }
  50% { box-shadow: 0 0 0 6px rgba(251, 191, 36, 0); }
}

/* Barra de rolagem do texto bem visível (mais grossa e roxa). */
.termos-scroll {
  scrollbar-width: auto;
  scrollbar-color: #a855f7 #f3e8ff;
}
.termos-scroll::-webkit-scrollbar {
  width: 12px;
}
.termos-scroll::-webkit-scrollbar-track {
  background: #f3e8ff;
  border-radius: 999px;
}
.termos-scroll::-webkit-scrollbar-thumb {
  background: #a855f7;
  border-radius: 999px;
  border: 2px solid #f3e8ff;
}
</style>
