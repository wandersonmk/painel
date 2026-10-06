export type TipoDocumento = 'cpf' | 'cnpj'

function todosIguais(d: string) {
  return d.split('').every(c => c === d[0])
}

/**
 * Tira pontuação e espaços. Letras ficam (em maiúsculas) porque a Receita
 * passou a emitir CNPJ alfanumérico em jul/2026: 12 posições com letras ou
 * dígitos + 2 dígitos verificadores. CPF continua só com dígitos.
 */
export function normalizarDocumento(bruto: string | null | undefined): string {
  return String(bruto ?? '').toUpperCase().replace(/[^0-9A-Z]/g, '')
}

function validarCpf(d: string): boolean {
  if (!/^\d{11}$/.test(d) || todosIguais(d)) return false
  for (const t of [9, 10]) {
    let soma = 0
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i)
    const dv = ((soma * 10) % 11) % 10
    if (dv !== Number(d[t])) return false
  }
  return true
}

/**
 * CNPJ numérico ou alfanumérico. A regra da Receita é a mesma para os dois:
 * cada posição vale (código ASCII − 48), então dígito vale ele mesmo e
 * A=17, B=18… Z=42. Pesos e módulo 11 não mudaram.
 */
function validarCnpj(d: string): boolean {
  if (!/^[0-9A-Z]{12}\d{2}$/.test(d) || todosIguais(d)) return false
  const valor = (c: string) => c.charCodeAt(0) - 48
  const calcDv = (len: number) => {
    const pesos = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < len; i++) soma += valor(d[i]!) * pesos[i]!
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return calcDv(12) === Number(d[12]) && calcDv(13) === Number(d[13])
}

/**
 * Documento já limpo e validado pelos dígitos verificadores, com o tipo.
 * Devolve null quando não é CPF nem CNPJ válido.
 */
export function identificarDocumento(bruto: string | null | undefined): { documento: string; tipo: TipoDocumento } | null {
  const d = normalizarDocumento(bruto)
  if (d.length === 11 && validarCpf(d)) return { documento: d, tipo: 'cpf' }
  if (d.length === 14 && validarCnpj(d)) return { documento: d, tipo: 'cnpj' }
  return null
}

/** Valida CPF (11 dígitos) ou CNPJ (14 posições) pelos dígitos verificadores. */
export function validarCpfCnpj(documento: string): boolean {
  return identificarDocumento(documento) !== null
}

function aplicarMascara(d: string, padrao: string) {
  let saida = ''
  let i = 0
  for (const ch of padrao) {
    if (i >= d.length) break
    saida += ch === '#' ? d[i++] : ch
  }
  return saida
}

/** 000.000.000-00 ou 00.000.000/0000-00 (completo ou parcial). */
export function formatarDocumento(bruto: string | null | undefined): string {
  const d = normalizarDocumento(bruto).slice(0, 14)
  if (d.length <= 11 && /^\d*$/.test(d)) return aplicarMascara(d, '###.###.###-##')
  return aplicarMascara(d, '##.###.###/####-##')
}
