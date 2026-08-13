import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { registrarAuditoria } from '~~/server/utils/parceiroLicencas'

const MODELOS = ['comissao', 'licenca_prepaga']

/**
 * Vira a chave do modelo de negócio de UM parceiro.
 *
 * É o feature flag da migração: ninguém troca de modelo em massa. O histórico
 * de comissão do parceiro continua intacto e consultável depois da migração —
 * nada é convertido em crédito automaticamente.
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { parceiroId, modelo } = await readBody<{ parceiroId?: string; modelo?: string }>(event)

  const id = String(parceiroId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Parceiro inválido' })
  }
  if (!MODELOS.includes(String(modelo))) {
    throw createError({ statusCode: 400, statusMessage: 'Modelo inválido' })
  }

  const supabase = getServiceClient()

  const { data: atual, error: buscaErr } = await supabase
    .from('parceiros')
    .select('id, nome, modelo_negocio')
    .eq('id', id)
    .maybeSingle()
  if (buscaErr) return failPublic(buscaErr, 'admin/parceiros/modelo', 'Não foi possível alterar o modelo.')
  if (!atual) throw createError({ statusCode: 404, statusMessage: 'Parceiro não encontrado' })
  if (atual.modelo_negocio === modelo) return { success: true as const, data: { inalterado: true } }

  const agora = new Date().toISOString()
  const { error } = await supabase
    .from('parceiros')
    .update({
      modelo_negocio: modelo,
      migrado_em: modelo === 'licenca_prepaga' ? agora : null,
      migrado_por: modelo === 'licenca_prepaga' ? adminUserId : null,
      updated_at: agora,
    })
    .eq('id', id)
  if (error) return failPublic(error, 'admin/parceiros/modelo', 'Não foi possível alterar o modelo.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: id,
    ator_user_id: adminUserId,
    ator_papel: 'admin',
    acao: 'alteracao_modelo_negocio',
    estado_anterior: { modelo_negocio: atual.modelo_negocio },
    estado_novo: { modelo_negocio: modelo },
    origem: 'painel_admin',
  })

  return { success: true as const }
})
