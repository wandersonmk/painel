<script setup lang="ts">
// Texto completo do Termo do Afiliado (fonte única: app/constants/termosAfiliado.ts),
// usado na página /afiliado/termos e na página pública /termos-afiliado.
import { CATEGORIAS_TERMO_AFILIADO, DATA_TERMO_AFILIADO_EXTENSO, NUMERO_SECAO_CONTATO_AFILIADO, VERSAO_TERMO_AFILIADO } from '~/constants/termosAfiliado'
</script>

<template>
  <div class="space-y-8">
    <div>
      <p class="text-xs text-slate-400 dark:text-slate-500 uppercase tracking-wider font-normal">Agzap Systems LTDA · Programa de Afiliados · Versão {{ VERSAO_TERMO_AFILIADO }}</p>
      <h2 class="text-lg font-semibold text-slate-900 dark:text-white mt-1">Termo do Afiliado</h2>
      <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Última atualização: {{ DATA_TERMO_AFILIADO_EXTENSO }}</p>
    </div>

    <section v-for="cat in CATEGORIAS_TERMO_AFILIADO" :id="cat.id" :key="cat.id" class="scroll-mt-24">
      <div class="flex items-center gap-2 mb-3 pb-1.5 border-b" :class="cat.destaque ? 'border-rose-200 dark:border-rose-500/30' : 'border-slate-100 dark:border-white/10'">
        <span :class="['w-2.5 h-2.5 rounded-full', cat.cor]" />
        <h3 class="text-xs font-medium uppercase tracking-wider" :class="cat.destaque ? 'text-rose-700 dark:text-rose-400' : 'text-slate-500 dark:text-slate-400'">{{ cat.titulo }}</h3>
      </div>
      <div class="space-y-5">
        <div v-for="s in cat.secoes" :id="s.id" :key="s.id" class="scroll-mt-24">
          <h4 class="text-sm font-medium text-slate-900 dark:text-white mb-1.5">{{ s.numero }}. {{ s.titulo }}</h4>
          <div class="text-sm leading-relaxed text-slate-600 dark:text-slate-400 space-y-2" v-html="s.conteudo" />
        </div>
      </div>
    </section>

    <section id="contato" class="rounded-xl bg-purple-50 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 p-4 text-sm">
      <h3 class="font-medium text-slate-900 dark:text-white mb-1">{{ NUMERO_SECAO_CONTATO_AFILIADO }}. Contato</h3>
      <p class="text-slate-600 dark:text-slate-400">Agzap Systems LTDA · Nome fantasia: Agzap · CNPJ: 60.865.841/0001-93</p>
      <p class="text-slate-600 dark:text-slate-400">contato@agzap.com.br · WhatsApp (11) 91460-0243</p>
    </section>
  </div>
</template>
