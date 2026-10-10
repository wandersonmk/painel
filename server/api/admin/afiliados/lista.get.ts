import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { buscarEmLotes } from '~~/server/utils/parceiroLicencas'

/**
 * Programa de afiliados: lista para o superAdmin com os números de cada um.
 *
 * Tudo sai de poucas consultas em lote (nada de uma consulta por afiliado):
 *   - afiliado_empresas + empresas → clientes que ele trouxe (total / ativos);
 *   - afiliado_regras → conexões liberadas pelo modelo A;
 *   - afiliado_comissoes (retido / disponível / em saque) → saldos;
 *   - afiliado_saques (solicitado / pago) → saques abertos e total sacado.
 *
 * Comissão 'retido' cujo liberar_em já passou aparece como disponível só na
 * tela: o banco continua 'retido' até o fluxo de saque mexer nela.
 */

type Resposta<T> = PromiseLike<{ data: T[] | null; error: unknown }>

/** Lê a tabela inteira em páginas de 1000 (o PostgREST corta em 1000 linhas). */
async function todasAsLinhas<T>(pagina: (de: number, ate: number) => Resposta<T>) {
  const TAMANHO = 1000
  const saida: T[] = []
  for (let de = 0; ; de += TAMANHO) {
    const { data, error } = await pagina(de, de + TAMANHO - 1)
    if (error) return { data: saida, error }
    const linhas = data ?? []
    saida.push(...linhas)
    if (linhas.length < TAMANHO) break
  }
  return { data: saida, error: null as unknown }
}

interface AfiliadoLinha {
  id: string
  nome: string
  email: string
  telefone: string | null
  documento: string | null
  codigo_indicacao: string
  ativo: boolean
  bloqueado_motivo: string | null
  removido_em: string | null
  created_at: string
}

interface Regra { conexao: number; meta_clientes: number }

/** Mesmo laço da função afiliado_registrar_comissao (modelo A). */
function conexoesLiberadas(ativos: number, regras: Regra[]) {
  let liberadas = 1
  let proxima: { conexao: number; meta: number } | null = null
  for (const r of regras) {
    if (r.conexao < 2) continue
    if (ativos < r.meta_clientes) {
      proxima = { conexao: r.conexao, meta: r.meta_clientes }
      break
    }
    liberadas = r.conexao
  }
  return { liberadas, proxima }
}

