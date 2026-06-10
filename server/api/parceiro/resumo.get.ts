import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { syncStripeComissoes, computeSaldos, statusExibicao, type ComissaoLancamento } from '~~/server/utils/parceiroComissoes'

export default defineEventHandler(async (event) => {
  const { parceiro } = await requireParceiro(event)

  // Sincroniza pagamentos do Stripe deste parceiro (best-effort, com throttle)
  await syncStripeComissoes(parceiro.id)

  const supabase = getServiceClient()
  const { data: rows, error } = await supabase
    .from('parceiro_comissao_pagamentos')
    .select('id, parceiro_id, empresa_id, origem, valor_base, comissao_percentual, valor_comissao, pago_em, liberar_em, status, repassado_em, empresas ( nome )')
    .eq('parceiro_id', parceiro.id)
    .order('pago_em', { ascending: false })
    .limit(100)
  if (error) return { success: false, error: error.message }

  const agora = new Date()
  const lancamentos = (rows || []).map((r: any) => ({
    id: r.id,
    empresa_id: r.empresa_id,
    empresa_nome: r.empresas?.nome ?? '—',
    origem: r.origem,
    valor_base: Number(r.valor_base),
    comissao_percentual: Number(r.comissao_percentual),
    valor_comissao: Number(r.valor_comissao),
    pago_em: r.pago_em,
    liberar_em: r.liberar_em,
    repassado_em: r.repassado_em,
    status: statusExibicao(r as ComissaoLancamento, agora),
  }))

  const saldos = computeSaldos((rows || []) as ComissaoLancamento[], agora)
  const pix = (parceiro.dados_split as any)?.pix ?? null

  return {
    success: true,
    data: {
      lancamentos,
      saldos,
      config: pix,
      parceiro: { nome: parceiro.nome, email: parceiro.email, telefone: parceiro.telefone },
    },
  }
})
