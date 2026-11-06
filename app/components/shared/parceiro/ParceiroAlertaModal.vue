<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { linkSuporteAgzap } from '~/composables/useParceiroLicencas'

/**
 * Alerta escrito pela Agzap. Aparece ao abrir o portal e só sai com "Li e
 * entendi": a confirmação de leitura é o registro de que o parceiro foi avisado.
 * Com mais de um alerta, um aparece depois do outro.
 */
interface AlertaParceiro {
  id: string
  empresa_nome: string | null
  mensagem: string
  criado_em: string
}

const alertas = ref<AlertaParceiro[]>([])
const atual = computed(() => alertas.value[0] ?? null)
const confirmando = ref(false)
const erro = ref<string | null>(null)

onMounted(async () => {
  try {
    const resp = await $fetch<{ success: boolean; data?: AlertaParceiro[] }>('/api/parceiro/alertas', {
      headers: await useAdminAuthHeaders(),
    })
    if (resp.success) alertas.value = resp.data ?? []
  } catch (e) {
    // Falha aqui não trava o portal: o alerta volta a aparecer no próximo acesso.
    console.warn('[parceiro:alertas]', e)
  }
})

function fmtDataHora(s: string) {
  const d = new Date(s)
  const data = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${data} às ${hora}`
}

const linkSuporte = computed(() => linkSuporteAgzap(atual.value?.empresa_nome
  ? `Olá! Recebi um alerta da Agzap sobre o cliente ${atual.value.empresa_nome}.`
  : 'Olá! Recebi um alerta da Agzap.'))

async function confirmar() {
  if (!atual.value || confirmando.value) return
  confirmando.value = true
  erro.value = null
  try {
    const resp = await $fetch<{ success: boolean; error?: string }>('/api/parceiro/alertas', {
      method: 'POST',
      body: { alertaId: atual.value.id },
      headers: await useAdminAuthHeaders(),
    })
    if (!resp.success) throw new Error(resp.error)
    alertas.value = alertas.value.slice(1)
  } catch (e: any) {
    erro.value = String(e?.data?.statusMessage || e?.message || 'Não foi possível confirmar a leitura. Tente de novo.')
  } finally {
    confirmando.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div v-if="atual" class="fixed inset-0 z-[400] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="alerta-agzap-titulo">
      <!-- Fundo sem clique: o alerta só sai com a confirmação de leitura -->
      <div class="absolute inset-0 bg-slate-900/75 backdrop-blur-sm" aria-hidden="true" />

      <div class="relative w-full max-w-2xl max-h-full overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl">
        <div class="flex items-center gap-3 px-5 sm:px-6 py-4 border-b border-slate-200 dark:border-slate-800">
          <span class="w-10 h-10 rounded-xl bg-red-100 dark:bg-red-500/15 flex items-center justify-center shrink-0">
            <i class="fa-solid fa-triangle-exclamation text-red-600 dark:text-red-400" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <h2 id="alerta-agzap-titulo" class="text-lg font-semibold text-slate-900 dark:text-white">Alerta da Agzap</h2>
            <p v-if="atual.empresa_nome" class="text-xs text-slate-500 dark:text-slate-400 truncate">Sobre o cliente {{ atual.empresa_nome }}</p>
          </div>
        </div>

        <div class="px-5 sm:px-6 py-5 space-y-4">
          <p class="text-xs text-slate-500 dark:text-slate-400 tabular-nums">{{ fmtDataHora(atual.criado_em) }}</p>
          <p class="text-sm text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-line">{{ atual.mensagem }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400">Sua confirmação de leitura fica registrada.</p>

          <p v-if="erro" class="text-xs text-red-600 dark:text-red-400 flex items-center gap-1.5">
            <i class="fa-solid fa-circle-exclamation text-[10px]" aria-hidden="true" />
            {{ erro }}
          </p>

          <div class="flex flex-col-reverse sm:flex-row gap-2 pt-1">
            <a
              :href="linkSuporte"
              target="_blank"
              rel="noopener noreferrer"
              class="flex-1 px-4 py-2.5 rounded font-semibold text-sm text-center border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
            >
              <i class="fa-brands fa-whatsapp mr-1.5" aria-hidden="true" />
              Falar com o suporte
            </a>
            <button
              type="button"
              @click="confirmar"
              :disabled="confirmando"
              class="flex-1 px-4 py-2.5 rounded font-semibold text-sm bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white transition-colors"
            >
              {{ confirmando ? 'Confirmando…' : 'Li e entendi' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
