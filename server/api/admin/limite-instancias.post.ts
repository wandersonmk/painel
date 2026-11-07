import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

// Limites e canais da empresa (modal "Limites e canais"). Todos os campos são
// opcionais: a tela manda só o que mudou, e quem não vem fica como está.
//
// Canais por tipo valem para qualquer conta (dono, 07/11/2026): o app trava
// cada tipo pela própria coluna quando ela não é nula. Conta antiga (colunas
// nulas) passa a ter limite por tipo quando os três chegam juntos.
// max_instancias vira a soma, igual aplicar_plano_assinatura.

// Faixas espelham os CHECKs das colunas (os mesmos de modulos.post.ts); fora
// delas o Postgres recusaria o UPDATE com erro genérico. Canais e funis não têm
// CHECK no banco: a trava é aqui.
const LIMITES: Record<string, { coluna: string; min: number; max: number }> = {
  maxAgentes: { coluna: 'max_agentes', min: 1, max: 50 },
  maxWebhooksEntrada: { coluna: 'max_webhooks_entrada', min: 0, max: 100 },
  maxWebhooksSaida: { coluna: 'max_webhooks_saida', min: 0, max: 100 },
  maxProfissionais: { coluna: 'max_profissionais', min: 1, max: 500 },
  maxClientes: { coluna: 'max_clientes', min: 1, max: 1_000_000 },
  maxMacros: { coluna: 'max_macros', min: 0, max: 100 },
  // Funis além do quadro Geral, que não conta (trigger trg_limite_funis). Nulo =
  // sem limite; por aqui só se grava número.
  maxFunis: { coluna: 'max_funis', min: 1, max: 500 },
}

const CANAIS = [
  { campo: 'maxCanaisWhatsapp', coluna: 'max_canais_whatsapp', max: 20 },
  { campo: 'maxCanaisInstagram', coluna: 'max_canais_instagram', max: 5 },
  { campo: 'maxCanaisWebchat', coluna: 'max_canais_webchat', max: 5 },
] as const

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<Record<string, unknown>>(event)
  const clienteId = body?.clienteId as string | undefined
  if (!clienteId) {
    throw createError({ statusCode: 400, statusMessage: 'clienteId obrigatório' })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const [campo, regra] of Object.entries(LIMITES)) {
    const valor = body[campo]
    if (valor === undefined) continue
    if (!Number.isInteger(valor) || (valor as number) < regra.min || (valor as number) > regra.max) {
      throw createError({ statusCode: 400, statusMessage: `${campo} inválido (${regra.min}–${regra.max})` })
    }
    update[regra.coluna] = valor
  }

  // Caminho antigo (campo único de canais WhatsApp). A tela não usa mais, mas
  // fica para não quebrar quem ainda chamar assim.
  const maxInstancias = body.maxInstancias
  if (maxInstancias !== undefined) {
    if (!Number.isInteger(maxInstancias) || (maxInstancias as number) < 1 || (maxInstancias as number) > 20) {
      throw createError({ statusCode: 400, statusMessage: 'maxInstancias inválido (1–20)' })
    }
    update.max_instancias = maxInstancias
  }

  const porTipo = CANAIS.some(c => body[c.campo] !== undefined)
  if (porTipo && maxInstancias !== undefined) {
    throw createError({ statusCode: 400, statusMessage: 'Mande maxInstancias ou os canais por tipo, não os dois' })
  }
  for (const c of CANAIS) {
    const valor = body[c.campo]
    if (valor === undefined) continue
    if (!Number.isInteger(valor) || (valor as number) < 0 || (valor as number) > c.max) {
      throw createError({ statusCode: 400, statusMessage: `${c.campo} inválido (0–${c.max})` })
    }
  }

  if (Object.keys(update).length === 1 && !porTipo) {
    throw createError({ statusCode: 400, statusMessage: 'Nenhum limite informado' })
  }

  const supabase = getServiceClient()

  if (porTipo) {
    const { data: atual, error: erroAtual } = await supabase
      .from('empresas')
      .select('max_canais_whatsapp, max_canais_instagram, max_canais_webchat')
      .eq('id', clienteId)
      .maybeSingle()
    if (erroAtual) return { success: false, error: erroAtual.message }
    if (!atual) throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado' })
    const novo: Record<string, number> = {}
    for (const c of CANAIS) {
      const valor = body[c.campo]
      const salvo = (atual as Record<string, unknown>)[c.coluna]
      if (valor !== undefined) novo[c.coluna] = valor as number
      else if (salvo !== null && salvo !== undefined) novo[c.coluna] = Number(salvo)
      else {
        // Conta antiga: sem o tipo salvo, não há de onde completar.
        throw createError({ statusCode: 400, statusMessage: 'Esta conta ainda não tem limite por tipo de canal: mande WhatsApp, Instagram e site juntos.' })
      }
    }
    Object.assign(update, novo)
    update.max_instancias = Math.max(1, novo.max_canais_whatsapp! + novo.max_canais_instagram! + novo.max_canais_webchat!)
  }

  // Caminho antigo em conta com limite por tipo: o canal a mais vendido aqui é
  // número de WhatsApp; sem isso o app recusaria o número novo.
  if (maxInstancias !== undefined) {
    const { data: atual } = await supabase
      .from('empresas').select('max_instancias, max_canais_whatsapp').eq('id', clienteId).maybeSingle()
    if (atual?.max_canais_whatsapp !== null && atual?.max_canais_whatsapp !== undefined) {
      update.max_canais_whatsapp = Math.max(0, atual.max_canais_whatsapp + (maxInstancias as number) - (atual.max_instancias ?? 1))
    }
  }

  const { error } = await supabase.from('empresas').update(update).eq('id', clienteId)
  if (error) return { success: false, error: error.message }
  return { success: true }
})
