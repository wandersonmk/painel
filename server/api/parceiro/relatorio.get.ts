import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/**
 * Relatório de lucro do parceiro no período.
 *
 * A conta que ele quer fazer é simples e ninguém fazia por ele:
 *   receita  = o que cobra de cada cliente × meses vendidos na renovação
 *   custo    = o crédito gasto nessa renovação, ao preço que ele pagou
 *   lucro    = a diferença
 *
 * Duas honestidades que a tela precisa dizer:
 * 1. A receita usa o valor ATUAL cadastrado do cliente. Se ele mudou o preço
 *    depois da renovação, o passado é recalculado pelo preço novo.
 * 2. O custo do crédito é o preço médio que o parceiro pagou naquele tipo.
 *    Crédito de cortesia custou zero e entra como zero — o lucro fica maior
 *    de propósito, porque foi isso que aconteceu de fato.
 */
export default defineEventHandler(async (event) => {
  const { parceiro } = await requireParceiroPrepago(event)
  const query = getQuery(event)

  const parseData = (valor: unknown, padrao: Date): Date => {
    const d = new Date(String(valor ?? ''))
    return Number.isNaN(d.getTime()) ? padrao : d
  }
  const agora = new Date()
  const trintaDias = new Date(agora.getTime() - 30 * 86_400_000)
  const de = parseData(query.de, trintaDias)
  const ate = parseData(query.ate, agora)
  if (de > ate) {
    throw createError({ statusCode: 400, statusMessage: 'Data inicial maior que a final' })
  }

  const supabase = getServiceClient()

  const [renovRes, ledgerRes, vinculosRes, precosRes] = await Promise.all([
    supabase.from('parceiro_renovacoes')
      .select('id, empresa_id, empresa_nome, tipo_credito, origem, consumiu_credito, vencimento_novo, executado_em')
      .eq('parceiro_id', parceiro.id)
      .eq('status', 'concluida')
      .gte('executado_em', de.toISOString())
      .lte('executado_em', ate.toISOString())
      .order('executado_em', { ascending: false }),
    // Ledger inteiro: as compras do período são o gasto de caixa, as compras
    // de todas as épocas dão o preço médio por crédito, e o estorno de compra
    // devolve dinheiro, então abate do gasto.
    supabase.from('parceiro_creditos_ledger')
      .select('tipo_credito, quantidade, operacao, valor_pago, created_at')
      .eq('parceiro_id', parceiro.id),
    supabase.from('parceiro_empresas')
      .select('empresa_id, cobranca_agzap, empresas ( nome, subscription_price )')
      .eq('parceiro_id', parceiro.id)
      .eq('ativo', true),
    supabase.from('parceiro_precos_licenca')
      .select('tipo_credito, quantidade_min, preco_unitario')
      .eq('ativo', true)
      .order('tipo_credito').order('quantidade_min'),
  ])
  if (renovRes.error) return failPublic(renovRes.error, 'parceiro/relatorio', 'Não foi possível montar o relatório.')

  const renovacoes = (renovRes.data ?? []) as any[]
  const ledger = (ledgerRes.data ?? []) as any[]
  const compras = ledger.filter(l => l.operacao === 'compra' && Number(l.quantidade) > 0)
  const vinculos = ((vinculosRes.data ?? []) as any[]).filter(v => v.empresas)
  const precos = (precosRes.data ?? []) as any[]

  const precoDoCliente = new Map<string, number>()
  const nomeDoCliente = new Map<string, string>()
  for (const v of vinculos) {
    precoDoCliente.set(v.empresa_id, Number(v.empresas.subscription_price ?? 0) || 0)
    nomeDoCliente.set(v.empresa_id, v.empresas.nome)
  }

  // Custo por crédito: média do que ele pagou; sem compra, cai na tabela.
  const custoPorTipo = (tipo: string): number => {
    const doTipo = compras.filter(c => c.tipo_credito === tipo && Number(c.quantidade) > 0)
    const qtd = doTipo.reduce((acc, c) => acc + Number(c.quantidade), 0)
    const valor = doTipo.reduce((acc, c) => acc + (Number(c.valor_pago) || 0), 0)
    if (qtd > 0 && valor > 0) return valor / qtd
    const faixa = precos.filter(p => p.tipo_credito === tipo)[0]
    return faixa ? Number(faixa.preco_unitario) : 0
  }
  const custoMensal = custoPorTipo('mensal_30d')
  const custoAnual = custoPorTipo('anual_12m')

  const MESES: Record<string, number> = { mensal_30d: 1, anual_12m: 12 }

  const linhas = renovacoes.map((r) => {
    const consumiu = r.consumiu_credito === true
    const meses = consumiu ? (MESES[r.tipo_credito as string] ?? 1) : 0
    const preco = precoDoCliente.get(r.empresa_id) ?? 0
    // Renovação da Agzap não é venda do parceiro nem custo dele: entra na
    // lista para explicar o vencimento, mas com receita e custo zerados.
    // Sem isso, um ajuste administrativo de 1 dia virava um mês de receita.
    const custo = !consumiu ? 0 : (r.tipo_credito === 'anual_12m' ? custoAnual : custoMensal)
    const receita = consumiu ? preco * meses : 0
    return {
      id: r.id,
      data: r.executado_em,
      empresa_id: r.empresa_id,
      empresa_nome: nomeDoCliente.get(r.empresa_id) ?? r.empresa_nome ?? '—',
      tipo_credito: r.tipo_credito,
      origem: r.origem,
      consumiu_credito: r.consumiu_credito === true,
      meses,
      preco_mensal: preco,
      receita,
      custo,
      resultado: receita - custo,
      vencimento_novo: r.vencimento_novo,
    }
  })

  const soma = (f: (l: typeof linhas[number]) => number) => linhas.reduce((acc, l) => acc + f(l), 0)

  // Consolidado por cliente, do mais lucrativo para o menos.
  const porCliente = Array.from(
    linhas.reduce((mapa, l) => {
      const atual = mapa.get(l.empresa_id) ?? {
        empresa_id: l.empresa_id,
        empresa_nome: l.empresa_nome,
        preco_mensal: l.preco_mensal,
        renovacoes: 0,
        meses: 0,
        receita: 0,
        custo: 0,
        resultado: 0,
      }
      // Só conta como renovação vendida o que consumiu crédito dele.
      if (l.consumiu_credito) atual.renovacoes += 1
      atual.meses += l.meses
      atual.receita += l.receita
      atual.custo += l.custo
      atual.resultado += l.resultado
      mapa.set(l.empresa_id, atual)
      return mapa
    }, new Map<string, any>()).values(),
  ).sort((a, b) => b.resultado - a.resultado)

  // ───────── Caixa: o que ele pagou à Agzap dentro do período ─────────
  const noPeriodo = (iso: string) => {
    const t = new Date(iso).getTime()
    return t >= de.getTime() && t <= ate.getTime()
  }
  const comprasNoPeriodo = compras.filter(c => noPeriodo(c.created_at))
  const compraValor = comprasNoPeriodo.reduce((acc, c) => acc + (Number(c.valor_pago) || 0), 0)
  const compraCreditos = comprasNoPeriodo.reduce((acc, c) => acc + Number(c.quantidade), 0)

  // Estorno de compra devolve dinheiro: abate do gasto do período. Correção
  // sem valor é retirada de cortesia — não movimenta caixa, fica de fora.
  const estornosNoPeriodo = ledger.filter(l =>
    l.operacao === 'correcao'
    && Number(l.quantidade) < 0
    && (Number(l.valor_pago) || 0) > 0
    && noPeriodo(l.created_at))
  const estornoValor = estornosNoPeriodo.reduce((acc, l) => acc + (Number(l.valor_pago) || 0), 0)

  const gastoCompras = compraValor - estornoValor
  const lucroBruto = soma(l => l.receita)

  const semPreco = porCliente.filter(c => c.preco_mensal <= 0).length

  return {
    success: true,
    data: {
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      resumo: {
        lucro_bruto: lucroBruto,
        // Gasto de caixa com a Agzap no período: é o que entra na conta do
        // lucro líquido, já abatido de estorno de compra.
        gasto_compras: gastoCompras,
        compras_valor: compraValor,
        compras_creditos: compraCreditos,
        estornos_valor: estornoValor,
        // Visão paralela: quanto valeu o crédito consumido nas renovações.
        // Cortesia entra como zero — não custou nada.
        custo_creditos_usados: soma(l => l.custo),
        creditos_usados: linhas.filter(l => l.consumiu_credito).length,
        creditos_cortesia_usados: linhas.filter(l => l.consumiu_credito && l.custo === 0).length,
        // Lucro líquido = bruto − o que saiu do bolso comprando crédito.
        lucro_liquido: lucroBruto - gastoCompras,
        margem: lucroBruto > 0 ? ((lucroBruto - gastoCompras) / lucroBruto) * 100 : 0,
        renovacoes: linhas.filter(l => l.consumiu_credito).length,
        renovacoes_agzap: linhas.filter(l => !l.consumiu_credito).length,
        meses_vendidos: soma(l => l.meses),
        clientes_atendidos: porCliente.filter(c => c.receita > 0).length,
        custo_medio_mensal: custoMensal,
        custo_medio_anual: custoAnual,
        // Cliente sem valor cadastrado entra com receita zero e distorce o
        // relatório: a tela avisa em vez de fingir que está tudo certo.
        clientes_sem_preco: semPreco,
      },
      porCliente,
      renovacoes: linhas,
    },
  }
})
