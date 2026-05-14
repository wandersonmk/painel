import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

const PERIOD_DAYS: Record<string, number> = {
  trial1d: 1, trial2d: 2, trial3d: 3, trial5d: 5, trial: 7,
  '1month': 30, '6months': 180, '12months': 365,
}

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{ clienteId: string; plan: string; period: string }>(event)

  if (!body?.clienteId || !body.plan || !body.period) {
    throw createError({ statusCode: 400, statusMessage: 'Dados incompletos' })
  }

  const days = PERIOD_DAYS[body.period]
  if (!days) throw createError({ statusCode: 400, statusMessage: 'Período inválido' })

  const renewDate = new Date()
  renewDate.setDate(renewDate.getDate() + days)

  const update: Record<string, any> = {
    subscription_plan: body.plan,
    subscription_period: body.period,
    subscription_status: 'active',
    ativo: true,
    updated_at: new Date().toISOString(),
  }

  if (body.period.startsWith('trial')) {
    update.trial_ends_at = renewDate.toISOString()
    update.subscription_renews_at = null
  } else {
    update.subscription_renews_at = renewDate.toISOString()
    update.trial_ends_at = null
  }

  const supabase = getServiceClient()
  const { error } = await supabase.from('empresas').update(update).eq('id', body.clienteId)

  if (error) return { success: false, error: error.message }
  return { success: true }
})
