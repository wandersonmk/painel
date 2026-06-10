import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { syncStripeComissoes, computeSaldos, statusExibicao, type ComissaoLancamento } from '~~/server/utils/parceiroComissoes'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  // Sincroniza pagamentos do Stripe de todos os vínculos (best-effort, com throttle)
  await syncStripeComissoes()

  const supabase = getServiceClient()

  const [parceirosRes, lancamentosRes] = await Promise.all([
    supabase
      .from('parceiros')
      .select('id, nome, email, telefone, ativo, dados_split')
      .order('nome'),
    supabase
      .from('parceiro_comissao_pagamentos')
      .select('id, parceiro_id, empresa_id, origem, valor_base, comissao_percentual, valor_comissao, pago_em, liberar_em, status, repassado_em, observacao, empresas ( nome ), parceiros ( nome )')
      .order('pago_em', { ascending: false })
      .limit(200),
  ])
  if (parceirosRes.error) return { success: false, error: parceirosRes.error.message }
  if (lancamentosRes.error) return { success: false, error: lancamentosRes.error.message }

  const agora = new Date()
  const todosLancamentos = (lancamentosRes.data || []) as any[]

  const parceiros = (parceirosRes.data || []).map((p: any) => {
    const doParceiro = todosLancamentos.filter(l => l.parceiro_id === p.id)
    return {
      id: p.id,
      nome: p.nome,
      email: p.email,
      telefone: p.telefone,
      ativo: p.ativo,
      pix: p.dados_split?.pix ?? null,
      saldos: computeSaldos(doParceiro as ComissaoLancamento[], agora),
    }
  })

  const lancamentos = todosLancamentos.map(l => ({
    id: l.id,
    parceiro_id: l.parceiro_id,
    parceiro_nome: l.parceiros?.nome ?? '—',
    empresa_nome: l.empresas?.nome ?? '—',
    origem: l.origem,
    valor_base: Number(l.valor_base),
    comissao_percentual: Number(l.comissao_percentual),
    valor_comissao: Number(l.valor_comissao),
    pago_em: l.pago_em,
    liberar_em: l.liberar_em,
    repassado_em: l.repassado_em,
    observacao: l.observacao,
    status: statusExibicao(l as ComissaoLancamento, agora),
  }))

  return { success: true, data: { parceiros, lancamentos } }
})
