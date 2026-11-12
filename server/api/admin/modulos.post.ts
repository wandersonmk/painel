import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

// Habilita/desabilita módulos do app por empresa (gates de admin).
//
// Todos os campos são opcionais: o body só carrega o que mudou, e quem não é
// informado fica como está. Os gates nascem TRUE no banco — exceto os add-ons
// pagos (envios_habilitado, delivery_modulo_ativo, desde 28/09/2026
// roteamento_habilitado e, desde 01/10/2026, imoveis_modulo_ativo), que nascem
// FALSE (só liberados após contratação).

// key do body -> coluna em `empresas`
// Especialidades do Módulo Clínica (espelha ESPECIALIDADES do app).
const ESPECIALIDADES_CLINICA = ['odontologia', 'estetica', 'psicologia', 'medica', 'fisioterapia', 'nutricao', 'outra']

const FLAGS: Record<string, string> = {
  roteamentoHabilitado: 'roteamento_habilitado',
  agendamentosHabilitado: 'agendamentos_habilitado',
  paginaAgendamentoHabilitada: 'pagina_agendamento_habilitada',
  apiAssistenteHabilitada: 'api_assistente_habilitada',
  webhooksHabilitado: 'webhooks_habilitado',
  documentacaoHabilitada: 'documentacao_habilitada',
  // URL personalizada da agenda: nasce TRUE, conta antiga continua liberada.
  dominioAgendaHabilitado: 'dominio_agenda_habilitado',
  enviosHabilitado: 'envios_habilitado',
  // Add-on pago, mesmo padrão de enviosHabilitado: nasce FALSE no banco.
  deliveryModuloAtivo: 'delivery_modulo_ativo',
  // Imóveis (01/10/2026): add-on pago, mesmo padrão de Delivery — nasce FALSE.
  imoveisModuloAtivo: 'imoveis_modulo_ativo',
  // Produtos (vitrine): add-on desde 11/11/2026 — desligado some do menu do app.
  vitrineHabilitada: 'vitrine_habilitada',
  // Add-ons que nascem FALSE (o plano Enterprise liga os dois).
  gruposHabilitado: 'grupos_habilitado',
  formulariosHabilitado: 'formularios_habilitado',
  // Módulo Clínica (11/11/2026): add-on, nasce FALSE.
  clinicaModuloAtivo: 'clinica_modulo_ativo',
  // Infoprodutor (12/11/2026): add-on, nasce FALSE.
  infoprodutorHabilitado: 'infoprodutor_habilitado',
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
    // Espelham os CHECKs de empresas.max_macros / max_acoes_macro (>= 0).
    maxMacros: { coluna: 'max_macros', min: 0, max: 100 },
    maxAcoesMacro: { coluna: 'max_acoes_macro', min: 0, max: 50 },
    // 0 = sem limite de pedidos. Mesmo padrão de maxEnviosMes, mas pro
    // módulo Delivery (soma pedidos de WhatsApp + site).
    maxPedidosMes: { coluna: 'max_pedidos_mes', min: 0, max: 200_000 },
    // Produtos da Vitrine ("Produtos" no menu do app). 0 = sem limite.
    // Espelha o CHECK de empresas.max_produtos_vitrine; quem trava de fato é
    // POST /api/vitrine/produtos no app.
    maxProdutosVitrine: { coluna: 'max_produtos_vitrine', min: 0, max: 100_000 },
    // Imóveis cadastrados (módulo Imóveis no app). 0 = sem limite, padrão 100.
    // Quem trava de fato é POST /api/imoveis no app (conta todos, inativos inclusos).
    maxImoveis: { coluna: 'max_imoveis', min: 0, max: 100_000 },
    // Funis de CRM, gravado pelo plano. Quem trava é o trigger trg_limite_funis,
    // que conta o quadro Geral junto. Nulo (conta antiga) = sem limite: a tela
    // só manda este campo para conta com plano.
    maxFunis: { coluna: 'max_funis', min: 1, max: 500 },
  }

  for (const [campo, regra] of Object.entries(LIMITES)) {
    const valor = body[campo]
    if (valor === undefined) continue
    if (!Number.isInteger(valor) || (valor as number) < regra.min || (valor as number) > regra.max) {
      throw createError({ statusCode: 400, statusMessage: `${campo} inválido (${regra.min}–${regra.max})` })
    }
    update[regra.coluna] = valor
  }

  // Especialidades da clínica (11/11/2026): liberam as funções de cada uma
  // (odontograma, mapa facial...). Lista de chaves conhecidas, sem repetir.
  if (body.clinicaEspecialidades !== undefined) {
    const lista = body.clinicaEspecialidades
    if (!Array.isArray(lista) || lista.some(e => typeof e !== 'string' || !ESPECIALIDADES_CLINICA.includes(e))) {
      throw createError({ statusCode: 400, statusMessage: 'clinicaEspecialidades inválido' })
    }
    update.clinica_especialidades = [...new Set(lista as string[])]
  }

  // Gate desligado nunca convive com faixa contratada: zera aqui também, e não
  // só na tela, pra não sobrar plano fantasma se a chamada vier de outro lugar.
  if (update.envios_habilitado === false) update.max_envios_mes = 0
  if (update.delivery_modulo_ativo === false) update.max_pedidos_mes = 0

  if (Object.keys(update).length === 1) {
    throw createError({ statusCode: 400, statusMessage: 'Nenhum módulo informado' })
  }

  const supabase = getServiceClient()

  // Nomenclatura (12/11/2026): ao LIGAR a Clínica ou TROCAR as especialidades,
  // o app passa a chamar as pessoas pelo perfil: clínica de saúde = "Pacientes";
  // só estética = "Clientes". Quem usa "Leads" fica como está; depois disso a
  // empresa pode trocar em Personalização (só muda de novo se mexerem aqui).
  if (update.clinica_modulo_ativo === true || update.clinica_especialidades !== undefined) {
    const { data: atual } = await supabase
      .from('empresas')
      .select('clinica_modulo_ativo, clinica_especialidades, nomenclatura_pessoa')
      .eq('id', clienteId)
      .maybeSingle()
    if (atual) {
      const ligada = update.clinica_modulo_ativo ?? atual.clinica_modulo_ativo
      const esp: string[] = (update.clinica_especialidades as string[] | undefined) ?? atual.clinica_especialidades ?? []
      const antes = [...(atual.clinica_especialidades || [])].sort().join(',')
      const mudouEsp = update.clinica_especialidades !== undefined && [...esp].sort().join(',') !== antes
      const ligouAgora = update.clinica_modulo_ativo === true && atual.clinica_modulo_ativo !== true
      const termoAtual = atual.nomenclatura_pessoa || 'cliente'
      if (ligada === true && (ligouAgora || mudouEsp) && termoAtual !== 'lead') {
        const soEstetica = esp.includes('estetica') && esp.every(e => e === 'estetica' || e === 'outra')
        update.nomenclatura_pessoa = soEstetica ? 'cliente' : 'paciente'
      }
    }
  }

  const { error } = await supabase.from('empresas').update(update).eq('id', clienteId)
  if (error) return { success: false, error: error.message }
  return { success: true }
})
