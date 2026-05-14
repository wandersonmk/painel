import { ref, readonly } from 'vue'

const hideValues = ref(false)

export function useHideValues() {
  function init() {
    if (!import.meta.client) return
    const saved = localStorage.getItem('agzap-hide-values')
    if (saved !== null) hideValues.value = saved === 'true'
  }

  function toggle() {
    hideValues.value = !hideValues.value
    if (import.meta.client) {
      localStorage.setItem('agzap-hide-values', String(hideValues.value))
    }
  }

  /**
   * Mascara um valor monetário formatado.
   * Mantém o "R$" + espaço pra preservar layout, troca dígitos por bullets.
   */
  function mask(formatted: string): string {
    if (!hideValues.value) return formatted
    // Mantém o prefixo "R$ " e troca o resto por bullets
    const match = formatted.match(/^(R\$\s*)/)
    const prefix = match ? match[1] : ''
    return `${prefix}•••••`
  }

  return {
    hideValues: readonly(hideValues),
    init,
    toggle,
    mask,
  }
}
