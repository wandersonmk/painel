<script setup lang="ts">
defineProps<{
  block?: boolean
  disabled?: boolean
  type?: 'button' | 'submit' | 'reset'
}>()
</script>

<template>
  <button
    :type="type || 'button'"
    :disabled="disabled"
    :class="[
      block ? 'w-full' : '',
      'px-4 py-3 rounded font-semibold transition-all disabled:opacity-50 disabled:cursor-not-allowed'
    ]"
  >
    <slot />
  </button>
</template>
