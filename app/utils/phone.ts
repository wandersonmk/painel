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

function detectCountry(d: string): { c: Country; national: string } | null {
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

  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return `+${d}`
}

export function whatsappLink(phone: string | null | undefined): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  if (!d) return null
  const withDdi = detectCountry(d) ? d : (d.length === 10 || d.length === 11 ? `55${d}` : d)
  return `https://wa.me/${withDdi}`
}

export function phoneCountryFlag(phone: string | null | undefined): string | null {
  if (!phone) return null
  const d = phone.replace(/\D/g, '')
  return detectCountry(d)?.c.flag ?? null
}
