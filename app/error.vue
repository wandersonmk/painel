<script setup lang="ts">
const props = defineProps<{ error: { statusCode: number; message: string } }>()
const handleError = () => clearError({ redirect: '/' })
</script>

<template>
  <div class="min-h-screen flex items-center justify-center bg-slate-950 text-white p-6">
    <div class="max-w-md text-center space-y-4">
      <h1 class="text-6xl font-bold">{{ props.error.statusCode }}</h1>
      <p class="text-slate-400">{{ props.error.message }}</p>
      <button @click="handleError" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold">
        Voltar ao início
      </button>
    </div>
  </div>
</template>
