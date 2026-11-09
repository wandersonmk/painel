import { randomUUID } from 'node:crypto'
import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

// Sem `ancora` (comportamento antigo): hoje + N dias corridos.
const PERIOD_DAYS: Record<string, number> = {
  trial1d: 1, trial2d: 2, trial3d: 3, trial5d: 5, trial: 7,
  '1month': 30, '6months': 180, '12months': 365,
}
// Com `ancora`: planos somam meses de calendário (mesmo dia do mês) e o teste
// grátis soma dias.
const PERIOD_MESES: Record<string, number> = { '1month': 1, '6months': 6, '12months': 12 }
const PLANS_VALIDOS = ['free', 'basic', 'pro', 'enterprise']
type Ancora = 'vencimento' | 'hoje'

// ── Datas no relógio de São Paulo ──────────────────────────────────────────
// A mesma conta está no AdminRenovarAssinaturaModal.vue (prévia). O dia do
// mês é o de SP, e a hora do vencimento atual é mantida.
const fmtPartesSP = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo', hourCycle: 'h23',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
})
// Instante → relógio de parede de SP, em ms "como se fosse UTC".
function paredeSP(t: number): number {
  const p: Record<string, number> = {}
  for (const x of fmtPartesSP.formatToParts(new Date(t))) if (x.type !== 'literal') p[x.type] = Number(x.value)
  return Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!) + (((t % 1000) + 1000) % 1000)
}
// Relógio de parede de SP → instante real.
function deParedeSP(parede: number): number {
  let t = parede + 3 * 3_600_000 // SP = UTC-3; o ajuste abaixo cobre qualquer diferença
  t += parede - paredeSP(t)
  return t
}
// Soma meses de calendário (31/01 + 1 mês = último dia de fevereiro) e dias.
function somarPeriodoSP(base: Date, meses: number, dias: number): Date {
  const w = new Date(paredeSP(base.getTime()))
  const ano = w.getUTCFullYear()
  const mesAlvo = w.getUTCMonth() + meses
  const ultimoDia = new Date(Date.UTC(ano, mesAlvo + 1, 0)).getUTCDate()
  const novo = Date.UTC(ano, mesAlvo, Math.min(w.getUTCDate(), ultimoDia),
    w.getUTCHours(), w.getUTCMinutes(), w.getUTCSeconds(), w.getUTCMilliseconds()) + dias * 86_400_000
  return new Date(deParedeSP(novo))
}
const diaSP = (d: Date) => Math.floor(paredeSP(d.getTime()) / 86_400_000)

// ── Data escolhida para o novo vencimento (`vencimento_em`) ────────────────
// INÍCIO-DATA-ESCOLHIDA: mesma conta do AdminRenovarAssinaturaModal.vue (lá o
// bloco tem também dataComDia, que só a tela usa para sugerir a data).
// Um "dia" aqui é o dia de calendário de SP como número (dias desde
// 01/01/1970, o mesmo que diaSP devolve) e vira texto 'AAAA-MM-DD'.
const MAX_MESES_DATA_ESCOLHIDA = 13
const DIA_MS = 86_400_000
// 'AAAA-MM-DD' → dia. null se o texto não é uma data que existe (ex.: 30/02).
function diaDeIso(iso: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const ano = Number(m[1]), mes = Number(m[2]), dia = Number(m[3])
  const x = new Date(Date.UTC(ano, mes - 1, dia))
  if (x.getUTCFullYear() !== ano || x.getUTCMonth() !== mes - 1 || x.getUTCDate() !== dia) return null
  return x.getTime() / DIA_MS
}
const isoDeDia = (n: number) => new Date(n * DIA_MS).toISOString().slice(0, 10)
// Dia `dia` do mês (ano, mes0). Dia que não existe no mês vira o último.
function diaNoMes(ano: number, mes0: number, dia: number): number {
  const ultimo = new Date(Date.UTC(ano, mes0 + 1, 0)).getUTCDate()
  return Date.UTC(ano, mes0, Math.min(dia, ultimo)) / DIA_MS
}
// Soma meses de calendário a um dia (31/01 + 1 mês = último dia de fevereiro).
function somarMesesDia(n: number, meses: number): number {
  const w = new Date(n * DIA_MS)
  return diaNoMes(w.getUTCFullYear(), w.getUTCMonth() + meses, w.getUTCDate())
}
// Período da renovação com data escolhida. Começa no vencimento atual se ele
// ainda não passou (o cliente já tem esses dias); senão, hoje. `referencia` é
// o fim do período normal do plano; `limite`, a data mais longe aceita.
function periodoDataEscolhida(hoje: number, vencimento: number | null, meses: number) {
  const inicio = vencimento !== null && vencimento >= hoje ? vencimento : hoje
  return {
    inicio,
    referencia: somarMesesDia(inicio, meses),
    limite: somarMesesDia(inicio, MAX_MESES_DATA_ESCOLHIDA),
  }
}
// FIM-DATA-ESCOLHIDA
// Fim do dia (23:59:59) no relógio de SP, o mesmo horário do resto da base.
const fimDoDiaSP = (n: number) => new Date(deParedeSP(n * DIA_MS + (23 * 3600 + 59 * 60 + 59) * 1000))
const fmtDataBR = (n: number) => isoDeDia(n).split('-').reverse().join('/')

