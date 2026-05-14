import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

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

  const agora = new Date()
  const isTrial = emp?.subscription_plan === 'free' || emp?.subscription_period === 'trial' || (emp?.subscription_period?.startsWith('trial') ?? false)

  let novoStatus: 'active' | 'trial' | 'expired' = 'expired'

  if (isTrial) {
    const trial = emp?.trial_ends_at ? new Date(emp.trial_ends_at) : null
    novoStatus = trial && trial >= agora ? 'trial' : 'expired'
  } else {
    const renew = emp?.subscription_renews_at ? new Date(emp.subscription_renews_at) : null
    novoStatus = renew && renew >= agora ? 'active' : 'expired'
  }

  const { error } = await supabase
    .from('empresas')
    .update({
      ativo: true,
      subscription_status: novoStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', clienteId)

  if (error) return { success: false, error: error.message }
  return { success: true, subscription_status: novoStatus }
})
