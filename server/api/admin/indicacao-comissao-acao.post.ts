import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

/**
 * POST /api/admin/indicacao-comissao-acao { comissaoId, acao, descricao }
 * Ação em UMA parcela (mês) do saldo de indicação, pelo modal "Saldo de
 * indicação" (pedido do dono, 05/10/2026):
 *  - acao 'utilizar': dá baixa no ganho já LIBERADO (virou desconto na
 *    mensalidade). Vira 'utilizado' com a descrição — ex.: "Desconto na
 *    mensalidade de novembro/2026". A indicadora vê isso no Registro de ganhos.
 *  - acao 'cancelar': cancela um ganho que não vale (estorno, chargeback,
 *    erro). Em carência/programado → 'cancelado'; liberado → 'estornado'.
 *    O motivo aparece para a indicadora.
 * O desconto em si é aplicado à parte (na cobrança); aqui é só o registro.
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { comissaoId, acao, descricao } = await readBody<{ comissaoId: string; acao: 'utilizar' | 'cancelar'; descricao: string }>(event)
  const texto = String(descricao || '').trim().slice(0, 200)
  if (!comissaoId || !['utilizar', 'cancelar'].includes(acao)) {
    throw createError({ statusCode: 400, statusMessage: 'comissaoId e acao (utilizar|cancelar) são obrigatórios' })
  }
  if (!texto) throw createError({ statusCode: 400, statusMessage: 'Informe a descrição / o motivo' })

  const supabase = getServiceClient()
  const { data: linha, error } = await supabase
    .from('indicacoes_comissoes')
    .select('id, status, valor_credito, empresa_indicadora_id')
    .eq('id', comissaoId)
    .maybeSingle()
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })
  if (!linha) throw createError({ statusCode: 404, statusMessage: 'Parcela não encontrada' })

  const agora = new Date().toISOString()
  let patch: Record<string, any>
  let statusEsperado: string[]

  if (acao === 'utilizar') {
    statusEsperado = ['liberado']
    if (linha.status !== 'liberado') {
      throw createError({ statusCode: 409, statusMessage: 'Só dá para dar baixa em parcela já liberada (disponível)' })
    }
    patch = { status: 'utilizado', utilizado_em: agora, utilizado_descricao: texto, updated_at: agora }
  } else {
    statusEsperado = ['pendente_liberacao', 'liberado']
    if (!statusEsperado.includes(linha.status)) {
      throw createError({ statusCode: 409, statusMessage: 'Essa parcela já foi utilizada ou cancelada' })
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
  if (!atualizada) throw createError({ statusCode: 409, statusMessage: 'A parcela mudou de situação agora há pouco. Recarregue e tente de novo.' })

  console.log(`[admin/indicacao-comissao-acao] admin=${adminUserId} comissao=${comissaoId} acao=${acao} valor=${linha.valor_credito} -> ${atualizada.status}`)
  return { success: true, data: { status: atualizada.status, valor: Number(linha.valor_credito) } }
})
