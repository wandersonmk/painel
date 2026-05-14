import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

const CHAVE_GLOBAL = 'default_token_openai'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{ clienteId: string; action: 'check' | 'save' | 'remove' | 'apply-global'; token?: string }>(event)
  if (!body?.clienteId || !body?.action) {
    throw createError({ statusCode: 400, statusMessage: 'clienteId e action obrigatórios' })
  }

  const supabase = getServiceClient()

  if (body.action === 'check') {
    const { data: emp } = await supabase.from('empresas').select('token_openai').eq('id', body.clienteId).single()
    const { data: setting } = await supabase.from('admin_settings').select('valor').eq('chave', CHAVE_GLOBAL).maybeSingle()
    const hasToken = !!emp?.token_openai
    const isGlobal = hasToken && !!setting?.valor && emp?.token_openai === setting.valor
    return { success: true, hasToken, isGlobal }
  }

  if (body.action === 'save') {
    if (!body.token) throw createError({ statusCode: 400, statusMessage: 'token obrigatório' })
    const { error } = await supabase.from('empresas').update({ token_openai: body.token, updated_at: new Date().toISOString() }).eq('id', body.clienteId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  }

  if (body.action === 'remove') {
    const { error } = await supabase.from('empresas').update({ token_openai: null, updated_at: new Date().toISOString() }).eq('id', body.clienteId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  }

  if (body.action === 'apply-global') {
    const { data: setting } = await supabase.from('admin_settings').select('valor').eq('chave', CHAVE_GLOBAL).maybeSingle()
    if (!setting?.valor) throw createError({ statusCode: 400, statusMessage: 'Nenhum token global configurado' })
    const { error } = await supabase.from('empresas').update({ token_openai: setting.valor, updated_at: new Date().toISOString() }).eq('id', body.clienteId)
    if (error) return { success: false, error: error.message }
    return { success: true }
  }

  throw createError({ statusCode: 400, statusMessage: 'action inválida' })
})
