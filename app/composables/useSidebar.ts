import { ref, readonly } from 'vue'

const isCollapsed = ref(false)
const isMobileOpen = ref(false)

export function useSidebar() {
  function init() {
    if (!import.meta.client) return
    const saved = localStorage.getItem('agzap-sidebar')
    if (saved !== null) isCollapsed.value = saved === 'true'
  }

  function toggle() {
    isCollapsed.value = !isCollapsed.value
    if (import.meta.client) {
      localStorage.setItem('agzap-sidebar', String(isCollapsed.value))
    }
  }

  function openMobile() {
    isMobileOpen.value = true
  }

  function closeMobile() {
    isMobileOpen.value = false
  }

  function toggleMobile() {
    isMobileOpen.value = !isMobileOpen.value
  }

  return {
    isCollapsed: readonly(isCollapsed),
    isMobileOpen: readonly(isMobileOpen),
    init,
    toggle,
    openMobile,
    closeMobile,
    toggleMobile,
  }
}
