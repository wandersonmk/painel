import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { registrarAuditoria } from '~~/server/utils/parceiroLicencas'
import { limparTexto } from '~~/server/utils/parceiroIndicacoes'

/**
 * O admin remove um registro de indicação (ex.: registro feito por engano ou
 * disputa resolvida). O CPF/CNPJ fica livre para outro parceiro registrar.
 * A auditoria guarda uma cópia do registro e o motivo.
 */
export default defineEventHandler(async (event) => {
  const userId = await requireSuperAdmin(event)
  const body = await readBody<{ id?: string; motivo?: string }>(event)

  const id = String(body?.id ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Registro inválido' })
  }
  const motivo = limparTexto(body?.motivo, 300) || null

  const supabase = getServiceClient()
  const { data: atual, error: buscaErr } = await supabase
    .from('parceiro_indicacoes')
    .select('id, parceiro_id, documento, documento_tipo, nome_cliente, telefone, observacao, empresa_id, created_at')
    .eq('id', id)
    .maybeSingle()
  if (buscaErr) return failPublic(buscaErr, 'admin/indicacoes/excluir', 'Não foi possível remover agora.')
  if (!atual) return { success: false as const, error: 'Registro não encontrado (talvez já tenha sido removido).' }

  const { error } = await supabase.from('parceiro_indicacoes').delete().eq('id', id)
  if (error) return failPublic(error, 'admin/indicacoes/excluir', 'Não foi possível remover agora.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: atual.parceiro_id,
    empresa_id: atual.empresa_id,
    ator_user_id: userId,
    ator_papel: 'admin',
    acao: 'indicacao_removida_admin',
    estado_anterior: atual,
    motivo,
    origem: 'painel_admin',
  })

  return { success: true as const }
})
