import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

// Habilita/desabilita módulos do app por empresa (gates de admin).
//
// Todos os campos são opcionais: o body só carrega o que mudou, e quem não é
// informado fica como está. Os gates nascem TRUE no banco — exceto
// envios_habilitado, add-on pago que nasce FALSE (só liberado após contato
// comercial).

// key do body -> coluna em `empresas`
const FLAGS: Record<string, string> = {
  roteamentoHabilitado: 'roteamento_habilitado',
  agendamentosHabilitado: 'agendamentos_habilitado',
  paginaAgendamentoHabilitada: 'pagina_agendamento_habilitada',
  apiAssistenteHabilitada: 'api_assistente_habilitada',
  webhooksHabilitado: 'webhooks_habilitado',
  documentacaoHabilitada: 'documentacao_habilitada',
  enviosHabilitado: 'envios_habilitado',
}

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<Record<string, unknown>>(event)
  const clienteId = body?.clienteId as string | undefined

  if (!clienteId) {
    throw createError({ statusCode: 400, statusMessage: 'clienteId obrigatório' })
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }

  for (const [campo, coluna] of Object.entries(FLAGS)) {
    const valor = body[campo]
    if (valor === undefined) continue
    if (typeof valor !== 'boolean') {
      throw createError({ statusCode: 400, statusMessage: `${campo} deve ser boolean` })
    }
    update[coluna] = valor
  }

  // Limites de profissionais e clientes moram aqui (e não em /limite-instancias)
  // porque no painel são negociados junto dos módulos. As faixas espelham os
  // CHECKs das colunas; quem aplica de fato são os triggers no banco.
  const LIMITES: Record<string, { coluna: string; min: number; max: number }> = {
    maxProfissionais: { coluna: 'max_profissionais', min: 1, max: 500 },
    maxClientes: { coluna: 'max_clientes', min: 1, max: 1_000_000 },
    // 0 = sem plano de envios. O teto espelha o CHECK da coluna, folgado de
    // propósito pra caber faixas maiores que as três vendidas hoje.
    maxEnviosMes: { coluna: 'max_envios_mes', min: 0, max: 200_000 },
  }

  for (const [campo, regra] of Object.entries(LIMITES)) {
    const valor = body[campo]
    if (valor === undefined) continue
    if (!Number.isInteger(valor) || (valor as number) < regra.min || (valor as number) > regra.max) {
      throw createError({ statusCode: 400, statusMessage: `${campo} inválido (${regra.min}–${regra.max})` })
    }
    update[regra.coluna] = valor
  }

  // Gate desligado nunca convive com faixa contratada: zera aqui também, e não
  // só na tela, pra não sobrar plano fantasma se a chamada vier de outro lugar.
  if (update.envios_habilitado === false) update.max_envios_mes = 0

  if (Object.keys(update).length === 1) {
    throw createError({ statusCode: 400, statusMessage: 'Nenhum módulo informado' })
  }

  const supabase = getServiceClient()
  const { error } = await supabase.from('empresas').update(update).eq('id', clienteId)
  if (error) return { success: false, error: error.message }
  return { success: true }
})
