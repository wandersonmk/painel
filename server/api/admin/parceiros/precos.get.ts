import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { ACAO_PRECO_ALTERADO, TIPOS_CREDITO } from '~~/server/utils/parceiroLicencas'

interface Faixa {
  quantidade_min: number
  preco_unitario: number
}

interface EstadoPreco {
  tipo_credito?: string
  faixas?: Faixa[]
  revenda?: number | null
}

function rotuloFaixa(faixas: Faixa[], i: number) {
  if (faixas.length === 1) return 'Preço único'
  const proxima = faixas[i + 1]
  const inicio = faixas[i]!.quantidade_min
  return proxima ? `${inicio} a ${proxima.quantidade_min - 1} licenças` : `${inicio} ou mais`
}

/** Uma linha por valor que mudou: faixa a faixa e, por último, a revenda. */
function mudancas(antes: EstadoPreco, depois: EstadoPreco) {
  const faixasDepois = depois.faixas ?? []
  const lista = faixasDepois.flatMap((f, i) => {
    const anterior = (antes.faixas ?? []).find(a => a.quantidade_min === f.quantidade_min)
    if (!anterior || Number(anterior.preco_unitario) === Number(f.preco_unitario)) return []
    return [{ campo: rotuloFaixa(faixasDepois, i), de: Number(anterior.preco_unitario), para: Number(f.preco_unitario) }]
  })
  if (Number(antes.revenda) !== Number(depois.revenda)) {
    lista.push({ campo: 'Revenda sugerida', de: Number(antes.revenda), para: Number(depois.revenda) })
  }
  return lista
}

/**
 * Tabela de preços em vigor e histórico de quem mudou o quê. Só leitura.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const supabase = getServiceClient()

  const [precosRes, auditoriaRes] = await Promise.all([
    supabase.from('parceiro_precos_licenca')
      .select('tipo_credito, quantidade_min, preco_unitario, preco_sugerido_revenda, vigente_desde')
      .eq('ativo', true)
      .order('tipo_credito').order('quantidade_min'),
    supabase.from('parceiro_auditoria')
      .select('id, created_at, ator_user_id, estado_anterior, estado_novo')
      .eq('acao', ACAO_PRECO_ALTERADO)
      .order('created_at', { ascending: false })
      .limit(100),
  ])
  if (precosRes.error) return failPublic(precosRes.error, 'admin/parceiros/precos', 'Não foi possível carregar os preços.')
  if (auditoriaRes.error) return failPublic(auditoriaRes.error, 'admin/parceiros/precos', 'Não foi possível carregar os preços.')

  const precos = (precosRes.data ?? []) as any[]
  const creditos = TIPOS_CREDITO
    .map((tipo) => {
      const linhas = precos.filter(p => p.tipo_credito === tipo)
      return {
        tipo_credito: tipo,
        faixas: linhas.map(l => ({ quantidade_min: l.quantidade_min, preco_unitario: Number(l.preco_unitario) })),
        revenda: Number(linhas[0]?.preco_sugerido_revenda ?? 0),
        // Trocar uma faixa só renova aquela linha: vale a mudança mais recente do crédito.
        vale_desde: linhas.map(l => l.vigente_desde as string).sort().at(-1) ?? null,
      }
    })
    .filter(c => c.faixas.length)

  const auditoria = (auditoriaRes.data ?? []) as any[]
  const autores = new Map<string, string>()
  const ids = [...new Set(auditoria.map(a => a.ator_user_id).filter(Boolean))]
  if (ids.length) {
    const { data, error } = await supabase.from('usuarios').select('auth_user_id, nome, email').in('auth_user_id', ids)
    // Sem o nome o histórico ainda serve: a coluna só cai no texto padrão.
    if (error) console.error('[api:admin/parceiros/precos] autores', error)
    for (const u of (data ?? []) as any[]) {
      if (!autores.has(u.auth_user_id)) autores.set(u.auth_user_id, u.nome || u.email)
    }
  }

  const alteracoes = auditoria.flatMap(a => mudancas(a.estado_anterior ?? {}, a.estado_novo ?? {}).map((m, i) => ({
    id: `${a.id}:${i}`,
    data: a.created_at as string,
    tipo_credito: a.estado_novo?.tipo_credito as string,
    ...m,
    autor: autores.get(a.ator_user_id) ?? 'Equipe Agzap',
  })))

  return { success: true, data: { creditos, alteracoes } }
})
