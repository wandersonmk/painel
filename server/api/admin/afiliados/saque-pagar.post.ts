import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/**
 * Marca um saque de afiliado como pago (o PIX já foi feito pelo admin no banco).
 *
 * 1. O saque só muda se ainda estiver 'solicitado' (dois cliques ou duas abas
 *    ao mesmo tempo não pagam duas vezes).
 * 2. As comissões presas nele (saque_id = este, status 'em_saque') viram 'sacado'.
 *
 * Se o passo 2 falhar, o saque continua pago (o dinheiro já saiu) e a resposta
 * leva um aviso. Uma nova tentativa de pagar o mesmo saque refaz só o passo 2.
 *
 * comprovanteUrl (opcional): arquivo que a tela subiu antes pelo
 * saque-comprovante. Só vale se for do nosso R2 e da pasta deste saque
 * (afiliados/saques/<saqueId>/<uuid>.<ext>); qualquer outra coisa é ignorada.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ARQUIVO_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i

function comprovanteUrlValida(bruta: unknown, saqueId: string): string | null {
  const url = String(bruta ?? '').trim()
  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '')
  if (!url || !base) return null
  const prefixo = `${base}/afiliados/saques/${saqueId}/`
  if (!url.startsWith(prefixo)) return null
  return ARQUIVO_RE.test(url.slice(prefixo.length)) ? url : null
}

async function baixarComissoes(supabase: ReturnType<typeof getServiceClient>, saqueId: string) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    const { data, error } = await supabase
      .from('afiliado_comissoes')
      .update({ status: 'sacado', updated_at: new Date().toISOString() })
      .eq('saque_id', saqueId)
      .eq('status', 'em_saque')
      .select('id')
    if (!error) return { ok: true, quantidade: data?.length ?? 0 }
    console.error('[api:admin/afiliados/saque-pagar] baixa das comissoes', { saqueId, tentativa, error })
  }
  return { ok: false, quantidade: 0 }
}

export default defineEventHandler(async (event) => {
  const adminId = await requireSuperAdmin(event)
  const body = await readBody<{ saqueId?: string; comprovante?: string | null; comprovanteUrl?: string | null }>(event)

  const saqueId = String(body?.saqueId ?? '')
  if (!UUID_RE.test(saqueId)) {
    throw createError({ statusCode: 400, statusMessage: 'saqueId invalido' })
  }
  const comprovante = String(body?.comprovante ?? '').trim().slice(0, 300) || null
  const comprovanteUrl = comprovanteUrlValida(body?.comprovanteUrl, saqueId)

  const supabase = getServiceClient()
  const agora = new Date().toISOString()

  const marcarPago = (campos: Record<string, unknown>) => supabase
    .from('afiliado_saques')
    .update({ status: 'pago', pago_em: agora, pago_por: adminId, comprovante, updated_at: agora, ...campos })
    .eq('id', saqueId)
    .eq('status', 'solicitado')
    .select('id')
    .maybeSingle()

  let { data: pago, error } = await marcarPago(comprovanteUrl ? { comprovante_url: comprovanteUrl } : {})
  if (error && comprovanteUrl && error.code === '42703') {
    // Coluna comprovante_url ainda não existe no banco: paga sem o arquivo.
    console.error('[api:admin/afiliados/saque-pagar] coluna comprovante_url ausente', error)
    ;({ data: pago, error } = await marcarPago({}))
  }
  if (error) return failPublic(error, 'admin/afiliados/saque-pagar', 'Não foi possível marcar o saque como pago.')

  if (!pago) {
    const { data: atual } = await supabase
      .from('afiliado_saques')
      .select('status')
      .eq('id', saqueId)
      .maybeSingle()
    if (!atual) return { success: false, error: 'Saque não encontrado.' }
    if ((atual as any).status === 'pago') {
      // Já estava pago: garante que as comissões dele também ficaram 'sacado'.
      await baixarComissoes(supabase, saqueId)
      return { success: false, error: 'Este saque já estava marcado como pago.' }
    }
    return { success: false, error: 'Este saque foi recusado e não pode ser marcado como pago.' }
  }

  const baixa = await baixarComissoes(supabase, saqueId)
  if (!baixa.ok) {
    return {
      success: true,
      aviso: 'Saque marcado como pago, mas as comissões dele não mudaram para "sacado". Avise o suporte técnico.',
    }
  }

  return { success: true, data: { comissoes: baixa.quantidade } }
})
