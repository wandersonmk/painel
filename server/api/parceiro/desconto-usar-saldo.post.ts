import { requireParceiroPrepago } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import {
  aplicarRateLimit, centavos, registrarAuditoria, vinculoAtivoDoParceiro,
} from '~~/server/utils/parceiroLicencas'

/**
 * POST /api/parceiro/desconto-usar-saldo { empresaId, valor, descricao }
 *
 * O parceiro aplicou parte (ou todo) o saldo LIBERADO de indicação de um
 * cliente dele na cobrança e dá baixa por valor. Mesma conta do admin
 * (/api/admin/indicacao-usar-saldo): consome os meses 'liberado' do mais
 * antigo para o mais novo; se o valor acaba no meio de um, ele é dividido —
 * a parte usada vira 'utilizado' e o resto continua 'liberado' numa linha
 * nova, sem mudar o total do extrato.
 *
 * Diferença de segurança: se um mês mudou de situação no meio do caminho
 * (outro clique, o admin), ele não é contado como usado.
 */
export default defineEventHandler(async (event) => {
  // Só o parceiro pré-pago cobra o cliente, então só ele paga o desconto.
  const { userId, parceiro } = await requireParceiroPrepago(event)
  const body = await readBody<{ empresaId?: string; valor?: number; descricao?: string }>(event)

  const empresaId = String(body?.empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }
  const valor = centavos(Number(body?.valor || 0))
  if (!(valor > 0) || valor > 100_000) {
    throw createError({ statusCode: 400, statusMessage: 'Informe um valor maior que zero' })
  }
  const descricao = String(body?.descricao ?? '').trim().slice(0, 200)
  if (!descricao) throw createError({ statusCode: 400, statusMessage: 'Diga em que o saldo foi usado' })

  aplicarRateLimit(`desconto:${parceiro.id}`, 30, 60_000)

  const supabase = getServiceClient()

  const { data: vinculo, error: vincErr } = await vinculoAtivoDoParceiro(supabase, parceiro.id, empresaId)
  if (vincErr) return failPublic(vincErr, 'parceiro/desconto-usar-saldo', 'Não foi possível concluir a operação.')
  if (!vinculo) return { success: false as const, error: 'Este cliente não está vinculado à sua conta.' }
  // Cliente cobrado direto pela Agzap: quem paga o desconto dele é a Agzap.
  if (vinculo.cobranca_agzap) {
    return { success: false as const, error: 'Este cliente é cobrado pela Agzap, então o desconto dele é dado pela Agzap.' }
  }

  const { data: linhas, error } = await supabase
    .from('indicacoes_comissoes')
    .select('*')
    .eq('empresa_indicadora_id', empresaId)
    .eq('status', 'liberado')
    .order('liberado_em', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true })
  if (error) return failPublic(error, 'parceiro/desconto-usar-saldo', 'Não foi possível concluir a operação.')

  const disponivel = centavos((linhas || []).reduce((a: number, l: any) => a + Number(l.valor_credito || 0), 0))
  if (valor > disponivel + 0.001) {
    return { success: false as const, error: `O saldo liberado é R$ ${disponivel.toFixed(2).replace('.', ',')}.` }
  }

  const agora = new Date().toISOString()
  let falta = valor
  const consumidas: { id: string; valor: number; dividida: boolean }[] = []

  for (const l of (linhas || []) as any[]) {
    if (falta <= 0.001) break
    const v = Number(l.valor_credito || 0)

    if (v <= falta + 0.001) {
      const { data: feita, error: e } = await supabase.from('indicacoes_comissoes')
        .update({ status: 'utilizado', utilizado_em: agora, utilizado_descricao: descricao, updated_at: agora })
        .eq('id', l.id).eq('status', 'liberado')
        .select('id')
        .maybeSingle()
      if (e) return failPublic(e, 'parceiro/desconto-usar-saldo', 'Não foi possível concluir a baixa.')
      if (!feita) continue // mudou de situação agora: não conta como usado
      consumidas.push({ id: l.id, valor: v, dividida: false })
      falta = centavos(falta - v)
      continue
    }

    // Usa só parte deste mês: divide em usada + resto (continua liberado).
    const usado = centavos(falta)
    const resto = centavos(v - usado)
    const { data: feita, error: e1 } = await supabase.from('indicacoes_comissoes')
      .update({ valor_credito: usado, status: 'utilizado', utilizado_em: agora, utilizado_descricao: descricao, updated_at: agora })
      .eq('id', l.id).eq('status', 'liberado')
      .select('id')
      .maybeSingle()
    if (e1) return failPublic(e1, 'parceiro/desconto-usar-saldo', 'Não foi possível concluir a baixa.')
    if (!feita) continue
    const { id: _id, created_at: _c, updated_at: _u, ...campos } = l
    const { error: e2 } = await supabase.from('indicacoes_comissoes').insert({
      ...campos,
      valor_credito: resto,
      status: 'liberado',
      idempotency_key: `${l.idempotency_key}:resto:${Date.now()}`,
      utilizado_em: null,
      utilizado_descricao: null,
    })
    if (e2) {
      // A parte usada já foi gravada: registra para a Agzap conseguir corrigir o resto.
      console.error(`[api:parceiro/desconto-usar-saldo] resto de R$ ${resto} da comissão ${l.id} não foi recriado`, e2)
      await registrarAuditoria(supabase, event, {
        parceiro_id: parceiro.id,
        empresa_id: empresaId,
        ator_user_id: userId,
        ator_papel: 'parceiro',
        acao: 'indicacao_desconto_usar_saldo_falha_resto',
        estado_anterior: { comissao_id: l.id, valor: v },
        estado_novo: { usado, resto_nao_recriado: resto },
        motivo: descricao,
        origem: 'painel_parceiro',
      })
      return failPublic(e2, 'parceiro/desconto-usar-saldo', 'A baixa ficou incompleta. Fale com a Agzap antes de tentar de novo.')
    }
    consumidas.push({ id: l.id, valor: usado, dividida: true })
    falta = 0
  }

  const usadoTotal = centavos(valor - falta)

  if (usadoTotal <= 0.001) {
    return { success: false as const, error: 'O saldo mudou agora há pouco. Recarregue e tente de novo.' }
  }

  await registrarAuditoria(supabase, event, {
    parceiro_id: parceiro.id,
    empresa_id: empresaId,
    ator_user_id: userId,
    ator_papel: 'parceiro',
    acao: 'indicacao_desconto_usar_saldo',
    estado_anterior: { disponivel },
    estado_novo: { usado: usadoTotal, restante: centavos(disponivel - usadoTotal), comissoes: consumidas },
    motivo: descricao,
    origem: 'painel_parceiro',
  })

  return {
    success: true as const,
    data: {
      usado: usadoTotal,
      restante: centavos(disponivel - usadoTotal),
      // Menor que o pedido só se algum mês mudou de situação durante a baixa.
      parcial: falta > 0.001,
    },
  }
})
