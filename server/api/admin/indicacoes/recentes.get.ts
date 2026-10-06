import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { CAMPOS_INDICACAO, vincularIndicacoesAEmpresas } from '~~/server/utils/parceiroIndicacoes'

const LIMITE = 300

/**
 * Últimos registros de indicação de todos os parceiros (ou de um só, com
 * ?parceiroId=). Serve para o admin acompanhar quem registrou o quê.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const parceiroId = String(getQuery(event).parceiroId ?? '').trim()
  if (parceiroId && !/^[0-9a-f-]{36}$/i.test(parceiroId)) {
    throw createError({ statusCode: 400, statusMessage: 'Parceiro inválido' })
  }

  const supabase = getServiceClient()
  try {
    let consulta = supabase
      .from('parceiro_indicacoes')
      .select(`${CAMPOS_INDICACAO}, parceiros ( id, nome, ativo )`, { count: 'exact' })
      .order('created_at', { ascending: false })
      .limit(LIMITE)
    if (parceiroId) consulta = consulta.eq('parceiro_id', parceiroId)

    const [{ data, count, error }, { data: parceiros, error: parErr }] = await Promise.all([
      consulta,
      supabase.from('parceiros').select('id, nome, ativo').order('nome'),
    ])
    if (error) throw error
    if (parErr) throw parErr

    const linhas = (data ?? []) as any[]
    let novos = new Map<string, string>()
    try {
      novos = await vincularIndicacoesAEmpresas(supabase, linhas)
    }
    catch (erro) {
      console.error('[api:admin/indicacoes/recentes] vincular', erro)
    }

    return {
      success: true as const,
      data: {
        total: count ?? linhas.length,
        limite: LIMITE,
        parceiros: parceiros ?? [],
        indicacoes: linhas.map(l => ({
          id: l.id,
          documento: l.documento,
          documento_tipo: l.documento_tipo,
          nome_cliente: l.nome_cliente,
          telefone: l.telefone,
          observacao: l.observacao,
          created_at: l.created_at,
          tem_conta_agzap: !!(l.empresa_id ?? novos.get(l.id)),
          parceiro: l.parceiros ? { id: l.parceiros.id, nome: l.parceiros.nome, ativo: l.parceiros.ativo } : null,
        })),
      },
    }
  }
  catch (erro) {
    return failPublic(erro, 'admin/indicacoes/recentes', 'Não foi possível carregar os registros.')
  }
})
