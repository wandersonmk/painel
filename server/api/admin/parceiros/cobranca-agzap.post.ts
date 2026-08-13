import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { registrarAuditoria } from '~~/server/utils/parceiroLicencas'

/**
 * Marca um cliente vinculado como "cobrado pela Agzap".
 *
 * Serve para o caso do cliente que já paga a Agzap direto quando o parceiro
 * migra: ele continua aparecendo na carteira do parceiro, mas em leitura —
 * sem botão de renovar e sem consumir crédito. A trava é do lado do banco
 * (a função de consumo recusa com CUSTOMER_BILLED_BY_AGZAP), não da tela.
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { empresaId, cobrancaAgzap, motivo } = await readBody<{
    empresaId?: string
    cobrancaAgzap?: boolean
    motivo?: string
  }>(event)

  const id = String(empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }
  if (typeof cobrancaAgzap !== 'boolean') {
    throw createError({ statusCode: 400, statusMessage: 'Valor inválido' })
  }

  const supabase = getServiceClient()

  const { data: vinculo, error: vincErr } = await supabase
    .from('parceiro_empresas')
    .select('id, parceiro_id, cobranca_agzap')
    .eq('empresa_id', id)
    .maybeSingle()
  if (vincErr) return failPublic(vincErr, 'admin/parceiros/cobranca-agzap', 'Não foi possível salvar.')
  if (!vinculo) {
    return { success: false as const, error: 'Este cliente não está vinculado a nenhum parceiro.' }
  }

  const { error } = await supabase
    .from('parceiro_empresas')
    .update({ cobranca_agzap: cobrancaAgzap, updated_at: new Date().toISOString() })
    .eq('id', vinculo.id)
  if (error) return failPublic(error, 'admin/parceiros/cobranca-agzap', 'Não foi possível salvar.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: vinculo.parceiro_id,
    empresa_id: id,
    ator_user_id: adminUserId,
    ator_papel: 'admin',
    acao: 'alteracao_cobranca_agzap',
    estado_anterior: { cobranca_agzap: vinculo.cobranca_agzap },
    estado_novo: { cobranca_agzap: cobrancaAgzap },
    motivo: (motivo ?? '').trim().slice(0, 300) || null,
    origem: 'painel_admin',
  })

  return { success: true as const }
})
