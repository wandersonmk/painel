import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

const CHAVE = 'default_token_openai'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{ action: 'get' | 'save' | 'remove'; token?: string }>(event)
  if (!body?.action) throw createError({ statusCode: 400, statusMessage: 'action obrigatória' })

  const supabase = getServiceClient()

  if (body.action === 'get') {
    const { data } = await supabase.from('admin_settings').select('valor').eq('chave', CHAVE).maybeSingle()
    return { success: true, hasToken: !!data?.valor, token: data?.valor || null }
  }

  if (body.action === 'save') {
    if (!body.token) throw createError({ statusCode: 400, statusMessage: 'token obrigatório' })
    const { data: existing } = await supabase.from('admin_settings').select('id').eq('chave', CHAVE).maybeSingle()
    if (existing) {
      const { error } = await supabase.from('admin_settings').update({ valor: body.token, updated_at: new Date().toISOString() }).eq('chave', CHAVE)
      if (error) return { success: false, error: error.message }
    } else {
      const { error } = await supabase.from('admin_settings').insert({ chave: CHAVE, valor: body.token })
      if (error) return { success: false, error: error.message }
    }
    return { success: true }
  }

  if (body.action === 'remove') {
    const { error } = await supabase.from('admin_settings').delete().eq('chave', CHAVE)
    if (error) return { success: false, error: error.message }
    return { success: true }
  }

  throw createError({ statusCode: 400, statusMessage: 'action inválida' })
})
