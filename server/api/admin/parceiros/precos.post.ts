import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { isTipoCredito, mensagemErro } from '~~/server/utils/parceiroLicencas'

/**
 * Troca os preços de um crédito. A função do banco confere o papel, valida os
 * valores e registra quem alterou, tudo na mesma transação. As faixas são fixas:
 * aqui só mudam os valores.
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const body = await readBody<{ tipoCredito?: string; faixas?: unknown; revenda?: unknown }>(event)

  if (!isTipoCredito(body?.tipoCredito)) {
    throw createError({ statusCode: 400, statusMessage: 'Tipo de crédito inválido' })
  }
  const faixas = (Array.isArray(body?.faixas) ? body.faixas : []).map((f: any) => ({
    quantidade_min: Number(f?.quantidade_min),
    preco_unitario: Number(f?.preco_unitario),
  }))
  const revenda = Number(body?.revenda)
  if (
    !faixas.length
    || faixas.some(f => !Number.isInteger(f.quantidade_min) || !Number.isFinite(f.preco_unitario))
    || !Number.isFinite(revenda)
  ) {
    throw createError({ statusCode: 400, statusMessage: 'Preço inválido' })
  }

  const { data, error } = await getServiceClient().rpc('parceiro_alterar_precos', {
    p_admin_user_id: adminUserId,
    p_tipo_credito: body.tipoCredito,
    p_faixas: faixas,
    p_revenda: revenda,
  })
  if (error) return failPublic(error, 'admin/parceiros/precos', 'Não foi possível salvar os preços.')

  const resultado = data as { success?: boolean; erro?: string; alterado?: boolean } | null
  if (!resultado?.success) {
    return { success: false as const, codigo: resultado?.erro ?? null, error: mensagemErro(resultado?.erro) }
  }
  return { success: true as const, alterado: resultado.alterado === true }
})
