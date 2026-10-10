import { createHash } from 'node:crypto'
import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { VERSAO_TERMO_PARCEIRO, textosConfirmacaoParceiro } from '~~/app/constants/termosParceiro'

/**
 * /api/parceiro/termos-aceite — aceite do Termo do Parceiro (09/10/2026).
 *
 * GET  -> { exige, versao, aceito_em, confirmacoes }: exige = true enquanto o
 *         parceiro não aceitou a versão vigente. O modal do portal bloqueia
 *         tudo até o aceite.
 * POST -> grava a prova em parceiro_termos_aceites: quem (login + cadastro do
 *         parceiro), as 2 confirmações (texto exato), IP, navegador, data/hora
 *         (do banco) e o hash do texto exato que estava na tela (texto em
 *         termos_versoes, versao 'parceiro-<versão>'). Idempotente por
 *         (parceiro, versão). Também atualiza parceiros.dados_split.termos.
 *
 * Mudou o texto em app/constants/termosParceiro.ts? Suba VERSAO_TERMO_PARCEIRO
 * e atualize HASH_TERMO_PARCEIRO_OFICIAL (SHA-256 de textoCanonicoTermoParceiro()).
 * Hash divergente NÃO bloqueia o aceite: grava com hash_confere = false.
 */
const HASH_TERMO_PARCEIRO_OFICIAL = '06cd1a5b2b790c74df159934db0276cb6ad546096c15dcaafa92b726aaf57738'

export default defineEventHandler(async (event) => {
  const { parceiro, userId } = await requireParceiro(event)
  const supabase = getServiceClient()

  if (event.method === 'GET') {
    const { data: aceite } = await supabase
      .from('parceiro_termos_aceites')
      .select('aceito_em')
      .eq('parceiro_id', parceiro.id)
      .eq('versao_termos', VERSAO_TERMO_PARCEIRO)
      .limit(1)
      .maybeSingle()
    return {
      exige: !aceite,
      versao: VERSAO_TERMO_PARCEIRO,
      aceito_em: (aceite as any)?.aceito_em ?? null,
      confirmacoes: textosConfirmacaoParceiro(parceiro),
    }
  }

  if (event.method !== 'POST') {
    throw createError({ statusCode: 405, statusMessage: 'Método não permitido' })
  }

  const body = await readBody<any>(event)
  const texto = String(body?.texto || '')

  if (String(body?.versao || '') !== VERSAO_TERMO_PARCEIRO) {
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
  const hashConfere = hash === HASH_TERMO_PARCEIRO_OFICIAL
  const xff = getHeader(event, 'x-forwarded-for') || ''
  const ip = (xff.split(',')[0] || '').trim() || getHeader(event, 'x-real-ip') || null
  const userAgent = getHeader(event, 'user-agent') || null
  const tempo = Number(body?.tempo_leitura_seg)

  const { error: erroVersao } = await supabase
    .from('termos_versoes')
    .upsert({ hash, versao: `parceiro-${VERSAO_TERMO_PARCEIRO}`, conteudo: texto, oficial: hashConfere }, { onConflict: 'hash', ignoreDuplicates: true })
  if (erroVersao) throw createError({ statusCode: 500, statusMessage: 'Não foi possível registrar o aceite. Tente de novo.' })

  const { error } = await supabase
    .from('parceiro_termos_aceites')
    .upsert({
      parceiro_id: parceiro.id,
      auth_user_id: userId,
      versao_termos: VERSAO_TERMO_PARCEIRO,
      hash_termos: hash,
      hash_confere: hashConfere,
      nome_assinante: parceiro.nome || parceiro.email || 'Parceiro',
      email_assinante: parceiro.email || null,
      documento_parceiro: parceiro.documento || null,
      telefone_parceiro: parceiro.telefone || null,
      confirmacoes: textosConfirmacaoParceiro(parceiro),
      rolou_ate_o_fim: true,
      tempo_leitura_seg: Number.isFinite(tempo) && tempo >= 0 ? Math.round(tempo) : null,
      ip,
      user_agent: userAgent,
    }, { onConflict: 'parceiro_id,versao_termos', ignoreDuplicates: true })
  if (error) throw createError({ statusCode: 500, statusMessage: 'Não foi possível registrar o aceite. Tente de novo.' })

  // Espelho no cadastro (a página /parceiro/termos e telas antigas leem daqui).
  await supabase
    .from('parceiros')
    .update({
      dados_split: {
        ...(parceiro.dados_split || {}),
        termos: { aceito_em: new Date().toISOString(), versao: VERSAO_TERMO_PARCEIRO, auth_user_id: userId },
      },
      updated_at: new Date().toISOString(),
    })
    .eq('id', parceiro.id)

  return { ok: true, versao: VERSAO_TERMO_PARCEIRO }
})
