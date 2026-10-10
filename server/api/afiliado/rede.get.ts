import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { janelaDoMes } from '~~/server/utils/janelaMes'
import {
  carregarRegras,
  conexoesLiberadas,
  consultarEmLotes,
  consultarPaginado,
  primeiroNome,
  requireAfiliado,
  situacaoEmpresa,
  somarValores,
} from '~~/server/utils/requireAfiliado'
import type { SituacaoRede } from '~~/server/utils/requireAfiliado'

/**
 * GET /api/afiliado/rede — a rede do afiliado logado, da 1ª à 5ª conexão.
 *
 * - 1ª conexão = afiliado_empresas deste afiliado (quem entrou pelo link dele);
 * - conexão k+1 = empresas com indicado_por_empresa_id em algum id da conexão k;
 * - cliente direto de OUTRO afiliado sai da rede junto com quem estiver abaixo
 *   dele: a comissão sobe a linha só até o primeiro dono (mesma regra da
 *   afiliado_registrar_comissao), então aquele ramo não é deste afiliado;
 * - para na 5ª; ciclos e repetidos são ignorados.
 *
 * Privacidade: só nome da empresa, primeiro nome do responsável, plano e
 * situação. Nunca e-mail, telefone ou documento de ninguém da rede.
 */
const COLUNAS_EMPRESA
  = 'id, nome, nome_cliente, subscription_status, subscription_period, subscription_renews_at, trial_ends_at, subscription_price, ativo, indicado_por_empresa_id, created_at'

interface EmpresaRede {
  id: string
  nome: string | null
  nome_cliente: string | null
  subscription_status: string | null
  subscription_period: string | null
  subscription_renews_at: string | null
  trial_ends_at: string | null
  subscription_price: number | string | null
  ativo: boolean | null
  indicado_por_empresa_id: string | null
  created_at: string
}

type Plano = 'mensal' | 'semestral' | 'anual' | null

function planoDe(periodo: string | null): Plano {
  if (periodo === '1month') return 'mensal'
  if (periodo === '6months') return 'semestral'
  if (periodo === '12months') return 'anual'
  return null
}

const MAX_CONEXAO = 5

