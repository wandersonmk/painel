import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import {
  carregarRegras,
  conexoesLiberadas,
  consultarEmLotes,
  consultarPaginado,
  situacaoEmpresa,
  situacaoRecebimento,
} from '~~/server/utils/requireAfiliado'
import type { SituacaoRede, TipoChavePix } from '~~/server/utils/requireAfiliado'

/**
 * GET /api/admin/afiliados/rede?afiliadoId=<uuid> — a rede de um afiliado
 * vista pelo superAdmin (linha expandida da tela /afiliados).
 *
 * Mesma montagem da rota do portal (server/api/afiliado/rede.get.ts):
 *   - 1ª conexão = afiliado_empresas deste afiliado (quem entrou pelo link dele);
 *   - conexão k+1 = empresas com indicado_por_empresa_id em algum id da conexão k;
 *   - cliente direto de OUTRO afiliado sai da rede junto com quem está abaixo
 *     dele (a comissão sobe a linha só até o primeiro dono);
 *   - para na 5ª; ciclos e repetidos são ignorados.
 *
 * Por conexão: % (1º pagamento / recorrente) e meta vindos de afiliado_regras,
 * se está liberada (modelo A: só os clientes ATIVOS que ele trouxe direto
 * contam), os clientes daquela conexão e as comissões (retido / disponível /
 * em saque / sacado / cancelado). Também os dados de PIX do afiliado.
 *
 * Só leitura. As consultas em `empresas` vão sempre por id (.in em lotes).
 */
const COLUNAS_EMPRESA
  = 'id, nome, nome_cliente, subscription_status, subscription_period, subscription_renews_at, trial_ends_at, subscription_price, ativo, indicado_por_empresa_id, created_at'

const COLUNAS_AFILIADO
  = 'id, nome, email, telefone, documento, chave_pix, chave_pix_tipo, pix_declarado_titular, codigo_indicacao, ativo, bloqueado_motivo, created_at'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_CONEXAO = 5

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

interface AfiliadoLinha {
  id: string
  nome: string
  email: string
  telefone: string | null
  documento: string | null
  chave_pix: string | null
  chave_pix_tipo: TipoChavePix | null
  pix_declarado_titular: boolean
  codigo_indicacao: string
  ativo: boolean
  bloqueado_motivo: string | null
  created_at: string
}

interface ComissaoLinha {
  empresa_pagante_id: string
  conexao: number
  valor: number | string
  status: string
  liberar_em: string
  created_at: string
}

type Plano = 'mensal' | 'semestral' | 'anual' | null

function planoDe(periodo: string | null): Plano {
  if (periodo === '1month') return 'mensal'
  if (periodo === '6months') return 'semestral'
  if (periodo === '12months') return 'anual'
  return null
}

