import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { registrarAuditoria } from '~~/server/utils/parceiroLicencas'

export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const { empresaId, parceiroId, comissaoPercentual, valorBaseOverride, motivo } = await readBody<{
    empresaId: string
    parceiroId: string
    comissaoPercentual?: number
    valorBaseOverride?: number | null
    motivo?: string
  }>(event)

  if (!empresaId || !parceiroId) {
    throw createError({ statusCode: 400, statusMessage: 'empresaId e parceiroId obrigatórios' })
  }
  // No modelo de licenças a comissão não é usada; o campo continua existindo
  // (NOT NULL) e vai a zero.
  const percentual = comissaoPercentual ?? 0
  if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
    throw createError({ statusCode: 400, statusMessage: 'Comissão inválida (0–100%)' })
  }
  const override = valorBaseOverride ?? null
  if (override !== null && (!Number.isFinite(override) || override < 0)) {
    throw createError({ statusCode: 400, statusMessage: 'Valor base inválido' })
  }

  const supabase = getServiceClient()

  const { data: parceiro, error: parceiroErr } = await supabase
    .from('parceiros')
    .select('id, ativo')
    .eq('id', parceiroId)
    .maybeSingle()
  if (parceiroErr) return { success: false, error: parceiroErr.message }
  if (!parceiro) throw createError({ statusCode: 404, statusMessage: 'Parceiro não encontrado' })

  // 1 empresa só tem 1 parceiro (unique em empresa_id): atualiza o vínculo existente ou cria um novo
  const { data: existente, error: existErr } = await supabase
    .from('parceiro_empresas')
    .select('id, parceiro_id')
    .eq('empresa_id', empresaId)
    .maybeSingle()
  if (existErr) return { success: false, error: existErr.message }

  const { data: empresa } = await supabase
    .from('empresas').select('nome').eq('id', empresaId).maybeSingle()
  const eTransferencia = !!existente && existente.parceiro_id !== parceiroId

  if (existente) {
    const { error } = await supabase
      .from('parceiro_empresas')
      .update({
        parceiro_id: parceiroId,
        comissao_percentual: percentual,
        valor_base_override: override,
        ativo: true,
        // Transferir não herda o bloqueio comercial do parceiro anterior.
        ...(eTransferencia ? { bloqueio_origem: null, bloqueado_em: null, bloqueado_por: null } : {}),
        updated_at: new Date().toISOString(),
      })
      .eq('id', existente.id)
    if (error) return { success: false, error: error.message }
  } else {
    const { error } = await supabase
      .from('parceiro_empresas')
      .insert({
        empresa_id: empresaId,
        parceiro_id: parceiroId,
        comissao_percentual: percentual,
        valor_base_override: override,
        ativo: true,
        atribuido_por: adminUserId,
      })
    if (error) return { success: false, error: error.message }
  }

  // O vínculo anterior não é apagado: fica registrado no histórico.
  await supabase.from('parceiro_vinculos_historico').insert({
    empresa_id: empresaId,
    empresa_nome: (empresa as any)?.nome ?? null,
    parceiro_anterior_id: existente?.parceiro_id ?? null,
    parceiro_novo_id: parceiroId,
    acao: eTransferencia ? 'transferencia' : 'vinculo',
    motivo: (motivo ?? '').trim().slice(0, 300) || null,
    executado_por: adminUserId,
  })

  await registrarAuditoria(supabase, event, {
    parceiro_id: parceiroId,
    empresa_id: empresaId,
    ator_user_id: adminUserId,
    ator_papel: 'admin',
    acao: eTransferencia ? 'transferencia_cliente' : 'vinculo_cliente',
    estado_anterior: { parceiro_id: existente?.parceiro_id ?? null },
    estado_novo: { parceiro_id: parceiroId, comissao_percentual: percentual },
    motivo: (motivo ?? '').trim().slice(0, 300) || null,
    origem: 'painel_admin',
  })

  return { success: true, data: { transferencia: eTransferencia } }
})
