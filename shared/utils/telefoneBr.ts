/**
 * Telefone brasileiro para a cartela de indicações.
 *
 * Formato gravado: 55 + DDD + número, só dígitos (12 ou 13). A busca gera as
 * variantes com e sem o 9º dígito, do mesmo jeito que o app faz em
 * `variantesTelefone` (server/utils/apiAuth.ts do app principal).
 */

const DDD_BR = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19,
  21, 22, 24, 27, 28,
  31, 32, 33, 34, 35, 37, 38,
  41, 42, 43, 44, 45, 46, 47, 48, 49,
  51, 53, 54, 55,
  61, 62, 63, 64, 65, 66, 67, 68, 69,
  71, 73, 74, 75, 77, 79,
  81, 82, 83, 84, 85, 86, 87, 88, 89,
  91, 92, 93, 94, 95, 96, 97, 98, 99,
])

/** DDD + número, sem o 55 e sem o zero de operadora na frente. */
function numeroNacional(bruto: string | null | undefined): string {
  let d = String(bruto ?? '').replace(/\D/g, '').replace(/^0+/, '')
  // 55 só é DDI quando sobra um número nacional completo depois dele:
  // "55999998888" (11 dígitos) é DDD 55 (RS), não DDI.
  if ((d.length === 12 || d.length === 13) && d.startsWith('55')) d = d.slice(2)
  return d
}

/**
 * 55 + DDD + número, ou null se não for um telefone brasileiro com DDD.
 * Celular com 11 dígitos precisa do 9 na frente; com 10 dígitos aceita fixo
 * e celular antigo (sem o 9), que ainda aparece em contas de WhatsApp.
 */
export function normalizarTelefoneBr(bruto: string | null | undefined): string | null {
  const d = numeroNacional(bruto)
  if (d.length !== 10 && d.length !== 11) return null
  if (!DDD_BR.has(Number(d.slice(0, 2)))) return null
  if (d.length === 11 && d[2] !== '9') return null
  if (d.length === 10 && !/[2-9]/.test(d[2] ?? '')) return null
  return `55${d}`
}

/** O mesmo número com e sem o 9º dígito (sempre com 55). */
export function variantesTelefoneBr(bruto: string | null | undefined): string[] {
  const canonico = normalizarTelefoneBr(bruto)
  if (!canonico) return []
  const ddd = canonico.slice(2, 4)
  const numero = canonico.slice(4)
  const variantes = new Set([canonico])
  if (numero.length === 9 && numero.startsWith('9')) variantes.add(`55${ddd}${numero.slice(1)}`)
  else if (numero.length === 8) variantes.add(`55${ddd}9${numero}`)
  return [...variantes]
}

/** (11) 99999-9999 — completo ou parcial, para o campo enquanto digita. */
export function formatarTelefoneBr(bruto: string | null | undefined): string {
  const d = numeroNacional(bruto).slice(0, 11)
  if (!d) return ''
  if (d.length <= 2) return `(${d}`
  const ddd = d.slice(0, 2)
  const resto = d.slice(2)
  if (resto.length <= 4) return `(${ddd}) ${resto}`
  const corte = d.length === 11 ? 5 : 4
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`
}
