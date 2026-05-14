/**
 * UaZapi REST helpers.
 * Auth: per-instance token via `token` header (apiKey).
 * Spec: https://docs.uazapi.com — server URL pattern `https://{subdomain}.uazapi.com`.
 */

export const UAZAPI_BASE_URL = process.env.UAZAPI_BASE_URL || ''
export const UAZAPI_ADMIN_TOKEN = process.env.UAZAPI_ADMIN_TOKEN || ''

export interface UazapiInstanceStatusResponse {
  instance?: {
    id?: string
    token?: string
    status?: string
    name?: string
    profileName?: string
    profilePicUrl?: string
    isBusiness?: boolean
    plataform?: string
    owner?: string
  }
  status?: {
    connected?: boolean
    loggedIn?: boolean
    jid?: string | object | null
  }
  jid?: string | null
}

export function extractPhoneDigits(raw: string | null | undefined): string | null {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  return digits || null
}

export function formatPhone(raw: string | null | undefined): string | null {
  const digits = extractPhoneDigits(raw)
  if (!digits) return null
  // 13 dígitos: 55 + DDD(2) + 9 dígitos → "(11)93926-5111"
  if (digits.length === 13) return `(${digits.slice(2, 4)})${digits.slice(4, 9)}-${digits.slice(9)}`
  // 12 dígitos: 55 + DDD(2) + 8 dígitos → "(11)3926-5111"
  if (digits.length === 12) return `(${digits.slice(2, 4)})${digits.slice(4, 8)}-${digits.slice(8)}`
  // 11 dígitos: DDD(2) + 9 dígitos → "(11)93926-5111"
  if (digits.length === 11) return `(${digits.slice(0, 2)})${digits.slice(2, 7)}-${digits.slice(7)}`
  return digits
}

interface UazapiOptions extends Omit<RequestInit, 'headers'> {
  token?: string
  adminToken?: boolean
}

export async function uazapiRequest<T = any>(path: string, opts: UazapiOptions = {}): Promise<T> {
  if (!UAZAPI_BASE_URL) {
    throw createError({ statusCode: 500, statusMessage: 'UAZAPI_BASE_URL não configurado no .env' })
  }
  const { token, adminToken, ...init } = opts
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (adminToken) {
    if (!UAZAPI_ADMIN_TOKEN) throw createError({ statusCode: 500, statusMessage: 'UAZAPI_ADMIN_TOKEN não configurado' })
    headers.admintoken = UAZAPI_ADMIN_TOKEN
  } else if (token) {
    headers.token = token
  }

  const res = await fetch(`${UAZAPI_BASE_URL}${path}`, { ...init, headers })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`UaZapi ${path} ${res.status}: ${body.slice(0, 200)}`)
  }
  return res.json().catch(() => ({} as T))
}
