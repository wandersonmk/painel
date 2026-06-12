import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

// Habilita/desabilita módulos do app por empresa (gates de admin).
// Não mexe em `transporte_ativo` (toggle da própria empresa no app).
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { clienteId, roteamentoHabilitado, transporteHabilitado } = await readBody<{
    clienteId: string
    roteamentoHabilitado?: boolean
    transporteHabilitado?: boolean
  }>(event)

  if (!clienteId) {
    throw createError({ statusCode: 400, statusMessage: 'clienteId obrigatório' })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (roteamentoHabilitado !== undefined) {
    if (typeof roteamentoHabilitado !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: 'roteamentoHabilitado deve ser boolean' })
    }
    update.roteamento_habilitado = roteamentoHabilitado
  }
  if (transporteHabilitado !== undefined) {
    if (typeof transporteHabilitado !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: 'transporteHabilitado deve ser boolean' })
    }
    update.transporte_habilitado = transporteHabilitado
  }

  if (Object.keys(update).length === 1) {
    throw createError({ statusCode: 400, statusMessage: 'Nenhum módulo informado' })
  }

  const supabase = getServiceClient()
  const { error } = await supabase.from('empresas').update(update).eq('id', clienteId)
  if (error) return { success: false, error: error.message }
  return { success: true }
})
