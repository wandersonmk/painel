<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { formatarDocumento, identificarDocumento, normalizarDocumento } from '~~/shared/utils/documento'
import { formatarTelefoneBr, normalizarTelefoneBr } from '~~/shared/utils/telefoneBr'
import { buscarAfiliadoLogado, erroAfiliado } from '~/composables/useAfiliado'

/**
 * Cadastro público de afiliado — link fixo painel.agzap.com.br/afiliado/cadastro.
 * Cadastrou, já entra no Portal do Afiliado.
 */
definePageMeta({
  layout: 'auth',
})

useHead({ title: 'Cadastro de afiliado · Agzap' })

const toast = useToast()
const { signInWithEmailAndPassword } = useAuth()

onMounted(async () => {
  // Já logado como afiliado: vai direto para o portal.
  const afiliado = await buscarAfiliadoLogado()
  if (afiliado?.ativo) await navigateTo('/afiliado', { replace: true })
})

const form = reactive({ nome: '', email: '', telefone: '', documento: '', senha: '', confirmar: '' })
const mostrarSenha = ref(false)
const enviando = ref(false)
const erroForm = ref<{ campo: string | null; mensagem: string } | null>(null)

function limparErro(campo: string) {
  if (erroForm.value?.campo === campo || erroForm.value?.campo === null) erroForm.value = null
}

// Máscara: grava também no próprio input, porque quando o texto formatado não
// muda o Vue não re-renderiza e o caractere descartado ficaria na tela.
function aoDigitarDocumento(e: Event) {
  const alvo = e.target as HTMLInputElement
  form.documento = formatarDocumento(alvo.value)
  alvo.value = form.documento
  limparErro('documento')
}
function aoDigitarTelefone(e: Event) {
  const alvo = e.target as HTMLInputElement
  form.telefone = formatarTelefoneBr(alvo.value)
  alvo.value = form.telefone
  limparErro('telefone')
}

const EMAIL_RE = /^[^\s@,;()<>]+@[^\s@,;()<>]+\.[^\s@,;()<>]+$/

const validacao = computed(() => {
  const nome = form.nome.replace(/\s+/g, ' ').trim()
  const doc = identificarDocumento(form.documento)
  return {
    nome: nome.length >= 2 && nome.length <= 120 && nome.includes(' '),
    email: EMAIL_RE.test(form.email.trim()),
    telefone: !!normalizarTelefoneBr(form.telefone),
    documento: !!doc && /^\d+$/.test(doc.documento),
    senha: form.senha.length >= 8 && form.senha.length <= 72,
    confirmar: !!form.confirmar && form.confirmar === form.senha,
  }
})

/** Aviso ao lado do campo, só quando já dá para julgar. */
const dicas = computed(() => {
  const d = normalizarDocumento(form.documento)
  const tel = form.telefone.replace(/\D/g, '')
  return {
    nome: form.nome.trim().length >= 2 && !validacao.value.nome ? 'Informe nome e sobrenome' : null,
    email: form.email.trim().length > 3 && !validacao.value.email ? 'E-mail inválido' : null,
    telefone: tel.length >= 10 && !validacao.value.telefone ? 'Confira o DDD e o número' : null,
    documento: (d.length === 11 || d.length === 14) && !validacao.value.documento
      ? (d.length === 11 ? 'CPF inválido' : 'CNPJ inválido')
      : null,
    senha: form.senha.length > 0 && form.senha.length < 8 ? 'Mínimo de 8 caracteres' : null,
    confirmar: form.confirmar.length > 0 && form.confirmar !== form.senha ? 'As senhas não são iguais' : null,
  }
})

const podeEnviar = computed(() => Object.values(validacao.value).every(Boolean) && !enviando.value)

