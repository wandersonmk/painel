import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { COLUNAS_REMOCAO_PARCEIRO, removerParceriaDoParceiro } from '~~/server/utils/parceiroLicencas'
import type { ParceiroParaRemocao } from '~~/server/utils/parceiroLicencas'

/**
 * POST /api/admin/tornar-afiliado { empresaId, previa? }
 *
 * Transforma o dono de uma empresa cliente em afiliado (pedido do dono,
 * 09/10/2026), igual ao "Tornar empresa parceira". Ele entra no portal do
 * afiliado com o mesmo login do Agzap e ganha o link fixo de indicação
 * (app.agzap.com.br/login?afiliado=<codigo>). Os dados de PIX ele mesmo
 * preenche no portal.
 *
 * Regra do dono: cada pessoa é parceiro OU afiliado, nunca os dois. Se ele é
 * parceiro (ativo ou suspenso, não removido), a troca é automática: a parceria
 * é removida pela mesma regra do "Remover parceria" (clientes voltam para a
 * Agzap, créditos congelados) e a afiliação entra em seguida.
 * `previa: true` não muda nada: devolve o que a troca vai fazer (para o modal).
 * Afiliação removida ou bloqueada: reativa (limpa removido_em e o motivo).
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { empresaId, previa } = await readBody<{ empresaId: string; previa?: boolean }>(event)

  if (!empresaId) {
    throw createError({ statusCode: 400, statusMessage: 'empresaId obrigatório' })
  }

  const supabase = getServiceClient()

  const { data: empresa, error: empErr } = await supabase
    .from('empresas')
    .select('id, nome, nome_cliente, email, whatsapp, auth_user_id, cpf, cnpj')
    .eq('id', empresaId)
    .maybeSingle()
  if (empErr) return { success: false, error: empErr.message }
  if (!empresa) throw createError({ statusCode: 404, statusMessage: 'Empresa não encontrada' })
  if (!empresa.auth_user_id) {
    return { success: false, error: 'Esta empresa não tem usuário de login vinculado' }
  }

  const [{ data: parceiroRow }, { data: existente }] = await Promise.all([
    supabase.from('parceiros').select(COLUNAS_REMOCAO_PARCEIRO).eq('auth_user_id', empresa.auth_user_id).maybeSingle(),
    supabase.from('afiliados').select('id, nome, ativo, removido_em, codigo_indicacao').eq('auth_user_id', empresa.auth_user_id).maybeSingle(),
  ])
  const parceiro = parceiroRow as ParceiroParaRemocao | null
  // Parceria removida não conta: só troca quem ainda tem o papel.
  const temParceria = !!parceiro && !parceiro.removido_em
  const situacaoAfiliado = !existente ? null : existente.removido_em ? 'removido' : existente.ativo ? 'ativo' : 'bloqueado'

  // Cadastro novo precisa de nome: confere ANTES de mexer na parceria.
  const nome = (empresa.nome_cliente?.trim() || empresa.nome || '').replace(/\s+/g, ' ').trim().slice(0, 120)
  if (!existente && nome.length < 2) {
    return { success: false, error: 'A empresa não tem nome do responsável para o cadastro de afiliado' }
  }

  if (previa) {
    let troca: any = null
    if (temParceria) {
      const r = await removerParceriaDoParceiro(supabase, event, parceiro!, { adminUserId, previa: true })
      if (!r.success) return r
      troca = { tipo: 'parceria', ...r.data }
    }
    return { success: true, data: { previa: true, nome: nome || empresa.nome, situacaoAfiliado, troca } }
  }

  // Já é afiliado ativo: nada a trocar.
  if (situacaoAfiliado === 'ativo' && !temParceria) {
    return { success: true, data: { jaEra: true, reativado: false, nome: existente!.nome, codigo: existente!.codigo_indicacao, trocou: null } }
  }

  let trocou: any = null
  if (temParceria) {
    const r = await removerParceriaDoParceiro(supabase, event, parceiro!, { adminUserId, nota: 'Parceria removida pelo admin ao tornar afiliado' })
    if (!r.success) return { success: false, error: `Não foi possível tornar afiliado: ${r.error}` }
    trocou = { tipo: 'parceria', ...r.data }
  }

  const agora = new Date().toISOString()
  if (existente) {
    if (situacaoAfiliado !== 'ativo') {
      const { error } = await supabase
        .from('afiliados')
        .update({ ativo: true, bloqueado_motivo: null, removido_em: null, updated_at: agora })
        .eq('id', existente.id)
      if (error) {
        return { success: false, error: trocou ? `A parceria foi removida, mas a afiliação não foi reativada: ${error.message}` : error.message }
      }
      return { success: true, data: { jaEra: true, reativado: true, nome: existente.nome, codigo: existente.codigo_indicacao, trocou } }
    }
    return { success: true, data: { jaEra: true, reativado: false, nome: existente.nome, codigo: existente.codigo_indicacao, trocou } }
  }

  let telefone = String(empresa.whatsapp || '').replace(/\D/g, '')
  if (telefone.length === 10 || telefone.length === 11) telefone = `55${telefone}`

  const documento = String(empresa.cnpj || empresa.cpf || '').replace(/\D/g, '')
  const docValido = documento.length === 11 || documento.length === 14

  const base = {
    auth_user_id: empresa.auth_user_id,
    nome,
    email: empresa.email?.trim().toLowerCase() || '',
    telefone: telefone || null,
  }

  let { data: criado, error } = await supabase
    .from('afiliados')
    .insert({ ...base, documento: docValido ? documento : null })
    .select('codigo_indicacao')
    .single()

  // CPF/CNPJ já usado por outro afiliado: cria sem o documento, ele completa no portal.
  if (error && (error as any).code === '23505' && docValido) {
    ;({ data: criado, error } = await supabase
      .from('afiliados')
      .insert({ ...base, documento: null })
      .select('codigo_indicacao')
      .single())
  }
  if (error) {
    return { success: false, error: trocou ? `A parceria foi removida, mas a afiliação não foi criada: ${error.message}` : error.message }
  }

  return { success: true, data: { jaEra: false, reativado: false, nome, codigo: criado?.codigo_indicacao ?? null, trocou } }
})
