import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { VERSAO_TERMO_PARCEIRO } from '~~/app/constants/termosParceiro'

/**
 * Aceite do Termo do Parceiro (tabela parceiro_termos_aceites, gravada por
 * /api/parceiro/termos-aceite no portal do parceiro).
 *
 * ?parceiroId= -> aceites do parceiro (mais recente primeiro), a versão
 *                 vigente e o aceite antigo (só data, em dados_split) de
 *                 antes da 3.0, quando houver.
 * ?id=         -> um aceite completo + texto integral da versão aceita + dados
 *                 do parceiro, para o comprovante (prova em disputa).
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { parceiroId, id } = getQuery(event) as { parceiroId?: string; id?: string }
  const supabase = getServiceClient()

  if (id) {
    const { data: aceite, error } = await supabase
      .from('parceiro_termos_aceites')
      .select('id, parceiro_id, auth_user_id, versao_termos, hash_termos, hash_confere, nome_assinante, email_assinante, documento_parceiro, telefone_parceiro, confirmacoes, rolou_ate_o_fim, tempo_leitura_seg, ip, user_agent, aceito_em')
      .eq('id', id)
      .maybeSingle()
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!aceite) throw createError({ statusCode: 404, statusMessage: 'Aceite não encontrado' })

    const [{ data: versao }, { data: parceiro }] = await Promise.all([
      supabase.from('termos_versoes').select('versao, conteudo, oficial, created_at').eq('hash', aceite.hash_termos).maybeSingle(),
      supabase.from('parceiros').select('nome, email, telefone, documento, created_at').eq('id', aceite.parceiro_id).maybeSingle(),
    ])
    return { success: true, data: { aceite, versao, parceiro } }
  }

  if (!parceiroId) throw createError({ statusCode: 400, statusMessage: 'parceiroId ou id obrigatório' })

  const [{ data: aceites, error }, { data: parceiro }] = await Promise.all([
    supabase
      .from('parceiro_termos_aceites')
      .select('id, versao_termos, aceito_em, ip, nome_assinante, email_assinante, documento_parceiro, hash_confere')
      .eq('parceiro_id', parceiroId)
      .order('aceito_em', { ascending: false }),
    supabase.from('parceiros').select('dados_split').eq('id', parceiroId).maybeSingle(),
  ])
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  const antigo = (parceiro as any)?.dados_split?.termos
  const aceiteAntigo = antigo?.aceito_em && antigo?.versao && antigo.versao !== VERSAO_TERMO_PARCEIRO
    ? { versao: String(antigo.versao), aceito_em: String(antigo.aceito_em) }
    : null

  return { success: true, data: { aceites: aceites || [], versao_vigente: VERSAO_TERMO_PARCEIRO, aceite_antigo: aceiteAntigo } }
})