interface Saldos { retido: number; disponivel: number; em_saque: number; sacado: number; cancelado: number }
const saldosVazios = (): Saldos => ({ retido: 0, disponivel: 0, em_saque: 0, sacado: 0, cancelado: 0 })
const centavos = (v: unknown) => Math.round(Number(v || 0) * 100)
const emReais = (s: Saldos): Saldos => ({
  retido: s.retido / 100,
  disponivel: s.disponivel / 100,
  em_saque: s.em_saque / 100,
  sacado: s.sacado / 100,
  cancelado: s.cancelado / 100,
})

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const afiliadoId = String(getQuery(event).afiliadoId ?? '').trim()
  if (!UUID.test(afiliadoId)) {
    throw createError({ statusCode: 400, statusMessage: 'afiliadoId inválido' })
  }

  const supabase = getServiceClient()

  try {
    const { data: afiliadoData, error: afiliadoErr } = await supabase
      .from('afiliados')
      .select(COLUNAS_AFILIADO)
      .eq('id', afiliadoId)
      .maybeSingle()
    if (afiliadoErr) throw afiliadoErr
    const afiliado = afiliadoData as AfiliadoLinha | null
    if (!afiliado) return { success: false as const, error: 'Afiliado não encontrado. Atualize a lista.' }

    const regras = await carregarRegras(supabase)

    // ───────── Rede: 1ª a 5ª conexão ─────────
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

    // ───────── Comissões deste afiliado ─────────
    const comissoes = await consultarPaginado<ComissaoLinha>((de, ate) =>
      supabase
        .from('afiliado_comissoes')
        .select('empresa_pagante_id, conexao, valor, status, liberar_em, created_at')
        .eq('afiliado_id', afiliado.id)
        .order('id')
        .range(de, ate),
    )

    // Mesma leitura da lista: 'retido' com liberar_em vencido aparece como
    // disponível só na tela (o banco muda quando o fluxo de saque passa).
    const agora = Date.now()
    const porConexao = new Map<number, Saldos>()
    const porEmpresa = new Map<string, { gerado: number; ultima: string | null }>()
    const total = saldosVazios()
    for (const c of comissoes) {
      const nivel = Number(c.conexao)
      const s = porConexao.get(nivel) ?? saldosVazios()
      const valor = centavos(c.valor)
      let chave: keyof Saldos
      if (c.status === 'em_saque') chave = 'em_saque'
      else if (c.status === 'sacado') chave = 'sacado'
      else if (c.status === 'cancelado' || c.status === 'estornado') chave = 'cancelado'
      else if (c.status === 'disponivel') chave = 'disponivel'
      else chave = new Date(c.liberar_em).getTime() <= agora ? 'disponivel' : 'retido'
      s[chave] += valor
      total[chave] += valor
      porConexao.set(nivel, s)

      if (chave !== 'cancelado') {
        const atual = porEmpresa.get(c.empresa_pagante_id) ?? { gerado: 0, ultima: null }
        atual.gerado += valor
        if (!atual.ultima || c.created_at > atual.ultima) atual.ultima = c.created_at
        porEmpresa.set(c.empresa_pagante_id, atual)
      }
    }

    // ───────── Montagem ─────────
    const situacoes = new Map<string, SituacaoRede>(nos.map(n => [n.e.id, situacaoEmpresa(n.e, agora)]))
    const nomeDe = new Map(nos.map(n => [n.e.id, n.e.nome ?? 'Sem nome']))
    const diretosDe = new Map<string, number>()
    for (const n of nos) {
      if (n.pai_id) diretosDe.set(n.pai_id, (diretosDe.get(n.pai_id) ?? 0) + 1)
    }

    const proprios = nos.filter(n => n.nivel === 1)
    const propriosAtivos = proprios.filter(n => situacoes.get(n.e.id) === 'pagando').length
    const liberadas = conexoesLiberadas(propriosAtivos, regras)

    const clientes = nos.map((n) => {
      const precoBruto = n.e.subscription_price
      const preco = precoBruto === null || precoBruto === undefined || precoBruto === '' ? null : Number(precoBruto)
      const gerado = porEmpresa.get(n.e.id)
      return {
        empresa_id: n.e.id,
        nome: n.e.nome ?? 'Sem nome',
        responsavel: (n.e.nome_cliente ?? '').trim() || null,
        nivel: n.nivel,
        indicado_por_id: n.pai_id,
        indicado_por_nome: n.pai_id ? (nomeDe.get(n.pai_id) ?? null) : null,
        situacao: situacoes.get(n.e.id)!,
        plano: planoDe(n.e.subscription_period),
        preco: Number.isFinite(preco) ? preco : null,
        diretos: diretosDe.get(n.e.id) ?? 0,
        comissao_gerada: (gerado?.gerado ?? 0) / 100,
        ultima_comissao_em: gerado?.ultima ?? null,
        cadastrado_em: n.e.created_at,
      }
    })

    const regraDe = new Map(regras.map(r => [r.conexao, r]))
    const niveis = Array.from({ length: MAX_CONEXAO }, (_, i) => i + 1).map((conexao) => {
      const regra = regraDe.get(conexao)
      const meta = conexao === 1 ? 0 : (regra?.meta_clientes ?? 0)
      const doNivel = clientes.filter(c => c.nivel === conexao)
      return {
        conexao,
        percentual_primeira: regra?.percentual_primeira ?? 0,
        percentual_recorrente: regra?.percentual_recorrente ?? 0,
        meta_clientes: meta,
        liberada: conexao <= liberadas,
        faltam: conexao <= liberadas ? 0 : Math.max(0, meta - propriosAtivos),
        clientes_total: doNivel.length,
        clientes_ativos: doNivel.filter(c => c.situacao === 'pagando').length,
        comissoes: emReais(porConexao.get(conexao) ?? saldosVazios()),
      }
    })

    return {
      success: true as const,
      data: {
        afiliado: {
          id: afiliado.id,
          nome: afiliado.nome,
          email: afiliado.email,
          telefone: afiliado.telefone,
          documento: afiliado.documento,
          chave_pix: afiliado.chave_pix,
          chave_pix_tipo: afiliado.chave_pix_tipo,
          pix_declarado_titular: afiliado.pix_declarado_titular === true,
          codigo_indicacao: afiliado.codigo_indicacao,
          ativo: afiliado.ativo,
          bloqueado_motivo: afiliado.bloqueado_motivo,
          created_at: afiliado.created_at,
        },
        recebimento: situacaoRecebimento(afiliado),
        regras,
        proprios_total: proprios.length,
        proprios_ativos: propriosAtivos,
        liberadas,
        niveis,
        clientes,
        totais: emReais(total),
      },
    }
  }
  catch (erro) {
    return failPublic(erro, 'admin/afiliados/rede', 'Não foi possível carregar a rede deste afiliado.')
  }
})
