import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/**
 * Clientes com Delivery: de parceiro e de assinatura direta pelo app. Pedidos por
 * mês, situação da regra de uso e alertas já enviados. Só leitura.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  const [listaRes, diretosRes, alertasRes] = await Promise.all([
    supabase.rpc('parceiro_delivery_uso_lista'),
    supabase.rpc('delivery_uso_assinantes'),
    supabase.from('parceiro_alertas')
      .select('empresa_id, criado_em, lido_em')
      .order('criado_em', { ascending: false })
      .limit(1000),
  ])
  if (listaRes.error) return failPublic(listaRes.error, 'admin/parceiros/uso-delivery', 'Não foi possível carregar o uso do Delivery.')
  if (alertasRes.error) console.error('[api:admin/parceiros/uso-delivery] alertas', alertasRes.error)
  if (diretosRes.error) console.error('[api:admin/parceiros/uso-delivery] diretos', diretosRes.error)

  // A lista vem do mais novo para o mais velho: o primeiro de cada empresa é o último enviado.
  const alertas = new Map<string, { total: number; ultimo_em: string; ultimo_lido_em: string | null }>()
  for (const a of (alertasRes.data ?? []) as any[]) {
    if (!a.empresa_id) continue
    const atual = alertas.get(a.empresa_id)
    if (atual) atual.total += 1
    else alertas.set(a.empresa_id, { total: 1, ultimo_em: a.criado_em, ultimo_lido_em: a.lido_em })
  }

  const clientes = [...((listaRes.data ?? []) as any[]), ...((diretosRes.data ?? []) as any[])].map(c => ({
    ...c,
    alertas: alertas.get(c.empresa_id) ?? { total: 0, ultimo_em: null, ultimo_lido_em: null },
  }))

  return { success: true, data: { clientes } }
})