export default defineEventHandler(async (event) => {
  const { afiliado } = await requireAfiliado(event)
  const supabase = getServiceClient()

  try {
    const regras = await carregarRegras(supabase)

    const vinculos = await consultarPaginado<{ empresa_id: string }>((de, ate) =>
      supabase
        .from('afiliado_empresas')
        .select('empresa_id')
        .eq('afiliado_id', afiliado.id)
        .order('empresa_id')
        .range(de, ate),
    )

    const visitados = new Set<string>()
    const nos: Array<{ e: EmpresaRede; nivel: number; pai_id: string | null }> = []

    let camada = await consultarEmLotes<EmpresaRede>(
      vinculos.map(v => v.empresa_id),
      (lote, de, ate) => supabase.from('empresas').select(COLUNAS_EMPRESA).in('id', lote).order('id').range(de, ate),
    )

    for (let nivel = 1; nivel <= MAX_CONEXAO && camada.length; nivel++) {
      const daVez: EmpresaRede[] = []
      for (const e of camada) {
        if (visitados.has(e.id)) continue
        visitados.add(e.id)
        daVez.push(e)
        nos.push({ e, nivel, pai_id: nivel === 1 ? null : (e.indicado_por_empresa_id ?? null) })
      }
      if (nivel === MAX_CONEXAO || !daVez.length) break

      const filhos = await consultarEmLotes<EmpresaRede>(
        daVez.map(e => e.id),
        (lote, de, ate) => supabase.from('empresas').select(COLUNAS_EMPRESA).in('indicado_por_empresa_id', lote).order('id').range(de, ate),
      )
      let candidatos = filhos.filter(f => !visitados.has(f.id))

      if (candidatos.length) {
        const donos = await consultarEmLotes<{ empresa_id: string; afiliado_id: string }>(
          candidatos.map(c => c.id),
          (lote, de, ate) => supabase.from('afiliado_empresas').select('empresa_id, afiliado_id').in('empresa_id', lote).order('empresa_id').range(de, ate),
        )
        const deOutroAfiliado = new Set(donos.filter(d => d.afiliado_id !== afiliado.id).map(d => d.empresa_id))
        candidatos = candidatos.filter(c => !deOutroAfiliado.has(c.id))
      }
      camada = candidatos
    }

    // Comissões deste afiliado criadas no mês corrente (fuso de São Paulo).
    const { de: inicioMes, ate: fimMes } = janelaDoMes('America/Sao_Paulo')
    const doMes = await consultarPaginado<{ id: string; empresa_pagante_id: string; valor: number | string }>((de, ate) =>
      supabase
        .from('afiliado_comissoes')
        .select('id, empresa_pagante_id, valor')
        .eq('afiliado_id', afiliado.id)
        .gte('created_at', inicioMes)
        .lt('created_at', fimMes)
        .not('status', 'in', '(cancelado,estornado)')
        .order('id')
        .range(de, ate),
    )
    const valoresPorEmpresa = new Map<string, Array<number | string>>()
    for (const c of doMes) {
      valoresPorEmpresa.set(c.empresa_pagante_id, [...(valoresPorEmpresa.get(c.empresa_pagante_id) ?? []), c.valor])
    }
    const mesTotal = somarValores(doMes.map(c => c.valor))

    // Diretos (filhos dentro da rede) e "na rede" (todos abaixo, até a 5ª).
    const filhosDe = new Map<string, string[]>()
    for (const n of nos) {
      if (!n.pai_id) continue
      filhosDe.set(n.pai_id, [...(filhosDe.get(n.pai_id) ?? []), n.e.id])
    }
    const naRede = new Map<string, number>()
    for (const n of [...nos].sort((a, b) => b.nivel - a.nivel)) {
      const filhos = filhosDe.get(n.e.id) ?? []
      naRede.set(n.e.id, filhos.reduce((acc, f) => acc + 1 + (naRede.get(f) ?? 0), 0))
    }

    const agora = Date.now()
    const proprios = nos.filter(n => n.nivel === 1)
    const situacoes = new Map<string, SituacaoRede>(nos.map(n => [n.e.id, situacaoEmpresa(n.e, agora)]))
    const propriosAtivos = proprios.filter(n => situacoes.get(n.e.id) === 'pagando').length
    const liberadas = conexoesLiberadas(propriosAtivos, regras)
    const regraDe = new Map(regras.map(r => [r.conexao, r]))

    const saida = nos.map((n) => {
      const precoBruto = n.e.subscription_price
      const preco = precoBruto === null || precoBruto === undefined || precoBruto === '' ? null : Number(precoBruto)
      const situacao = situacoes.get(n.e.id)!
      const regra = regraDe.get(n.nivel)
      // O que esta empresa geraria no mês se a conexão estivesse liberada:
      // mesmo arredondamento da função do banco (round(base × %) / 100).
      const liberaria = n.nivel > liberadas && situacao === 'pagando' && preco && preco > 0 && regra
        ? Math.round(preco * regra.percentual_recorrente) / 100
        : null
      return {
        empresa_id: n.e.id,
        nome: n.e.nome ?? 'Sem nome',
        responsavel: primeiroNome(n.e.nome_cliente),
        pai_id: n.pai_id,
        nivel: n.nivel,
        plano: planoDe(n.e.subscription_period),
        situacao,
        preco,
        mes_valor: somarValores(valoresPorEmpresa.get(n.e.id) ?? []),
        liberaria,
        diretos: (filhosDe.get(n.e.id) ?? []).length,
        na_rede: naRede.get(n.e.id) ?? 0,
      }
    })

    const bloqueadoEstimado = somarValores(saida.map(n => n.liberaria ?? 0))

    return {
      success: true as const,
      data: {
        nos: saida,
        regras,
        proprios_total: proprios.length,
        proprios_ativos: propriosAtivos,
        liberadas,
        mes_total: mesTotal,
        bloqueado_estimado: bloqueadoEstimado,
      },
    }
  }
  catch (erro) {
    return failPublic(erro, 'afiliado/rede', 'Não foi possível carregar sua rede.')
  }
})