// Vencimento atual, na mesma regra da coluna "Vencimento" (getDataVencimento).
function vencimentoAtual(e: { subscription_status?: string | null; subscription_renews_at?: string | null; trial_ends_at?: string | null } | null): Date | null {
  if (!e) return null
  const s = (e.subscription_status === 'active' && e.subscription_renews_at) ? e.subscription_renews_at
    : (e.subscription_status === 'trial' && e.trial_ends_at) ? e.trial_ends_at
    : e.trial_ends_at || e.subscription_renews_at || null
  if (!s) return null
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  // vencimento_em ('AAAA-MM-DD', opcional, só para os planos): data escolhida
  // do novo vencimento. Quando vem, ela manda e `ancora` é ignorada.
  // planoCodigo (opcional): plano de `planos_assinatura` aplicado junto da renovação.
  const body = await readBody<{ clienteId: string; plan: string; period: string; motivo?: string; ancora?: Ancora; vencimento_em?: string | null; planoCodigo?: string | null }>(event)

  if (!body?.clienteId || !body.plan || !body.period) {
    throw createError({ statusCode: 400, statusMessage: 'Dados incompletos' })
  }
  if (!PLANS_VALIDOS.includes(body.plan)) {
    throw createError({ statusCode: 400, statusMessage: 'Plano inválido' })
  }

  const days = PERIOD_DAYS[body.period]
  if (!days) throw createError({ statusCode: 400, statusMessage: 'Período inválido' })

  const ancora: Ancora | null = body.ancora === 'vencimento' || body.ancora === 'hoje' ? body.ancora : null
  const ehTeste = body.period.startsWith('trial')
  if (body.vencimento_em != null && typeof body.vencimento_em !== 'string') {
    throw createError({ statusCode: 400, statusMessage: 'Data do novo vencimento inválida.' })
  }
  const vencimentoEm = body.vencimento_em?.trim() || null
  if (vencimentoEm && ehTeste) {
    throw createError({ statusCode: 400, statusMessage: 'A data do vencimento só pode ser escolhida nos planos, não no teste grátis.' })
  }

  const planoCodigo = typeof body.planoCodigo === 'string' ? body.planoCodigo.trim() || null : null
  if (planoCodigo && !['1month', '12months'].includes(body.period)) {
    throw createError({ statusCode: 400, statusMessage: 'O plano vale para 1 mês ou 12 meses.' })
  }

  const supabase = getServiceClient()

  // Estado anterior: base do "contar a partir do vencimento atual" e registro
  // da renovação administrativa.
  const { data: antes, error: erroAntes } = await supabase
    .from('empresas')
    .select('nome, subscription_status, subscription_plan, plano_codigo, subscription_price, subscription_price_anual, subscription_renews_at, trial_ends_at, subscription_id, created_at')
    .eq('id', body.clienteId)
    .maybeSingle()

  // Sem planoCodigo = Básico (plano antigo): renova sem mexer em módulos e
  // limites. Vale para qualquer conta, inclusive conta nova em teste (dono,
  // 09/11/2026: antes só conta criada antes de 06/11/2026). A tela obriga o
  // administrador a clicar no Básico ou num plano quando a conta é nova.

  const agora = new Date()
  let renewDate: Date
  if (vencimentoEm) {
    if (erroAntes) throw createError({ statusCode: 500, statusMessage: 'Não consegui ler o vencimento atual' })
    if (!antes) throw createError({ statusCode: 404, statusMessage: 'Cliente não encontrado' })
    // Assinatura viva no Stripe: o webhook invoice.paid regrava o vencimento
    // com a data da cobrança. Uma data escolhida aqui não muda a cobrança e,
    // se cair antes dela, bloqueia o cliente antes de o Stripe cobrar.
    const subId = (antes as any).subscription_id
    if (typeof subId === 'string' && subId.startsWith('sub_')) {
      throw createError({ statusCode: 400, statusMessage: 'Cliente cobrado pelo Stripe: o vencimento segue a data da cobrança no Stripe.' })
    }
    const escolhido = diaDeIso(vencimentoEm)
    if (escolhido === null) throw createError({ statusCode: 400, statusMessage: 'Data do novo vencimento inválida.' })
    const hoje = diaSP(agora)
    const atual = vencimentoAtual(antes as any)
    const { limite } = periodoDataEscolhida(hoje, atual ? diaSP(atual) : null, PERIOD_MESES[body.period] ?? 1)
    if (escolhido <= hoje) {
      throw createError({ statusCode: 400, statusMessage: 'O novo vencimento precisa ser depois de hoje.' })
    }
    if (escolhido > limite) {
      throw createError({ statusCode: 400, statusMessage: `O novo vencimento passa de ${MAX_MESES_DATA_ESCOLHIDA} meses: escolha até ${fmtDataBR(limite)}.` })
    }
    renewDate = fimDoDiaSP(escolhido)
  } else if (!ancora) {
    renewDate = new Date()
    renewDate.setDate(renewDate.getDate() + days)
  } else {
    let base = agora
    if (ancora === 'vencimento') {
      if (erroAntes) throw createError({ statusCode: 500, statusMessage: 'Não consegui ler o vencimento atual' })
      const atual = vencimentoAtual(antes as any)
      if (!atual) throw createError({ statusCode: 400, statusMessage: 'Cliente sem vencimento atual. Renove a partir de hoje.' })
      base = atual
    }
    renewDate = somarPeriodoSP(base, ehTeste ? 0 : (PERIOD_MESES[body.period] ?? 1), ehTeste ? days : 0)
    // Vencimento muito antigo: contando dele, a nova data já teria passado.
    if (ancora === 'vencimento' && diaSP(renewDate) <= diaSP(agora)) {
      throw createError({ statusCode: 400, statusMessage: 'Contando do vencimento atual, a nova data já passou. Renove a partir de hoje.' })
    }
  }

  const update: Record<string, any> = {
    subscription_plan: body.plan,
    subscription_period: body.period,
    subscription_status: 'active',
    ativo: true,
    updated_at: agora.toISOString(),
  }

  if (ehTeste) {
    update.trial_ends_at = renewDate.toISOString()
    update.subscription_renews_at = null
  } else {
    update.subscription_renews_at = renewDate.toISOString()
    update.trial_ends_at = null
  }

  const { data: vinculo } = await supabase
    .from('parceiro_empresas')
    .select('parceiro_id')
    .eq('empresa_id', body.clienteId)
    .eq('ativo', true)
    .maybeSingle()

  // Antes das datas: se o plano falhar, nada foi renovado. Aplicar de novo o
  // mesmo plano não mexe em nada, então um ajuste manual continua valendo.
  if (planoCodigo) {
    const { error: erroPlano } = await supabase.rpc('aplicar_plano_assinatura', {
      p_empresa_id: body.clienteId,
      p_plano: planoCodigo,
    })
    if (erroPlano) {
      console.error('[api:admin/renovar-assinatura] aplicar plano', erroPlano)
      return { success: false, error: 'Não consegui aplicar o plano. Nada foi renovado.' }
    }
    // Cliente de parceiro paga o que o parceiro definiu, não o preço de tabela.
    if (vinculo) {
      update.subscription_price = (antes as any)?.subscription_price ?? null
      update.subscription_price_anual = (antes as any)?.subscription_price_anual ?? null
    }
  }

  const { error } = await supabase.from('empresas').update(update).eq('id', body.clienteId)

  if (error) return { success: false, error: error.message }

  // Se o cliente é de um parceiro, a renovação administrativa fica registrada
  // — sem consumir crédito e sem mexer no vínculo.
  if (vinculo) {
    const motivo = body.motivo?.trim() || ''
    await supabase.from('parceiro_renovacoes').insert({
      parceiro_id: (vinculo as any).parceiro_id,
      empresa_id: body.clienteId,
      empresa_nome: (antes as any)?.nome ?? null,
      tipo_credito: null,
      origem: 'admin',
      consumiu_credito: false,
      vencimento_anterior: (antes as any)?.subscription_renews_at ?? (antes as any)?.trial_ends_at ?? null,
      vencimento_novo: renewDate.toISOString(),
      status: 'concluida',
      idempotency_key: `admrenov:${randomUUID()}`,
      // A data escolhida no painel fica escrita no motivo (vencimento_novo já
      // guarda o instante gravado).
      motivo: (vencimentoEm
        ? `Vencimento escolhido no painel: ${vencimentoEm.split('-').reverse().join('/')}${motivo ? `. ${motivo}` : ''}`
        : motivo).slice(0, 300) || null,
      executado_por: adminUserId,
    }).then(({ error: e }) => {
      if (e) console.error('[api:admin/renovar-assinatura] registro de renovação', e)
    })
  }

  // Datas gravadas, para a lista do painel mostrar o vencimento certo na hora.
  return {
    success: true,
    subscription_renews_at: update.subscription_renews_at as string | null,
    trial_ends_at: update.trial_ends_at as string | null,
  }
})
