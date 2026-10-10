<script setup lang="ts">
// Aceite do Termo do Parceiro (09/10/2026): mostra os aceites registrados
// (data e hora com segundos, IP, texto aceito) e o botão "Imprimir PDF", que
// abre /comprovante-termos-parceiro/:id — prova em disputa com o parceiro.
import { ref, watch } from 'vue'

const props = defineProps<{
  show: boolean
  parceiro: { id: string; nome: string; email?: string | null } | null
}>()
const emit = defineEmits<{ close: [] }>()

interface AceiteResumo {
  id: string
  versao_termos: string
  aceito_em: string
  ip: string | null
  nome_assinante: string
  email_assinante: string | null
  documento_parceiro: string | null
  hash_confere: boolean
}
interface Dados {
  aceites: AceiteResumo[]
  versao_vigente: string
  aceite_antigo: { versao: string; aceito_em: string } | null
}

const dados = ref<Dados | null>(null)
const carregando = ref(false)
const erro = ref(false)

const dataHoraBR = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

async function carregar() {
  if (!props.parceiro) return
  carregando.value = true
  erro.value = false
  dados.value = null
  try {
    const resp = await $fetch<{ success: boolean; data: Dados }>('/api/admin/parceiro-termos-aceite', {
      query: { parceiroId: props.parceiro.id },
      headers: await useAdminAuthHeaders(),
    })
    dados.value = resp.data
  } catch {
    erro.value = true
  } finally {
    carregando.value = false
  }
}

watch(() => [props.show, props.parceiro?.id], ([aberto]) => { if (aberto) void carregar() })

const aceitouVigente = (d: Dados) => d.aceites.some(a => a.versao_termos === d.versao_vigente)
</script>

<template>
  <BaseModal :show="show" :title="`Termo do Parceiro — ${parceiro?.nome || ''}`" max-width="max-w-lg" @close="emit('close')">
    <div v-if="carregando" class="py-10 flex items-center justify-center">
      <AppLoading />
    </div>
    <div v-else-if="erro" class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
      Não foi possível carregar o aceite do Termo.
    </div>
    <div v-else-if="dados" class="space-y-2">
      <!-- Pendente na versão vigente -->
      <div
        v-if="!aceitouVigente(dados)"
        class="rounded-md border border-amber-200 dark:border-amber-500/30 bg-amber-50/60 dark:bg-amber-500/10 px-3 py-2.5 text-[12px]"
      >
        <p class="text-[13px] font-semibold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
          <i class="fa-solid fa-clock text-[12px]" aria-hidden="true" />
          Ainda não aceitou a versão {{ dados.versao_vigente }}
        </p>
        <p class="text-slate-600 dark:text-slate-400">No próximo acesso, o portal do parceiro fica bloqueado até ele ler e aceitar o Termo.</p>
        <p v-if="dados.aceite_antigo" class="text-slate-500 dark:text-slate-400 mt-1">
          Aceite anterior (versão {{ dados.aceite_antigo.versao }}, só com data): {{ dataHoraBR(dados.aceite_antigo.aceito_em) }}.
        </p>
      </div>

      <!-- Aceites registrados (o mais recente primeiro) -->
      <div
        v-for="a in dados.aceites"
        :key="a.id"
        class="rounded-md border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50/60 dark:bg-emerald-500/10 px-3 py-2.5"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="min-w-0">
            <p class="text-[13px] font-semibold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <i class="fa-solid fa-circle-check text-[12px]" aria-hidden="true" />
              Aceitou o Termo do Parceiro
            </p>
            <p class="text-[12px] text-slate-600 dark:text-slate-400 tabular-nums">
              {{ dataHoraBR(a.aceito_em) }} (Brasília) · versão {{ a.versao_termos }}
            </p>
          </div>
          <a
            :href="`/comprovante-termos-parceiro/${a.id}`"
            target="_blank"
            rel="noopener"
            class="shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors"
          >
            <i class="fa-solid fa-print text-[11px]" aria-hidden="true" />
            Imprimir PDF
          </a>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 mt-2 text-[12px]">
          <p class="truncate"><span class="text-slate-400 dark:text-slate-500">Aceito por:</span> <span class="text-slate-800 dark:text-slate-200">{{ a.nome_assinante }}</span></p>
          <p class="truncate"><span class="text-slate-400 dark:text-slate-500">E-mail:</span> <span class="text-slate-800 dark:text-slate-200">{{ a.email_assinante || '—' }}</span></p>
          <p class="truncate"><span class="text-slate-400 dark:text-slate-500">CPF/CNPJ:</span> <span class="text-slate-800 dark:text-slate-200">{{ a.documento_parceiro || '—' }}</span></p>
          <p class="truncate"><span class="text-slate-400 dark:text-slate-500">IP:</span> <span class="text-slate-800 dark:text-slate-200 font-mono">{{ a.ip || '—' }}</span></p>
          <p class="truncate sm:col-span-2"><span class="text-slate-400 dark:text-slate-500">Texto aceito:</span> <span class="text-slate-800 dark:text-slate-200">{{ a.hash_confere ? 'versão oficial' : 'diferente da oficial' }}</span></p>
        </div>
      </div>

      <p class="text-[11px] text-slate-500 dark:text-slate-400 pt-1">
        O comprovante em PDF traz a Agzap Systems LTDA (CNPJ 60.865.841/0001-93), o parceiro e o documento dele, data e hora com segundos, IP, as confirmações marcadas, o link do Termo e o texto integral aceito.
        <a href="/termos-parceiro" target="_blank" rel="noopener" class="text-purple-600 dark:text-purple-400 hover:underline">Ver o Termo vigente</a>.
      </p>
    </div>
  </BaseModal>
</template>
