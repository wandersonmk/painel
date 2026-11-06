import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/**
 * Vendas de pedidos extras de um mês (`mes=YYYY-MM`, horário de São Paulo), com o
 * saldo que cada cliente tem agora. Só leitura.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const mes = String(getQuery(event).mes ?? '')
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) {
    throw createError({ statusCode: 400, statusMessage: 'Mês inválido' })
  }
  const [ano, numero] = mes.split('-').map(Number) as [number, number]
  const de = new Date(Date.UTC(ano, numero - 1, 1, 3)).toISOString()
  const ate = new Date(Date.UTC(ano, numero, 1, 3)).toISOString()

  const supabase = getServiceClient()
  const { data, error } = await supabase
    .from('delivery_pedidos_extras_vendas')
    .select('id, empresa_id, empresa_nome, parceiro_id, parceiro_nome, quantidade, valor, lancado_por_nome, criado_em')
    .gte('criado_em', de)
    .lt('criado_em', ate)
    .order('criado_em', { ascending: false })
    .limit(1000)
  if (error) return failPublic(error, 'admin/pedidos-extras', 'Não foi possível carregar as vendas.')

  const vendas = (data ?? []) as any[]
  const empresas = [...new Set(vendas.map(v => v.empresa_id).filter(Boolean))] as string[]

  // Saldo de agora: o que foi comprado menos o que o ciclo já consumiu.
  const saldos = new Map<string, number>()
  await Promise.all(empresas.map(async (id) => {
    const { data: uso, error: usoErr } = await supabase.rpc('delivery_pedidos_mes_uso', { p_empresa_id: id })
    if (usoErr) console.error('[api:admin/pedidos-extras] saldo', usoErr)
    else saldos.set(id, Number((uso as { extras?: number } | null)?.extras ?? 0) || 0)
  }))

  return {
    success: true,
    data: {
      vendas: vendas.map(v => ({
        ...v,
        valor: Number(v.valor),
        saldo_atual: v.empresa_id ? saldos.get(v.empresa_id) ?? null : null,
      })),
    },
  }
})
