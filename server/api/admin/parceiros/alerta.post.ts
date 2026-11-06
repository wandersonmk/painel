import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { ACAO_ALERTA_ENVIADO, registrarAuditoria } from '~~/server/utils/parceiroLicencas'

/**
 * A Agzap escreve ao parceiro sobre um cliente dele. O parceiro vê ao abrir o
 * portal e precisa confirmar a leitura, que fica registrada em parceiro_alertas.
 */
export default defineEventHandler(async (event) => {
  const adminUserId = await requireSuperAdmin(event)
  const body = await readBody<{ empresaId?: string; mensagem?: string }>(event)

  const empresaId = String(body?.empresaId ?? '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(empresaId)) {
    throw createError({ statusCode: 400, statusMessage: 'Cliente inválido' })
  }
  const mensagem = String(body?.mensagem ?? '').trim()
  if (mensagem.length < 10 || mensagem.length > 2000) {
    throw createError({ statusCode: 400, statusMessage: 'Escreva a mensagem do alerta, com até 2.000 caracteres.' })
  }

  const supabase = getServiceClient()
  const { data: vinculo, error: vincErr } = await supabase
    .from('parceiro_empresas')
    .select('parceiro_id, empresas ( nome )')
    .eq('empresa_id', empresaId)
    .eq('ativo', true)
    .limit(1)
    .maybeSingle()
  if (vincErr) return failPublic(vincErr, 'admin/parceiros/alerta', 'Não foi possível enviar o alerta.')
  if (!vinculo) return { success: false as const, error: 'Este cliente não está vinculado a um parceiro.' }

  const empresaNome = (vinculo as any).empresas?.nome ?? null
  const { data: alerta, error } = await supabase
    .from('parceiro_alertas')
    .insert({ parceiro_id: vinculo.parceiro_id, empresa_id: empresaId, empresa_nome: empresaNome, mensagem, criado_por: adminUserId })
    .select('id, criado_em')
    .single()
  if (error) return failPublic(error, 'admin/parceiros/alerta', 'Não foi possível enviar o alerta.')

  await registrarAuditoria(supabase, event, {
    parceiro_id: vinculo.parceiro_id,
    empresa_id: empresaId,
    ator_user_id: adminUserId,
    ator_papel: 'admin',
    acao: ACAO_ALERTA_ENVIADO,
    estado_novo: { alerta_id: alerta.id, empresa_nome: empresaNome },
    motivo: mensagem.slice(0, 300),
    origem: 'painel_admin',
  })

  return { success: true as const, data: alerta }
})
