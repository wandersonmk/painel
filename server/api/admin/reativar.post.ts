import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { calcularStatusReativacao } from '~~/server/utils/acessoCliente'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { clienteId } = await readBody<{ clienteId: string }>(event)
  if (!clienteId) throw createError({ statusCode: 400, statusMessage: 'clienteId obrigatório' })

  const supabase = getServiceClient()

  const { data: emp } = await supabase
    .from('empresas')
    .select('subscription_plan, subscription_period, trial_ends_at, subscription_renews_at')
    .eq('id', clienteId)
    .single()

  const novoStatus = calcularStatusReativacao(emp)

  const { error } = await supabase
    .from('empresas')
    .update({
      ativo: true,
      subscription_status: novoStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clienteId)

  if (error) return { success: false, error: error.message }

  // Reativar pela Agzap limpa qualquer bloqueio registrado no vínculo — inclusive
  // o comercial do parceiro, já que o admin pode sobrescrever a ação dele.
  await supabase
    .from('parceiro_empresas')
    .update({ bloqueio_origem: null, bloqueado_em: null, bloqueado_por: null, updated_at: new Date().toISOString() })
    .eq('empresa_id', clienteId)
    .eq('ativo', true)

  return { success: true, subscription_status: novoStatus }
})