async function cadastrar() {
  if (!podeEnviar.value) return
  enviando.value = true
  erroForm.value = null
  const email = form.email.trim().toLowerCase()
  try {
    const resp = await $fetch<{ success: boolean; campo?: string; error?: string }>('/api/afiliado/cadastro', {
      method: 'POST',
      body: {
        nome: form.nome,
        email,
        telefone: form.telefone,
        documento: form.documento,
        senha: form.senha,
      },
    })
    if (!resp.success) {
      erroForm.value = { campo: resp.campo ?? null, mensagem: resp.error || 'Não foi possível fazer seu cadastro.' }
      return
    }

    const usuario = await signInWithEmailAndPassword(email, form.senha)
    if (!usuario) {
      toast.success('Cadastro feito! Entre com seu e-mail e senha.')
      await navigateTo('/login')
      return
    }
    toast.success('Cadastro feito! Bem-vindo ao Portal do Afiliado.')
    await navigateTo('/afiliado')
  }
  catch (err: any) {
    erroForm.value = { campo: null, mensagem: erroAfiliado(err, 'Não foi possível fazer seu cadastro.') }
  }
  finally {
    enviando.value = false
  }
}

// Compacto (10/10/2026, pedido do dono): em notebook a página não cabia na
// tela — campos de 40 px e cantos menos redondos.
const campoBase = 'w-full h-10 px-3.5 rounded-lg border bg-white/[0.04] text-sm text-white placeholder:text-gray-500 shadow-[inset_0_1px_2px_rgba(0,0,0,0.25)] hover:bg-white/[0.06] focus:bg-white/[0.07] focus:outline-none focus:ring-[3px] focus:ring-purple-500/25 transition-all'
function borda(campo: keyof typeof dicas.value) {
  if (erroForm.value?.campo === campo || dicas.value[campo]) return 'border-red-500/70'
  return validacao.value[campo] ? 'border-green-500/40' : 'border-white/10'
}

const CONEXOES = [
  { n: '1ª', pct: '30% e 15%' },
  { n: '2ª', pct: '5%' },
  { n: '3ª', pct: '3%' },
  { n: '4ª', pct: '2%' },
  { n: '5ª', pct: '2%' },
]
</script>

