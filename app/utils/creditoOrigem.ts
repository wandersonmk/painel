/**
 * Origem do crédito num lançamento do ledger, para exibição.
 *
 * Mesma regra que o rateio do financeiro usa para separar passivo pago de
 * cortesia a executar: o que manda é ter valor lançado.
 *   entrada com valor  → dinheiro entrou
 *   entrada sem valor  → concessão, migração ou correção a favor
 *   saída com valor    → estorno de uma compra paga
 *   saída sem valor    → retirada de saldo sem reembolso
 *
 * Consumo não tem origem: é uso de saldo, e qual lote ele gasta depende do
 * FIFO, que só o servidor calcula.
 */
export interface OrigemCredito {
  texto: string
  cls: string
  icone: string
}

export function origemCredito(
  operacao: string,
  quantidade: number,
  valorPago: number | null | undefined,
): OrigemCredito | null {
  if (operacao === 'consumo') return null

  const pago = Number(valorPago ?? 0) > 0
  const emerald = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400'
  const amber = 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-400'

  if (quantidade < 0) {
    return pago
      ? { texto: 'Estorno de compra', cls: emerald, icone: 'fa-rotate-left' }
      : { texto: 'Sem reembolso', cls: amber, icone: 'fa-minus' }
  }
  return pago
    ? { texto: 'Pago', cls: emerald, icone: 'fa-money-bill-wave' }
    : { texto: 'Cortesia', cls: amber, icone: 'fa-gift' }
}
