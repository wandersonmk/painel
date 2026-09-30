import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

/**
 * POST /api/admin/indicacao-usar-saldo — registra o uso do saldo LIBERADO
 * de indicação (desconto na renovação por Pix ou serviço).
 * Body: { empresaId, valor, descricao }
 *
 * Consome as comissões 'liberado' da mais antiga pra mais nova (viram
 * 'utilizado'). Se o valor acaba no meio de uma, ela é dividida: a parte
 * usada vira 'utilizado' e o resto continua 'liberado' numa linha nova —
 * o total do extrato não muda.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{ empresaId?: string; valor?: number; descricao?: string }>(event)
  const empresaId = String(body?.empresaId || '')
  const valor = Math.round(Number(body?.valor || 0) * 100) / 100
  const descricao = String(body?.descricao || '').trim().slice(0, 200)
  if (!empresaId) throw createError({ statusCode: 400, statusMessage: 'empresaId é obrigatório' })
  if (!(valor > 0)) throw createError({ statusCode: 400, statusMessage: 'Informe um valor maior que zero' })
  if (!descricao) throw createError({ statusCode: 400, statusMessage: 'Diga em que o saldo foi usado' })

  const supabase = getServiceClient()
  const { data: linhas, error } = await supabase
    .from('indicacoes_comissoes')
    .select('*')
    .eq('empresa_indicadora_id', empresaId)
    .eq('status', 'liberado')
    .order('liberado_em', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const disponivel = Math.round((linhas || []).reduce((a: number, l: any) => a + Number(l.valor_credito || 0), 0) * 100) / 100
  if (valor > disponivel + 0.001) {
    throw createError({ statusCode: 409, statusMessage: `Saldo disponível é R$ ${disponivel.toFixed(2).replace('.', ',')}` })
  }

  const agora = new Date().toISOString()
  let falta = valor
  for (const l of (linhas || []) as any[]) {
    if (falta <= 0.001) break
    const v = Number(l.valor_credito || 0)
    if (v <= falta + 0.001) {
      const { error: e } = await supabase.from('indicacoes_comissoes')
        .update({ status: 'utilizado', utilizado_em: agora, utilizado_descricao: descricao, updated_at: agora })
        .eq('id', l.id).eq('status', 'liberado')
      if (e) throw createError({ statusCode: 500, statusMessage: e.message })
      falta = Math.round((falta - v) * 100) / 100
      continue
    }
    // Usa só parte desta: divide em usada + resto (continua liberado).
    const usado = Math.round(falta * 100) / 100
    const resto = Math.round((v - usado) * 100) / 100
    const { error: e1 } = await supabase.from('indicacoes_comissoes')
      .update({ valor_credito: usado, status: 'utilizado', utilizado_em: agora, utilizado_descricao: descricao, updated_at: agora })
      .eq('id', l.id).eq('status', 'liberado')
    if (e1) throw createError({ statusCode: 500, statusMessage: e1.message })
    const { id: _id, created_at: _c, updated_at: _u, ...campos } = l
    const { error: e2 } = await supabase.from('indicacoes_comissoes').insert({
      ...campos,
      valor_credito: resto,
      status: 'liberado',
      idempotency_key: `${l.idempotency_key}:resto:${Date.now()}`,
      utilizado_em: null,
      utilizado_descricao: null,
    })
    if (e2) throw createError({ statusCode: 500, statusMessage: e2.message })
    falta = 0
  }

  return { success: true, usado: valor, restante: Math.round((disponivel - valor) * 100) / 100 }
})
