import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { CAMPOS_INDICACAO, vincularIndicacoesAEmpresas } from '~~/server/utils/parceiroIndicacoes'

/**
 * Cartela de indicações do parceiro logado. Só as dele: o filtro por
 * parceiro_id sai do token, nunca do que a tela mandou.
 *
 * "conta_agzap_desde" = data em que a conta com o mesmo CPF/CNPJ foi criada
 * na Agzap (null = nenhuma conta com esse documento até agora).
 */
export default defineEventHandler(async (event) => {
  const { parceiro } = await requireParceiro(event)
  const supabase = getServiceClient()

  // O PostgREST devolve no máximo 1000 linhas por consulta: pagina.
  const indicacoes: any[] = []
  for (let inicio = 0; inicio < 10_000; inicio += 1000) {
    const { data, error } = await supabase
      .from('parceiro_indicacoes')
      .select(CAMPOS_INDICACAO)
      .eq('parceiro_id', parceiro.id)
      .order('created_at', { ascending: false })
      .range(inicio, inicio + 999)
    if (error) return failPublic(error, 'parceiro/indicacoes', 'Não foi possível carregar suas indicações.')
    indicacoes.push(...(data ?? []))
    if ((data?.length ?? 0) < 1000) break
  }

  let novosVinculos = new Map<string, string>()
  try {
    novosVinculos = await vincularIndicacoesAEmpresas(supabase, indicacoes)
  }
  catch (erro) {
    console.error('[api:parceiro/indicacoes] vincular', erro)
  }

  const empresaIds = [...new Set(
    indicacoes.map(i => i.empresa_id ?? novosVinculos.get(i.id)).filter(Boolean) as string[],
  )]
  const criadaEm = new Map<string, string>()
  for (let i = 0; i < empresaIds.length; i += 200) {
    const { data } = await supabase
      .from('empresas')
      .select('id, created_at')
      .in('id', empresaIds.slice(i, i + 200))
    for (const e of data ?? []) criadaEm.set(e.id, e.created_at)
  }

  return {
    success: true as const,
    data: {
      indicacoes: indicacoes.map((i) => {
        const empresaId = i.empresa_id ?? novosVinculos.get(i.id) ?? null
        return {
          id: i.id,
          documento: i.documento,
          documento_tipo: i.documento_tipo,
          nome_cliente: i.nome_cliente,
          telefone: i.telefone,
          observacao: i.observacao,
          created_at: i.created_at,
          updated_at: i.updated_at,
          conta_agzap_desde: empresaId ? (criadaEm.get(empresaId) ?? null) : null,
          tem_conta_agzap: !!empresaId,
        }
      }),
    },
  }
})