<template>
  <div class="min-h-screen w-full relative overflow-hidden bg-[#0c0a12]">
    <div class="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:linear-gradient(to_bottom,#000,transparent_85%)]" aria-hidden="true" />
    <div class="absolute top-0 -left-4 w-96 h-96 bg-purple-900 rounded-full filter blur-3xl opacity-20 animate-blob" aria-hidden="true" />
    <div class="absolute top-1/3 -right-16 w-96 h-96 bg-purple-800 rounded-full filter blur-3xl opacity-10 animate-blob animation-delay-4000" aria-hidden="true" />

    <!-- Moedas caindo + brilho dourado no rodapé da tela (só visual, atrás de tudo) -->
    <AfiliadoMoedasFundo />

    <!-- Desktop: os dois cartões na mesma linha e com a mesma altura (items-stretch).
         1024–1279 px: colunas iguais; 1280 px+: ~45/55.
         Compacto (10/10/2026, pedido do dono): tudo menor pra caber num
         notebook (~768 px de altura) sem rolar; em monitor alto o conteúdo
         fica centralizado na altura (min-h-screen + content-center). -->
    <div class="relative z-10 w-full xl:max-w-[80rem] mx-auto px-4 sm:px-6 lg:px-10 pt-5 lg:pt-6 pb-6 lg:pb-6 grid lg:grid-cols-2 xl:grid-cols-[minmax(0,4.5fr)_minmax(0,5.5fr)] gap-5 lg:gap-8 items-start lg:items-stretch lg:min-h-screen lg:content-center">
      <!-- Formulário -->
      <section class="w-full max-w-lg xl:max-w-none mx-auto lg:mx-0 lg:ml-auto lg:flex lg:flex-col">
        <div class="mb-3">
          <img src="/logo.wrn.png" alt="Agzap" class="h-8 w-auto object-contain">
        </div>

        <div class="relative rounded-2xl p-5 lg:p-6 bg-[#15121f]/85 backdrop-blur-xl ring-1 ring-inset ring-white/[0.08] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85),inset_0_1px_0_rgba(255,255,255,0.05)] lg:flex-1 lg:flex lg:flex-col">
          <div class="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-b from-purple-400/[0.07] via-transparent to-amber-400/[0.03]" aria-hidden="true" />
          <div class="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-amber-200/60 to-transparent" aria-hidden="true" />

          <div class="relative z-10 lg:flex-1 lg:flex lg:flex-col">
            <div class="flex items-center gap-3">
              <span class="grid place-items-center w-9 h-9 shrink-0 rounded-xl bg-gradient-to-br from-amber-200 via-amber-400 to-amber-600 shadow-[0_10px_24px_-10px_rgba(245,158,11,0.75),inset_0_1px_0_rgba(255,255,255,0.5)]" aria-hidden="true">
                <i class="fa-solid fa-coins text-[13px] text-[#5b3a02]" />
              </span>
              <h1 class="text-xl font-semibold text-white tracking-tight">Seja afiliado Agzap</h1>
            </div>
            <p class="text-sm text-gray-300 mt-2 leading-relaxed">Indique a Agzap e ganhe todo mês enquanto seus clientes pagam.</p>

            <!-- No desktop a altura extra (para igualar ao cartão da direita) é
                 distribuída por igual entre os blocos, sem buraco no fim. -->
            <form class="mt-4 space-y-3 lg:flex-1 lg:flex lg:flex-col lg:justify-between" novalidate @submit.prevent="cadastrar">
              <div>
                <div class="flex items-center justify-between gap-2 mb-1 px-0.5">
                  <label for="af-nome" class="text-xs text-gray-300">Nome completo</label>
                  <span v-if="dicas.nome" class="text-[11px] text-red-400">{{ dicas.nome }}</span>
                </div>
                <input
                  id="af-nome"
                  v-model="form.nome"
                  type="text"
                  autocomplete="name"
                  maxlength="120"
                  placeholder="Seu nome e sobrenome"
                  :class="[campoBase, borda('nome')]"
                  @input="limparErro('nome')"
                >
              </div>

              <div>
                <div class="flex items-center justify-between gap-2 mb-1 px-0.5">
                  <label for="af-email" class="text-xs text-gray-300">E-mail</label>
                  <span v-if="dicas.email" class="text-[11px] text-red-400">{{ dicas.email }}</span>
                </div>
                <input
                  id="af-email"
                  v-model="form.email"
                  type="email"
                  autocomplete="email"
                  maxlength="254"
                  placeholder="voce@exemplo.com"
                  :class="[campoBase, borda('email')]"
                  @input="limparErro('email')"
                >
              </div>

              <div class="grid sm:grid-cols-2 gap-3">
                <div>
                  <div class="flex items-center justify-between gap-2 mb-1 px-0.5">
                    <label for="af-tel" class="text-xs text-gray-300">WhatsApp</label>
                    <span v-if="dicas.telefone" class="text-[11px] text-red-400">{{ dicas.telefone }}</span>
                  </div>
                  <input
                    id="af-tel"
                    :value="form.telefone"
                    type="text"
                    inputmode="tel"
                    autocomplete="tel-national"
                    maxlength="16"
                    placeholder="(11) 99999-9999"
                    :class="[campoBase, borda('telefone'), 'tabular-nums']"
                    @input="aoDigitarTelefone"
                  >
                </div>
                <div>
                  <div class="flex items-center justify-between gap-2 mb-1 px-0.5">
                    <label for="af-doc" class="text-xs text-gray-300">CPF ou CNPJ</label>
                    <span v-if="dicas.documento" class="text-[11px] text-red-400">{{ dicas.documento }}</span>
                  </div>
                  <input
                    id="af-doc"
                    :value="form.documento"
                    type="text"
                    inputmode="numeric"
                    autocomplete="off"
                    maxlength="18"
                    placeholder="000.000.000-00"
                    :class="[campoBase, borda('documento'), 'tabular-nums']"
                    @input="aoDigitarDocumento"
                  >
                </div>
              </div>

              <div class="grid sm:grid-cols-2 gap-3">
                <div>
                  <div class="flex items-center justify-between gap-2 mb-1 px-0.5">
                    <label for="af-senha" class="text-xs text-gray-300">Senha</label>
                    <span v-if="dicas.senha" class="text-[11px] text-red-400">{{ dicas.senha }}</span>
                  </div>
                  <div class="relative">
                    <input
                      id="af-senha"
                      v-model="form.senha"
                      :type="mostrarSenha ? 'text' : 'password'"
                      autocomplete="new-password"
                      maxlength="72"
                      placeholder="Mínimo 8 caracteres"
                      :class="[campoBase, borda('senha'), '!pr-11']"
                      @input="limparErro('senha')"
                    >
                    <button
                      type="button"
                      tabindex="-1"
                      class="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-white hover:bg-white/[0.06] transition-colors"
                      :aria-label="mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'"
                      :title="mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'"
                      @click="mostrarSenha = !mostrarSenha"
                    >
                      <i class="fa-solid text-sm" :class="mostrarSenha ? 'fa-eye-slash' : 'fa-eye'" aria-hidden="true" />
                    </button>
                  </div>
                </div>
                <div>
                  <div class="flex items-center justify-between gap-2 mb-1 px-0.5">
                    <label for="af-senha2" class="text-xs text-gray-300">Confirmar senha</label>
                    <span v-if="dicas.confirmar" class="text-[11px] text-red-400">{{ dicas.confirmar }}</span>
                  </div>
                  <input
                    id="af-senha2"
                    v-model="form.confirmar"
                    :type="mostrarSenha ? 'text' : 'password'"
                    autocomplete="new-password"
                    maxlength="72"
                    placeholder="Repita a senha"
                    :class="[campoBase, borda('confirmar')]"
                  >
                </div>
              </div>

              <p class="text-xs text-gray-400 leading-relaxed px-0.5">
                Já usa a Agzap? Pode usar o mesmo e-mail e a mesma senha da sua conta.
              </p>

              <div
                v-if="erroForm"
                class="px-3.5 py-2.5 rounded-lg bg-red-500/10 ring-1 ring-inset ring-red-500/25 text-red-300 text-sm leading-relaxed flex items-start gap-2.5"
                role="alert"
              >
                <i class="fa-solid fa-triangle-exclamation mt-0.5" aria-hidden="true" />
                <span>{{ erroForm.mensagem }}</span>
              </div>

              <button
                type="submit"
                :disabled="!podeEnviar"
                class="w-full h-10 px-5 rounded-lg text-sm font-medium text-white bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 shadow-[0_14px_32px_-14px_rgba(139,92,246,0.9),inset_0_1px_0_rgba(255,255,255,0.18)] transition-all duration-200 active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100 inline-flex items-center justify-center gap-2"
              >
                <i v-if="enviando" class="fa-solid fa-spinner animate-spin text-sm" aria-hidden="true" />
                {{ enviando ? 'Criando sua conta…' : 'Criar minha conta de afiliado' }}
              </button>

              <div class="space-y-1 text-xs text-gray-400 text-center">
                <p>
                  No primeiro acesso ao portal você lê e aceita o
                  <a href="/termos-afiliado" target="_blank" rel="noopener" class="text-purple-300 hover:text-purple-200 underline-offset-2 hover:underline">Termo do Afiliado</a>.
                </p>
                <p>
                  Já é afiliado?
                  <NuxtLink to="/login" class="text-purple-300 hover:text-purple-200 underline-offset-2 hover:underline">Entrar</NuxtLink>
                </p>
              </div>
            </form>
          </div>
        </div>
      </section>

      <!-- Regras -->
      <!-- mt = altura da linha do logo (h-8 + mb-3), para os topos alinharem -->
      <aside class="w-full max-w-lg lg:max-w-none mx-auto lg:mx-0 lg:mt-11 lg:flex lg:flex-col">
        <div class="relative rounded-2xl bg-[#15121f]/55 backdrop-blur-xl ring-1 ring-inset ring-white/[0.08] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.75),inset_0_1px_0_rgba(255,255,255,0.05)] p-5 lg:p-6 lg:flex-1 lg:flex lg:flex-col">
          <div class="pointer-events-none absolute inset-x-10 -top-px h-px bg-gradient-to-r from-transparent via-purple-300/50 to-transparent" aria-hidden="true" />

          <div class="relative space-y-3.5 lg:flex-1 lg:flex lg:flex-col lg:justify-between">
            <div class="flex items-center gap-3">
              <span class="grid place-items-center w-8 h-8 shrink-0 rounded-lg bg-amber-400/10 ring-1 ring-inset ring-amber-300/25 text-amber-300" aria-hidden="true">
                <i class="fa-solid fa-sack-dollar text-[13px]" />
              </span>
              <div class="min-w-0">
                <h2 class="text-base font-semibold text-white tracking-tight leading-tight">Como você ganha</h2>
                <p class="text-xs text-gray-400 mt-0.5 leading-snug">Comissão sobre a mensalidade de cada cliente, enquanto ele paga.</p>
              </div>
            </div>

            <div>
              <div class="grid grid-cols-4 sm:grid-cols-6 gap-1.5">
                <div
                  v-for="c in CONEXOES"
                  :key="c.n"
                  class="flex flex-col items-center justify-center rounded-lg px-1.5 py-2 text-center"
                  :class="c.n === '1ª'
                    ? 'col-span-4 sm:col-span-2 bg-gradient-to-b from-amber-300/[0.16] to-amber-500/[0.04] ring-1 ring-inset ring-amber-300/30 shadow-[0_10px_30px_-16px_rgba(245,158,11,0.6)]'
                    : 'bg-white/[0.035] ring-1 ring-inset ring-white/[0.07]'"
                >
                  <p class="text-[11px] leading-tight" :class="c.n === '1ª' ? 'text-amber-200/80' : 'text-gray-400'">{{ c.n }} conexão</p>
                  <p
                    class="font-display font-medium tabular-nums leading-tight mt-0.5"
                    :class="c.n === '1ª' ? 'text-base text-amber-200' : 'text-[15px] text-white'"
                  >
                    {{ c.pct }}
                  </p>
                </div>
              </div>
              <p class="mt-2 px-0.5 text-xs leading-relaxed text-gray-400 [text-wrap:balance]">
                <span class="whitespace-nowrap text-gray-200">1ª conexão:</span> quem cria a conta pelo seu link (<span class="text-amber-300/90 tabular-nums">30%</span> no 1º pagamento, <span class="text-amber-300/90 tabular-nums">15%</span> nos seguintes).
                <span class="xl:block"><span class="whitespace-nowrap text-gray-200">Da 2ª à 5ª:</span> as indicações dos seus clientes.</span>
              </p>
            </div>

            <ul class="space-y-2 text-[13px] leading-snug text-gray-300">
              <li class="flex items-center gap-3">
                <span class="grid place-items-center w-7 h-7 shrink-0 rounded-md bg-purple-500/10 ring-1 ring-inset ring-purple-400/15 text-purple-300" aria-hidden="true">
                  <i class="fa-solid fa-unlock text-[12px]" />
                </span>
                <span class="[text-wrap:pretty]">Libera da 2ª à 5ª conexão com <span class="font-medium text-amber-300 tabular-nums">10, 15, 20 e 50</span> clientes ativos seus</span>
              </li>
              <li class="flex items-center gap-3">
                <span class="grid place-items-center w-7 h-7 shrink-0 rounded-md bg-purple-500/10 ring-1 ring-inset ring-purple-400/15 text-purple-300" aria-hidden="true">
                  <i class="fa-solid fa-hourglass-half text-[12px]" />
                </span>
                <span class="[text-wrap:pretty]">Fica retida <span class="font-medium text-amber-300">7 dias</span> (PIX) ou <span class="font-medium text-amber-300">15 dias</span> (cartão), depois liberada para saque</span>
              </li>
              <li class="flex items-center gap-3">
                <span class="grid place-items-center w-7 h-7 shrink-0 rounded-md bg-emerald-500/10 ring-1 ring-inset ring-emerald-400/20 text-emerald-300" aria-hidden="true">
                  <i class="fa-solid fa-money-bill-transfer text-[12px]" />
                </span>
                <span class="[text-wrap:pretty]">Saque por PIX em até <span class="font-medium text-amber-300">48 horas</span>, chave em seu nome e CPF/CNPJ</span>
              </li>
            </ul>

            <!-- Simulador (só conta no navegador, não mexe no formulário) -->
            <AfiliadoSimuladorGanhos />
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
