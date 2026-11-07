import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { clienteId, maxInstancias, maxAgentes, maxWebhooksEntrada, maxWebhooksSaida } = await readBody<{
    clienteId: string
    maxInstancias?: number
    maxAgentes?: number
    maxWebhooksEntrada?: number
    maxWebhooksSaida?: number
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

  if (Object.keys(update).length === 1) {
    throw createError({ statusCode: 400, statusMessage: 'Nenhum limite informado' })
  }

  const supabase = getServiceClient()

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
