import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import {
  carregarConfig,
  consultarEmLotes,
  consultarPaginado,
  normalizarLiberacoes,
  requireAfiliado,
  situacaoRecebimento,
  somarValores,
} from '~~/server/utils/requireAfiliado'

/**
 * GET /api/afiliado/ganhos — extrato de comissões e saques do afiliado logado.
 * Antes de ler, passa a retenção vencida para "disponível" (ou cancela, se o
 * cliente parou de pagar). Tudo filtrado por afiliado_id do token.
 */
export default defineEventHandler(async (event) => {
  const { afiliado } = await requireAfiliado(event)
  const supabase = getServiceClient()

  await normalizarLiberacoes(supabase, afiliado.id)

  try {
    const [comissoes, saques, config] = await Promise.all([
      consultarPaginado<any>((de, ate) =>
        supabase
          .from('afiliado_comissoes')
          .select('id, empresa_pagante_id, conexao, tipo, percentual_aplicado, valor_base, valor, meses, origem_pagamento, status, liberar_em, liberado_em, saque_id, motivo_estorno, estornado_em, created_at')
          .eq('afiliado_id', afiliado.id)
          .order('created_at', { ascending: false })
          .order('id')
          .range(de, ate),
      ),
      consultarPaginado<any>((de, ate) =>
        supabase
          .from('afiliado_saques')
          .select('id, valor, chave_pix, chave_pix_tipo, titular_nome, titular_documento, status, solicitado_em, prazo_em, pago_em, comprovante, recusa_motivo')
          .eq('afiliado_id', afiliado.id)
          .order('solicitado_em', { ascending: false })
          .order('id')
          .range(de, ate),
      ),
      carregarConfig(supabase),
    ])

    // Só o nome da empresa que pagou: nada de contato.
    const empresas = await consultarEmLotes<{ id: string; nome: string | null }>(
      comissoes.map((c: any) => c.empresa_pagante_id),
      (lote, de, ate) => supabase.from('empresas').select('id, nome').in('id', lote).order('id').range(de, ate),
    )
    const nomePorId = new Map(empresas.map(e => [e.id, e.nome ?? 'Sem nome']))

    const somaStatus = (status: string) => somarValores(comissoes.filter((c: any) => c.status === status).map((c: any) => c.valor))
    const recebimento = situacaoRecebimento(afiliado)

    return {
      success: true as const,
      data: {
        comissoes: comissoes.map((c: any) => ({
          id: c.id as string,
          cliente: nomePorId.get(c.empresa_pagante_id) ?? 'Cliente',
          conexao: Number(c.conexao),
          tipo: c.tipo as 'primeira' | 'recorrente',
          percentual: Number(c.percentual_aplicado ?? 0),
          valor_base: Number(c.valor_base ?? 0),
          valor: Number(c.valor ?? 0),
          meses: Number(c.meses ?? 1),
          origem_pagamento: c.origem_pagamento as 'stripe_invoice' | 'pix_admin',
          status: c.status as string,
          liberar_em: c.liberar_em as string,
          liberado_em: (c.liberado_em ?? null) as string | null,
          motivo_estorno: (c.motivo_estorno ?? null) as string | null,
          created_at: c.created_at as string,
        })),
        saques: saques.map((s: any) => ({
          id: s.id as string,
          valor: Number(s.valor ?? 0),
          chave_pix: s.chave_pix as string,
          chave_pix_tipo: (s.chave_pix_tipo ?? null) as string | null,
          titular_nome: (s.titular_nome ?? null) as string | null,
          titular_documento: (s.titular_documento ?? null) as string | null,
          status: s.status as 'solicitado' | 'pago' | 'recusado',
          solicitado_em: s.solicitado_em as string,
          prazo_em: s.prazo_em as string,
          pago_em: (s.pago_em ?? null) as string | null,
          comprovante: (s.comprovante ?? null) as string | null,
          recusa_motivo: (s.recusa_motivo ?? null) as string | null,
        })),
        config: {
          saque_minimo: config.saque_minimo,
          prazo_saque_horas: config.prazo_saque_horas,
        },
        recebimento: {
          completo: recebimento.completo,
          faltando: recebimento.faltando,
          nome: afiliado.nome,
          documento: afiliado.documento,
          chave_pix: afiliado.chave_pix,
          chave_pix_tipo: afiliado.chave_pix_tipo,
        },
        // Contato do próprio afiliado: só para montar a mensagem opcional de
        // aviso do saque no WhatsApp da Agzap (enviada pelo WhatsApp dele).
        afiliado: {
          nome: afiliado.nome,
          email: afiliado.email,
          telefone: afiliado.telefone,
          documento: afiliado.documento,
          codigo_indicacao: afiliado.codigo_indicacao,
        },
        saque_aberto: saques.some((s: any) => s.status === 'solicitado'),
        totais: {
          retido: somaStatus('retido'),
          disponivel: somaStatus('disponivel'),
          em_saque: somaStatus('em_saque'),
          sacado: somaStatus('sacado'),
        },
      },
    }
  }
  catch (erro) {
    return failPublic(erro, 'afiliado/ganhos', 'Não foi possível carregar seus ganhos.')
  }
})
