import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

/**
 * GET /api/admin/indicacao-vinculo?empresaId= — quem indicou este cliente
 * (empresas.indicado_por_empresa_id) e o que essa indicação já gerou para a
 * indicadora: recebido, em carência, meses programados (plano anual) e
 * cancelado. Usado pelo modal aberto no badge "Indicação de …".
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const empresaId = String(getQuery(event).empresaId || '')
  if (!empresaId) throw createError({ statusCode: 400, statusMessage: 'empresaId é obrigatório' })

  const supabase = getServiceClient()
  const { data: indicada, error } = await supabase
    .from('empresas')
    .select('id, nome, indicado_por_empresa_id')
    .eq('id', empresaId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!indicada) throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado' })
  if (!indicada.indicado_por_empresa_id) return { indicadora: null, resumo: null, meses: [] }

  const { data: indicadora } = await supabase
    .from('empresas')
    .select('id, nome, nome_cliente, email, whatsapp, subscription_status, subscription_plan, subscription_price, ativo')
    .eq('id', indicada.indicado_por_empresa_id)
    .maybeSingle()

  const { data: comissoes, error: cErr } = await supabase
    .from('indicacoes_comissoes')
    .select('id, status, tipo, parcela, parcelas_total, percentual_aplicado, valor_base, valor_credito, liberar_em, liberado_em, utilizado_em, motivo_estorno, created_at, referencia_pagamento, origem_pagamento')
    .eq('empresa_indicada_id', empresaId)
    .eq('empresa_indicadora_id', indicada.indicado_por_empresa_id)
    .order('liberar_em', { ascending: true })
  if (cErr) throw createError({ statusCode: 500, statusMessage: cErr.message })

  const linhas = (comissoes || []) as any[]
  const programada = (l: any) => l.status === 'pendente_liberacao' && Number(l.parcela || 1) > 1
  const soma = (filtro: (l: any) => boolean) => Math.round(linhas.filter(filtro).reduce((a, l) => a + Number(l.valor_credito || 0), 0) * 100) / 100

  return {
    indicadora: indicadora
      ? {
          id: indicadora.id,
          nome: indicadora.nome,
          responsavel: indicadora.nome_cliente?.trim() || null,
          email: indicadora.email || null,
          whatsapp: indicadora.whatsapp || null,
          status: indicadora.subscription_status || null,
          plano: indicadora.subscription_plan || null,
          mensalidade: indicadora.subscription_price == null ? null : Number(indicadora.subscription_price),
          ativo: indicadora.ativo ?? null,
        }
      // Vínculo aponta para empresa apagada: ainda dá pra remover.
      : { id: indicada.indicado_por_empresa_id, nome: 'Empresa não encontrada', responsavel: null, email: null, whatsapp: null, status: null, plano: null, mensalidade: null, ativo: null },
    resumo: {
      recebido: soma(l => ['liberado', 'utilizado', 'creditado'].includes(l.status)),
      carencia: soma(l => l.status === 'pendente_liberacao' && !programada(l)),
      programado: soma(programada),
      mesesProgramados: linhas.filter(programada).length,
      aCancelarSeRemover: soma(l => l.status === 'pendente_liberacao'),
      mesesACancelar: linhas.filter(l => l.status === 'pendente_liberacao').length,
      cancelado: soma(l => l.status === 'cancelado' || l.status === 'estornado'),
    },
    meses: linhas.map(l => ({
      id: l.id,
      status: l.status,
      tipo: l.tipo,
      parcela: l.parcela ?? null,
      parcelasTotal: l.parcelas_total ?? null,
      percentual: Number(l.percentual_aplicado),
      valorBase: Number(l.valor_base),
      valor: Number(l.valor_credito),
      liberarEm: l.liberar_em,
      liberadoEm: l.liberado_em,
      utilizadoEm: l.utilizado_em,
      motivo: l.motivo_estorno,
      // Pagamento que gerou o ganho (o anual inteiro tem a mesma referência):
      // é por ele que o admin registra chargeback/estorno.
      referencia: l.referencia_pagamento,
      origem: l.origem_pagamento,
      criadoEm: l.created_at,
    })),
  }
})
