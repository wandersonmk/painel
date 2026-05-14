import { ref, readonly } from 'vue'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'warning' | 'info'
}

const toasts = ref<Toast[]>([])

export function useToast() {
  function remove(id: string) {
    const idx = toasts.value.findIndex(t => t.id === id)
    if (idx !== -1) toasts.value.splice(idx, 1)
  }

  function add(message: string, type: Toast['type'], duration = 4500) {
    if (!import.meta.client) return
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2)}`
    toasts.value.push({ id, message, type })
    setTimeout(() => remove(id), duration)
  }

  return {
    toasts: readonly(toasts),
    remove,
    success: (msg: string) => add(msg, 'success'),
    error: (msg: string) => add(msg, 'error'),
    warning: (msg: string) => add(msg, 'warning'),
    info: (msg: string) => add(msg, 'info'),
  }
}
