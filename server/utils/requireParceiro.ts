import { createClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { getServiceClient } from './requireSuperAdmin'

export interface ParceiroAutenticado {
  userId: string
  parceiro: {
    id: string
    nome: string
    email: string | null
    telefone: string | null
    documento: string | null
    dados_split: Record<string, any> | null
  }
}

export async function requireParceiro(event: H3Event): Promise<ParceiroAutenticado> {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Token de autenticação não fornecido' })
  }

  const supabase = createClient(
    process.env.NUXT_PUBLIC_SUPABASE_URL || '',
    process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || '',
  )
  const { data: { user }, error: authError } = await supabase.auth.getUser(token)
  if (authError || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Token inválido ou expirado' })
  }

  const service = getServiceClient()
  const { data: parceiro, error } = await service
    .from('parceiros')
    .select('id, nome, email, telefone, documento, ativo, dados_split')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error || !parceiro || !parceiro.ativo) {
    throw createError({ statusCode: 403, statusMessage: 'Acesso negado: apenas parceiros ativos' })
  }

  return { userId: user.id, parceiro }
}
