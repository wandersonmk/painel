<script setup lang="ts">
import { computed } from 'vue'

interface Props {
  title: string
  value: string | number
  icon?: string
  color?: 'indigo' | 'amber' | 'purple' | 'red' | 'blue' | 'slate' | 'emerald' | 'orange'
  highlighted?: boolean
}
const props = withDefaults(defineProps<Props>(), { color: 'blue', icon: 'fa-chart-simple', highlighted: false })

const iconColors: Record<string, string> = {
  indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400',
  amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400',
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400',
  red: 'bg-red-100 dark:bg-red-900/50 text-red-600 dark:text-red-400',
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400',
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400',
  emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400',
  orange: 'bg-orange-100 dark:bg-orange-900/50 text-orange-600 dark:text-orange-400',
}

const cardClass = computed(() => {
  if (props.highlighted && props.color === 'red') return 'bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-900'
  if (props.highlighted && props.color === 'orange') return 'bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900'
  return 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800'
})
const titleClass = computed(() => {
  if (props.highlighted && props.color === 'red') return 'text-red-700 dark:text-red-400'
  if (props.highlighted && props.color === 'orange') return 'text-orange-700 dark:text-orange-400'
  return 'text-slate-500 dark:text-slate-400'
})
const valueClass = computed(() => {
  if (props.highlighted && props.color === 'red') return 'text-red-900 dark:text-red-100'
  if (props.highlighted && props.color === 'orange') return 'text-orange-900 dark:text-orange-100'
  return 'text-slate-900 dark:text-white'
})
</script>

<template>
  <div class="px-4 py-3 rounded-xl border shadow-sm flex items-center justify-between gap-3" :class="cardClass">
    <div class="flex flex-col gap-0.5 min-w-0">
      <p class="text-xs font-medium truncate" :class="titleClass">{{ title }}</p>
      <p class="text-2xl font-bold leading-tight tabular-nums" :class="valueClass">{{ value }}</p>
    </div>
    <div class="size-10 rounded-lg flex items-center justify-center shrink-0" :class="iconColors[color]">
      <i :class="['fa-solid', icon]" aria-hidden="true" />
    </div>
  </div>
</template>
