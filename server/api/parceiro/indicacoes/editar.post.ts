import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { aplicarRateLimit, registrarAuditoria } from '~~/server/utils/parceiroLicencas'
import { limparTexto } from '~~/server/utils/parceiroIndicacoes'

/**
 * Edição de uma indicação do próprio parceiro: SÓ nome do cliente e
 * observação. CPF/CNPJ e telefone não mudam, senão um registro antigo
 * poderia "trocar de cliente" e levar junto a data original. Para corrigir
 * um deles, o parceiro exclui e registra de novo (vale a data nova).
 */
export default defineEventHandler(async (event) => {
  const { userId, parceiro } = await requireParceiro(event)
  const body = await readBody<{ id?: string; nome?: string; observacao?: string }>(event)

  const id = String(body?.id ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Indicação inválida' })
  }
  const nome = limparTexto(body?.nome, 120)
  if (nome.length < 2) return { success: false as const, error: 'Informe o nome do cliente.' }
  const observacao = limparTexto(body?.observacao, 500) || null

  aplicarRateLimit(`indicacao-editar:${parceiro.id}`, 30, 60_000)

  const supabase = getServiceClient()
  const { data: atual, error: buscaErr } = await supabase
    .from('parceiro_indicacoes')
    .select('id, nome_cliente, observacao, empresa_id')
    .eq('id', id)
    .eq('parceiro_id', parceiro.id)
    .maybeSingle()
  if (buscaErr) return failPublic(buscaErr, 'parceiro/indicacoes/editar', 'Não foi possível salvar agora.')
  if (!atual) return { success: false as const, error: 'Indicação não encontrada na sua cartela.' }

  if (atual.nome_cliente === nome && (atual.observacao ?? null) === observacao) {
    return { success: true as const }
  }

  const { error } = await supabase
    .from('parceiro_indicacoes')
    .update({ nome_cliente: nome, observacao, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('parceiro_id', parceiro.id)
  if (error) return failPublic(error, 'parceiro/indicacoes/editar', 'Não foi possível salvar agora.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: parceiro.id,
    empresa_id: atual.empresa_id,
    ator_user_id: userId,
    ator_papel: 'parceiro',
    acao: 'indicacao_editada',
    estado_anterior: { id, nome_cliente: atual.nome_cliente, observacao: atual.observacao },
    estado_novo: { id, nome_cliente: nome, observacao },
    origem: 'painel_parceiro',
  })

  return { success: true as const }
})
