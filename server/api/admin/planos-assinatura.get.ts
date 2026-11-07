import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

// Planos que a renovação pelo painel pode aplicar.
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { data, error } = await getServiceClient()
    .from('planos_assinatura')
    .select('codigo, nome, preco_mensal, preco_anual')
    .eq('ativo', true)
    .order('ordem')
  if (error) throw createError({ statusCode: 500, statusMessage: 'Não consegui carregar os planos' })
  return {
    planos: (data ?? []).map(p => ({
      codigo: p.codigo,
      nome: p.nome,
      precoMensal: Number(p.preco_mensal),
      precoAnual: Number(p.preco_anual),
    })),
  }
})
