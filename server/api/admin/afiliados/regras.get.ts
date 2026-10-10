import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/**
 * Regras do programa de afiliados: percentuais e metas por conexão
 * (afiliado_regras) e a configuração geral (afiliado_config).
 * Conexão que faltar no banco volta com o padrão da migration.
 */
const PADRAO_REGRAS = [
  { conexao: 1, percentual_primeira: 30, percentual_recorrente: 15, meta_clientes: 0 },
  { conexao: 2, percentual_primeira: 5, percentual_recorrente: 5, meta_clientes: 10 },
  { conexao: 3, percentual_primeira: 3, percentual_recorrente: 3, meta_clientes: 15 },
  { conexao: 4, percentual_primeira: 2, percentual_recorrente: 2, meta_clientes: 20 },
  { conexao: 5, percentual_primeira: 2, percentual_recorrente: 2, meta_clientes: 50 },
]

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  const [regrasRes, configRes] = await Promise.all([
    supabase.from('afiliado_regras')
      .select('conexao, percentual_primeira, percentual_recorrente, meta_clientes, updated_at')
      .order('conexao'),
    supabase.from('afiliado_config')
      .select('ativo, saque_minimo, prazo_saque_horas, updated_at')
      .eq('id', true)
      .maybeSingle(),
  ])
  if (regrasRes.error) return failPublic(regrasRes.error, 'admin/afiliados/regras', 'Não foi possível carregar as regras.')
  if (configRes.error) return failPublic(configRes.error, 'admin/afiliados/regras', 'Não foi possível carregar as regras.')

  const doBanco = new Map(((regrasRes.data ?? []) as any[]).map(r => [Number(r.conexao), r]))
  const regras = PADRAO_REGRAS.map((padrao) => {
    const r = doBanco.get(padrao.conexao)
    return {
      conexao: padrao.conexao,
      percentual_primeira: r ? Number(r.percentual_primeira) : padrao.percentual_primeira,
      percentual_recorrente: r ? Number(r.percentual_recorrente) : padrao.percentual_recorrente,
      meta_clientes: padrao.conexao === 1 ? 0 : (r ? Number(r.meta_clientes) : padrao.meta_clientes),
      updated_at: r?.updated_at ?? null,
    }
  })

  const c = configRes.data as any
  const config = {
    ativo: c ? c.ativo !== false : true,
    saque_minimo: c ? Number(c.saque_minimo) || 0 : 0,
    prazo_saque_horas: c ? Number(c.prazo_saque_horas) || 48 : 48,
    updated_at: c?.updated_at ?? null,
  }

  return { success: true, data: { regras, config } }
})
