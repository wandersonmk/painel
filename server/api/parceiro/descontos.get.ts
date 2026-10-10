import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import {
  COLUNAS_COMISSAO_PARCEIRO, buscarEmLotes, centavos, efeitoProximaCobranca,
  mapearComissao, situacaoDoCliente, somarComissoes, vinculosDoParceiro,
  type ComissaoParceiro, type SituacaoCliente,
} from '~~/server/utils/parceiroLicencas'

/**
 * GET /api/parceiro/descontos — descontos de indicação que o parceiro paga.
 *
 * Quando quem indicou é cliente do parceiro, o desconto sai da cobrança do
 * parceiro. Aqui vêm todas as comissões em que a INDICADORA é cliente dele,
 * um resumo por indicadora (retido, programado, liberado, usado e o efeito na
 * próxima mensalidade) e o WhatsApp do parceiro, que recebe os pedidos.
 */
export default defineEventHandler(async (event) => {
  const { parceiro } = await requireParceiro(event)
  const supabase = getServiceClient()

  const { data: vinculos, error } = await vinculosDoParceiro(
    supabase,
    parceiro.id,
    'id, nome, nome_cliente, ativo, subscription_price, subscription_renews_at, trial_ends_at, indicado_por_empresa_id',
  )
  if (error) return failPublic(error, 'parceiro/descontos', 'Não foi possível carregar os descontos.')

  const porId = new Map<string, any>()
  for (const v of vinculos) porId.set(v.empresa_id, v)
  const empresaIds = [...porId.keys()]

  const { data: brutas, error: errComissoes } = await buscarEmLotes<any>(
    empresaIds,
    (lote, de, ate) => supabase
      .from('indicacoes_comissoes')
      .select(COLUNAS_COMISSAO_PARCEIRO)
      .in('empresa_indicadora_id', lote)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(de, ate),
  )
  if (errComissoes) return failPublic(errComissoes, 'parceiro/descontos', 'Não foi possível carregar os descontos.')

  const comissoes = brutas.map(mapearComissao)
  const comissoesPor = new Map<string, ComissaoParceiro[]>()
  for (const c of comissoes) {
    const lista = comissoesPor.get(c.empresa_indicadora_id) ?? []
    lista.push(c)
    comissoesPor.set(c.empresa_indicadora_id, lista)
  }

  const agora = Date.now()
  type Indicado = { empresa_id: string; nome: string; responsavel: string | null; situacao: SituacaoCliente | null }
  const indicadosPor = new Map<string, Indicado[]>()
  const adicionarIndicado = (indicadoraId: string, item: Indicado) => {
    const lista = indicadosPor.get(indicadoraId) ?? []
    if (!lista.some(i => i.empresa_id === item.empresa_id)) lista.push(item)
    indicadosPor.set(indicadoraId, lista)
  }

  // Quem cada cliente indicou dentro da rede (com a situação de cada um).
  for (const v of porId.values()) {
    const ref = v.empresas.indicado_por_empresa_id
    if (!ref || ref === v.empresa_id || !porId.has(ref)) continue
    adicionarIndicado(ref, {
      empresa_id: v.empresa_id,
      nome: v.empresas.nome,
      responsavel: v.empresas.nome_cliente?.trim() || null,
      situacao: situacaoDoCliente(v.bloqueio_origem, v.empresas, agora).situacao,
    })
  }
  // Indicada que gerou ganho mas não é cliente deste parceiro: só o nome.
  for (const c of comissoes) {
    if (porId.has(c.empresa_indicada_id)) continue
    adicionarIndicado(c.empresa_indicadora_id, {
      empresa_id: c.empresa_indicada_id,
      nome: c.indicada_nome ?? 'Cliente',
      responsavel: null,
      situacao: null,
    })
  }

  const indicadoraIds = new Set<string>([...comissoesPor.keys(), ...indicadosPor.keys()])
  const indicadoras = [...indicadoraIds]
    .filter(id => porId.has(id))
    .map((id) => {
      const e = porId.get(id).empresas
      const mensalidade = e.subscription_price === null || e.subscription_price === undefined
        ? null
        : Number(e.subscription_price)
      const somas = somarComissoes(comissoesPor.get(id) ?? [])
      return {
        empresa_id: id,
        nome: e.nome as string,
        responsavel: e.nome_cliente?.trim() || null,
        mensalidade,
        indicados: (indicadosPor.get(id) ?? []).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')),
        ...somas,
        efeito_proxima_cobranca: efeitoProximaCobranca(somas.liberado, mensalidade),
      }
    })
    .sort((a, b) => b.liberado - a.liberado || b.retido - a.retido || a.nome.localeCompare(b.nome, 'pt-BR'))

  const total = somarComissoes(comissoes)

  return {
    success: true as const,
    data: {
      parceiro: { nome: parceiro.nome, telefone: parceiro.telefone },
      totais: {
        indicadoras: indicadoras.filter(i => i.indicados.length > 0).length,
        retido: total.retido,
        programado: total.programado,
        liberado: total.liberado,
        utilizado: total.utilizado,
        gratis_proxima: indicadoras.filter(i => i.efeito_proxima_cobranca.tipo === 'gratis').length,
        desconto_proxima: centavos(indicadoras.reduce((a, i) => a + i.efeito_proxima_cobranca.valor, 0)),
      },
      indicadoras,
      comissoes,
    },
  }
})
