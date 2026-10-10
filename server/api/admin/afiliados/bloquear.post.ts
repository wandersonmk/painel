import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/**
 * Bloqueia ou desbloqueia um afiliado. Bloquear exige motivo (fica em
 * bloqueado_motivo); desbloquear limpa o motivo. Afiliado bloqueado não gera
 * comissão nova (a função do banco checa afiliados.ativo). O que ele já ganhou
 * continua registrado.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{ afiliadoId?: string; bloquear?: boolean; motivo?: string | null }>(event)

  const afiliadoId = String(body?.afiliadoId ?? '')
  if (!UUID_RE.test(afiliadoId) || typeof body?.bloquear !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'afiliadoId e bloquear obrigatorios' })
  }

  const bloquear = body.bloquear
  const motivo = String(body.motivo ?? '').trim()
  if (bloquear && motivo.length < 3) {
    return { success: false, error: 'Informe o motivo do bloqueio.' }
  }
  if (motivo.length > 500) {
    return { success: false, error: 'O motivo pode ter no máximo 500 caracteres.' }
  }

  const supabase = getServiceClient()

  // Desbloquear: um papel ativo por vez (regra do dono, 09/10/2026).
  if (!bloquear) {
    const { data: afiliado } = await supabase.from('afiliados').select('auth_user_id').eq('id', afiliadoId).maybeSingle()
    if (afiliado?.auth_user_id) {
      const { data: parceiro } = await supabase
        .from('parceiros').select('id').eq('auth_user_id', afiliado.auth_user_id).eq('ativo', true).maybeSingle()
      if (parceiro) {
        return { success: false, error: 'Este login é parceiro agora. Remova a parceria antes de desbloquear o afiliado.' }
      }
    }
  }

  // Desbloquear também desfaz a remoção (afiliação removida volta a valer).
  const { data, error } = await supabase
    .from('afiliados')
    .update({
      ativo: !bloquear,
      bloqueado_motivo: bloquear ? motivo : null,
      ...(bloquear ? {} : { removido_em: null }),
      updated_at: new Date().toISOString(),
    })
    .eq('id', afiliadoId)
    .select('id')
  if (error) {
    return failPublic(error, 'admin/afiliados/bloquear', bloquear
      ? 'Não foi possível bloquear o afiliado.'
      : 'Não foi possível desbloquear o afiliado.')
  }
  if (!data?.length) return { success: false, error: 'Afiliado não encontrado.' }

  return { success: true }
})
