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
  const body = await readBody<{ clienteId: string; plan: string; period: string; motivo?: string; ancora?: Ancora }>(event)

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

  const supabase = getServiceClient()

  // Estado anterior: base do "contar a partir do vencimento atual" e registro
  // da renovação administrativa.
  const { data: antes, error: erroAntes } = await supabase
    .from('empresas')
    .select('nome, subscription_status, subscription_renews_at, trial_ends_at')
    .eq('id', body.clienteId)
    .maybeSingle()

  const agora = new Date()
  let renewDate: Date
  if (!ancora) {
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

  const { error } = await supabase.from('empresas').update(update).eq('id', body.clienteId)

  if (error) return { success: false, error: error.message }

  // Se o cliente é de um parceiro, a renovação administrativa fica registrada
  // — sem consumir crédito e sem mexer no vínculo.
  const { data: vinculo } = await supabase
    .from('parceiro_empresas')
    .select('parceiro_id')
    .eq('empresa_id', body.clienteId)
    .eq('ativo', true)
    .maybeSingle()

  if (vinculo) {
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
      motivo: body.motivo?.trim().slice(0, 300) || null,
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
