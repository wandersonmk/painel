import { createClient } from '@supabase/supabase-js'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { aplicarRateLimit } from '~~/server/utils/parceiroLicencas'
import { motivoBloqueioAntesDaRemocao } from '~~/server/utils/requireAfiliado'
import { identificarDocumento } from '~~/shared/utils/documento'
import { normalizarTelefoneBr } from '~~/shared/utils/telefoneBr'

/**
 * POST /api/afiliado/cadastro — público (link fixo painel.agzap.com.br/afiliado/cadastro).
 *
 * - Cria o usuário no Supabase Auth já confirmado e o registro em afiliados.
 * - E-mail que já tem conta na Agzap: só vira afiliado se a senha for a da
 *   conta (confere com um login descartável). Nunca troca senha de ninguém.
 * - Se o insert falhar e o usuário de Auth nasceu nesta requisição, ele é
 *   apagado para não sobrar conta órfã.
 * - Senha nunca vai para log: os erros logados são só os objetos de erro.
 */
const EMAIL_RE = /^[^\s@,;()<>]+@[^\s@,;()<>]+\.[^\s@,;()<>]+$/

function emailJaExiste(erro: unknown): boolean {
  const e = erro as { code?: string; message?: string } | null
  if (!e) return false
  if (e.code === 'email_exists' || e.code === 'user_already_exists') return true
  return /already (been )?registered|already exists/i.test(String(e.message ?? ''))
}

