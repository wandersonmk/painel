import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import {
  aplicarRateLimit, registrarAuditoria, vinculoAtivoDoParceiro,
} from '~~/server/utils/parceiroLicencas'

/**
 * POST /api/parceiro/desconto-acao { comissaoId, acao, descricao }
 *
 * O parceiro paga o desconto de indicação dos clientes dele, então ele mesmo
 * registra o que fez com cada mês de ganho. Mesmas transições do admin
 * (/api/admin/indicacao-comissao-acao), sem o "liberar" antecipado:
 *  - 'utilizar' (dar baixa): carência ou liberado → utilizado, com descrição.
 *  - 'cancelar' (estornar): carência → cancelado; liberado → estornado, com motivo.
 * A descrição aparece para o cliente no Registro de ganhos.
 *
 * A comissão só é tocada se a INDICADORA estiver vinculada (ativa) a este
 * parceiro — o id que veio da tela nunca basta.
 */
type Acao = 'utilizar' | 'cancelar'

export default defineEventHandler(async (event) => {
  // Só o parceiro pré-pago cobra o cliente, então só ele paga o desconto.
  const { userId, parceiro } = await requireParceiroPrepago(event)
  const body = await readBody<{ comissaoId?: string; acao?: string; descricao?: string }>(event)

  const comissaoId = String(body?.comissaoId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(comissaoId)) {
    throw createError({ statusCode: 400, statusMessage: 'Ganho inválido' })
  }
  const acao = body?.acao as Acao
  if (acao !== 'utilizar' && acao !== 'cancelar') {
    throw createError({ statusCode: 400, statusMessage: 'Ação inválida' })
  }
  const texto = String(body?.descricao ?? '').trim().slice(0, 200)
  if (!texto) {
    throw createError({ statusCode: 400, statusMessage: acao === 'utilizar' ? 'Diga onde o desconto foi aplicado' : 'Informe o motivo do estorno' })
  }

  aplicarRateLimit(`desconto:${parceiro.id}`, 30, 60_000)

  const supabase = getServiceClient()
  const { data: linha, error } = await supabase
    .from('indicacoes_comissoes')
    .select('id, status, valor_credito, liberado_em, empresa_indicadora_id, empresa_indicada_id')
    .eq('id', comissaoId)
    .maybeSingle()
  if (error) return failPublic(error, 'parceiro/desconto-acao', 'Não foi possível concluir a operação.')
  // Mesmo texto para "não existe" e "não é seu": não confirma id de outro parceiro.
  if (!linha) return { success: false as const, error: 'Este ganho não pertence a um cliente seu.' }

  const { data: vinculo, error: vincErr } = await vinculoAtivoDoParceiro(supabase, parceiro.id, linha.empresa_indicadora_id)
  if (vincErr) return failPublic(vincErr, 'parceiro/desconto-acao', 'Não foi possível concluir a operação.')
  if (!vinculo) return { success: false as const, error: 'Este ganho não pertence a um cliente seu.' }
  // Cliente cobrado direto pela Agzap: quem paga o desconto dele é a Agzap.
  if (vinculo.cobranca_agzap) {
    return { success: false as const, error: 'Este cliente é cobrado pela Agzap, então o desconto dele é dado pela Agzap.' }
  }

  const statusEsperado = ['pendente_liberacao', 'liberado']
  if (!statusEsperado.includes(linha.status)) {
    return { success: false as const, error: 'Esse mês já foi usado ou cancelado.' }
  }

  const agora = new Date().toISOString()
  const patch: Record<string, any> = acao === 'utilizar'
    ? {
        status: 'utilizado',
        liberado_em: linha.liberado_em ?? agora,
        utilizado_em: agora,
        utilizado_descricao: texto,
        updated_at: agora,
      }
    : {
        status: linha.status === 'liberado' ? 'estornado' : 'cancelado',
        motivo_estorno: texto,
        estornado_em: agora,
        updated_at: agora,
      }

  // .in(status) = trava contra corrida (outro clique, o admin ou o cron liberando junto).
  const { data: atualizada, error: upErr } = await supabase
    .from('indicacoes_comissoes')
    .update(patch)
    .eq('id', comissaoId)
    .in('status', statusEsperado)
    .select('id, status')
    .maybeSingle()
  if (upErr) return failPublic(upErr, 'parceiro/desconto-acao', 'Não foi possível salvar.')
  if (!atualizada) {
    return { success: false as const, error: 'Esse mês mudou de situação agora há pouco. Recarregue e tente de novo.' }
  }

  await registrarAuditoria(supabase, event, {
    parceiro_id: parceiro.id,
    empresa_id: linha.empresa_indicadora_id,
    ator_user_id: userId,
    ator_papel: 'parceiro',
    acao: acao === 'utilizar' ? 'indicacao_desconto_utilizar' : 'indicacao_desconto_cancelar',
    estado_anterior: { comissao_id: comissaoId, status: linha.status, valor: Number(linha.valor_credito), indicada_id: linha.empresa_indicada_id },
    estado_novo: { comissao_id: comissaoId, status: atualizada.status },
    motivo: texto,
    origem: 'painel_parceiro',
  })

  return { success: true as const, data: { status: atualizada.status as string, valor: Number(linha.valor_credito) } }
})
