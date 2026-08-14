import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/**
 * Relatório de lucro do parceiro no período.
 *
 * A conta que ele quer fazer é simples e ninguém fazia por ele:
 *   receita  = o que cobra de cada cliente × meses vendidos na renovação
 *   custo    = o lote de crédito realmente gasto nessa renovação (FIFO)
 *   lucro    = a diferença
 *
 * Duas honestidades que a tela precisa dizer:
 * 1. A receita usa o valor ATUAL cadastrado do cliente. Se ele mudou o preço
 *    depois da renovação, o passado é recalculado pelo preço novo.
 * 2. Compra de créditos é movimento de caixa/estoque, não custo de uma venda.
 *    O custo entra no resultado quando o lote é consumido. Cortesia custa zero.
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

  // O Data API pode limitar cada resposta a 1.000 linhas. Para reconstruir o
  // custo FIFO sem perder lotes antigos, o ledger é lido em páginas ordenadas.
  async function carregarLedger() {
    const pagina = 1_000
    const dados: any[] = []
    for (let inicio = 0; ; inicio += pagina) {
      const resposta = await supabase.from('parceiro_creditos_ledger')
        .select('id, tipo_credito, quantidade, operacao, valor_pago, renovacao_id, created_at')
        .eq('parceiro_id', parceiro.id)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .range(inicio, inicio + pagina - 1)
      if (resposta.error) return { data: dados, error: resposta.error }
      dados.push(...(resposta.data ?? []))
      if ((resposta.data?.length ?? 0) < pagina) return { data: dados, error: null }
    }
  }

  const [renovRes, ledgerRes, vinculosRes, precosRes] = await Promise.all([
    supabase.from('parceiro_renovacoes')
      .select('id, empresa_id, empresa_nome, tipo_credito, origem, consumiu_credito, vencimento_novo, executado_em')
      .eq('parceiro_id', parceiro.id)
      .eq('status', 'concluida')
      .gte('executado_em', de.toISOString())
      .lte('executado_em', ate.toISOString())
      .order('executado_em', { ascending: false }),
    carregarLedger(),
    supabase.from('parceiro_empresas')
      .select('empresa_id, cobranca_agzap, empresas ( nome, subscription_price, subscription_price_anual )')
      .eq('parceiro_id', parceiro.id)
      .eq('ativo', true),
    supabase.from('parceiro_precos_licenca')
      .select('tipo_credito, quantidade_min, preco_unitario, preco_sugerido_revenda')
      .eq('ativo', true)
      .order('tipo_credito').order('quantidade_min'),
  ])
  const erroConsulta = renovRes.error || ledgerRes.error || vinculosRes.error || precosRes.error
  if (erroConsulta) return failPublic(erroConsulta, 'parceiro/relatorio', 'Não foi possível montar o relatório.')

  const renovacoes = (renovRes.data ?? []) as any[]
  const ledger = (ledgerRes.data ?? []) as any[]
  const compras = ledger.filter(l => l.operacao === 'compra' && Number(l.quantidade) > 0)
  const vinculos = ((vinculosRes.data ?? []) as any[]).filter(v => v.empresas)
  const precos = (precosRes.data ?? []) as any[]

  const precoDoCliente = new Map<string, number>()
  const precoAnualDoCliente = new Map<string, number | null>()
  const nomeDoCliente = new Map<string, string>()
  for (const v of vinculos) {
    precoDoCliente.set(v.empresa_id, Number(v.empresas.subscription_price ?? 0) || 0)
    precoAnualDoCliente.set(
      v.empresa_id,
      v.empresas.subscription_price_anual == null
        ? null
        : Number(v.empresas.subscription_price_anual),
    )
    nomeDoCliente.set(v.empresa_id, v.empresas.nome)
  }

  /** Sugestão de revenda da tabela, quando o parceiro não definiu a dele. */
  const sugeridoRevenda = (tipo: string): number => {
    const faixa = precos.filter(p => p.tipo_credito === tipo)[0]
    return faixa ? Number(faixa.preco_sugerido_revenda ?? 0) || 0 : 0
  }

  /**
   * Receita de uma renovação anual: quem vende 12 meses cobra um preço
   * fechado, não 12× o mensal. A ordem é a do mais específico para o mais
   * genérico — valor do cliente, sugerido da tabela, e só então 12× o mensal.
   */
  function receitaAnual(empresaId: string, precoMensal: number) {
    const doCliente = precoAnualDoCliente.get(empresaId)
    if (doCliente !== null && doCliente !== undefined && doCliente > 0) {
      return { valor: doCliente, origem: 'cliente' as const }
    }
    const sugerido = sugeridoRevenda('anual_12m')
    if (sugerido > 0) return { valor: sugerido, origem: 'tabela' as const }
    return { valor: precoMensal * 12, origem: 'mensal_x12' as const }
  }

  // Fallback apenas para registros legados sem consumo ligado à renovação.
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

  interface LoteCredito { qtd: number; unitario: number; origem: 'pago' | 'cortesia' }
  const lotesPorTipo = new Map<string, LoteCredito[]>()
  const custoPorRenovacao = new Map<string, { custo: number; cortesia: boolean }>()

  /** Consome lotes antigos primeiro e devolve o custo real da saída. */
  function consumir(fila: LoteCredito[], quantidade: number, preferencia: LoteCredito['origem'] | null) {
    let restante = quantidade
    let custo = 0
    let cortesia = false
    const ordens: Array<LoteCredito['origem'] | null> = preferencia ? [preferencia, null] : [null]
    for (const origem of ordens) {
      for (const lote of fila) {
        if (restante <= 0) break
        if (origem && lote.origem !== origem) continue
        const usa = Math.min(lote.qtd, restante)
        if (usa <= 0) continue
        lote.qtd -= usa
        restante -= usa
        custo += usa * lote.unitario
        if (lote.origem === 'cortesia') cortesia = true
      }
    }
    return { fila: fila.filter(l => l.qtd > 0), custo, cortesia, semOrigem: restante }
  }

  // Reconstrói o estoque por lote. Compra tem o custo efetivamente pago;
  // concessão, migração e ajuste sem valor são cortesia com custo zero.
  for (const movimento of ledger) {
    const tipo = String(movimento.tipo_credito)
    const qtd = Number(movimento.quantidade) || 0
    let fila = lotesPorTipo.get(tipo) ?? []
    if (qtd > 0) {
      const totalPago = Number(movimento.valor_pago) || 0
      fila.push({
        qtd,
        unitario: totalPago > 0 ? totalPago / qtd : 0,
        origem: totalPago > 0 ? 'pago' : 'cortesia',
      })
    }
    else if (qtd < 0) {
      const preferencia = movimento.operacao === 'correcao'
        ? ((Number(movimento.valor_pago) || 0) > 0 ? 'pago' : null)
        : null
      const saida = consumir(fila, -qtd, preferencia)
      fila = saida.fila
      if (movimento.operacao === 'consumo' && movimento.renovacao_id) {
        const fallback = tipo === 'anual_12m' ? custoAnual : custoMensal
        custoPorRenovacao.set(movimento.renovacao_id, {
          // Saldo sem origem é legado inconsistente; estimar é mais honesto do
          // que declarar custo zero e inflar o lucro.
          custo: saida.custo + saida.semOrigem * fallback,
          cortesia: saida.cortesia,
        })
      }
    }
    lotesPorTipo.set(tipo, fila)
  }

  const MESES: Record<string, number> = { mensal_30d: 1, anual_12m: 12 }

  const linhas = renovacoes.map((r) => {
    const consumiu = r.consumiu_credito === true
    const meses = consumiu ? (MESES[r.tipo_credito as string] ?? 1) : 0
    const preco = precoDoCliente.get(r.empresa_id) ?? 0
    // Renovação da Agzap não é venda do parceiro nem custo dele: entra na
    // lista para explicar o vencimento, mas com receita e custo zerados.
    // Sem isso, um ajuste administrativo de 1 dia virava um mês de receita.
    const custoRegistrado = custoPorRenovacao.get(r.id)
    const custo = !consumiu
      ? 0
      : (custoRegistrado?.custo ?? (r.tipo_credito === 'anual_12m' ? custoAnual : custoMensal))
    const anual = r.tipo_credito === 'anual_12m' ? receitaAnual(r.empresa_id, preco) : null
    const receita = !consumiu ? 0 : (anual ? anual.valor : preco * meses)
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
      // De onde saiu a receita da linha anual, para a tela poder avisar quando
      // ainda é o sugerido da tabela e não o preço que ele realmente cobrou.
      preco_anual_origem: anual?.origem ?? null,
      receita,
      custo,
      credito_cortesia: consumiu && custoRegistrado?.cortesia === true && custo === 0,
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
  const receitaBruta = soma(l => l.receita)
  const custoCreditosUsados = soma(l => l.custo)
  const lucroLiquido = receitaBruta - custoCreditosUsados

  const semPreco = porCliente.filter(c => c.preco_mensal <= 0).length

  return {
    success: true,
    data: {
      periodo: { de: de.toISOString(), ate: ate.toISOString() },
      resumo: {
        receita_bruta: receitaBruta,
        // Compatibilidade temporária com consumidores antigos da API. Na tela
        // o nome correto deste valor é receita bruta, não lucro.
        lucro_bruto: receitaBruta,
        // Movimento de caixa/estoque do período; não é descontado novamente do
        // lucro porque cada crédito entra pelo custo ao ser consumido.
        gasto_compras: gastoCompras,
        compras_valor: compraValor,
        compras_creditos: compraCreditos,
        estornos_valor: estornoValor,
        custo_creditos_usados: custoCreditosUsados,
        creditos_usados: linhas.filter(l => l.consumiu_credito).length,
        creditos_cortesia_usados: linhas.filter(l => l.credito_cortesia).length,
        lucro_liquido: lucroLiquido,
        margem: receitaBruta > 0 ? (lucroLiquido / receitaBruta) * 100 : 0,
        renovacoes: linhas.filter(l => l.consumiu_credito).length,
        renovacoes_agzap: linhas.filter(l => !l.consumiu_credito).length,
        meses_vendidos: soma(l => l.meses),
        clientes_atendidos: porCliente.filter(c => c.receita > 0).length,
        custo_medio_mensal: custoMensal,
        custo_medio_anual: custoAnual,
        // Quantas renovações anuais ainda usam o preço sugerido da tabela em
        // vez do que o parceiro combinou com aquele cliente.
        anuais_sem_preco_proprio: linhas.filter(l => l.preco_anual_origem && l.preco_anual_origem !== 'cliente').length,
        // Cliente sem valor cadastrado entra com receita zero e distorce o
        // relatório: a tela avisa em vez de fingir que está tudo certo.
        clientes_sem_preco: semPreco,
      },
      porCliente,
      renovacoes: linhas,
    },
  }
})
