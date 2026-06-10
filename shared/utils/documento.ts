function todosIguais(d: string) {
  return d.split('').every(c => c === d[0])
}

function validarCpf(d: string): boolean {
  if (d.length !== 11 || todosIguais(d)) return false
  for (const t of [9, 10]) {
    let soma = 0
    for (let i = 0; i < t; i++) soma += Number(d[i]) * (t + 1 - i)
    const dv = ((soma * 10) % 11) % 10
    if (dv !== Number(d[t])) return false
  }
  return true
}

function validarCnpj(d: string): boolean {
  if (d.length !== 14 || todosIguais(d)) return false
  const calcDv = (len: number) => {
    const pesos = len === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    let soma = 0
    for (let i = 0; i < len; i++) soma += Number(d[i]) * pesos[i]!
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return calcDv(12) === Number(d[12]) && calcDv(13) === Number(d[13])
}

/** Valida CPF (11 dígitos) ou CNPJ (14 dígitos) pelos dígitos verificadores. */
export function validarCpfCnpj(documento: string): boolean {
  const d = (documento || '').replace(/\D/g, '')
  if (d.length === 11) return validarCpf(d)
  if (d.length === 14) return validarCnpj(d)
  return false
}
