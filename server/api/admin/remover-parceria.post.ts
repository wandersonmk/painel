import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { COLUNAS_REMOCAO_PARCEIRO, removerParceriaDoParceiro } from '~~/server/utils/parceiroLicencas'
import type { ParceiroParaRemocao } from '~~/server/utils/parceiroLicencas'

/**
 * POST /api/admin/remover-parceria { parceiroId? | empresaId?, previa? }
 *
 * Tira o papel de parceiro de uma pessoa (pedido do dono, 09/10/2026), sem
 * apagar nada — ao contrário do "Excluir" da tela Parceiros, que derruba
 * vínculos e extrato em cascata. A regra fica em removerParceriaDoParceiro
 * (server/utils/parceiroLicencas.ts), a mesma da troca automática de papel:
 *  - os clientes da carteira voltam a ser da Agzap (com histórico);
 *  - os créditos que sobraram ficam congelados no extrato;
 *  - o cadastro fica REMOVIDO (removido_em), não suspenso: some da tela
 *    Parceiros e o login ignora o papel (a pessoa volta a ser cliente normal).
 * `previa: true` só conta o que vai acontecer (para o modal de confirmação).
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { parceiroId, empresaId, previa } = await readBody<{ parceiroId?: string; empresaId?: string; previa?: boolean }>(event)

  const supabase = getServiceClient()

  // Parceiro pelo id (tela Parceiros) ou pelo dono da empresa (tela Clientes).
  let parceiro: ParceiroParaRemocao | null = null
  if (parceiroId) {
    const { data } = await supabase.from('parceiros').select(COLUNAS_REMOCAO_PARCEIRO).eq('id', parceiroId).maybeSingle()
    parceiro = data as any
  }
  else if (empresaId) {
    const { data: empresa } = await supabase.from('empresas').select('auth_user_id').eq('id', empresaId).maybeSingle()
    if (empresa?.auth_user_id) {
      const { data } = await supabase.from('parceiros').select(COLUNAS_REMOCAO_PARCEIRO).eq('auth_user_id', empresa.auth_user_id).maybeSingle()
      parceiro = data as any
    }
  }
  else {
    throw createError({ statusCode: 400, statusMessage: 'parceiroId ou empresaId obrigatório' })
  }
  if (!parceiro) return { success: false, error: 'Não encontrei parceiro para esta conta.' }

  return await removerParceriaDoParceiro(supabase, event, parceiro, { adminUserId, previa: !!previa })
})
