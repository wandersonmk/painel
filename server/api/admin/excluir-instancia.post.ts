import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { uazapiRequest } from '~~/server/utils/uazapi'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { instanciaId } = await readBody<{ instanciaId: string }>(event)
  if (!instanciaId) throw createError({ statusCode: 400, statusMessage: 'instanciaId obrigatório' })

  const supabase = getServiceClient()
  const { data: inst, error: e1 } = await supabase
    .from('instancias_uazapi')
    .select('id, uazapi_token, nome_instancia, empresa_id')
    .eq('id', instanciaId)
    .single()
  if (e1 || !inst) return { success: false, error: 'Instância não encontrada' }

  if (inst.uazapi_token) {
    // Desconecta primeiro (best-effort — pode já estar desconectado)
    try { await uazapiRequest('/instance/disconnect', { method: 'POST', token: inst.uazapi_token }) } catch {}
    // Deleta a instância no servidor UaZapi — se falhar, NÃO remove do banco
    try {
      await uazapiRequest('/instance', { method: 'DELETE', token: inst.uazapi_token })
    } catch (err: any) {
      const msg = err?.message || String(err)
      console.error('[excluir-instancia] UaZapi DELETE falhou:', msg)
      return { success: false, error: `Falha na UaZapi: ${msg.slice(0, 200)}` }
    }
  }

  if (inst.nome_instancia) {
    await supabase
      .from('clientes')
      .update({ instancia_nome_historico: inst.nome_instancia })
      .eq('empresa_id', inst.empresa_id)
  }

  await supabase
    .from('empresas')
    .update({ instancia_lembrete_id: null })
    .eq('instancia_lembrete_id', instanciaId)

  const { error } = await supabase.from('instancias_uazapi').delete().eq('id', instanciaId)
  if (error) return { success: false, error: error.message }
  return { success: true }
})
