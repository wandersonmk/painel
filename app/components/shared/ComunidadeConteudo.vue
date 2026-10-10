<script setup lang="ts">
/**
 * Página "Comunidade" (09/10/2026): conteúdo único usado pelo Portal do
 * Parceiro (/parceiro/comunidade) e pelo Portal do Afiliado
 * (/afiliado/comunidade). Só informação real: nada de número de membros,
 * depoimento ou data de evento. O convite é o link oficial do Discord.
 */
const CONVITE_DISCORD = 'https://discord.gg/UvgUMGkYS'

// Classes estáticas (o Tailwind precisa enxergá-las inteiras no código).
const recursos = [
  {
    icone: 'fa-user-group',
    titulo: 'Network',
    texto: 'Conecte-se com parceiros, afiliados e clientes que usam a Agzap.',
    tom: 'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300',
  },
  {
    icone: 'fa-handshake',
    titulo: 'Parcerias',
    texto: 'Encontre oportunidades de parceria e de indicação.',
    tom: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300',
  },
  {
    icone: 'fa-bullhorn',
    titulo: 'Novidades e atualizações',
    texto: 'Acompanhe os anúncios de novas funções e melhorias da Agzap.',
    tom: 'bg-amber-50 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
  },
  {
    icone: 'fa-comments',
    titulo: 'Bate-papo',
    texto: 'Converse com a comunidade e com o time Agzap.',
    tom: 'bg-sky-50 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
  },
  {
    icone: 'fa-lightbulb',
    titulo: 'Dicas e boas práticas',
    texto: 'Veja como tirar mais proveito da IA, do CRM, dos disparos e das outras funções.',
    tom: 'bg-rose-50 text-rose-600 dark:bg-rose-500/15 dark:text-rose-300',
  },
  {
    icone: 'fa-circle-question',
    titulo: 'Dúvidas da comunidade',
    texto: 'Troque experiências com quem já passou pela mesma situação. O suporte oficial continua pelos canais de suporte.',
    tom: 'bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300',
  },
]

const passos = [
  { titulo: 'Clique em "Entrar na comunidade"', texto: 'O convite abre o Discord em uma nova aba.' },
  { titulo: 'Crie ou entre na sua conta do Discord', texto: 'Dá para usar pelo navegador, pelo computador ou pelo celular.' },
  { titulo: 'Apresente-se', texto: 'Conte quem você é e como usa a Agzap no canal de boas-vindas.' },
]

const combinados = [
  { icone: 'fa-heart', titulo: 'Respeito sempre', texto: 'Trate todos com cordialidade. Críticas construtivas são bem-vindas; ofensas, não.' },
  { icone: 'fa-ban', titulo: 'Sem spam', texto: 'Nada de spam nem de propaganda sem autorização da equipe Agzap.' },
  { icone: 'fa-user-shield', titulo: 'Dados de clientes são sigilosos', texto: 'Não compartilhe nomes, telefones, conversas ou prints com dados de clientes (LGPD).' },
  { icone: 'fa-headset', titulo: 'Suporte pelos canais oficiais', texto: 'Problemas de conta, cobrança ou acesso são resolvidos pelos canais oficiais de suporte.' },
]

const cartao = 'rounded-2xl bg-white dark:bg-slate-900/60 ring-1 ring-inset ring-slate-200 dark:ring-white/10'
const botaoDiscord = 'inline-flex items-center justify-center gap-2.5 h-11 px-5 rounded-xl text-sm font-normal text-white bg-[#5865F2] hover:bg-[#4752C4] shadow-sm shadow-[#5865F2]/25 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#5865F2] focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 transition-colors'
</script>

