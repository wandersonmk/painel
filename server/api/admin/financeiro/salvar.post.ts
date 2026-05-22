import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

interface SalvarBody {
  id?: string
  tipo: 'entrada' | 'saida'
  descricao: string
  categoria?: string | null
  valor: number
  data_vencimento?: string | null
  data_pagamento?: string | null
  observacao?: string | null
}

export default defineEventHandler(async (event) => {
  const userId = await requireSuperAdmin(event)
  const body = await readBody<SalvarBody>(event)

  if (!body?.tipo || (body.tipo !== 'entrada' && body.tipo !== 'saida')) {
    throw createError({ statusCode: 400, statusMessage: 'tipo inválido' })
  }
  if (!body.descricao?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'descrição obrigatória' })
  }
  if (!Number.isFinite(body.valor) || body.valor < 0) {
    throw createError({ statusCode: 400, statusMessage: 'valor inválido' })
  }

  const payload = {
    tipo: body.tipo,
    descricao: body.descricao.trim(),
    categoria: body.categoria?.trim() || null,
    valor: body.valor,
    data_vencimento: body.data_vencimento || null,
    data_pagamento: body.data_pagamento || null,
    observacao: body.observacao?.trim() || null,
  }

  const supabase = getServiceClient()

  if (body.id) {
    const { data, error } = await supabase
      .from('financeiro_lancamentos')
      .update(payload)
      .eq('id', body.id)
      .select()
      .single()
    if (error) return { success: false, error: error.message }
    return { success: true, data }
  }

  const { data, error } = await supabase
    .from('financeiro_lancamentos')
    .insert({ ...payload, created_by: userId })
    .select()
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, data }
})
