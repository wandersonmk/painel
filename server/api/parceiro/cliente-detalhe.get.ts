import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { janelaDoMes } from '~~/server/utils/janelaMes'
import {
  COLUNAS_COMISSAO_PARCEIRO, buscarEmLotes, centavos, mapearComissao,
  situacaoDoCliente, somarComissoes, vinculoAtivoDoParceiro,
  type ComissaoParceiro,
} from '~~/server/utils/parceiroLicencas'

/**
 * GET /api/parceiro/cliente-detalhe?empresaId= — o que o modal "Detalhes do
 * cliente" mostra: dados e plano, quem ele indicou (só clientes da rede deste
 * parceiro) e os ganhos de indicação que o parceiro paga para ele.
 */
export default defineEventHandler(async (event) => {
  const { parceiro } = await requireParceiro(event)
  const empresaId = String(getQuery(event).empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }

  const supabase = getServiceClient()

  const { data: vinculo, error: vincErr } = await vinculoAtivoDoParceiro(supabase, parceiro.id, empresaId)
  if (vincErr) return failPublic(vincErr, 'parceiro/cliente-detalhe', 'Não foi possível carregar o cliente.')
  if (!vinculo) return { success: false as const, error: 'Este cliente não está vinculado à sua conta.' }

  const { data: empresa, error: empErr } = await supabase
    .from('empresas')
    .select('id, nome, nome_cliente, email, whatsapp, ativo, created_at, subscription_status, subscription_plan, subscription_period, subscription_price, subscription_price_anual, subscription_renews_at, trial_ends_at, indicado_por_empresa_id')
    .eq('id', empresaId)
    .maybeSingle()
  if (empErr || !empresa) return failPublic(empErr, 'parceiro/cliente-detalhe', 'Não foi possível carregar o cliente.')

  const refId = empresa.indicado_por_empresa_id && empresa.indicado_por_empresa_id !== empresaId
    ? empresa.indicado_por_empresa_id as string
    : null

  const [refRes, indicadasRes, comissoesRes, configRes] = await Promise.all([
    refId
      ? supabase.from('empresas').select('nome').eq('id', refId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    supabase
      .from('empresas')
      .select('id, nome, nome_cliente, ativo, created_at, subscription_status, subscription_plan, subscription_period, subscription_renews_at, trial_ends_at')
      .eq('indicado_por_empresa_id', empresaId)
      .order('created_at', { ascending: true })
      .limit(1000),
    supabase
      .from('indicacoes_comissoes')
      .select(COLUNAS_COMISSAO_PARCEIRO)
      .eq('empresa_indicadora_id', empresaId)
      .order('created_at', { ascending: true })
      .limit(1000),
    supabase
      .from('indicacao_config')
      .select('percentual_primeira, percentual_recorrente')
      .limit(1)
      .maybeSingle(),
  ])
  if (indicadasRes.error) return failPublic(indicadasRes.error, 'parceiro/cliente-detalhe', 'Não foi possível carregar o cliente.')
  if (comissoesRes.error) return failPublic(comissoesRes.error, 'parceiro/cliente-detalhe', 'Não foi possível carregar o cliente.')

  // Indicados: só os que também são clientes deste parceiro. Quem não é dele
  // não aparece (nome, plano e situação de cliente alheio não vazam).
  const indicadas = ((indicadasRes.data ?? []) as any[]).filter(e => e.id !== empresaId)
  const { data: vinculosIndicadas, error: errVinc } = await buscarEmLotes<{ empresa_id: string; bloqueio_origem: string | null }>(
    indicadas.map(e => e.id),
    (lote, de, ate) => supabase
      .from('parceiro_empresas')
      .select('empresa_id, bloqueio_origem')
      .eq('parceiro_id', parceiro.id)
      .eq('ativo', true)
      .in('empresa_id', lote)
      .order('empresa_id')
      .range(de, ate),
  )
  if (errVinc) return failPublic(errVinc, 'parceiro/cliente-detalhe', 'Não foi possível carregar o cliente.')
  const bloqueioDe = new Map(vinculosIndicadas.map(v => [v.empresa_id, v.bloqueio_origem]))

  const comissoes = ((comissoesRes.data ?? []) as any[]).map(mapearComissao)
  const pctPrimeira = Number(configRes.data?.percentual_primeira ?? 10)
  const pctRecorrente = Number(configRes.data?.percentual_recorrente ?? 5)
  const preco = empresa.subscription_price === null || empresa.subscription_price === undefined
    ? null
    : Number(empresa.subscription_price)

  // "Este mês" no fuso de São Paulo. Mês 2..N do plano adiantado conta no
  // mês em que libera; o resto conta no mês do pagamento.
  const janela = janelaDoMes('America/Sao_Paulo')
  const inicioMes = new Date(janela.de).getTime()
  const fimMes = new Date(janela.ate).getTime()
  const noMes = (iso: string | null) => {
    if (!iso) return false
    const ms = new Date(iso).getTime()
    return ms >= inicioMes && ms < fimMes
  }
  const valeAinda = (c: ComissaoParceiro) => c.status !== 'cancelado' && c.status !== 'estornado'
  const doMes = (c: ComissaoParceiro) =>
    valeAinda(c) && (Number(c.parcela || 1) > 1 ? noMes(c.liberar_em) : noMes(c.created_at))

  const agora = Date.now()
  const indicados = indicadas
    .filter(e => bloqueioDe.has(e.id))
    .map((e) => {
      const { situacao, vencimento } = situacaoDoCliente(bloqueioDe.get(e.id), e, agora)
      const deste = comissoes.filter(c => c.empresa_indicada_id === e.id)
      const registrada = deste.filter(doMes).sort((a, b) => b.created_at.localeCompare(a.created_at))[0]

      let gera: { tipo: 'primeira' | 'recorrente'; percentual: number; valor: number; previsto: boolean } | null = null
      if (registrada) {
        gera = { tipo: registrada.tipo, percentual: registrada.percentual_aplicado, valor: registrada.valor_credito, previsto: false }
      }
      else if (situacao === 'ativo') {
        // Ainda não pagou este mês: mostra o que vai gerar quando pagar.
        const tipo = deste.some(valeAinda) ? 'recorrente' : 'primeira'
        const percentual = tipo === 'primeira' ? pctPrimeira : pctRecorrente
        gera = { tipo, percentual, valor: preco ? centavos(preco * percentual / 100) : 0, previsto: true }
      }

      return {
        empresa_id: e.id as string,
        nome: e.nome as string,
        responsavel: e.nome_cliente?.trim() || null,
        situacao,
        plano: e.subscription_plan ?? null,
        periodo: e.subscription_period ?? null,
        vencimento,
        created_at: e.created_at as string,
        gera,
      }
    })

  const { situacao, vencimento } = situacaoDoCliente(vinculo.bloqueio_origem, empresa, agora)

  return {
    success: true as const,
    data: {
      dados: {
        empresa_id: empresa.id as string,
        nome: empresa.nome as string,
        responsavel: empresa.nome_cliente?.trim() || null,
        email: empresa.email ?? null,
        whatsapp: empresa.whatsapp ?? null,
        created_at: empresa.created_at as string,
        vinculado_em: vinculo.created_at as string,
        plano: empresa.subscription_plan ?? null,
        periodo: empresa.subscription_period ?? null,
        status_assinatura: empresa.subscription_status ?? null,
        vencimento,
        situacao,
        preco,
        preco_anual: empresa.subscription_price_anual === null || empresa.subscription_price_anual === undefined
          ? null
          : Number(empresa.subscription_price_anual),
        cobranca_agzap: vinculo.cobranca_agzap === true,
        indicado_por_nome: refId ? ((refRes.data as { nome?: string } | null)?.nome ?? null) : null,
      },
      indicados,
      ganhos: {
        rows: comissoes,
        ...somarComissoes(comissoes),
      },
      percentuais: { primeira: pctPrimeira, recorrente: pctRecorrente },
    },
  }
})
