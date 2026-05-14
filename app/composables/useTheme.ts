import { ref, computed } from 'vue'

const isDark = ref(true)

export function useTheme() {
  function apply() {
    if (!import.meta.client) return
    if (isDark.value) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  function init() {
    if (!import.meta.client) return
    const saved = localStorage.getItem('agzap-theme')
    isDark.value = saved === null ? true : saved === 'dark'
    apply()
  }

  function toggle() {
    isDark.value = !isDark.value
    if (import.meta.client) {
      localStorage.setItem('agzap-theme', isDark.value ? 'dark' : 'light')
    }
    apply()
  }

  // computed garante reatividade correta no template
  return { isDark: computed(() => isDark.value), init, toggle }
}
