<script setup lang="ts">
const { toasts, remove } = useToast()

const icons: Record<string, string> = {
  success: 'fa-circle-check',
  error: 'fa-circle-xmark',
  warning: 'fa-triangle-exclamation',
  info: 'fa-circle-info',
}

const styles: Record<string, string> = {
  success: 'bg-white border-slate-200 border-l-4 border-l-emerald-500',
  error: 'bg-white border-slate-200 border-l-4 border-l-red-500',
  warning: 'bg-white border-slate-200 border-l-4 border-l-amber-500',
  info: 'bg-white border-slate-200 border-l-4 border-l-blue-500',
}

const iconStyles: Record<string, string> = {
  success: 'text-emerald-600',
  error: 'text-red-600',
  warning: 'text-amber-600',
  info: 'text-blue-600',
}
</script>

<template>
  <Teleport to="body">
    <div
      class="fixed top-5 right-5 z-[9999] flex flex-col gap-2.5 w-full max-w-sm"
      aria-live="polite"
      aria-atomic="false"
    >
      <TransitionGroup
        tag="div"
        enter-active-class="transition-all duration-300 ease-out"
        enter-from-class="opacity-0 translate-x-8 scale-95"
        enter-to-class="opacity-100 translate-x-0 scale-100"
        leave-active-class="transition-all duration-200 ease-in"
        leave-from-class="opacity-100 translate-x-0 scale-100"
        leave-to-class="opacity-0 translate-x-8 scale-95"
        class="flex flex-col gap-2.5"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="flex items-start gap-3 px-4 py-3.5 rounded border shadow-lg"
          :class="styles[toast.type]"
          role="alert"
        >
          <i
            class="fa-solid mt-0.5 text-base shrink-0"
            :class="[icons[toast.type], iconStyles[toast.type]]"
            aria-hidden="true"
          />
          <p class="text-sm font-medium leading-snug flex-1 text-slate-900">{{ toast.message }}</p>
          <button
            @click="remove(toast.id)"
            class="shrink-0 text-slate-400 hover:text-slate-700 transition-colors mt-0.5"
            :aria-label="'Fechar notificação'"
            type="button"
          >
            <i class="fa-solid fa-xmark text-sm" aria-hidden="true" />
          </button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>
