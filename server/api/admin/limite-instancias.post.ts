import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { clienteId, maxInstancias, maxAgentes, maxWebhooksEntrada, maxWebhooksSaida, maxCanaisWhatsapp, maxCanaisInstagram, maxCanaisWebchat } = await readBody<{
    clienteId: string
    maxInstancias?: number
    maxAgentes?: number
    maxWebhooksEntrada?: number
    maxWebhooksSaida?: number
    // Conta com plano: limite por tipo de canal. Vem no lugar de maxInstancias.
    maxCanaisWhatsapp?: number
    maxCanaisInstagram?: number
    maxCanaisWebchat?: number
  }>(event)

  if (!clienteId) {
    throw createError({ statusCode: 400, statusMessage: 'clienteId obrigatório' })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  if (maxInstancias !== undefined) {
    if (!Number.isFinite(maxInstancias) || maxInstancias < 1 || maxInstancias > 20) {
      throw createError({ statusCode: 400, statusMessage: 'maxInstancias inválido (1–20)' })
    }
    update.max_instancias = maxInstancias
  }
  if (maxAgentes !== undefined) {
    if (!Number.isFinite(maxAgentes) || maxAgentes < 1 || maxAgentes > 50) {
      throw createError({ statusCode: 400, statusMessage: 'maxAgentes inválido (1–50)' })
    }
    update.max_agentes = maxAgentes
  }
  if (maxWebhooksEntrada !== undefined) {
    if (!Number.isFinite(maxWebhooksEntrada) || maxWebhooksEntrada < 0 || maxWebhooksEntrada > 100) {
      throw createError({ statusCode: 400, statusMessage: 'maxWebhooksEntrada inválido (0–100)' })
    }
    update.max_webhooks_entrada = maxWebhooksEntrada
  }
  // Faixa 0–100 espelha o CHECK da coluna (20260725_webhooks_saida.sql);
  // fora dela o Postgres recusaria o UPDATE com erro genérico.
  if (maxWebhooksSaida !== undefined) {
    if (!Number.isFinite(maxWebhooksSaida) || maxWebhooksSaida < 0 || maxWebhooksSaida > 100) {
      throw createError({ statusCode: 400, statusMessage: 'maxWebhooksSaida inválido (0–100)' })
    }
    update.max_webhooks_saida = maxWebhooksSaida
  }

  // Faixas por tipo de canal (conta com plano). Sem CHECK no banco: a trava é aqui.
  const CANAIS = [
    { valor: maxCanaisWhatsapp, coluna: 'max_canais_whatsapp', nome: 'maxCanaisWhatsapp', max: 20 },
    { valor: maxCanaisInstagram, coluna: 'max_canais_instagram', nome: 'maxCanaisInstagram', max: 5 },
    { valor: maxCanaisWebchat, coluna: 'max_canais_webchat', nome: 'maxCanaisWebchat', max: 5 },
  ] as const
  const porTipo = CANAIS.some(c => c.valor !== undefined)
  if (porTipo && maxInstancias !== undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Mande maxInstancias ou os canais por tipo, não os dois' })
  }
  for (const c of CANAIS) {
    if (c.valor === undefined) continue
    if (!Number.isInteger(c.valor) || c.valor < 0 || c.valor > c.max) {
      throw createError({ statusCode: 400, statusMessage: `${c.nome} inválido (0–${c.max})` })
    }
  }

  if (Object.keys(update).length === 1 && !porTipo) {
    throw createError({ statusCode: 400, statusMessage: 'Nenhum limite informado' })
  }

  const supabase = getServiceClient()

  // Conta com plano: grava cada tipo e mantém max_instancias como a soma, igual
  // aplicar_plano_assinatura. Conta antiga (WhatsApp nulo) não vira conta por
  // tipo por aqui: ela segue com o campo único.
  if (porTipo) {
    const { data: atual, error: erroAtual } = await supabase
      .from('empresas')
      .select('max_canais_whatsapp, max_canais_instagram, max_canais_webchat')
      .eq('id', clienteId)
      .maybeSingle()
    if (erroAtual) return { success: false, error: erroAtual.message }
    if (!atual) throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado' })
    if (atual.max_canais_whatsapp === null || atual.max_canais_whatsapp === undefined) {
      throw createError({ statusCode: 400, statusMessage: 'Esta conta não tem limite por tipo de canal: use o limite de canais WhatsApp.' })
    }
    const novo: Record<string, number> = {}
    for (const c of CANAIS) {
      novo[c.coluna] = c.valor !== undefined ? c.valor : Number((atual as Record<string, unknown>)[c.coluna] ?? 0)
    }
    Object.assign(update, novo)
    update.max_instancias = Math.max(1, novo.max_canais_whatsapp! + novo.max_canais_instagram! + novo.max_canais_webchat!)
  }

  // Cliente com plano assinado pela tela tem limite por tipo de canal. O canal a
  // mais vendido aqui é número de WhatsApp: sem isso o app recusaria o número novo.
  if (maxInstancias !== undefined) {
    const { data: atual } = await supabase
      .from('empresas').select('max_instancias, max_canais_whatsapp').eq('id', clienteId).maybeSingle()
    if (atual?.max_canais_whatsapp !== null && atual?.max_canais_whatsapp !== undefined) {
      update.max_canais_whatsapp = Math.max(0, atual.max_canais_whatsapp + maxInstancias - (atual.max_instancias ?? 1))
    }
  }

  const { error } = await supabase.from('empresas').update(update).eq('id', clienteId)
  if (error) return { success: false, error: error.message }
  return { success: true }
})
