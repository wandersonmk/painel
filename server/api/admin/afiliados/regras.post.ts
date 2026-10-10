import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/**
 * Salva as regras do programa de afiliados.
 *
 * Body: {
 *   regras: [{ conexao 1..5, percentual_primeira, percentual_recorrente, meta_clientes }] (as 5),
 *   config: { ativo, saque_minimo, prazo_saque_horas }
 * }
 *
 * Validação: percentuais de 0 a 100; meta inteira ≥ 0, a 1ª conexão sempre 0
 * ("na entrada") e da 2ª à 5ª sem diminuir (o laço do modelo A para na
 * primeira meta não batida); saque mínimo ≥ 0; prazo do PIX > 0 hora.
 */
interface RegraEntrada {
  conexao?: unknown
  percentual_primeira?: unknown
  percentual_recorrente?: unknown
  meta_clientes?: unknown
}

const PRAZO_MAXIMO_HORAS = 720
const SAQUE_MINIMO_MAXIMO = 1_000_000
const META_MAXIMA = 100_000

const numero = (v: unknown) => (v === null || v === undefined || v === '' ? Number.NaN : Number(v))
const duasCasas = (v: number) => Math.round(v * 100) / 100

export default defineEventHandler(async (event) => {
  const adminId = await requireSuperAdmin(event)
  const body = await readBody<{ regras?: RegraEntrada[]; config?: { ativo?: unknown; saque_minimo?: unknown; prazo_saque_horas?: unknown } }>(event)

  const entrada = Array.isArray(body?.regras) ? body.regras : []
  const porConexao = new Map<number, RegraEntrada>()
  for (const r of entrada) {
    const c = Number(r?.conexao)
    if (Number.isInteger(c) && c >= 1 && c <= 5) porConexao.set(c, r)
  }
  if (porConexao.size !== 5) {
    return { success: false, error: 'Envie as regras das 5 conexões.' }
  }

  const agora = new Date().toISOString()
  const regras: Array<{ conexao: number; percentual_primeira: number; percentual_recorrente: number; meta_clientes: number; updated_at: string; updated_por: string }> = []

  for (let conexao = 1; conexao <= 5; conexao++) {
    const r = porConexao.get(conexao)!
    const primeira = numero(r.percentual_primeira)
    const recorrente = numero(r.percentual_recorrente)
    if (!Number.isFinite(primeira) || primeira < 0 || primeira > 100
      || !Number.isFinite(recorrente) || recorrente < 0 || recorrente > 100) {
      return { success: false, error: `Na ${conexao}ª conexão, os percentuais precisam ficar entre 0 e 100.` }
    }

    let meta = 0
    if (conexao > 1) {
      meta = numero(r.meta_clientes)
      if (!Number.isInteger(meta) || meta < 0 || meta > META_MAXIMA) {
        return { success: false, error: `A meta da ${conexao}ª conexão precisa ser um número inteiro de 0 a ${META_MAXIMA}.` }
      }
      const anterior = regras[conexao - 2]
      if (conexao > 2 && anterior && meta < anterior.meta_clientes) {
        return { success: false, error: `A meta da ${conexao}ª conexão não pode ser menor que a da ${conexao - 1}ª.` }
      }
    }

    regras.push({
      conexao,
      percentual_primeira: duasCasas(primeira),
      percentual_recorrente: duasCasas(recorrente),
      meta_clientes: meta,
      updated_at: agora,
      updated_por: adminId,
    })
  }

  const cfg = body?.config ?? {}
  if (typeof cfg.ativo !== 'boolean') {
    return { success: false, error: 'Informe se o programa está ativo.' }
  }
  const saqueMinimo = numero(cfg.saque_minimo)
  if (!Number.isFinite(saqueMinimo) || saqueMinimo < 0 || saqueMinimo > SAQUE_MINIMO_MAXIMO) {
    return { success: false, error: 'O valor mínimo por saque precisa ser 0 ou mais.' }
  }
  const prazo = numero(cfg.prazo_saque_horas)
  if (!Number.isInteger(prazo) || prazo <= 0 || prazo > PRAZO_MAXIMO_HORAS) {
    return { success: false, error: `O prazo do PIX precisa ser um número inteiro de horas, de 1 a ${PRAZO_MAXIMO_HORAS}.` }
  }

  const supabase = getServiceClient()

  const { error: erroRegras } = await supabase
    .from('afiliado_regras')
    .upsert(regras, { onConflict: 'conexao' })
  if (erroRegras) return failPublic(erroRegras, 'admin/afiliados/regras', 'Não foi possível salvar as regras.')

  const { error: erroConfig } = await supabase
    .from('afiliado_config')
    .upsert({
      id: true,
      ativo: cfg.ativo,
      saque_minimo: duasCasas(saqueMinimo),
      prazo_saque_horas: prazo,
      updated_at: agora,
      updated_por: adminId,
    }, { onConflict: 'id' })
  if (erroConfig) {
    return failPublic(erroConfig, 'admin/afiliados/regras', 'As porcentagens foram salvas, mas a configuração de saque não. Tente de novo.')
  }

  return { success: true }
})
