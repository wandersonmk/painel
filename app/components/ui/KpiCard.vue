<script setup lang="ts">
import { computed } from 'vue'

type KpiColor = 'blue' | 'purple' | 'orange' | 'emerald' | 'indigo' | 'cyan' | 'rose' | 'violet' | 'amber' | 'pink'

interface Props {
  label: string
  value?: string | number
  unit?: string
  icon: string
  color: KpiColor
  loading?: boolean
  loadingWidth?: string
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  loadingWidth: 'w-12',
})

const colorMap: Record<KpiColor, { border: string; gradient: string; shadow: string; text: string }> = {
  blue: {
    border: 'border-blue-300 dark:border-blue-500/30',
    gradient: 'bg-gradient-to-br from-blue-100 to-white dark:from-blue-600/10 dark:to-transparent',
    shadow: 'shadow-[0_0_15px_rgba(59,130,246,0.18)] dark:shadow-[0_0_15px_rgba(59,130,246,0.1)]',
    text: 'text-blue-600 dark:text-blue-400',
  },
  purple: {
    border: 'border-purple-300 dark:border-purple-500/30',
    gradient: 'bg-gradient-to-br from-purple-100 to-white dark:from-purple-600/10 dark:to-transparent',
    shadow: 'shadow-[0_0_15px_rgba(168,85,247,0.18)] dark:shadow-[0_0_15px_rgba(168,85,247,0.1)]',
    text: 'text-purple-600 dark:text-purple-400',
  },
  orange: {
    border: 'border-orange-300 dark:border-orange-500/30',
    gradient: 'bg-gradient-to-br from-orange-100 to-white dark:from-orange-600/10 dark:to-transparent',
    shadow: 'shadow-[0_0_15px_rgba(249,115,22,0.18)] dark:shadow-[0_0_15px_rgba(249,115,22,0.1)]',
    text: 'text-orange-600 dark:text-orange-400',
  },
  emerald: {
    border: 'border-emerald-300 dark:border-emerald-500/30',
    gradient: 'bg-gradient-to-br from-emerald-100 to-white dark:from-emerald-600/10 dark:to-transparent',
    shadow: 'shadow-[0_0_15px_rgba(16,185,129,0.18)] dark:shadow-[0_0_15px_rgba(16,185,129,0.1)]',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  indigo: {
    border: 'border-indigo-300 dark:border-indigo-500/30',
    gradient: 'bg-gradient-to-br from-indigo-100 to-white dark:from-indigo-600/10 dark:to-transparent',
    shadow: 'shadow-[0_0_15px_rgba(99,102,241,0.18)] dark:shadow-[0_0_15px_rgba(99,102,241,0.1)]',
    text: 'text-indigo-600 dark:text-indigo-400',
  },
  cyan: {
    border: 'border-cyan-300 dark:border-cyan-500/30',
    gradient: 'bg-gradient-to-br from-cyan-100 to-white dark:from-cyan-600/10 dark:to-transparent',
    shadow: 'shadow-[0_0_15px_rgba(6,182,212,0.18)] dark:shadow-[0_0_15px_rgba(6,182,212,0.1)]',
    text: 'text-cyan-600 dark:text-cyan-400',
  },
  rose: {
    border: 'border-rose-300 dark:border-rose-500/30',
    gradient: 'bg-gradient-to-br from-rose-100 to-white dark:from-rose-600/10 dark:to-transparent',
    shadow: 'shadow-[0_0_15px_rgba(244,63,94,0.18)] dark:shadow-[0_0_15px_rgba(244,63,94,0.1)]',
    text: 'text-rose-600 dark:text-rose-400',
  },
  violet: {
    border: 'border-violet-300 dark:border-violet-500/30',
    gradient: 'bg-gradient-to-br from-violet-100 to-white dark:from-violet-600/10 dark:to-transparent',
    shadow: 'shadow-[0_0_15px_rgba(139,92,246,0.18)] dark:shadow-[0_0_15px_rgba(139,92,246,0.1)]',
    text: 'text-violet-600 dark:text-violet-400',
  },
  amber: {
    border: 'border-amber-300 dark:border-amber-500/30',
    gradient: 'bg-gradient-to-br from-amber-100 to-white dark:from-amber-600/10 dark:to-transparent',
    shadow: 'shadow-[0_0_15px_rgba(245,158,11,0.18)] dark:shadow-[0_0_15px_rgba(245,158,11,0.1)]',
    text: 'text-amber-600 dark:text-amber-400',
  },
  pink: {
    border: 'border-pink-300 dark:border-pink-500/30',
    gradient: 'bg-gradient-to-br from-pink-100 to-white dark:from-pink-600/10 dark:to-transparent',
    shadow: 'shadow-[0_0_15px_rgba(236,72,153,0.18)] dark:shadow-[0_0_15px_rgba(236,72,153,0.1)]',
    text: 'text-pink-600 dark:text-pink-400',
  },
}

const c = computed(() => colorMap[props.color])
</script>

<template>
  <div
    class="p-4 rounded-xl border transition-all hover:shadow-md dark:hover:scale-[1.02]"
    :class="[c.border, c.gradient, c.shadow]"
  >
    <div class="flex items-center justify-between mb-2">
      <span
        class="text-[10px] font-bold text-slate-400 uppercase tracking-wider"
        :class="c.text"
      >
        {{ label }}
      </span>
      <i :class="[icon, 'text-slate-400', c.text]" aria-hidden="true" />
    </div>
    <div class="flex items-baseline gap-1">
      <span class="text-2xl font-bold text-slate-800 dark:text-white tabular-nums">
        <span
          v-if="loading"
          class="inline-block h-7 bg-slate-200 dark:bg-white/10 rounded-lg animate-pulse"
          :class="loadingWidth"
        />
        <slot v-else>{{ value }}</slot>
      </span>
      <span v-if="unit && !loading" class="text-[10px] text-slate-500 dark:text-slate-400 font-medium">
        {{ unit }}
      </span>
    </div>
  </div>
</template>
