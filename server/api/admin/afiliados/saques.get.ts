import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { buscarEmLotes } from '~~/server/utils/parceiroLicencas'

/**
 * Saques de afiliados para o superAdmin pagar (PIX) ou recusar.
 *
 * ?status=abertos (padrão) | pagos | recusados | todos
 * ?resumo=1 → só { abertos } (contagem leve para o número no menu lateral).
 *
 * Abertos vêm do mais antigo para o mais novo (o prazo que vence primeiro fica
 * em cima); os demais, do mais recente para o mais antigo. Junto vai a contagem
 * por situação (para as fichas do filtro) e o prazo configurado do PIX.
 */
const FILTROS: Record<string, string[] | null> = {
  abertos: ['solicitado'],
  pagos: ['pago'],
  recusados: ['recusado'],
  todos: null,
}

const LIMITE = 500

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  // Número do menu lateral: um count no índice (status, solicitado_em), nada mais.
  if (String(getQuery(event).resumo ?? '') === '1') {
    const { count, error } = await supabase
      .from('afiliado_saques')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'solicitado')
    if (error) return failPublic(error, 'admin/afiliados/saques:resumo', 'Não foi possível contar os saques abertos.')
    return { success: true, data: { abertos: count ?? 0 } }
  }

  const filtroBruto = String(getQuery(event).status ?? 'abertos')
  const filtro = filtroBruto in FILTROS ? filtroBruto : 'abertos'
  const status = FILTROS[filtro]

  const COLUNAS = 'id, afiliado_id, valor, chave_pix, chave_pix_tipo, titular_nome, titular_documento, status, solicitado_em, prazo_em, pago_em, comprovante, recusa_motivo'
  const consultar = (colunas: string) => {
    let consulta = supabase
      .from('afiliado_saques')
      .select(colunas)
    if (status) consulta = consulta.in('status', status)
    return consulta
      .order('solicitado_em', { ascending: filtro === 'abertos' })
      .order('id')
      .limit(LIMITE)
  }

  const contar = (s: string) => supabase
    .from('afiliado_saques')
    .select('id', { count: 'exact', head: true })
    .eq('status', s)

  let [saquesRes, abertosRes, pagosRes, recusadosRes, configRes] = await Promise.all([
    consultar(`${COLUNAS}, comprovante_url`),
    contar('solicitado'),
    contar('pago'),
    contar('recusado'),
    supabase.from('afiliado_config').select('prazo_saque_horas').eq('id', true).maybeSingle(),
  ])
  // Coluna comprovante_url ainda não existe no banco: lista sem ela.
  if (saquesRes.error?.code === '42703') saquesRes = await consultar(COLUNAS)
  if (saquesRes.error) return failPublic(saquesRes.error, 'admin/afiliados/saques', 'Não foi possível carregar os saques.')

  const linhas = (saquesRes.data ?? []) as any[]
  const afiliadosRes = await buscarEmLotes<{ id: string; nome: string; email: string; ativo: boolean; telefone: string | null; codigo_indicacao: string | null }>(
    linhas.map(s => s.afiliado_id),
    (lote, de, ate) => supabase.from('afiliados')
      .select('id, nome, email, ativo, telefone, codigo_indicacao')
      .in('id', lote)
      .order('id')
      .range(de, ate),
  )
  if (afiliadosRes.error) console.error('[api:admin/afiliados/saques] nomes dos afiliados', afiliadosRes.error)
  const afiliadoPorId = new Map(afiliadosRes.data.map(a => [a.id, a]))

  const saques = linhas.map(s => {
    const a = afiliadoPorId.get(s.afiliado_id)
    return {
      id: s.id,
      afiliado_id: s.afiliado_id,
      afiliado_nome: a?.nome ?? null,
      afiliado_email: a?.email ?? null,
      afiliado_ativo: a?.ativo ?? null,
      afiliado_telefone: a?.telefone ?? null,
      afiliado_codigo: a?.codigo_indicacao ?? null,
      valor: Number(s.valor) || 0,
      chave_pix: s.chave_pix,
      chave_pix_tipo: s.chave_pix_tipo,
      titular_nome: s.titular_nome,
      titular_documento: s.titular_documento,
      status: s.status,
      solicitado_em: s.solicitado_em,
      prazo_em: s.prazo_em,
      pago_em: s.pago_em,
      comprovante: s.comprovante,
      comprovante_url: s.comprovante_url ?? null,
      recusa_motivo: s.recusa_motivo,
    }
  })

  const abertos = abertosRes.count ?? 0
  const pagos = pagosRes.count ?? 0
  const recusados = recusadosRes.count ?? 0

  return {
    success: true,
    data: {
      filtro,
      saques,
      truncado: linhas.length >= LIMITE,
      contagem: { abertos, pagos, recusados, todos: abertos + pagos + recusados },
      prazo_saque_horas: Number((configRes.data as any)?.prazo_saque_horas) || 48,
    },
  }
})
