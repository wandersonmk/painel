<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue: number | null
  id?: string
  placeholder?: string
  required?: boolean
}>()
const emit = defineEmits<{ 'update:modelValue': [value: number | null] }>()

const formatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

const display = computed(() =>
  props.modelValue == null ? '' : formatter.format(props.modelValue),
)

// Máscara: só dígitos contam; os 2 últimos viram centavos (digitação estilo caixa)
function onInput(e: Event) {
  const el = e.target as HTMLInputElement
  const digits = el.value.replace(/\D/g, '').slice(0, 12)
  if (!digits) {
    emit('update:modelValue', null)
    el.value = ''
    return
  }
  const valor = Number(digits) / 100
  emit('update:modelValue', valor)
  el.value = formatter.format(valor)
}
</script>

<template>
  <input
    :id="id"
    type="text"
    inputmode="numeric"
    autocomplete="off"
    :value="display"
    :placeholder="placeholder || 'R$ 0,00'"
    :required="required"
    @input="onInput"
  />
</template>
