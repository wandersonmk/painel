import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { consultarEmLotes, consultarPaginado, emLotes, somarValores } from '~~/server/utils/requireAfiliado'

/**
 * Recusa um saque de afiliado (motivo obrigatório, o afiliado vê).
 *
 * 1. O saque só muda se ainda estiver 'solicitado'.
 * 2. As comissões presas nele saem do saque (saque_id = null):
 *    - marcadas para estorno enquanto estavam em saque (motivo_estorno
 *      preenchido: reembolso ou chargeback do pagamento) → 'estornado';
 *    - cliente que pagou não está mais com assinatura ativa → 'cancelado'
 *      (mesma regra do cron que libera as retidas);
 *    - o resto volta para 'disponivel', e o afiliado pode pedir de novo, por
 *      exemplo com a chave PIX corrigida.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MOTIVO_CLIENTE_INATIVO = 'O cliente não está mais ativo'

type LinhaEmSaque = { id: string; empresa_pagante_id: string; valor: number | string; motivo_estorno: string | null }

async function devolverComissoes(supabase: ReturnType<typeof getServiceClient>, saqueId: string) {
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const linhas = await consultarPaginado<LinhaEmSaque>((de, ate) =>
        supabase
          .from('afiliado_comissoes')
          .select('id, empresa_pagante_id, valor, motivo_estorno')
          .eq('saque_id', saqueId)
          .eq('status', 'em_saque')
          .order('id')
          .range(de, ate),
      )
      if (!linhas.length) return { ok: true, quantidade: 0, estornado: 0, cancelado: 0 }

      const empresas = await consultarEmLotes<{ id: string; subscription_status: string | null }>(
        linhas.map(l => l.empresa_pagante_id),
        (lote, de, ate) => supabase.from('empresas').select('id, subscription_status').in('id', lote).order('id').range(de, ate),
      )
      const ativas = new Set(empresas.filter(e => e.subscription_status === 'active').map(e => e.id))

      const marcada = (l: LinhaEmSaque) => !!l.motivo_estorno?.trim()
      const estornar = linhas.filter(marcada)
      const cancelar = linhas.filter(l => !marcada(l) && !ativas.has(l.empresa_pagante_id))
      const devolver = linhas.filter(l => !marcada(l) && ativas.has(l.empresa_pagante_id))
      const agora = new Date().toISOString()

      // estornar: mantém o motivo_estorno (a disputa ganha procura por ele).
      const grupos: Array<{ linhas: LinhaEmSaque[]; campos: Record<string, unknown> }> = [
        { linhas: estornar, campos: { status: 'estornado', saque_id: null, estornado_em: agora, updated_at: agora } },
        { linhas: cancelar, campos: { status: 'cancelado', saque_id: null, motivo_estorno: MOTIVO_CLIENTE_INATIVO, estornado_em: agora, updated_at: agora } },
        { linhas: devolver, campos: { status: 'disponivel', saque_id: null, updated_at: agora } },
      ]
      let quantidade = 0
      for (const g of grupos) {
        for (const lote of emLotes(g.linhas.map(l => l.id), 100)) {
          const { data, error } = await supabase
            .from('afiliado_comissoes')
            .update(g.campos)
            .in('id', lote)
            .eq('saque_id', saqueId)
            .eq('status', 'em_saque')
            .select('id')
          if (error) throw error
          quantidade += data?.length ?? 0
        }
      }
      return {
        ok: true,
        quantidade,
        estornado: somarValores(estornar.map(l => l.valor)),
        cancelado: somarValores(cancelar.map(l => l.valor)),
      }
    }
    catch (error) {
      console.error('[api:admin/afiliados/saque-recusar] devolucao das comissoes', { saqueId, tentativa, error })
    }
  }
  return { ok: false, quantidade: 0, estornado: 0, cancelado: 0 }
}

/** Aviso quando parte do valor NÃO voltou ao disponível (estorno ou cliente inativo). */
function avisoDevolucao(d: { estornado: number; cancelado: number }): string | null {
  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  const partes: string[] = []
  if (d.estornado > 0) partes.push(`${brl(d.estornado)} ficaram estornados (o pagamento do cliente foi estornado ou contestado)`)
  if (d.cancelado > 0) partes.push(`${brl(d.cancelado)} foram cancelados (o cliente que pagou não está mais ativo)`)
  return partes.length ? `Saque recusado. ${partes.join(' e ')}; o resto voltou para o disponível do afiliado.` : null
}

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{ saqueId?: string; motivo?: string }>(event)

  const saqueId = String(body?.saqueId ?? '')
  if (!UUID_RE.test(saqueId)) {
    throw createError({ statusCode: 400, statusMessage: 'saqueId invalido' })
  }
  const motivo = String(body?.motivo ?? '').trim()
  if (motivo.length < 3) return { success: false, error: 'Informe o motivo da recusa.' }
  if (motivo.length > 500) return { success: false, error: 'O motivo pode ter no máximo 500 caracteres.' }

  const supabase = getServiceClient()
  const agora = new Date().toISOString()

  const { data: recusado, error } = await supabase
    .from('afiliado_saques')
    .update({ status: 'recusado', recusa_motivo: motivo, updated_at: agora })
    .eq('id', saqueId)
    .eq('status', 'solicitado')
    .select('id')
    .maybeSingle()
  if (error) return failPublic(error, 'admin/afiliados/saque-recusar', 'Não foi possível recusar o saque.')

  if (!recusado) {
    const { data: atual } = await supabase
      .from('afiliado_saques')
      .select('status')
      .eq('id', saqueId)
      .maybeSingle()
    if (!atual) return { success: false, error: 'Saque não encontrado.' }
    if ((atual as any).status === 'recusado') {
      // Já estava recusado: garante que as comissões voltaram ao disponível.
      await devolverComissoes(supabase, saqueId)
      return { success: false, error: 'Este saque já estava recusado.' }
    }
    return { success: false, error: 'Este saque já foi pago e não pode ser recusado.' }
  }

  const devolucao = await devolverComissoes(supabase, saqueId)
  if (!devolucao.ok) {
    return {
      success: true,
      aviso: 'Saque recusado, mas o valor não voltou para o disponível do afiliado. Avise o suporte técnico.',
    }
  }

  const aviso = avisoDevolucao(devolucao)
  return {
    success: true,
    ...(aviso ? { aviso } : {}),
    data: { comissoes: devolucao.quantidade, estornado: devolucao.estornado, cancelado: devolucao.cancelado },
  }
})
