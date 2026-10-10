import { createHash } from 'node:crypto'
import { requireAfiliado } from '~~/server/utils/requireAfiliado'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { VERSAO_TERMO_AFILIADO, textosConfirmacaoAfiliado } from '~~/app/constants/termosAfiliado'

/**
 * /api/afiliado/termos-aceite — aceite do Termo do Afiliado (09/10/2026).
 * Mesmo modelo do Termo do Parceiro e dos Termos do app (versão + hash +
 * leitura até o fim + 2 caixas + prova gravada no servidor).
 *
 * GET  -> { exige, versao, aceito_em, confirmacoes }: exige = true enquanto o
 *         afiliado não aceitou a versão vigente. O modal do portal bloqueia
 *         tudo até o aceite.
 * POST -> grava a prova em afiliado_termos_aceites: quem (login + cadastro do
 *         afiliado), as 2 confirmações (texto exato), IP, navegador, data/hora
 *         (do banco) e o hash do texto exato que estava na tela (texto em
 *         termos_versoes, versao 'afiliado-<versão>'). Idempotente por
 *         (afiliado, versão).
 *
 * Mudou o texto em app/constants/termosAfiliado.ts? Suba VERSAO_TERMO_AFILIADO
 * e atualize HASH_TERMO_AFILIADO_OFICIAL (SHA-256 de textoCanonicoTermoAfiliado()).
 * Hash divergente NÃO bloqueia o aceite: grava com hash_confere = false.
 * Tabela ainda não criada no banco: o GET não exige (o portal não trava) e o
 * POST responde com erro amigável.
 */
const HASH_TERMO_AFILIADO_OFICIAL = '48457bf4d211c6b1c28c9c08e6c5a4dde00cf92892d7ed3c4b019772c6a0550e'

export default defineEventHandler(async (event) => {
  const { afiliado, userId } = await requireAfiliado(event)
  const supabase = getServiceClient()

  if (event.method === 'GET') {
    const { data: aceite, error } = await supabase
      .from('afiliado_termos_aceites')
      .select('aceito_em')
      .eq('afiliado_id', afiliado.id)
      .eq('versao_termos', VERSAO_TERMO_AFILIADO)
      .limit(1)
      .maybeSingle()
    if (error) {
      // Sem a tabela (SQL não rodado) ou erro de banco: não trava o portal.
      console.error('[api:afiliado/termos-aceite]', error)
      return { exige: false, versao: VERSAO_TERMO_AFILIADO, aceito_em: null, confirmacoes: textosConfirmacaoAfiliado(afiliado), indisponivel: true }
    }
    return {
      exige: !aceite,
      versao: VERSAO_TERMO_AFILIADO,
      aceito_em: (aceite as any)?.aceito_em ?? null,
      confirmacoes: textosConfirmacaoAfiliado(afiliado),
    }
  }

  if (event.method !== 'POST') {
    throw createError({ statusCode: 405, statusMessage: 'Método não permitido' })
  }

  const body = await readBody<any>(event)
  const texto = String(body?.texto || '')

  if (String(body?.versao || '') !== VERSAO_TERMO_AFILIADO) {
    throw createError({ statusCode: 409, statusMessage: 'O Termo foi atualizado. Recarregue a página para ler a versão atual.' })
  }
  if (body?.rolou_ate_o_fim !== true) {
    throw createError({ statusCode: 400, statusMessage: 'Leia o Termo até o fim para continuar.' })
  }
  if (body?.li_termos !== true || body?.aceito_termos !== true) {
    throw createError({ statusCode: 400, statusMessage: 'Marque as duas confirmações para continuar.' })
  }
  if (texto.length < 1000 || texto.length > 300_000) {
    throw createError({ statusCode: 400, statusMessage: 'Texto do Termo inválido. Recarregue a página.' })
  }

  const hash = createHash('sha256').update(texto, 'utf8').digest('hex')
  const hashConfere = hash === HASH_TERMO_AFILIADO_OFICIAL
  const xff = getHeader(event, 'x-forwarded-for') || ''
  const ip = (xff.split(',')[0] || '').trim() || getHeader(event, 'x-real-ip') || null
  const userAgent = getHeader(event, 'user-agent') || null
  const tempo = Number(body?.tempo_leitura_seg)

  const { error: erroVersao } = await supabase
    .from('termos_versoes')
    .upsert({ hash, versao: `afiliado-${VERSAO_TERMO_AFILIADO}`, conteudo: texto, oficial: hashConfere }, { onConflict: 'hash', ignoreDuplicates: true })
  if (erroVersao) {
    console.error('[api:afiliado/termos-aceite:versao]', erroVersao)
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível registrar o aceite. Tente de novo.' })
  }

  const { error } = await supabase
    .from('afiliado_termos_aceites')
    .upsert({
      afiliado_id: afiliado.id,
      auth_user_id: userId,
      versao_termos: VERSAO_TERMO_AFILIADO,
      hash_termos: hash,
      hash_confere: hashConfere,
      nome_assinante: afiliado.nome || afiliado.email || 'Afiliado',
      email_assinante: afiliado.email || null,
      documento_afiliado: afiliado.documento || null,
      telefone_afiliado: afiliado.telefone || null,
      confirmacoes: textosConfirmacaoAfiliado(afiliado),
      rolou_ate_o_fim: true,
      tempo_leitura_seg: Number.isFinite(tempo) && tempo >= 0 ? Math.round(tempo) : null,
      ip,
      user_agent: userAgent,
    }, { onConflict: 'afiliado_id,versao_termos', ignoreDuplicates: true })
  if (error) {
    console.error('[api:afiliado/termos-aceite]', error)
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível registrar o aceite. Tente de novo.' })
  }

  return { ok: true, versao: VERSAO_TERMO_AFILIADO }
})
