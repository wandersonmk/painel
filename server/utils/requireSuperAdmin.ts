import { createClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'

export async function requireSuperAdmin(event: H3Event): Promise<string> {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '') || getCookie(event, 'sb-access-token')

  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Token de autenticação não fornecido' })
  }

  const supabaseUrl = process.env.NUXT_PUBLIC_SUPABASE_URL || ''
  const supabaseAnonKey = process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || ''
  const supabaseServiceKey = process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY || ''

  const supabase = createClient(supabaseUrl, supabaseAnonKey)
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Token inválido ou expirado' })
  }

  const serviceSupabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  const { data: usuario, error } = await serviceSupabase
    .from('usuarios')
    .select('role')
    .eq('auth_user_id', user.id)
    .single()

  if (error || !usuario || usuario.role !== 'superAdmin') {
    throw createError({ statusCode: 403, statusMessage: 'Acesso negado: apenas superAdmin' })
  }

  return user.id
}

export function getServiceClient() {
  return createClient(
    process.env.NUXT_PUBLIC_SUPABASE_URL || '',
    process.env.NUXT_SUPABASE_SERVICE_ROLE_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
