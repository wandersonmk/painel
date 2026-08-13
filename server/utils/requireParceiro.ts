import { createClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { getServiceClient } from './requireSuperAdmin'

export type ModeloNegocioParceiro = 'comissao' | 'licenca_prepaga'

export interface ParceiroAutenticado {
  userId: string
  parceiro: {
    id: string
    nome: string
    email: string | null
    telefone: string | null
    documento: string | null
    dados_split: Record<string, any> | null
    modelo_negocio: ModeloNegocioParceiro
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
    .select('id, nome, email, telefone, documento, ativo, dados_split, modelo_negocio')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if (error || !parceiro || !parceiro.ativo) {
    throw createError({ statusCode: 403, statusMessage: 'Acesso negado: apenas parceiros ativos' })
  }

  return { userId: user.id, parceiro }
}

/**
 * Igual ao requireParceiro, mas recusa quem ainda está no modelo de comissão.
 * Toda ação de crédito/renovação/bloqueio passa por aqui — a checagem é do
 * servidor, nunca do que a tela mandou.
 */
export async function requireParceiroPrepago(event: H3Event): Promise<ParceiroAutenticado> {
  const autenticado = await requireParceiro(event)
  if (autenticado.parceiro.modelo_negocio !== 'licenca_prepaga') {
    throw createError({
      statusCode: 403,
      statusMessage: 'Esta operação está disponível apenas no modelo de licenças pré-pagas',
    })
  }
  return autenticado
}
