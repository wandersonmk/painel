import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

/**
 * POST /api/admin/indicacao-comissao-acao { comissaoId, acao, descricao }
 * Ação em UMA parcela (mês) do saldo de indicação, pelo menu "⋯" do modal
 * "Saldo de indicação" (pedido do dono, 05/10/2026):
 *  - acao 'liberar': antecipa a liberação — mês em carência ou programado
 *    vira 'liberado' (disponível) na hora. Descrição opcional.
 *  - acao 'utilizar' ("Marcar como pago"): dá baixa no mês — o desconto foi
 *    aplicado na mensalidade, inclusive ANTECIPADO (vale para carência e
 *    programado). Vira 'utilizado' com a descrição, que a indicadora vê no
 *    Registro de ganhos.
 *  - acao 'cancelar': o ganho não vale (estorno, chargeback, erro). Em
 *    carência/programado → 'cancelado'; liberado → 'estornado'. Com motivo.
 * O desconto em si é aplicado à parte (na cobrança); aqui é só o registro.
 */
type Acao = 'liberar' | 'utilizar' | 'cancelar'

export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { comissaoId, acao, descricao } = await readBody<{ comissaoId: string; acao: Acao; descricao?: string }>(event)
  const texto = String(descricao || '').trim().slice(0, 200)
  if (!comissaoId || !['liberar', 'utilizar', 'cancelar'].includes(acao)) {
    throw createError({ statusCode: 400, statusMessage: 'comissaoId e acao (liberar|utilizar|cancelar) são obrigatórios' })
  }
  if (acao !== 'liberar' && !texto) throw createError({ statusCode: 400, statusMessage: 'Informe a descrição / o motivo' })

  const supabase = getServiceClient()
  const { data: linha, error } = await supabase
    .from('indicacoes_comissoes')
    .select('id, status, valor_credito, liberado_em')
    .eq('id', comissaoId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!linha) throw createError({ statusCode: 404, statusMessage: 'Parcela não encontrada' })

  const agora = new Date().toISOString()
  let patch: Record<string, any>
  let statusEsperado: string[]

  if (acao === 'liberar') {
    statusEsperado = ['pendente_liberacao']
    if (linha.status !== 'pendente_liberacao') {
      throw createError({ statusCode: 409, statusMessage: 'Só dá para liberar um mês em carência ou programado' })
    }
    patch = { status: 'liberado', liberado_em: agora, updated_at: agora }
  } else if (acao === 'utilizar') {
    statusEsperado = ['pendente_liberacao', 'liberado']
    if (!statusEsperado.includes(linha.status)) {
      throw createError({ statusCode: 409, statusMessage: 'Esse mês já foi utilizado ou cancelado' })
    }
    patch = {
      status: 'utilizado',
      liberado_em: linha.liberado_em ?? agora,
      utilizado_em: agora,
      utilizado_descricao: texto,
      updated_at: agora,
    }
  } else {
    statusEsperado = ['pendente_liberacao', 'liberado']
    if (!statusEsperado.includes(linha.status)) {
      throw createError({ statusCode: 409, statusMessage: 'Esse mês já foi utilizado ou cancelado' })
    }
    patch = {
      status: linha.status === 'liberado' ? 'estornado' : 'cancelado',
      motivo_estorno: texto,
      estornado_em: agora,
      updated_at: agora,
    }
  }

  // .in(status) = trava contra corrida (outro clique / o cron liberando junto).
  const { data: atualizada, error: upErr } = await supabase
    .from('indicacoes_comissoes')
    .update(patch)
    .eq('id', comissaoId)
    .in('status', statusEsperado)
    .select('id, status')
    .maybeSingle()
  if (upErr) throw createError({ statusCode: 500, statusMessage: upErr.message })
  if (!atualizada) throw createError({ statusCode: 409, statusMessage: 'O mês mudou de situação agora há pouco. Recarregue e tente de novo.' })

  console.log(`[admin/indicacao-comissao-acao] admin=${adminUserId} comissao=${comissaoId} acao=${acao} valor=${linha.valor_credito} ${linha.status} -> ${atualizada.status}${texto ? ` (${texto})` : ''}`)
  return { success: true, data: { status: atualizada.status, valor: Number(linha.valor_credito) } }
})
