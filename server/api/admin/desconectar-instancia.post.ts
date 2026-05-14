import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { uazapiRequest } from '~~/server/utils/uazapi'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { instanciaId } = await readBody<{ instanciaId: string }>(event)
  if (!instanciaId) throw createError({ statusCode: 400, statusMessage: 'instanciaId obrigatório' })

  const supabase = getServiceClient()
  const { data: inst, error: e1 } = await supabase
    .from('instancias_uazapi')
    .select('id, uazapi_token, nome_instancia, status')
    .eq('id', instanciaId)
    .single()
  if (e1 || !inst) return { success: false, error: 'Instância não encontrada' }

  if (inst.uazapi_token) {
    try {
      await uazapiRequest('/instance/disconnect', { method: 'POST', token: inst.uazapi_token })
    } catch (err: any) {
      const msg = err?.message || String(err)
      console.error('[desconectar-instancia] UaZapi falhou:', msg)
      // Não atualiza o DB se a chamada falhou — retorna o erro real ao frontend
      return {
        success: false,
        error: `Falha na UaZapi: ${msg.slice(0, 200)}`,
      }
    }
  }

  // Só atualiza o DB após confirmar que a UaZapi desconectou com sucesso.
  // Limpa o phone porque o dono pode conectar outro número na mesma instância.
  const { error } = await supabase
    .from('instancias_uazapi')
    .update({ status: 'disconnected', phone: null })
    .eq('id', instanciaId)

  if (error) return { success: false, error: error.message }
  return { success: true }
})
