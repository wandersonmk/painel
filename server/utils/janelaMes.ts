/**
 * Janela do mês corrente no fuso da empresa — mesmo cálculo usado em
 * server/utils/disparos.ts do Agzap Aplicativo (duplicado aqui de
 * propósito: são dois apps/repos separados, sem import cross-repo).
 * Usado pra contar uso mensal (envios, pedidos de Delivery) igual ao que
 * as próprias funções de cota do app calculam.
 */
function offsetDoFuso(fuso: string, instante: Date): number {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: fuso, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(instante).map(x => [x.type, x.value]),
  ) as Record<string, string>
  const comoUTC = Date.UTC(
    Number(p.year), Number(p.month) - 1, Number(p.day),
    Number(p.hour) % 24, Number(p.minute), Number(p.second),
  )
  return comoUTC - instante.getTime()
}

function inicioDoMes(fuso: string, ano: number, mes: number): Date {
  const alvo = Date.UTC(ano, mes - 1, 1, 0, 0, 0)
  let ms = alvo - offsetDoFuso(fuso, new Date(alvo))
  ms = alvo - offsetDoFuso(fuso, new Date(ms))
  return new Date(ms)
}

export function janelaDoMes(fuso = 'America/Sao_Paulo', agora = new Date()): { de: string; ate: string } {
  const [ano, mes] = new Intl.DateTimeFormat('en-CA', {
    timeZone: fuso, year: 'numeric', month: '2-digit',
  }).format(agora).split('-').map(Number) as [number, number]
  return {
    de: inicioDoMes(fuso, ano, mes).toISOString(),
    ate: inicioDoMes(fuso, mes === 12 ? ano + 1 : ano, mes === 12 ? 1 : mes + 1).toISOString(),
  }
}
