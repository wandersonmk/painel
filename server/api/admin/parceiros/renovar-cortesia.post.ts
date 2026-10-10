import { randomUUID } from 'node:crypto'
import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { registrarAuditoria } from '~~/server/utils/parceiroLicencas'

/**
 * POST /api/admin/parceiros/renovar-cortesia { empresaId, periodo: '30d' | '12m', motivo?, previa? }
 *
 * "Renovar pela Agzap": cortesia para um cliente de parceiro. Não gasta crédito
 * do parceiro (não toca em saldo nem ledger) e não gera desconto de indicação
 * nem comissão de afiliado.
 *
 * - O novo vencimento é calculado AQUI (nunca vem do navegador), com a mesma
 *   conta do /api/admin/renovar-assinatura (meses de calendário no relógio de
 *   São Paulo, mantendo o dia do mês). Conta do vencimento atual se ele é hoje
 *   ou no futuro; senão, de hoje.
 * - Grava em `empresas` as mesmas colunas que a função do banco
 *   parceiro_consumir_credito_renovacao grava na renovação por crédito.
 *   Diferença: bloqueio (do parceiro ou da Agzap) prevalece. A cortesia muda a
 *   data, mas não desbloqueia nem desfaz o bloqueio comercial do parceiro.
 * - Os gatilhos de empresas (trg_indicacao_comissao_renovacao_manual e
 *   trg_afiliado_comissao_renovacao_manual) não sabem que é cortesia e podem
 *   criar comissão. Logo depois do update, as linhas que eles criaram para ESTA
 *   renovação (referência com o novo subscription_renews_at, ainda pendentes)
 *   são canceladas.
 * - `previa: true` só calcula as datas (para o modal), sem gravar nada.
 */

const PERIODOS = {
  '30d': { meses: 1, period: '1month', label: '30 dias' },
  '12m': { meses: 12, period: '12months', label: '12 meses' },
} as const
type Periodo = keyof typeof PERIODOS

const MOTIVO_ESTORNO = 'Renovação cortesia da Agzap (sem pagamento)'

// ── Datas no relógio de São Paulo ──────────────────────────────────────────
// Cópia da conta de server/api/admin/renovar-assinatura.post.ts (com âncora).
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

// Texto de timestamptz do Postgres ('2026-10-21 12:12:31.222+00', que é o que
// os gatilhos põem na referência) → ms. NaN se não reconhecer.
function msDoTextoPg(s: string): number {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(\.\d+)?([+-]\d{2})(?::?(\d{2}))?$/.exec(s.trim())
  if (!m) return Number.NaN
  const frac = m[3] ? m[3].slice(0, 4) : ''
  return Date.parse(`${m[1]}T${m[2]}${frac}${m[4]}:${m[5] ?? '00'}`)
}

