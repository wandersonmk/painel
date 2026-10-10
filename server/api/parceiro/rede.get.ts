import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import {
  aguardandoAtivacao, buscarEmLotes, situacaoDoCliente, vinculosDoParceiro,
} from '~~/server/utils/parceiroLicencas'

/**
 * GET /api/parceiro/rede — a rede inteira do parceiro: todos os clientes
 * vinculados a ele e quem indicou quem (empresas.indicado_por_empresa_id).
 *
 * O "indicado por" só aponta para dentro da rede. Quem foi indicado por
 * alguém de fora vira topo da árvore; o nome de quem indicou ainda aparece,
 * só como informação. A árvore em si é montada na tela.
 */
export default defineEventHandler(async (event) => {
  const { parceiro } = await requireParceiro(event)
  const supabase = getServiceClient()

  const { data: vinculos, error } = await vinculosDoParceiro(
    supabase,
    parceiro.id,
    'id, nome, nome_cliente, ativo, created_at, subscription_status, subscription_plan, subscription_period, subscription_price, subscription_renews_at, trial_ends_at, indicado_por_empresa_id',
  )
  if (error) return failPublic(error, 'parceiro/rede', 'Não foi possível carregar sua rede.')

  const porId = new Map<string, any>()
  for (const v of vinculos) porId.set(v.empresa_id, v)

  const indicadoraDe = (v: any): string | null => {
    const ref = v.empresas.indicado_por_empresa_id ?? null
    return ref && ref !== v.empresa_id ? ref : null
  }

  // Nome de quem indicou mas não é cliente deste parceiro: uma consulta só.
  const forasDaRede = [...new Set(
    [...porId.values()].map(indicadoraDe).filter((id): id is string => !!id && !porId.has(id)),
  )]
  const nomesFora = new Map<string, string>()
  if (forasDaRede.length) {
    const { data, error: errNomes } = await buscarEmLotes<{ id: string; nome: string }>(
      forasDaRede,
      (lote, de, ate) => supabase.from('empresas').select('id, nome').in('id', lote).order('id').range(de, ate),
    )
    // Só o nome fica faltando: não derruba a rede.
    if (errNomes) console.error('[api:parceiro/rede] nomes de fora da rede', errNomes)
    for (const e of data) nomesFora.set(e.id, e.nome)
  }

  const diretos = new Map<string, number>()
  for (const v of porId.values()) {
    const ref = indicadoraDe(v)
    if (ref && porId.has(ref)) diretos.set(ref, (diretos.get(ref) ?? 0) + 1)
  }

  const agora = Date.now()
  const clientes = [...porId.values()].map((v) => {
    const e = v.empresas
    const { situacao, vencimento } = situacaoDoCliente(v.bloqueio_origem, e, agora)
    const ref = indicadoraDe(v)
    return {
      empresa_id: v.empresa_id as string,
      nome: e.nome as string,
      responsavel: e.nome_cliente?.trim() || null,
      indicado_por_empresa_id: ref && porId.has(ref) ? ref : null,
      indicado_por_nome: ref ? (porId.get(ref)?.empresas.nome ?? nomesFora.get(ref) ?? null) : null,
      situacao,
      plano: e.subscription_plan ?? null,
      periodo: e.subscription_period ?? null,
      status_assinatura: e.subscription_status ?? null,
      vencimento,
      aguardando_ativacao: aguardandoAtivacao(e),
      created_at: e.created_at as string,
      vinculado_em: v.created_at as string,
      preco: e.subscription_price === null || e.subscription_price === undefined ? null : Number(e.subscription_price),
      diretos: diretos.get(v.empresa_id) ?? 0,
    }
  })

  return {
    success: true as const,
    data: {
      parceiro: { nome: parceiro.nome, telefone: parceiro.telefone },
      clientes,
    },
  }
})
