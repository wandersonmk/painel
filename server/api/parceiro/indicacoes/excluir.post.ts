import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { aplicarRateLimit, registrarAuditoria } from '~~/server/utils/parceiroLicencas'
import { empresasPorDocumentos } from '~~/server/utils/parceiroIndicacoes'

/**
 * O parceiro exclui uma indicação DELE, só enquanto não existe conta na
 * Agzap com aquele CPF/CNPJ. Depois que o cliente cria a conta, o registro
 * vira prova da indicação e só a Agzap pode remover.
 *
 * A checagem da conta é refeita aqui na hora (não confia no que a tela viu).
 * A auditoria guarda uma cópia do registro excluído.
 */
export default defineEventHandler(async (event) => {
  const { userId, parceiro } = await requireParceiro(event)
  const body = await readBody<{ id?: string }>(event)

  const id = String(body?.id ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Indicação inválida' })
  }

  aplicarRateLimit(`indicacao-excluir:${parceiro.id}`, 20, 60_000)

  const supabase = getServiceClient()
  const { data: atual, error: buscaErr } = await supabase
    .from('parceiro_indicacoes')
    .select('id, documento, documento_tipo, nome_cliente, telefone, observacao, empresa_id, created_at')
    .eq('id', id)
    .eq('parceiro_id', parceiro.id)
    .maybeSingle()
  if (buscaErr) return failPublic(buscaErr, 'parceiro/indicacoes/excluir', 'Não foi possível excluir agora.')
  if (!atual) return { success: false as const, error: 'Indicação não encontrada na sua cartela.' }

  const travada = {
    success: false as const,
    error: 'Esse cliente já tem conta na Agzap. O registro fica guardado como prova da sua indicação; para remover, fale com a Agzap.',
  }
  if (atual.empresa_id) return travada

  let empresaId: string | null = null
  try {
    empresaId = (await empresasPorDocumentos(supabase, [atual.documento])).get(atual.documento)?.[0]?.id ?? null
  }
  catch (erro) {
    // Sem conseguir conferir, não exclui: melhor travar do que apagar prova.
    return failPublic(erro, 'parceiro/indicacoes/excluir', 'Não foi possível excluir agora. Tente novamente.')
  }
  if (empresaId) {
    await supabase.from('parceiro_indicacoes').update({ empresa_id: empresaId }).eq('id', id).is('empresa_id', null)
    return travada
  }

  const { error } = await supabase
    .from('parceiro_indicacoes')
    .delete()
    .eq('id', id)
    .eq('parceiro_id', parceiro.id)
    .is('empresa_id', null)
  if (error) return failPublic(error, 'parceiro/indicacoes/excluir', 'Não foi possível excluir agora.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: parceiro.id,
    ator_user_id: userId,
    ator_papel: 'parceiro',
    acao: 'indicacao_excluida',
    estado_anterior: atual,
    origem: 'painel_parceiro',
  })

  return { success: true as const }
})
