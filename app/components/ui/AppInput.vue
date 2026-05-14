<script setup lang="ts">
defineProps<{
  modelValue?: string
  type?: string
  placeholder?: string
  autocomplete?: string
  required?: boolean
  invalid?: boolean
  valid?: boolean
}>()
defineEmits<{ 'update:modelValue': [v: string] }>()
</script>

<template>
  <input
    :value="modelValue"
    :type="type || 'text'"
    :placeholder="placeholder"
    :autocomplete="autocomplete"
    :required="required"
    @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
    class="w-full px-4 py-3 bg-white/5 border rounded text-white placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
    :class="[
      invalid ? 'border-red-500' : valid ? 'border-green-500/50' : 'border-white/10'
    ]"
  />
</template>
