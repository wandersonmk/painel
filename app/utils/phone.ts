type Country = { ddi: string; flag: string; lens: number[] }

const COUNTRIES: Country[] = [
  { ddi: '598', flag: 'UY', lens: [8, 9] },
  { ddi: '595', flag: 'PY', lens: [9] },
  { ddi: '351', flag: 'PT', lens: [9] },
  { ddi: '55',  flag: 'BR', lens: [10, 11] },
  { ddi: '54',  flag: 'AR', lens: [10, 11] },
  { ddi: '56',  flag: 'CL', lens: [9] },
  { ddi: '57',  flag: 'CO', lens: [10] },
  { ddi: '52',  flag: 'MX', lens: [10] },
  { ddi: '51',  flag: 'PE', lens: [9] },
  { ddi: '34',  flag: 'ES', lens: [9] },
  { ddi: '1',   flag: 'US', lens: [10] },
]

/**
 * DDDs que existem de verdade. Sem essa lista, "569xxxxxxxx" (Chile com DDI)
 * passaria por celular brasileiro de DDD 56, que não existe.
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

/**
 * Número nacional brasileiro, gravado sem o 55 na frente.
 *
 * Precisa ser testado ANTES da detecção por DDI: o DDI dos EUA é '1' e engolia
 * todo celular de DDD 11 a 19 — São Paulo inteiro virava "+1 (9xx) xxx-xxxx".
 *
 * Celular: 11 dígitos, DDD válido e o 9 obrigatório na frente.
 * Fixo: 10 dígitos, DDD válido e começando de 2 a 5.
 *
 * Um número dos EUA só cairia aqui por engano se o código de área tivesse 9 no
 * meio (99x), faixa que a NANP não usa. Para um produto brasileiro, a troca é
 * essa e vale a pena.
 */
function isBrNacional(d: string): boolean {
  const ddd = Number(d.slice(0, 2))
  if (!DDD_BR.has(ddd)) return false
  if (d.length === 11) return d[2] === '9'
  if (d.length === 10) return /[2-5]/.test(d[2] ?? '')
  return false
}

const BR: Country = COUNTRIES.find(c => c.flag === 'BR')!

function detectCountry(d: string): { c: Country; national: string } | null {
  if (isBrNacional(d)) return { c: BR, national: d }
  for (const c of COUNTRIES) {
    if (!d.startsWith(c.ddi)) continue
    const rest = d.slice(c.ddi.length)
    if (c.lens.includes(rest.length)) return { c, national: rest }
  }
  return null
}

function formatNational(flag: string, n: string): string {
  if (flag === 'BR' || flag === 'AR') {
    if (n.length === 11) return `(${n.slice(0, 2)}) ${n.slice(2, 7)}-${n.slice(7)}`
    if (n.length === 10) return `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`
  }
  if (flag === 'US' && n.length === 10) return `(${n.slice(0, 3)}) ${n.slice(3, 6)}-${n.slice(6)}`
  if (flag === 'MX' && n.length === 10) return `${n.slice(0, 2)} ${n.slice(2, 6)} ${n.slice(6)}`
  if (flag === 'CO' && n.length === 10) return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  if ((flag === 'PT' || flag === 'PE' || flag === 'PY') && n.length === 9)
    return `${n.slice(0, 3)} ${n.slice(3, 6)} ${n.slice(6)}`
  if (flag === 'ES' && n.length === 9) return `${n.slice(0, 3)} ${n.slice(3, 5)} ${n.slice(5, 7)} ${n.slice(7)}`
  if (flag === 'CL' && n.length === 9) return `${n.slice(0, 1)} ${n.slice(1, 5)} ${n.slice(5)}`
  if (flag === 'UY') {
    if (n.length === 9) return `${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`
    if (n.length === 8) return `${n.slice(0, 4)} ${n.slice(4)}`
  }
  return n
}

export function formatPhone(phone: string | null | undefined): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  if (!d) return null

  const match = detectCountry(d)
  if (match) return `+${match.c.ddi} ${formatNational(match.c.flag, match.national)}`

  // Número que começa com 55 mas não fecha como BR completo (13/12 dígitos):
  // foi gravado com o DDI dentro da máscara nacional — ex.: "(55) 21981-0810".
  // Mostrar o 55 como DDI e o que vem depois como DDD + número (possivelmente
  // truncado na origem), em vez de exibir "(55)" como se fosse DDD.
  if (d.startsWith('55') && d.length > 4) {
    const rest = d.slice(2)
    return `+55 (${rest.slice(0, 2)}) ${rest.slice(2)}`
  }

  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `+${d}`
}

/**
 * Exibição local para as telas do parceiro: números brasileiros ficam apenas
 * com DDD + número. O DDI continua no link do WhatsApp e números estrangeiros
 * mantêm o próprio DDI para não ficarem ambíguos.
 */
export function formatPhoneSemDdiBrasil(phone: string | null | undefined): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  if (!d) return null

  const match = detectCountry(d)
  if (match?.c.flag === 'BR') return formatNational('BR', match.national)

  // Também limpa cadastros brasileiros antigos com 55 duplicado ou número
  // nacional incompleto, preservando o máximo possível do que foi gravado.
  if (d.startsWith('55') && d.length > 4) {
    const nacional = d.slice(2)
    if (nacional.length === 10 || nacional.length === 11) return formatNational('BR', nacional)
    return `(${nacional.slice(0, 2)}) ${nacional.slice(2)}`
  }

  return formatPhone(phone)
}

export function whatsappLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  if (!d) return null
  // Nacional brasileiro precisa do 55 no link, senão o wa.me abre um número
  // americano. Era o mesmo bug da exibição: o link ia para wa.me/19991091605.
  if (isBrNacional(d)) return `https://wa.me/55${d}`
  // Já tem DDI reconhecido (ou começa com 55): não prefixar de novo.
  const withDdi = detectCountry(d) || d.startsWith('55')
    ? d
    : (d.length === 10 || d.length === 11 ? `55${d}` : d)
  return `https://wa.me/${withDdi}`
}

export function phoneCountryFlag(phone: string | null | undefined): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  return detectCountry(d)?.c.flag ?? null
}