export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const body = await readBody<{ empresaId?: string; periodo?: string; motivo?: string; previa?: boolean }>(event)

  const id = String(body?.empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }
  const previa = body?.previa === true
  const periodo = String(body?.periodo ?? '') as Periodo
  if (!previa && periodo !== '30d' && periodo !== '12m') {
    throw createError({ statusCode: 400, statusMessage: 'Período inválido' })
  }

  const supabase = getServiceClient()

  // Vínculo ativo com um parceiro: cortesia daqui é só para cliente de parceiro.
  const { data: vinculo, error: vincErr } = await supabase
    .from('parceiro_empresas')
    .select('id, parceiro_id, bloqueio_origem, cobranca_agzap')
    .eq('empresa_id', id)
    .eq('ativo', true)
    .maybeSingle()
  if (vincErr) return failPublic(vincErr, 'admin/parceiros/renovar-cortesia', 'Não foi possível carregar o cliente.')
  if (!vinculo) {
    return { success: false as const, error: 'Este cliente não está vinculado a nenhum parceiro.' }
  }

  const { data: empresa, error: empErr } = await supabase
    .from('empresas')
    .select('id, nome, ativo, subscription_status, subscription_plan, subscription_period, subscription_renews_at, trial_ends_at')
    .eq('id', id)
    .maybeSingle()
  if (empErr || !empresa) {
    return failPublic(empErr ?? 'empresa não encontrada', 'admin/parceiros/renovar-cortesia', 'Não foi possível carregar o cliente.')
  }

  const agora = new Date()
  const atual = vencimentoAtual(empresa)
  const contaDe: 'vencimento' | 'hoje' = atual && diaSP(atual) >= diaSP(agora) ? 'vencimento' : 'hoje'
  const base = contaDe === 'vencimento' && atual ? atual : agora
  const bloqueio = (vinculo.bloqueio_origem as 'parceiro' | 'admin' | null) ?? null

  if (previa) {
    return {
      success: true as const,
      data: {
        empresaNome: empresa.nome as string,
        vencimentoAtual: atual ? atual.toISOString() : null,
        diasParaVencer: atual ? diaSP(atual) - diaSP(agora) : null,
        contaDe,
        novos: {
          '30d': somarPeriodoSP(base, PERIODOS['30d'].meses, 0).toISOString(),
          '12m': somarPeriodoSP(base, PERIODOS['12m'].meses, 0).toISOString(),
        },
        bloqueio,
      },
    }
  }

  const cfg = PERIODOS[periodo]
  const motivo = (body?.motivo ?? '').trim().slice(0, 300) || null
  const novoIso = somarPeriodoSP(base, cfg.meses, 0).toISOString()
  const agoraIso = agora.toISOString()

  // Mesmas colunas da função parceiro_consumir_credito_renovacao (passo 8),
  // sem saldo/ledger. Bloqueio (parceiro ou Agzap) mantém o `ativo` de hoje.
  const update = {
    subscription_renews_at: novoIso,
    trial_ends_at: null,
    subscription_status: 'active',
    subscription_period: cfg.period,
    subscription_plan: empresa.subscription_plan && empresa.subscription_plan !== 'free' ? empresa.subscription_plan : 'pro',
    ativo: bloqueio ? empresa.ativo : true,
    updated_at: agoraIso,
  }

  // Trava otimista: só grava se o vencimento ainda é o que foi lido (dois
  // cliques, ou o parceiro renovando no mesmo instante, não somam duas vezes).
  let gravar = supabase.from('empresas').update(update).eq('id', id)
  gravar = empresa.subscription_renews_at
    ? gravar.eq('subscription_renews_at', empresa.subscription_renews_at)
    : gravar.is('subscription_renews_at', null)
  const { data: gravadas, error: updErr } = await gravar.select('id, subscription_renews_at')
  if (updErr) return failPublic(updErr, 'admin/parceiros/renovar-cortesia', 'Não foi possível renovar o cliente.')
  if (!gravadas?.length) {
    return {
      success: false as const,
      error: 'O vencimento deste cliente mudou agora há pouco. Feche, recarregue a lista e tente de novo.',
    }
  }

  // ── Neutraliza a comissão que os gatilhos criaram para esta renovação ──
  // Indicação: referencia_pagamento = 'painel-admin:<renews_at>' (a chave pode
  // ter sufixo ':m01'..':m12' no anual), status 'pendente_liberacao'.
  // Afiliado: referencia_pagamento = 'painel-admin:<empresa_id>:<renews_at>',
  // status 'retido'. A data vem como texto do Postgres: compara em ms.
  const alvoMs = Date.parse(String(gravadas[0].subscription_renews_at ?? novoIso))
  const desde = new Date(agora.getTime() - 5 * 60_000).toISOString()
  const canceladas = { indicacao: [] as string[], afiliado: [] as string[] }
  let avisoComissoes: string | null = null
  const cancelamento = { status: 'cancelado', motivo_estorno: MOTIVO_ESTORNO, estornado_em: agoraIso, updated_at: agoraIso }

  try {
    const prefixoInd = 'painel-admin:'
    const { data: indCand, error: e1 } = await supabase
      .from('indicacoes_comissoes')
      .select('id, referencia_pagamento')
      .eq('empresa_indicada_id', id)
      .eq('origem_pagamento', 'pix_admin')
      .eq('status', 'pendente_liberacao')
      .like('referencia_pagamento', `${prefixoInd}%`)
      .gte('created_at', desde)
    if (e1) throw e1
    const indIds = ((indCand ?? []) as any[])
      .filter(r => msDoTextoPg(String(r.referencia_pagamento).slice(prefixoInd.length)) === alvoMs)
      .map(r => r.id as string)
    if (indIds.length) {
      const { data, error } = await supabase
        .from('indicacoes_comissoes')
        .update(cancelamento)
        .in('id', indIds)
        .eq('status', 'pendente_liberacao')
        .select('id')
      if (error) throw error
      canceladas.indicacao = ((data ?? []) as any[]).map(r => r.id)
    }

    const prefixoAf = `painel-admin:${id}:`
    const { data: afCand, error: e2 } = await supabase
      .from('afiliado_comissoes')
      .select('id, referencia_pagamento')
      .eq('empresa_pagante_id', id)
      .eq('origem_pagamento', 'pix_admin')
      .eq('status', 'retido')
      .like('referencia_pagamento', `${prefixoAf}%`)
      .gte('created_at', desde)
    if (e2) throw e2
    const afIds = ((afCand ?? []) as any[])
      .filter(r => msDoTextoPg(String(r.referencia_pagamento ?? '').slice(prefixoAf.length)) === alvoMs)
      .map(r => r.id as string)
    if (afIds.length) {
      const { data, error } = await supabase
        .from('afiliado_comissoes')
        .update(cancelamento)
        .in('id', afIds)
        .eq('status', 'retido')
        .select('id')
      if (error) throw error
      canceladas.afiliado = ((data ?? []) as any[]).map(r => r.id)
    }
  }
  catch (erro) {
    console.error('[api:admin/parceiros/renovar-cortesia] cancelar comissões', erro)
    avisoComissoes = 'A renovação foi feita, mas não consegui conferir as comissões. Confira a indicação deste cliente.'
  }
  const comissoesCanceladas = canceladas.indicacao.length + canceladas.afiliado.length

  // Histórico de renovações do parceiro: sem crédito, origem Agzap.
  const vencimentoAnterior = empresa.subscription_renews_at ?? empresa.trial_ends_at ?? null
  const { error: renovErr } = await supabase.from('parceiro_renovacoes').insert({
    parceiro_id: vinculo.parceiro_id,
    empresa_id: id,
    empresa_nome: empresa.nome ?? null,
    tipo_credito: null,
    origem: 'admin',
    consumiu_credito: false,
    vencimento_anterior: vencimentoAnterior,
    vencimento_novo: novoIso,
    status: 'concluida',
    idempotency_key: `cortesia-agzap:${randomUUID()}`,
    motivo: `Cortesia da Agzap (${cfg.label})${motivo ? `: ${motivo}` : ''}`.slice(0, 300),
    executado_por: adminUserId,
  })
  if (renovErr) console.error('[api:admin/parceiros/renovar-cortesia] registro de renovação', renovErr)

  await registrarAuditoria(supabase, event, {
    parceiro_id: vinculo.parceiro_id,
    empresa_id: id,
    ator_user_id: adminUserId,
    ator_papel: 'admin',
    acao: 'renovacao_cortesia_agzap',
    estado_anterior: {
      periodo: empresa.subscription_period,
      renews_at: empresa.subscription_renews_at,
      trial_ends_at: empresa.trial_ends_at,
      status: empresa.subscription_status,
      ativo: empresa.ativo,
    },
    estado_novo: {
      periodo: cfg.period,
      renews_at: novoIso,
      status: 'active',
      ativo: update.ativo,
      conta_de: contaDe,
      consumiu_credito: false,
      comissoes_canceladas: canceladas,
    },
    motivo,
    origem: 'painel_admin',
  })

  return {
    success: true as const,
    data: { novoVencimento: novoIso, periodo, comissoesCanceladas, avisoComissoes },
  }
})
