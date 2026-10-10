import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { VERSAO_TERMO_AFILIADO } from '~~/app/constants/termosAfiliado'

/**
 * Aceite do Termo do Afiliado (tabela afiliado_termos_aceites, gravada por
 * /api/afiliado/termos-aceite no portal do afiliado). Só superAdmin.
 *
 * ?afiliadoId= -> aceites do afiliado (mais recente primeiro) e a versão vigente.
 * ?id=         -> um aceite completo + texto integral da versão aceita + dados
 *                 do afiliado, para o comprovante (prova em disputa).
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { afiliadoId, id } = getQuery(event) as { afiliadoId?: string; id?: string }
  const supabase = getServiceClient()

  if (id) {
    const { data: aceite, error } = await supabase
      .from('afiliado_termos_aceites')
      .select('id, afiliado_id, auth_user_id, versao_termos, hash_termos, hash_confere, nome_assinante, email_assinante, documento_afiliado, telefone_afiliado, confirmacoes, rolou_ate_o_fim, tempo_leitura_seg, ip, user_agent, aceito_em')
      .eq('id', id)
      .maybeSingle()
    if (error) throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar o aceite.' })
    if (!aceite) throw createError({ statusCode: 404, statusMessage: 'Aceite não encontrado' })

    const [{ data: versao }, { data: afiliado }] = await Promise.all([
      supabase.from('termos_versoes').select('versao, conteudo, oficial, created_at').eq('hash', aceite.hash_termos).maybeSingle(),
      supabase.from('afiliados').select('nome, email, telefone, documento, created_at').eq('id', aceite.afiliado_id).maybeSingle(),
    ])
    return { success: true, data: { aceite, versao, afiliado } }
  }

  if (!afiliadoId) throw createError({ statusCode: 400, statusMessage: 'afiliadoId ou id obrigatório' })

  const { data: aceites, error } = await supabase
    .from('afiliado_termos_aceites')
    .select('id, versao_termos, aceito_em, ip, nome_assinante, email_assinante, documento_afiliado, hash_confere')
    .eq('afiliado_id', afiliadoId)
    .order('aceito_em', { ascending: false })
  if (error) throw createError({ statusCode: 500, statusMessage: 'Não foi possível carregar os aceites.' })

  return { success: true, data: { aceites: aceites || [], versao_vigente: VERSAO_TERMO_AFILIADO } }
})
