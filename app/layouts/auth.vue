<script setup lang="ts">
onMounted(() => {
  document.documentElement.classList.add('dark')
})
</script>

<template>
  <div class="min-h-screen bg-background relative overflow-hidden flex flex-col">
    <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
      <div class="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-purple-900/30 via-purple-800/20 to-transparent rounded-full blur-3xl -translate-x-1/2 -translate-y-1/2" />
      <div class="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-violet-900/25 via-purple-700/15 to-transparent rounded-full blur-3xl translate-x-1/3 -translate-y-1/3" />
      <div class="absolute bottom-0 left-0 w-72 h-72 bg-gradient-to-tr from-indigo-900/20 via-purple-800/15 to-transparent rounded-full blur-3xl -translate-x-1/3 translate-y-1/3" />
      <div class="absolute bottom-0 right-0 w-88 h-88 bg-gradient-to-tl from-purple-900/25 via-violet-800/20 to-transparent rounded-full blur-3xl translate-x-1/4 translate-y-1/4" />
    </div>
    <div class="relative z-10 flex-1">
      <main><slot /></main>
    </div>
  </div>
</template>
