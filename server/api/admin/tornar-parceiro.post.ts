import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { COLUNAS_REMOCAO_AFILIADO, removerAfiliacaoDoAfiliado } from '~~/server/utils/requireAfiliado'
import type { AfiliadoParaRemocao } from '~~/server/utils/requireAfiliado'

/**
 * POST /api/admin/tornar-parceiro { empresaId, previa? }
 *
 * Transforma o dono de uma empresa cliente em parceiro.
 *
 * Regra do dono (09/10/2026): cada pessoa é parceiro OU afiliado, nunca os dois.
 * Se ele é afiliado (ativo ou bloqueado, não removido), a troca é automática:
 * a afiliação é removida pela mesma regra do "Remover afiliação" e a parceria
 * entra em seguida. As travas continuam: saque aberto, ou saldo de afiliado
 * NÃO bloqueado, recusam a troca (a mensagem diz o que fazer antes).
 * `previa: true` não muda nada: devolve o que a troca vai fazer (para o modal).
 * Parceria removida ou suspensa: reativa (limpa removido_em).
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { empresaId, previa } = await readBody<{ empresaId: string; previa?: boolean }>(event)

  if (!empresaId) {
    throw createError({ statusCode: 400, statusMessage: 'empresaId obrigatório' })
  }

  const supabase = getServiceClient()

  const { data: empresa, error: empErr } = await supabase
    .from('empresas')
    .select('id, nome, nome_cliente, email, whatsapp, auth_user_id')
    .eq('id', empresaId)
    .maybeSingle()
  if (empErr) return { success: false, error: empErr.message }
  if (!empresa) throw createError({ statusCode: 404, statusMessage: 'Empresa não encontrada' })
  if (!empresa.auth_user_id) {
    return { success: false, error: 'Esta empresa não tem usuário de login vinculado' }
  }

  const [{ data: afiliadoRow }, { data: existente }] = await Promise.all([
    supabase.from('afiliados').select(COLUNAS_REMOCAO_AFILIADO).eq('auth_user_id', empresa.auth_user_id).maybeSingle(),
    supabase.from('parceiros').select('id, nome, ativo, removido_em').eq('auth_user_id', empresa.auth_user_id).maybeSingle(),
  ])
  const afiliado = afiliadoRow as AfiliadoParaRemocao | null
  // Afiliação removida não conta: só troca quem ainda tem o papel.
  const temAfiliacao = !!afiliado && !afiliado.removido_em
  const situacaoParceiro = !existente ? null : existente.removido_em ? 'removido' : existente.ativo ? 'ativo' : 'suspenso'

  if (previa) {
    let troca: any = null
    if (temAfiliacao) {
      const r = await removerAfiliacaoDoAfiliado(supabase, afiliado!, { previa: true })
      if (!r.success) return r
      troca = { tipo: 'afiliacao', ...r.data }
    }
    return { success: true, data: { previa: true, nome: empresa.nome_cliente?.trim() || empresa.nome, situacaoParceiro, troca } }
  }

  // Já é parceiro ativo: nada a trocar.
  if (situacaoParceiro === 'ativo' && !temAfiliacao) {
    return { success: true, data: { jaEra: true, reativado: false, nome: existente!.nome, trocou: null } }
  }

  let trocou: any = null
  if (temAfiliacao) {
    const r = await removerAfiliacaoDoAfiliado(supabase, afiliado!, { nota: 'Afiliação removida pelo admin ao tornar parceiro' })
    if (!r.success) return { success: false, error: `Não foi possível tornar parceiro: ${r.error}` }
    trocou = { tipo: 'afiliacao', ...r.data }
  }

  const agora = new Date().toISOString()
  if (existente) {
    if (situacaoParceiro !== 'ativo') {
      const { error } = await supabase
        .from('parceiros')
        .update({ ativo: true, removido_em: null, updated_at: agora })
        .eq('id', existente.id)
      if (error) {
        return { success: false, error: trocou ? `A afiliação foi removida, mas a parceria não foi reativada: ${error.message}` : error.message }
      }
      return { success: true, data: { jaEra: true, reativado: true, nome: existente.nome, trocou } }
    }
    return { success: true, data: { jaEra: true, reativado: false, nome: existente.nome, trocou } }
  }

  const nomeParceiro = empresa.nome_cliente?.trim() || empresa.nome
  const { error } = await supabase.from('parceiros').insert({
    nome: nomeParceiro,
    email: empresa.email?.trim().toLowerCase() || null,
    telefone: empresa.whatsapp || null,
    auth_user_id: empresa.auth_user_id,
    ativo: true,
    observacoes: `Convertido da empresa cliente "${empresa.nome}"`,
  })
  if (error) {
    return { success: false, error: trocou ? `A afiliação foi removida, mas a parceria não foi criada: ${error.message}` : error.message }
  }

  return { success: true, data: { jaEra: false, reativado: false, nome: nomeParceiro, trocou } }
})