export default defineEventHandler(async (event) => {
  const body = await readBody<{
    nome?: string
    email?: string
    telefone?: string
    documento?: string
    senha?: string
  }>(event).catch(() => null)

  const nome = String(body?.nome ?? '').replace(/\s+/g, ' ').trim()
  if (nome.length < 2 || nome.length > 120 || !nome.includes(' ')) {
    return { success: false as const, campo: 'nome', error: 'Informe seu nome completo (nome e sobrenome).' }
  }

  const email = String(body?.email ?? '').trim().toLowerCase()
  if (email.length > 254 || !EMAIL_RE.test(email)) {
    return { success: false as const, campo: 'email', error: 'Digite um e-mail válido.' }
  }

  const telefone = normalizarTelefoneBr(body?.telefone)
  if (!telefone) {
    return { success: false as const, campo: 'telefone', error: 'WhatsApp inválido. Informe DDD + número, ex.: (11) 99999-9999.' }
  }

  const doc = identificarDocumento(body?.documento)
  if (!doc) {
    return { success: false as const, campo: 'documento', error: 'CPF ou CNPJ inválido. Confira os números.' }
  }
  // A coluna aceita só dígitos (11 ou 14). CNPJ alfanumérico ainda não entra.
  if (!/^\d+$/.test(doc.documento)) {
    return { success: false as const, campo: 'documento', error: 'Por enquanto o cadastro aceita só CPF ou CNPJ com números.' }
  }
  const rotuloDoc = doc.tipo === 'cpf' ? 'CPF' : 'CNPJ'

  const senha = String(body?.senha ?? '')
  if (senha.length < 8) {
    return { success: false as const, campo: 'senha', error: 'A senha precisa ter pelo menos 8 caracteres.' }
  }
  if (senha.length > 72) {
    return { success: false as const, campo: 'senha', error: 'A senha pode ter no máximo 72 caracteres.' }
  }

  // Conta só depois da validação: errar um campo não gasta tentativa, mas
  // testar e-mail/senha em série esbarra no limite.
  const ip = getRequestIP(event, { xForwardedFor: true }) || 'sem-ip'
  try {
    aplicarRateLimit(`afiliado-cadastro:${ip}`, 5, 10 * 60_000)
  }
  catch {
    return { success: false as const, error: 'Muitas tentativas seguidas. Aguarde alguns minutos e tente de novo.' }
  }

  const supabase = getServiceClient()

  // Programa pausado pelo admin (Afiliados › Regras): não entra afiliado novo.
  // Quem já é afiliado continua vendo os ganhos e sacando o que já ganhou.
  const { data: config } = await supabase.from('afiliado_config').select('ativo').eq('id', true).maybeSingle()
  if (config && config.ativo === false) {
    return { success: false as const, error: 'O programa de afiliados está pausado no momento. Tente de novo mais tarde.' }
  }

  // Afiliação REMOVIDA (removido_em) não bloqueia o cadastro: a pessoa pode
  // voltar com o mesmo login (o cadastro antigo é reativado lá embaixo).
  const [porEmail, porDoc] = await Promise.all([
    supabase.from('afiliados').select('id, removido_em').eq('email', email).limit(1),
    supabase.from('afiliados').select('id, removido_em').eq('documento', doc.documento).limit(1),
  ])
  if (porEmail.error || porDoc.error) {
    return failPublic(porEmail.error || porDoc.error, 'afiliado/cadastro', 'Não foi possível fazer seu cadastro agora. Tente novamente.')
  }
  const linhaEmail = porEmail.data?.[0] as { id: string; removido_em: string | null } | undefined
  const linhaDoc = porDoc.data?.[0] as { id: string; removido_em: string | null } | undefined
  if (linhaEmail && !linhaEmail.removido_em) {
    return { success: false as const, campo: 'email', error: 'Este e-mail já tem cadastro de afiliado. Entre pelo login.' }
  }
  if (linhaDoc && (!linhaDoc.removido_em || (linhaEmail && linhaDoc.id !== linhaEmail.id))) {
    return { success: false as const, campo: 'documento', error: `Este ${rotuloDoc} já tem cadastro de afiliado.` }
  }

  // Regra do dono (09/10/2026): cada pessoa é parceiro OU afiliado, nunca os dois
  // ao mesmo tempo. Parceria removida (ativo = false) não conta.
  const MSG_JA_PARCEIRO = 'Este cadastro já é de um parceiro Agzap. Cada pessoa pode ser parceiro ou afiliado, não os dois.'
  const { data: parceiroPorEmail } = await supabase.from('parceiros').select('id').ilike('email', email).eq('ativo', true).limit(1)
  if (parceiroPorEmail?.length) {
    return { success: false as const, campo: 'email', error: MSG_JA_PARCEIRO }
  }

  let userId: string | null = null
  let criadoAgora = false

  const { data: criado, error: errCriar } = await supabase.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome, papel: 'afiliado' },
  })

  if (!errCriar && criado?.user) {
    userId = criado.user.id
    criadoAgora = true
  }
  else if (emailJaExiste(errCriar)) {
    // Quem já usa a Agzap vira afiliado com a mesma senha. A sessão aberta
    // aqui é só para conferir a senha: é descartada logo em seguida, e só ela
    // (scope local), sem derrubar o login da pessoa no app.
    const anon = createClient(
      process.env.NUXT_PUBLIC_SUPABASE_URL || '',
      process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || '',
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data: login, error: errLogin } = await anon.auth.signInWithPassword({ email, password: senha })
    if (errLogin || !login?.user) {
      return {
        success: false as const,
        campo: 'email',
        error: 'Este e-mail já tem conta na Agzap. Use a mesma senha dela ou outro e-mail.',
      }
    }
    userId = login.user.id
    try {
      await anon.auth.signOut({ scope: 'local' })
    }
    catch { /* sessão descartável: se não revogar, expira sozinha */ }

    const { data: parceiroDoLogin } = await supabase.from('parceiros').select('id').eq('auth_user_id', userId).eq('ativo', true).limit(1)
    if (parceiroDoLogin?.length) {
      return { success: false as const, campo: 'email', error: MSG_JA_PARCEIRO }
    }
  }
  else if ((errCriar as { code?: string } | null)?.code === 'weak_password') {
    return { success: false as const, campo: 'senha', error: 'Senha fraca. Use letras e números, com pelo menos 8 caracteres.' }
  }
  else {
    return failPublic(errCriar, 'afiliado/cadastro:auth', 'Não foi possível criar sua conta agora. Tente novamente.')
  }

  // Este login já teve afiliação e ela foi REMOVIDA: reativa o mesmo cadastro
  // (link e histórico continuam). Removida enquanto estava bloqueada por algum
  // motivo: só a Agzap reativa.
  if (!criadoAgora && userId) {
    const { data: anterior, error: errAnterior } = await supabase
      .from('afiliados')
      .select('id, removido_em, bloqueado_motivo')
      .eq('auth_user_id', userId)
      .maybeSingle()
    if (errAnterior) {
      return failPublic(errAnterior, 'afiliado/cadastro', 'Não foi possível fazer seu cadastro agora. Tente novamente.')
    }
    if (anterior?.removido_em) {
      if (motivoBloqueioAntesDaRemocao(anterior.bloqueado_motivo)) {
        return { success: false as const, error: 'Seu cadastro de afiliado foi encerrado pela Agzap. Fale com a Agzap para voltar.' }
      }
      // O documento informado só entra se não for de outro afiliado.
      const docLivre = !linhaDoc || linhaDoc.id === anterior.id
      const { error: errReativar } = await supabase
        .from('afiliados')
        .update({
          nome,
          email,
          telefone,
          ...(docLivre ? { documento: doc.documento } : {}),
          ativo: true,
          bloqueado_motivo: null,
          removido_em: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', anterior.id)
      if (errReativar) {
        return failPublic(errReativar, 'afiliado/cadastro', 'Não foi possível fazer seu cadastro agora. Tente novamente.')
      }
      return { success: true as const }
    }
  }

  const { error: errIns } = await supabase.from('afiliados').insert({
    auth_user_id: userId,
    nome,
    email,
    telefone,
    documento: doc.documento,
  })

  if (errIns) {
    if (criadoAgora && userId) {
      try {
        const { error: errDel } = await supabase.auth.admin.deleteUser(userId)
        if (errDel) console.error('[api:afiliado/cadastro] usuário órfão não apagado', userId, errDel)
      }
      catch (e) {
        console.error('[api:afiliado/cadastro] usuário órfão não apagado', userId, e)
      }
    }
    if ((errIns as { code?: string }).code === '23505') {
      return {
        success: false as const,
        error: 'Já existe um cadastro de afiliado com estes dados. Entre pelo login.',
      }
    }
    return failPublic(errIns, 'afiliado/cadastro', 'Não foi possível fazer seu cadastro agora. Tente novamente.')
  }

  return { success: true as const }
})
