import { randomUUID } from 'node:crypto'
import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

const PERIOD_DAYS: Record<string, number> = {
  trial1d: 1, trial2d: 2, trial3d: 3, trial5d: 5, trial: 7,
  '1month': 30, '6months': 180, '12months': 365,
}
const PLANS_VALIDOS = ['free', 'basic', 'pro', 'enterprise']

export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const body = await readBody<{ clienteId: string; plan: string; period: string; motivo?: string }>(event)

  if (!body?.clienteId || !body.plan || !body.period) {
    throw createError({ statusCode: 400, statusMessage: 'Dados incompletos' })
  }
  if (!PLANS_VALIDOS.includes(body.plan)) {
    throw createError({ statusCode: 400, statusMessage: 'Plano inválido' })
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

  // Estado anterior, para o registro da renovação administrativa.
  const { data: antes } = await supabase
    .from('empresas')
    .select('nome, subscription_renews_at, trial_ends_at')
    .eq('id', body.clienteId)
    .maybeSingle()

  const { error } = await supabase.from('empresas').update(update).eq('id', body.clienteId)

  if (error) return { success: false, error: error.message }

  // Se o cliente é de um parceiro, a renovação administrativa fica registrada
  // — sem consumir crédito e sem mexer no vínculo.
  const { data: vinculo } = await supabase
    .from('parceiro_empresas')
    .select('parceiro_id')
    .eq('empresa_id', body.clienteId)
    .eq('ativo', true)
    .maybeSingle()

  if (vinculo) {
    await supabase.from('parceiro_renovacoes').insert({
      parceiro_id: (vinculo as any).parceiro_id,
      empresa_id: body.clienteId,
      empresa_nome: (antes as any)?.nome ?? null,
      tipo_credito: null,
      origem: 'admin',
      consumiu_credito: false,
      vencimento_anterior: (antes as any)?.subscription_renews_at ?? (antes as any)?.trial_ends_at ?? null,
      vencimento_novo: renewDate.toISOString(),
      status: 'concluida',
      idempotency_key: `admrenov:${randomUUID()}`,
      motivo: body.motivo?.trim().slice(0, 300) || null,
      executado_por: adminUserId,
    }).then(({ error: e }) => {
      if (e) console.error('[api:admin/renovar-assinatura] registro de renovação', e)
    })
  }

  return { success: true }
})
