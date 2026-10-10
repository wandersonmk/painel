<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'parceiro'],
  layout: 'parceiro',
})

useHead({ title: 'Comunidade · Portal do Parceiro' })
</script>

<template>
  <!-- Conteúdo compartilhado com o Portal do Afiliado -->
  <ComunidadeConteudo />
</template>
