import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { uazapiRequest, formatPhone, extractPhoneDigits, type UazapiInstanceStatusResponse } from '~~/server/utils/uazapi'

type InstanciaPainel = {
  id: string
  provider: 'uazapi' | 'meta' | 'instagram'
  nome_instancia: string
  status: string
  created_at: string
  /** WhatsApp: número formatado. Instagram: null (usa `username`). */
  phone: string | null
  /** Instagram: @handle sem o arroba. Demais provedores: null. */
  username: string | null
}

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const query = getQuery(event)
  const empresaId = String(query.empresaId || '')
  if (!empresaId) throw createError({ statusCode: 400, statusMessage: 'empresaId obrigatório' })

  const supabase = getServiceClient()

  const [uazResp, metaResp, igResp] = await Promise.all([
    supabase
      .from('instancias_uazapi')
      .select('id, nome_instancia, status, created_at, uazapi_token, phone')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false }),
    supabase
      .from('instancias_meta')
      .select('id, nome_display, phone_number, phone_number_id, status, created_at')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false }),
    // Instagram é canal de tabela própria (não é linha em instancias_meta).
    supabase
      .from('instancias_instagram')
      .select('id, username, ig_business_account_id, status, created_at')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false }),
  ])

  if (uazResp.error) return { success: false, error: uazResp.error.message }
  if (metaResp.error) return { success: false, error: metaResp.error.message }
  if (igResp.error) return { success: false, error: igResp.error.message }

  const uazapiList: InstanciaPainel[] = await Promise.all((uazResp.data || []).map(async (inst) => {
    let phone: string | null = formatPhone(inst.phone)

    if (inst.status === 'connected' && inst.uazapi_token) {
      try {
        const resp = await uazapiRequest<UazapiInstanceStatusResponse>('/instance/status', { token: inst.uazapi_token })
        const jidRaw = typeof resp?.status?.jid === 'string' ? resp.status.jid : (typeof resp?.jid === 'string' ? resp.jid : null)
        const phoneFromJid = jidRaw ? jidRaw.split('@')[0].split(':')[0] : null
        const liveDigits = extractPhoneDigits(phoneFromJid || resp?.instance?.owner)
        if (liveDigits && liveDigits !== inst.phone) {
          await supabase
            .from('instancias_uazapi')
            .update({ phone: liveDigits })
            .eq('id', inst.id)
        }
        if (liveDigits) phone = formatPhone(liveDigits)
      } catch {
        // mantém telefone salvo anteriormente, se houver
      }
    }

    return {
      id: inst.id,
      provider: 'uazapi' as const,
      nome_instancia: inst.nome_instancia,
      status: inst.status,
      created_at: inst.created_at,
      phone,
      username: null,
    }
  }))

  const metaList: InstanciaPainel[] = (metaResp.data || []).map((inst) => ({
    id: inst.id,
    provider: 'meta' as const,
    nome_instancia: inst.nome_display?.trim() || `Meta · ${inst.phone_number_id?.slice(-4) || '—'}`,
    status: inst.status || 'ativo',
    created_at: inst.created_at,
    phone: inst.phone_number || null,
    username: null,
  }))

  const instagramList: InstanciaPainel[] = (igResp.data || []).map((inst) => {
    const handle = inst.username?.trim() || null
    return {
      id: inst.id,
      provider: 'instagram' as const,
      nome_instancia: handle || `Instagram · ${inst.ig_business_account_id?.slice(-4) || '—'}`,
      status: inst.status || 'ativo',
      created_at: inst.created_at,
      phone: null,
      username: handle,
    }
  })

  const result = [...uazapiList, ...metaList, ...instagramList].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  )

  return { success: true, data: result }
})
