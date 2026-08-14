import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{
    clienteId: string
    nome: string
    email: string
    whatsapp: string | null
    subscription_price: number | null
    /** Só é enviado pelo modal para clientes de parceiro. */
    preco_anual?: number | null
  }>(event)

  if (!body?.clienteId) {
    throw createError({ statusCode: 400, statusMessage: 'clienteId obrigatório' })
  }

  const nome = (body.nome ?? '').trim()
  if (!nome || nome.length > 200) {
    throw createError({ statusCode: 400, statusMessage: 'Nome inválido' })
  }
  const email = (body.email ?? '').trim()
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw createError({ statusCode: 400, statusMessage: 'E-mail inválido' })
  }
  const price = body.subscription_price
  if (price != null && (!Number.isFinite(price) || price < 0 || price > 1_000_000)) {
    throw createError({ statusCode: 400, statusMessage: 'Preço inválido' })
  }
  const precoAnualRecebido = body.preco_anual
  if (precoAnualRecebido != null && (!Number.isFinite(precoAnualRecebido) || precoAnualRecebido < 0 || precoAnualRecebido > 1_000_000)) {
    throw createError({ statusCode: 400, statusMessage: 'Preço anual inválido' })
  }
  // Limpar/zerar restaura o preço padrão em vez de deixar o app sem anual.
  const precoAnual = precoAnualRecebido != null && precoAnualRecebido > 0
    ? Number(precoAnualRecebido.toFixed(2))
    : 2299

  const supabase = getServiceClient()
  const { error } = await supabase
    .from('empresas')
    .update({
      nome,
      email,
      whatsapp: body.whatsapp,
      subscription_price: price,
      // Ausente no corpo = preserva o preço anual atual.
      ...(body.preco_anual !== undefined
        ? { subscription_price_anual: precoAnual }
        : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', body.clienteId)

  if (error) {
    return { success: false, error: error.message }
  }

  return { success: true }
})
