import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { id, nome, email, telefone, documento, observacoes, senha } = await readBody<{
    id?: string
    nome: string
    email?: string
    telefone?: string
    documento?: string
    observacoes?: string
    senha?: string
  }>(event)

  if (!nome?.trim() || nome.trim().length < 3) {
    throw createError({ statusCode: 400, statusMessage: 'Nome do parceiro obrigatório' })
  }

  const supabase = getServiceClient()
  const payload: Record<string, unknown> = {
    nome: nome.trim(),
    email: email?.trim().toLowerCase() || null,
    telefone: telefone?.trim() || null,
    documento: documento?.trim() || null,
    observacoes: observacoes?.trim() || null,
    updated_at: new Date().toISOString(),
  }

  if (id) {
    const { error } = await supabase.from('parceiros').update(payload).eq('id', id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  }

  // Novo parceiro: vincula um usuário existente pelo email ou cria a conta de acesso
  let authUserId: string | null = null
  let contaCriada = false

  if (payload.email) {
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('auth_user_id')
      .ilike('email', payload.email as string)
      .maybeSingle()
    authUserId = (usuario as any)?.auth_user_id ?? null

    if (!authUserId && senha) {
      if (senha.length < 6) {
        throw createError({ statusCode: 400, statusMessage: 'A senha precisa ter pelo menos 6 caracteres' })
      }
      // Mesmo fluxo do cadastro normal: o trigger on_auth_user_created
      // (handle_new_user) cria a linha em `usuarios` automaticamente
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: payload.email as string,
        password: senha,
        email_confirm: true,
        user_metadata: { nome: payload.nome },
      })
      if (createErr) {
        return { success: false, error: `Erro ao criar a conta: ${createErr.message}` }
      }
      authUserId = created.user?.id ?? null
      contaCriada = true
    }
  } else if (senha) {
    throw createError({ statusCode: 400, statusMessage: 'Informe o email para criar a conta de acesso' })
  }

  // Regra do dono (09/10/2026): cada pessoa é parceiro OU afiliado, nunca os dois
  // ao mesmo tempo. Afiliação removida (ativo = false) não conta.
  if (authUserId && !contaCriada) {
    const { data: afiliado } = await supabase
      .from('afiliados')
      .select('id')
      .eq('auth_user_id', authUserId)
      .eq('ativo', true)
      .maybeSingle()
    if (afiliado) {
      return { success: false, error: 'Este login é afiliado. Remova a afiliação (tela Afiliados) antes de cadastrá-lo como parceiro.' }
    }

    // Login que já teve parceria: removida volta a valer (limpa removido_em);
    // ainda ativa ou suspensa, já está na lista (o insert bateria no UNIQUE).
    const { data: anterior } = await supabase
      .from('parceiros')
      .select('id, ativo, removido_em, observacoes')
      .eq('auth_user_id', authUserId)
      .maybeSingle()
    if (anterior && !anterior.removido_em) {
      return { success: false, error: anterior.ativo ? 'Este login já é parceiro.' : 'Este login já é parceiro (suspenso). Use "Reativar parceiro" na lista.' }
    }
    if (anterior) {
      // Mantém as notas antigas (inclusive a da remoção) e soma as novas.
      const observacoesJuntas = [anterior.observacoes?.trim(), payload.observacoes as string | null].filter(Boolean).join('\n') || null
      const { error: errReativar } = await supabase
        .from('parceiros')
        .update({ ...payload, observacoes: observacoesJuntas, ativo: true, removido_em: null })
        .eq('id', anterior.id)
      if (errReativar) return { success: false, error: errReativar.message }
      return { success: true, data: { loginVinculado: true, contaCriada: false, reativado: true } }
    }
  }

  const { error } = await supabase
    .from('parceiros')
    .insert({ ...payload, auth_user_id: authUserId, ativo: true })
  if (error) {
    // Não deixa conta órfã se o insert do parceiro falhar logo após criar o login
    if (contaCriada && authUserId) {
      await supabase.auth.admin.deleteUser(authUserId).catch(() => {})
    }
    return { success: false, error: error.message }
  }

  return { success: true, data: { loginVinculado: !!authUserId, contaCriada } }
})
