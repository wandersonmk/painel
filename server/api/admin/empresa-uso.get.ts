import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { empresaId } = getQuery(event) as { empresaId?: string }
  if (!empresaId) throw createError({ statusCode: 400, statusMessage: 'empresaId obrigatório' })

  const supabase = getServiceClient()

  const [agentesResp, webhooksResp] = await Promise.all([
    supabase.from('agente_configuracoes').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
    supabase.from('webhooks_entrada').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId),
  ])

  return {
    success: true,
    data: {
      assistentes: agentesResp.count ?? 0,
      webhooks: webhooksResp.count ?? 0,
    },
  }
})
