import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { parceiroId, ativo } = await readBody<{ parceiroId: string; ativo: boolean }>(event)

  if (!parceiroId || typeof ativo !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'parceiroId e ativo obrigatórios' })
  }

  const supabase = getServiceClient()

  // Reativar: um papel ativo por vez (regra do dono, 09/10/2026).
  if (ativo) {
    const { data: parceiro } = await supabase.from('parceiros').select('auth_user_id').eq('id', parceiroId).maybeSingle()
    if (parceiro?.auth_user_id) {
      const { data: afiliado } = await supabase
        .from('afiliados').select('id').eq('auth_user_id', parceiro.auth_user_id).eq('ativo', true).maybeSingle()
      if (afiliado) {
        return { success: false, error: 'Este login é afiliado agora. Remova a afiliação antes de reativar a parceria.' }
      }
    }
  }

  // Reativar também desfaz a remoção (parceria removida volta a valer).
  // Suspender não mexe em removido_em: suspenso e removido são estados diferentes.
  const { error } = await supabase
    .from('parceiros')
    .update(ativo
      ? { ativo, removido_em: null, updated_at: new Date().toISOString() }
      : { ativo, updated_at: new Date().toISOString() })
    .eq('id', parceiroId)
  if (error) return { success: false, error: error.message }

  return { success: true }
})
