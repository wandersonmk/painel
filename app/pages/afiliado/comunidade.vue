<script setup lang="ts">
definePageMeta({
  middleware: ['auth', 'afiliado'],
  layout: 'afiliado',
})

useHead({ title: 'Comunidade · Portal do Afiliado' })
</script>

<template>
  <!-- Conteúdo compartilhado com o Portal do Parceiro -->
  <ComunidadeConteudo />
</template>
