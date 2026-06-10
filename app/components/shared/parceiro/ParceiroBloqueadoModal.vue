<script setup lang="ts">
const { bloqueado } = useContaBloqueada()
const { signOut } = useAuth()

const TELEFONE_ADMIN = '5511914600243'
const TELEFONE_EXIBICAO = '+55 (11) 91460-0243'

function falarComAdministracao() {
  const msg = 'Olá! Minha conta de parceiro Agzap foi bloqueada e gostaria de entender o motivo.'
  window.open(`https://wa.me/${TELEFONE_ADMIN}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener,noreferrer')
}

async function sair() {
  bloqueado.value = false
  await signOut()
  await navigateTo('/login')
}
</script>

<template>
  <Teleport to="body">
    <!-- Sem fechamento por clique fora: o aviso precisa ser lido -->
    <div
      v-if="bloqueado"
      class="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
      role="alertdialog"
      aria-modal="true"
      aria-label="Conta bloqueada"
    >
      <div class="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        <!-- Faixa superior -->
        <div class="bg-gradient-to-r from-red-600 to-rose-600 px-6 py-8 text-center">
          <div class="w-16 h-16 rounded-full bg-white/15 backdrop-blur flex items-center justify-center mx-auto mb-3 ring-4 ring-white/10">
            <i class="fa-solid fa-lock text-white text-2xl" aria-hidden="true" />
          </div>
          <h2 class="text-xl font-bold text-white">Conta bloqueada</h2>
          <p class="text-red-100 text-sm mt-1">Seu acesso ao portal do parceiro foi suspenso</p>
        </div>

        <!-- Corpo -->
        <div class="px-6 py-5 space-y-4">
          <p class="text-sm text-slate-600 dark:text-slate-400 leading-relaxed text-center">
            Sua conta de parceiro foi <strong class="text-slate-900 dark:text-white">bloqueada pela administração</strong>.
            Para entender o motivo e regularizar sua situação, entre em contato com a nossa equipe.
          </p>

          <!-- Contato -->
          <div class="rounded-md bg-slate-50 dark:bg-white/[0.04] border border-slate-200 dark:border-white/10 px-4 py-3 text-center">
            <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Contato da administração</p>
            <p class="text-base font-bold text-slate-900 dark:text-white tabular-nums mt-1">{{ TELEFONE_EXIBICAO }}</p>
          </div>

          <div class="flex flex-col gap-2">
            <button
              @click="falarComAdministracao"
              class="w-full px-4 py-2.5 rounded font-semibold text-sm bg-emerald-600 hover:bg-emerald-700 text-white transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30"
              type="button"
            >
              <i class="fa-brands fa-whatsapp" aria-hidden="true" />
              Falar com a administração
            </button>
            <button
              @click="sair"
              class="w-full px-4 py-2.5 rounded font-semibold text-sm border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              type="button"
            >
              Sair da conta
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
