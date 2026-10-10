import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { COLUNAS_REMOCAO_AFILIADO, removerAfiliacaoDoAfiliado } from '~~/server/utils/requireAfiliado'
import type { AfiliadoParaRemocao } from '~~/server/utils/requireAfiliado'

/**
 * POST /api/admin/remover-afiliacao { afiliadoId? | empresaId?, previa? }
 *
 * Tira o papel de afiliado de uma pessoa (pedido do dono, 09/10/2026). A regra
 * fica em removerAfiliacaoDoAfiliado (server/utils/requireAfiliado.ts), a
 * mesma da troca automática de papel:
 *  - saque aberto → recusa (pague ou recuse o saque antes);
 *  - com saldo, só remove quem está BLOQUEADO com motivo (o saldo é cancelado);
 *  - nunca trouxe cliente, nunca teve comissão nem saque → o cadastro é apagado;
 *  - já tem histórico → fica REMOVIDO (removido_em), não bloqueado: some da
 *    tela Afiliados e o login ignora o papel (a pessoa volta a ser cliente normal).
 * `previa: true` só conta o que vai acontecer (para o modal de confirmação).
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { afiliadoId, empresaId, previa } = await readBody<{ afiliadoId?: string; empresaId?: string; previa?: boolean }>(event)

  const supabase = getServiceClient()

  let afiliado: AfiliadoParaRemocao | null = null
  if (afiliadoId) {
    const { data } = await supabase.from('afiliados').select(COLUNAS_REMOCAO_AFILIADO).eq('id', afiliadoId).maybeSingle()
    afiliado = data as any
  }
  else if (empresaId) {
    const { data: empresa } = await supabase.from('empresas').select('auth_user_id').eq('id', empresaId).maybeSingle()
    if (empresa?.auth_user_id) {
      const { data } = await supabase.from('afiliados').select(COLUNAS_REMOCAO_AFILIADO).eq('auth_user_id', empresa.auth_user_id).maybeSingle()
      afiliado = data as any
    }
  }
  else {
    throw createError({ statusCode: 400, statusMessage: 'afiliadoId ou empresaId obrigatório' })
  }
  if (!afiliado) return { success: false, error: 'Não encontrei afiliado para esta conta.' }

  return await removerAfiliacaoDoAfiliado(supabase, afiliado, { previa: !!previa })
})
