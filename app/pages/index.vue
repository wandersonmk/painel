<script setup lang="ts">
definePageMeta({ middleware: 'guest' })
onMounted(() => navigateTo('/login', { replace: true }))
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-950">
    <AppLoading />
  </div>
</template>
