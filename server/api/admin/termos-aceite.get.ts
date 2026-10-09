import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

/**
 * Aceite dos Termos de Serviço feito pelo titular no app (tabelas
 * termos_aceites / termos_versoes, gravadas por /api/termos/aceite do app).
 *
 * ?empresaId=  -> aceites da empresa (mais recente primeiro) e as recusas
 *                 ("Não aceito"). Desde 09/10/2026 o aceite vale para TODA
 *                 conta de empresa (titular), inclusive a própria Agzap.
 * ?id=         -> um aceite completo + texto integral da versão aceita + dados
 *                 da empresa, para o comprovante (prova em chargeback/disputa).
 */

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { empresaId, id } = getQuery(event) as { empresaId?: string; id?: string }
  const supabase = getServiceClient()

  if (id) {
    const { data: aceite, error } = await supabase
      .from('termos_aceites')
      .select('id, empresa_id, auth_user_id, usuario_id, versao_termos, hash_termos, hash_confere, nome_assinante, email_assinante, nome_empresa, documento_empresa, li_termos, aceito_termos, aceito_cancelamento, confirmacoes, rolou_ate_o_fim, tempo_leitura_seg, ip, user_agent, aceito_em')
      .eq('id', id)
      .maybeSingle()
    if (error) throw createError({ statusCode: 500, statusMessage: error.message })
    if (!aceite) throw createError({ statusCode: 404, statusMessage: 'Aceite não encontrado' })

    const [{ data: versao }, { data: empresa }] = await Promise.all([
      supabase.from('termos_versoes').select('versao, conteudo, oficial, created_at').eq('hash', aceite.hash_termos).maybeSingle(),
      supabase.from('empresas').select('nome, cnpj, cpf, email, whatsapp, created_at').eq('id', aceite.empresa_id).maybeSingle(),
    ])
    return { success: true, data: { aceite, versao, empresa } }
  }

  if (!empresaId) throw createError({ statusCode: 400, statusMessage: 'empresaId ou id obrigatório' })

  const [{ data: aceites, error }, { data: recusas }] = await Promise.all([
    supabase
      .from('termos_aceites')
      .select('id, versao_termos, aceito_em, ip, nome_assinante, email_assinante, nome_empresa, documento_empresa, hash_confere')
      .eq('empresa_id', empresaId)
      .order('aceito_em', { ascending: false }),
    supabase
      .from('termos_recusas')
      .select('id, versao_termos, recusado_em, ip')
      .eq('empresa_id', empresaId)
      .order('recusado_em', { ascending: false })
      .limit(5),
  ])
  if (error) throw createError({ statusCode: 500, statusMessage: error.message })

  return { success: true, data: { aceites: aceites || [], recusas: recusas || [], exigido: true } }
})