<template>
  <div class="px-4 pt-4 pb-6 sm:px-6 sm:pt-5 md:px-8 md:pb-8 space-y-4 sm:space-y-5 w-full">

    <!-- Destaque: ícone + título à esquerda, convite à direita (empilha no celular) -->
    <section
      aria-labelledby="comunidade-titulo"
      class="rounded-2xl bg-purple-50 dark:bg-purple-500/10 dark:ring-1 dark:ring-inset dark:ring-purple-400/15 px-5 py-4 sm:px-7 sm:py-5"
    >
      <div class="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div class="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-5 min-w-0 flex-1">
          <span class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-[#5865F2] text-white flex items-center justify-center shrink-0 shadow-sm shadow-[#5865F2]/30">
            <i class="fa-brands fa-discord text-xl sm:text-2xl" aria-hidden="true" />
          </span>
          <div class="min-w-0 flex-1">
            <h1 id="comunidade-titulo" class="text-xl sm:text-2xl font-semibold text-slate-900 dark:text-white tracking-tight">
              Comunidade Agzap
            </h1>
            <p class="mt-1.5 text-sm sm:text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl">
              O espaço no Discord para quem usa e indica a Agzap trocar experiências, fazer network e acompanhar as novidades.
            </p>
          </div>
        </div>

        <a
          :href="CONVITE_DISCORD"
          target="_blank"
          rel="noopener noreferrer"
          :class="[botaoDiscord, 'w-full sm:w-auto shrink-0']"
        >
          <i class="fa-brands fa-discord text-base" aria-hidden="true" />
          <span>Entrar na comunidade</span>
          <i class="fa-solid fa-arrow-up-right-from-square text-[11px] opacity-80" aria-hidden="true" />
        </a>
      </div>
    </section>

    <!-- O que você encontra lá -->
    <section aria-labelledby="comunidade-recursos" class="space-y-3">
      <h2 id="comunidade-recursos" class="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
        O que você encontra lá
      </h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
        <article
          v-for="r in recursos"
          :key="r.titulo"
          :class="[cartao, 'p-4 sm:p-5 flex items-start gap-3 min-w-0']"
        >
          <span class="w-9 h-9 rounded-xl flex items-center justify-center shrink-0" :class="r.tom">
            <i :class="['fa-solid', r.icone, 'text-sm']" aria-hidden="true" />
          </span>
          <div class="min-w-0">
            <h3 class="text-[15px] font-medium text-slate-800 dark:text-slate-100">{{ r.titulo }}</h3>
            <p class="mt-1 text-sm leading-snug text-slate-500 dark:text-slate-400">{{ r.texto }}</p>
          </div>
        </article>
      </div>
    </section>

    <!-- Como entrar + Combinados -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4 items-start">
      <section aria-labelledby="comunidade-como-entrar" :class="[cartao, 'p-4 sm:p-5']">
        <h2 id="comunidade-como-entrar" class="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
          Como entrar
        </h2>
        <ol class="mt-4 space-y-4">
          <li v-for="(p, i) in passos" :key="p.titulo" class="flex items-start gap-3">
            <span class="w-7 h-7 rounded-full bg-purple-600 text-white dark:bg-purple-400 dark:text-slate-950 text-xs font-medium flex items-center justify-center shrink-0 tabular-nums">
              {{ i + 1 }}
            </span>
            <div class="min-w-0 pt-0.5">
              <p class="text-sm font-medium text-slate-800 dark:text-slate-100">{{ p.titulo }}</p>
              <p class="mt-0.5 text-sm leading-snug text-slate-500 dark:text-slate-400">{{ p.texto }}</p>
            </div>
          </li>
        </ol>
      </section>

      <section aria-labelledby="comunidade-combinados" :class="[cartao, 'p-4 sm:p-5']">
        <h2 id="comunidade-combinados" class="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
          Combinados
        </h2>
        <ul class="mt-4 space-y-4">
          <li v-for="c in combinados" :key="c.titulo" class="flex items-start gap-3">
            <span class="w-7 h-7 rounded-lg bg-purple-50 text-purple-600 dark:bg-purple-500/15 dark:text-purple-300 flex items-center justify-center shrink-0">
              <i :class="['fa-solid', c.icone, 'text-xs']" aria-hidden="true" />
            </span>
            <div class="min-w-0 pt-0.5">
              <p class="text-sm font-medium text-slate-800 dark:text-slate-100">{{ c.titulo }}</p>
              <p class="mt-0.5 text-sm leading-snug text-slate-500 dark:text-slate-400">{{ c.texto }}</p>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <!-- Chamada final -->
    <section
      aria-labelledby="comunidade-cta"
      class="rounded-2xl bg-purple-50 dark:bg-purple-500/10 dark:ring-1 dark:ring-inset dark:ring-purple-400/15 p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
    >
      <div class="min-w-0">
        <h2 id="comunidade-cta" class="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
          Pronto para participar?
        </h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">
          Entre pelo convite oficial e apresente-se para a comunidade.
        </p>
      </div>
      <a
        :href="CONVITE_DISCORD"
        target="_blank"
        rel="noopener noreferrer"
        :class="[botaoDiscord, 'w-full sm:w-auto shrink-0']"
      >
        <i class="fa-brands fa-discord text-base" aria-hidden="true" />
        <span>Entrar na comunidade</span>
        <i class="fa-solid fa-arrow-up-right-from-square text-[11px] opacity-80" aria-hidden="true" />
      </a>
    </section>
  </div>
</template>
