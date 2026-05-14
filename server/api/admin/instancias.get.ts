import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { uazapiRequest, formatPhone, extractPhoneDigits, type UazapiInstanceStatusResponse } from '~~/server/utils/uazapi'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const query = getQuery(event)
  const empresaId = String(query.empresaId || '')
  if (!empresaId) throw createError({ statusCode: 400, statusMessage: 'empresaId obrigatório' })

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('instancias_uazapi')
    .select('id, nome_instancia, status, created_at, uazapi_token, phone')
    .eq('empresa_id', empresaId)
    .order('created_at', { ascending: false })

  if (error) return { success: false, error: error.message }

  const result = await Promise.all((data || []).map(async (inst) => {
    // Banco guarda apenas dígitos (ex: "5511939265111"); formatPhone gera "(11)93926-5111"
    let phone: string | null = formatPhone(inst.phone)

    if (inst.status === 'connected' && inst.uazapi_token) {
      try {
        const resp = await uazapiRequest<UazapiInstanceStatusResponse>('/instance/status', { token: inst.uazapi_token })
        // Tenta status.jid (formato "5511999999999:35@s.whatsapp.net"), depois jid raiz, depois instance.owner
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
        // Mantém o telefone salvo anteriormente, se houver
      }
    }

    return {
      id: inst.id,
      nome_instancia: inst.nome_instancia,
      status: inst.status,
      created_at: inst.created_at,
      phone,
    }
  }))

  return { success: true, data: result }
})