const centavos = (v: unknown) => Math.round(Number(v || 0) * 100)
const reais = (c: number) => c / 100

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  const [afiliadosRes, vinculosRes, comissoesRes, saquesRes, regrasRes] = await Promise.all([
    todasAsLinhas<AfiliadoLinha>((de, ate) => supabase.from('afiliados')
      .select('id, nome, email, telefone, documento, codigo_indicacao, ativo, bloqueado_motivo, removido_em, created_at')
      .order('created_at', { ascending: false })
      .order('id')
      .range(de, ate)),
    todasAsLinhas<{ afiliado_id: string; empresa_id: string }>((de, ate) => supabase.from('afiliado_empresas')
      .select('afiliado_id, empresa_id')
      .order('id')
      .range(de, ate)),
    todasAsLinhas<{ afiliado_id: string; valor: number; status: string; liberar_em: string }>((de, ate) => supabase.from('afiliado_comissoes')
      .select('afiliado_id, valor, status, liberar_em')
      .in('status', ['retido', 'disponivel', 'em_saque'])
      .order('id')
      .range(de, ate)),
    todasAsLinhas<{ afiliado_id: string; valor: number; status: string }>((de, ate) => supabase.from('afiliado_saques')
      .select('afiliado_id, valor, status')
      .in('status', ['solicitado', 'pago'])
      .order('id')
      .range(de, ate)),
    supabase.from('afiliado_regras').select('conexao, meta_clientes').order('conexao'),
  ])

  const contexto = 'admin/afiliados/lista'
  const mensagem = 'Não foi possível carregar os afiliados.'
  if (afiliadosRes.error) return failPublic(afiliadosRes.error, contexto, mensagem)
  if (vinculosRes.error) return failPublic(vinculosRes.error, contexto, mensagem)
  if (comissoesRes.error) return failPublic(comissoesRes.error, contexto, mensagem)
  if (saquesRes.error) return failPublic(saquesRes.error, contexto, mensagem)
  if (regrasRes.error) return failPublic(regrasRes.error, contexto, mensagem)

  const empresasRes = await buscarEmLotes<{ id: string; subscription_status: string | null; subscription_renews_at: string | null }>(
    vinculosRes.data.map(v => v.empresa_id),
    (lote, de, ate) => supabase.from('empresas')
      .select('id, subscription_status, subscription_renews_at')
      .in('id', lote)
      .order('id')
      .range(de, ate),
  )
  if (empresasRes.error) return failPublic(empresasRes.error, contexto, mensagem)

  const agora = Date.now()
  const regras: Regra[] = ((regrasRes.data ?? []) as any[])
    .map(r => ({ conexao: Number(r.conexao), meta_clientes: Number(r.meta_clientes) || 0 }))
    .sort((a, b) => a.conexao - b.conexao)

  // Cliente ativo = assinatura 'active' e renovação nula ou no futuro (igual à função do banco).
  const empresaAtiva = new Map<string, boolean>()
  for (const e of empresasRes.data) {
    const renova = e.subscription_renews_at ? new Date(e.subscription_renews_at).getTime() : null
    empresaAtiva.set(e.id, e.subscription_status === 'active' && (renova === null || renova > agora))
  }

  const clientes = new Map<string, { total: number; ativos: number }>()
  for (const v of vinculosRes.data) {
    const atual = clientes.get(v.afiliado_id) ?? { total: 0, ativos: 0 }
    atual.total += 1
    if (empresaAtiva.get(v.empresa_id)) atual.ativos += 1
    clientes.set(v.afiliado_id, atual)
  }

  const saldos = new Map<string, { retido: number; disponivel: number; em_saque: number }>()
  for (const c of comissoesRes.data) {
    const atual = saldos.get(c.afiliado_id) ?? { retido: 0, disponivel: 0, em_saque: 0 }
    const valor = centavos(c.valor)
    if (c.status === 'em_saque') atual.em_saque += valor
    else if (c.status === 'disponivel') atual.disponivel += valor
    else if (new Date(c.liberar_em).getTime() <= agora) atual.disponivel += valor
    else atual.retido += valor
    saldos.set(c.afiliado_id, atual)
  }

  const saques = new Map<string, { sacado: number; abertos: number; abertos_valor: number }>()
  for (const s of saquesRes.data) {
    const atual = saques.get(s.afiliado_id) ?? { sacado: 0, abertos: 0, abertos_valor: 0 }
    if (s.status === 'pago') atual.sacado += centavos(s.valor)
    else {
      atual.abertos += 1
      atual.abertos_valor += centavos(s.valor)
    }
    saques.set(s.afiliado_id, atual)
  }

  const totais = {
    afiliados_total: 0,
    afiliados_ativos: 0,
    clientes_total: 0,
    clientes_ativos: 0,
    retido: 0,
    disponivel: 0,
    em_saque: 0,
    saques_abertos: 0,
    saques_abertos_valor: 0,
  }

  const afiliados = afiliadosRes.data.map((a) => {
    const cli = clientes.get(a.id) ?? { total: 0, ativos: 0 }
    const sal = saldos.get(a.id) ?? { retido: 0, disponivel: 0, em_saque: 0 }
    const saq = saques.get(a.id) ?? { sacado: 0, abertos: 0, abertos_valor: 0 }
    const { liberadas, proxima } = conexoesLiberadas(cli.ativos, regras)

    // Afiliação REMOVIDA (09/10/2026) não é afiliado: fica fora dos totais (a
    // tela também esconde a linha, a não ser que peça para ver os removidos).
    if (!a.removido_em) {
      totais.afiliados_total += 1
      if (a.ativo) totais.afiliados_ativos += 1
      totais.clientes_total += cli.total
      totais.clientes_ativos += cli.ativos
      totais.retido += sal.retido
      totais.disponivel += sal.disponivel
      totais.em_saque += sal.em_saque
      totais.saques_abertos += saq.abertos
      totais.saques_abertos_valor += saq.abertos_valor
    }

    return {
      id: a.id,
      nome: a.nome,
      email: a.email,
      telefone: a.telefone,
      documento: a.documento,
      codigo_indicacao: a.codigo_indicacao,
      ativo: a.ativo,
      bloqueado_motivo: a.bloqueado_motivo,
      removido_em: a.removido_em ?? null,
      created_at: a.created_at,
      clientes_total: cli.total,
      clientes_ativos: cli.ativos,
      conexoes_liberadas: liberadas,
      proxima_conexao: proxima,
      retido: reais(sal.retido),
      disponivel: reais(sal.disponivel),
      em_saque: reais(sal.em_saque),
      sacado: reais(saq.sacado),
      saques_abertos: saq.abertos,
    }
  })

  return {
    success: true,
    data: {
      afiliados,
      regras,
      totais: {
        ...totais,
        retido: reais(totais.retido),
        disponivel: reais(totais.disponivel),
        em_saque: reais(totais.em_saque),
        saques_abertos_valor: reais(totais.saques_abertos_valor),
      },
    },
  }
})
