import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { registrarAuditoria } from '~~/server/utils/parceiroLicencas'

/**
 * Desvincula o cliente do parceiro.
 *
 * O vínculo em si é apagado (é o que faz o cliente sumir da carteira do
 * parceiro), mas o histórico não se perde: fica em parceiro_vinculos_historico
 * e na auditoria. Créditos já consumidos também sobrevivem — o ledger e as
 * renovações guardam o nome da empresa e usam ON DELETE SET NULL.
 *
 * Desvincular NÃO devolve crédito e NÃO altera vencimento nem bloqueio.
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { empresaId, motivo } = await readBody<{ empresaId: string; motivo?: string }>(event)

  if (!empresaId) {
    throw createError({ statusCode: 400, statusMessage: 'empresaId obrigatório' })
  }

  const supabase = getServiceClient()

  const { data: vinculo, error: vincErr } = await supabase
    .from('parceiro_empresas')
    .select('id, parceiro_id, bloqueio_origem, cobranca_agzap, parceiros ( nome )')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (vincErr) return failPublic(vincErr, 'admin/remover-parceiro', 'Não foi possível remover a atribuição.')
  if (!vinculo) return { success: true, data: { jaEstavaSemParceiro: true } }

  const { data: empresa } = await supabase
    .from('empresas').select('nome, ativo').eq('id', empresaId).maybeSingle()

  const razao = (motivo ?? '').trim().slice(0, 300) || null

  // Histórico ANTES do delete — depois a linha não existe mais para consultar.
  await supabase.from('parceiro_vinculos_historico').insert({
    empresa_id: empresaId,
    empresa_nome: (empresa as any)?.nome ?? null,
    parceiro_anterior_id: (vinculo as any).parceiro_id,
    parceiro_novo_id: null,
    acao: 'desvinculo',
    motivo: razao,
    executado_por: adminUserId,
  })

  const { error } = await supabase
    .from('parceiro_empresas')
    .delete()
    .eq('empresa_id', empresaId)
  if (error) return failPublic(error, 'admin/remover-parceiro', 'Não foi possível remover a atribuição.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: (vinculo as any).parceiro_id,
    empresa_id: empresaId,
    ator_user_id: adminUserId,
    ator_papel: 'admin',
    acao: 'desvinculo_cliente',
    estado_anterior: {
      parceiro_id: (vinculo as any).parceiro_id,
      bloqueio_origem: (vinculo as any).bloqueio_origem,
      cobranca_agzap: (vinculo as any).cobranca_agzap,
    },
    estado_novo: { parceiro_id: null },
    motivo: razao,
    origem: 'painel_admin',
  })

  return {
    success: true,
    data: {
      parceiroNome: (vinculo as any).parceiros?.nome ?? null,
      // Desvincular não desbloqueia: se o parceiro tinha bloqueado o cliente,
      // ele continua bloqueado e só a Agzap consegue reativar.
      clienteSegueBloqueado: (empresa as any)?.ativo === false,
    },
  }
})
