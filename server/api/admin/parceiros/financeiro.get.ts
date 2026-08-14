import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/**
 * Visão financeira do programa de parceiros para a página /financeiro.
 *
 * Responde três perguntas de controle que o extrato solto não respondia:
 *   1. quanto entrou de venda de crédito e quanto saiu em estorno (com motivo);
 *   2. quem consumiu crédito, em qual cliente e até quando vale;
 *   3. quanto de crédito já pago ainda não virou entrega (passivo) e o que vence.
 *
 * Só leitura — nenhuma escrita mora aqui.
 */

const DIA_MS = 86_400_000

type Tipo = 'mensal_30d' | 'anual_12m'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  const [parceirosRes, ledgerRes, saldosRes, renovacoesRes, vinculosRes, precosRes] = await Promise.all([
    supabase.from('parceiros').select('id, nome, email, ativo, modelo_negocio'),
    // Sem limite artificial: o financeiro precisa do total do ano, não dos
    // últimos N lançamentos. O ledger cresce devagar (1 linha por operação).
    supabase.from('parceiro_creditos_ledger')
      .select('id, parceiro_id, tipo_credito, quantidade, operacao, empresa_id, empresa_nome, renovacao_id, referencia, valor_pago, descricao, criado_por_papel, created_at')
      .order('created_at', { ascending: false })
      .limit(2000),
    supabase.from('parceiro_creditos_saldo').select('parceiro_id, tipo_credito, saldo'),
    supabase.from('parceiro_renovacoes')
      .select('id, parceiro_id, empresa_id, empresa_nome, tipo_credito, origem, consumiu_credito, vencimento_anterior, vencimento_novo, status, executado_em')
      .eq('status', 'concluida')
      .order('executado_em', { ascending: false })
      .limit(1000),
    supabase.from('parceiro_empresas')
      .select('parceiro_id, empresa_id, ativo, cobranca_agzap, bloqueio_origem, empresas ( nome, ativo, subscription_renews_at, trial_ends_at )')
      .eq('ativo', true),
    supabase.from('parceiro_precos_licenca')
      .select('tipo_credito, quantidade_min, preco_unitario, preco_sugerido_revenda')
      .eq('ativo', true)
      .order('tipo_credito').order('quantidade_min'),
  ])

  if (parceirosRes.error) return failPublic(parceirosRes.error, 'admin/parceiros/financeiro', 'Não foi possível carregar o financeiro de parceiros.')
  if (ledgerRes.error) return failPublic(ledgerRes.error, 'admin/parceiros/financeiro', 'Não foi possível carregar o financeiro de parceiros.')

  const parceiros = (parceirosRes.data ?? []) as any[]
  const ledger = (ledgerRes.data ?? []) as any[]
  const renovacoes = (renovacoesRes.data ?? []) as any[]
  const vinculos = ((vinculosRes.data ?? []) as any[]).filter(v => v.empresas)
  const precos = (precosRes.data ?? []) as any[]

  const nomePorParceiro = new Map<string, string>(parceiros.map(p => [p.id, p.nome]))

  const agora = Date.now()
  const inicioMes = new Date()
  inicioMes.setDate(1)
  inicioMes.setHours(0, 0, 0, 0)
  const inicioMesMs = inicioMes.getTime()

  const noMes = (iso: string | null) => !!iso && new Date(iso).getTime() >= inicioMesMs
  const valor = (l: any) => Number(l.valor_pago ?? 0) || 0

  // ───────── Preço de tabela (fallback do passivo quando não há compra) ─────────
  const precoTabela = (tipo: Tipo): number => {
    const faixas = precos.filter(p => p.tipo_credito === tipo)
    if (!faixas.length) return 0
    // Faixa de menor volume = preço cheio: passivo estimado por baixo do risco.
    return Number(faixas[0].preco_unitario) || 0
  }

  // ───────── Rateio do saldo: o que tem dinheiro atrás e o que é cortesia ─────────
  // O ledger não marca lote, então reconstruímos: cada entrada vira um lote com
  // origem e preço unitário, cada saída consome do lote mais antigo (FIFO).
  // Sem isso, "passivo" mistura receita adiantada (dívida de verdade) com
  // cortesia concedida (serviço prometido sem dinheiro nenhum recebido).
  interface Lote { origem: 'pago' | 'cortesia'; unitario: number; qtd: number }
  const lotesPorChave = new Map<string, Lote[]>()

  /**
   * Baixa `quantidade` da fila, começando pelos lotes da origem preferida (do
   * mais antigo para o mais novo) e caindo no FIFO puro se não bastar — assim
   * o saldo rateado nunca fica negativo.
   */
  function consumirDaFila(fila: Lote[], quantidade: number, preferencia: 'pago' | 'cortesia' | null) {
    let restante = quantidade
    const ordens = preferencia ? [preferencia, null] : [null]
    for (const origem of ordens) {
      for (const lote of fila) {
        if (restante <= 0) break
        if (origem && lote.origem !== origem) continue
        const usa = Math.min(lote.qtd, restante)
        lote.qtd -= usa
        restante -= usa
      }
    }
    return fila.filter(l => l.qtd > 0)
  }

  // O ledger vem do mais novo para o mais velho; o FIFO precisa do contrário.
  for (const l of [...ledger].reverse()) {
    const chave = `${l.parceiro_id}:${l.tipo_credito}`
    let fila = lotesPorChave.get(chave) ?? []
    const qtd = Number(l.quantidade)

    if (qtd > 0) {
      // Entrada com valor lançado = dinheiro entrou. Sem valor (concessão,
      // migração, correção a favor) = crédito dado, avaliado a preço de tabela.
      const pago = valor(l) > 0
      fila.push({
        origem: pago ? 'pago' : 'cortesia',
        unitario: pago ? valor(l) / qtd : precoTabela(l.tipo_credito),
        qtd,
      })
    }
    else {
      // Correção negativa COM valor é estorno de compra: tira do lote pago.
      // SEM valor é retirada de cortesia. Sem essa distinção o FIFO comia o
      // crédito comprado ao desfazer uma cortesia, e o passivo pago sumia.
      // Consumo de verdade (renovação) segue FIFO puro: gasta o mais antigo.
      const preferencia = l.operacao === 'correcao'
        ? (valor(l) > 0 ? 'pago' : 'cortesia')
        : null
      fila = consumirDaFila(fila, -qtd, preferencia)
    }
    lotesPorChave.set(chave, fila)
  }

  /**
   * Saldo rateado, conferido contra parceiro_creditos_saldo — que é a fonte da
   * verdade. Divergência (ledger truncado, ajuste fora do fluxo) entra como
   * cortesia: na dúvida, nunca inflar o que consta como pago.
   */
  function ratearSaldo(parceiroId: string, tipo: Tipo, saldoReal: number) {
    const fila = (lotesPorChave.get(`${parceiroId}:${tipo}`) ?? []).map(l => ({ ...l }))
    let sobrando = fila.reduce((acc, l) => acc + l.qtd, 0) - saldoReal
    // Ledger diz mais que o saldo: consome o excedente do lote mais antigo.
    while (sobrando > 0 && fila.length) {
      const lote = fila[0]!
      const usa = Math.min(lote.qtd, sobrando)
      lote.qtd -= usa
      sobrando -= usa
      if (lote.qtd === 0) fila.shift()
    }

    const pago = fila.filter(l => l.origem === 'pago')
    const cortesia = fila.filter(l => l.origem === 'cortesia')
    const qtdPago = pago.reduce((acc, l) => acc + l.qtd, 0)
    const qtdCortesia = cortesia.reduce((acc, l) => acc + l.qtd, 0)
    // Saldo diz mais que o ledger: a diferença não tem origem conhecida.
    const semOrigem = Math.max(0, saldoReal - qtdPago - qtdCortesia)

    return {
      qtdPago,
      qtdCortesia: qtdCortesia + semOrigem,
      valorPago: pago.reduce((acc, l) => acc + l.qtd * l.unitario, 0),
      valorCortesia: cortesia.reduce((acc, l) => acc + l.qtd * l.unitario, 0)
        + semOrigem * precoTabela(tipo),
    }
  }

  // ───────── Listas detalhadas ─────────
  const enriquecer = (l: any) => ({
    id: l.id,
    data: l.created_at,
    parceiro_id: l.parceiro_id,
    parceiro_nome: nomePorParceiro.get(l.parceiro_id) ?? '—',
    tipo_credito: l.tipo_credito,
    quantidade: Number(l.quantidade),
    operacao: l.operacao,
    empresa_id: l.empresa_id ?? null,
    empresa_nome: l.empresa_nome,
    renovacao_id: l.renovacao_id ?? null,
    referencia: l.referencia,
    valor_pago: l.valor_pago === null ? null : Number(l.valor_pago),
    // O motivo é o que faltava na tela: correção sem justificativa não passa
    // pelo endpoint de lançamento, então aqui ele sempre existe.
    motivo: l.descricao,
    criado_por_papel: l.criado_por_papel,
  })

  const vendas = ledger.filter(l => l.operacao === 'compra').map(enriquecer)
  const concessoes = ledger.filter(l => l.operacao === 'concessao_admin').map(enriquecer)
  const migracoes = ledger.filter(l => l.operacao === 'migracao').map(enriquecer)
  const correcoes = ledger.filter(l => l.operacao === 'correcao').map(enriquecer)
  const estornos = correcoes.filter(l => l.quantidade < 0)
  const ajustesPositivos = correcoes.filter(l => l.quantidade > 0)
  const consumos = ledger.filter(l => l.operacao === 'consumo').map(enriquecer)

  // Cada consumo aponta para a SUA renovação (ledger.renovacao_id). Casar por
  // parceiro+empresa faria todas as linhas do cliente herdarem a data da
  // renovação mais recente e o histórico viraria mentira.
  const renovPorId = new Map<string, any>()
  for (const r of renovacoes) renovPorId.set(r.id, r)

  // Só para a coluna "última renovação" da lista de vencendo, onde a pergunta
  // é mesmo "quando esse cliente foi renovado pela última vez".
  const renovPorEmpresa = new Map<string, any>()
  for (const r of renovacoes) {
    const chave = `${r.parceiro_id}:${r.empresa_id}`
    if (!renovPorEmpresa.has(chave)) renovPorEmpresa.set(chave, r)
  }

  const soma = (ls: any[], f: (l: any) => number) => ls.reduce((acc, l) => acc + f(l), 0)
  const abs = (n: number) => Math.abs(n)

  // ───────── Consolidado por parceiro ─────────
  const porParceiro = parceiros.map((p) => {
    const doP = (ls: any[]) => ls.filter(l => l.parceiro_id === p.id)
    const vendasP = doP(vendas)
    const estornosP = doP(estornos)
    const ajustesP = doP(ajustesPositivos)
    const concessoesP = doP(concessoes)
    const consumosP = doP(consumos)

    const saldo = { mensal_30d: 0, anual_12m: 0 }
    for (const s of (saldosRes.data ?? []) as any[]) {
      if (s.parceiro_id === p.id && s.tipo_credito in saldo) {
        saldo[s.tipo_credito as Tipo] = Number(s.saldo) || 0
      }
    }

    const carteira = vinculos.filter(v => v.parceiro_id === p.id)
    const vencimentoDe = (v: any) => v.empresas.subscription_renews_at ?? v.empresas.trial_ends_at ?? null
    const diasAte = (iso: string | null) => iso === null ? null : Math.ceil((new Date(iso).getTime() - agora) / DIA_MS)

    const rateioMensal = ratearSaldo(p.id, 'mensal_30d', saldo.mensal_30d)
    const rateioAnual = ratearSaldo(p.id, 'anual_12m', saldo.anual_12m)
    const passivoPago = rateioMensal.valorPago + rateioAnual.valorPago
    const passivoCortesia = rateioMensal.valorCortesia + rateioAnual.valorCortesia

    return {
      id: p.id,
      nome: p.nome,
      email: p.email,
      ativo: p.ativo,
      modelo_negocio: p.modelo_negocio,
      // Dinheiro
      vendido_total: soma(vendasP, valor),
      vendido_mes: soma(vendasP.filter(l => noMes(l.data)), valor),
      estornado_total: soma(estornosP, valor),
      estornado_mes: soma(estornosP.filter(l => noMes(l.data)), valor),
      liquido_total: soma(vendasP, valor) - soma(estornosP, valor),
      // Passivo pago = dinheiro que entrou e ainda não virou entrega.
      // Cortesia = serviço prometido sem nenhum dinheiro atrás. São coisas
      // diferentes; somar as duas num número só engana.
      passivo_pago: passivoPago,
      passivo_cortesia: passivoCortesia,
      passivo_estimado: passivoPago + passivoCortesia,
      saldo_pago: rateioMensal.qtdPago + rateioAnual.qtdPago,
      saldo_cortesia: rateioMensal.qtdCortesia + rateioAnual.qtdCortesia,
      // Créditos
      creditos_comprados: soma(vendasP, l => l.quantidade),
      creditos_concedidos: soma(concessoesP, l => l.quantidade),
      creditos_estornados: abs(soma(estornosP, l => l.quantidade)),
      creditos_ajustados: soma(ajustesP, l => l.quantidade),
      creditos_consumidos: abs(soma(consumosP, l => l.quantidade)),
      consumidos_mes: abs(soma(consumosP.filter(l => noMes(l.data)), l => l.quantidade)),
      saldo,
      saldo_total: saldo.mensal_30d + saldo.anual_12m,
      // Carteira
      clientes_total: carteira.length,
      clientes_vencendo_7d: carteira.filter((v) => {
        const d = diasAte(vencimentoDe(v))
        return d !== null && d >= 0 && d <= 7
      }).length,
      clientes_vencidos: carteira.filter((v) => {
        const d = diasAte(vencimentoDe(v))
        return d !== null && d < 0
      }).length,
      ultimo_consumo_em: consumosP[0]?.data ?? null,
    }
  })

  // ───────── Clientes vencendo / vencidos (visão de cobrança) ─────────
  const vencendo = vinculos.map((v) => {
    const venc = v.empresas.subscription_renews_at ?? v.empresas.trial_ends_at ?? null
    const dias = venc === null ? null : Math.ceil((new Date(venc).getTime() - agora) / DIA_MS)
    const ultima = renovPorEmpresa.get(`${v.parceiro_id}:${v.empresa_id}`) ?? null
    return {
      parceiro_id: v.parceiro_id,
      parceiro_nome: nomePorParceiro.get(v.parceiro_id) ?? '—',
      empresa_id: v.empresa_id,
      empresa_nome: v.empresas.nome,
      vencimento: venc,
      dias_restantes: dias,
      bloqueio_origem: v.bloqueio_origem ?? null,
      cobranca_agzap: v.cobranca_agzap === true,
      empresa_ativa: v.empresas.ativo !== false,
      ultima_renovacao_em: ultima?.executado_em ?? null,
    }
  })
    .filter(c => c.dias_restantes !== null && c.dias_restantes <= 7)
    .sort((a, b) => (a.dias_restantes ?? 0) - (b.dias_restantes ?? 0))

  // ───────── Consumo detalhado (quem gastou, com quem) ─────────
  const consumoDetalhado = consumos.map((c) => {
    const r = c.renovacao_id ? renovPorId.get(c.renovacao_id) : null
    return {
      ...c,
      renovou_de: r?.vencimento_anterior ?? null,
      renovou_ate: r?.vencimento_novo ?? null,
    }
  })

  // ───────── Resumo geral ─────────
  const resumo = {
    vendido_mes: soma(vendas.filter(l => noMes(l.data)), valor),
    vendido_total: soma(vendas, valor),
    estornado_mes: soma(estornos.filter(l => noMes(l.data)), valor),
    estornado_total: soma(estornos, valor),
    liquido_mes: soma(vendas.filter(l => noMes(l.data)), valor) - soma(estornos.filter(l => noMes(l.data)), valor),
    liquido_total: soma(vendas, valor) - soma(estornos, valor),
    creditos_vendidos_mes: soma(vendas.filter(l => noMes(l.data)), l => l.quantidade),
    creditos_vendidos_total: soma(vendas, l => l.quantidade),
    creditos_estornados_total: abs(soma(estornos, l => l.quantidade)),
    creditos_concedidos_total: soma(concessoes, l => l.quantidade),
    // Cortesia tem custo: o que foi dado de graça, avaliado a preço de tabela.
    concedido_valor_tabela: soma(concessoes, l => l.quantidade * precoTabela(l.tipo_credito)),
    creditos_consumidos_mes: abs(soma(consumos.filter(l => noMes(l.data)), l => l.quantidade)),
    creditos_consumidos_total: abs(soma(consumos, l => l.quantidade)),
    ticket_medio_credito: soma(vendas, l => l.quantidade) > 0
      ? soma(vendas, valor) / soma(vendas, l => l.quantidade)
      : 0,
    // Passivo pago: dinheiro no caixa que ainda não virou renovação entregue.
    passivo_pago: porParceiro.reduce((acc, p) => acc + p.passivo_pago, 0),
    saldo_pago: porParceiro.reduce((acc, p) => acc + p.saldo_pago, 0),
    // Cortesia a executar: serviço prometido sem dinheiro recebido.
    passivo_cortesia: porParceiro.reduce((acc, p) => acc + p.passivo_cortesia, 0),
    saldo_cortesia: porParceiro.reduce((acc, p) => acc + p.saldo_cortesia, 0),
    passivo_estimado: porParceiro.reduce((acc, p) => acc + p.passivo_estimado, 0),
    saldo_creditos_aberto: porParceiro.reduce((acc, p) => acc + p.saldo_total, 0),
    clientes_vencendo_7d: vencendo.filter(c => (c.dias_restantes ?? 0) >= 0).length,
    clientes_vencidos: vencendo.filter(c => (c.dias_restantes ?? 0) < 0).length,
    // Sinal de alerta operacional, não acusação: renovação sem consumo de
    // crédito é sempre a Agzap pagando a conta no lugar do parceiro.
    renovacoes_sem_credito_mes: renovacoes.filter(r => !r.consumiu_credito && noMes(r.executado_em)).length,
  }

  return {
    success: true,
    data: {
      resumo,
      porParceiro: porParceiro.sort((a, b) => b.liquido_total - a.liquido_total),
      vendas,
      estornos,
      ajustesPositivos,
      concessoes,
      migracoes,
      consumos: consumoDetalhado,
      vencendo,
      precos,
    },
  }
})
