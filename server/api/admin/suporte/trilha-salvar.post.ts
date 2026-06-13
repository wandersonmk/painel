import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{
    id: string
    nome: string
    nivelLabel: string
    descricao?: string | null
    ordem?: number
    ativo?: boolean
  }>(event)

  if (!body.id) {
    throw createError({ statusCode: 400, statusMessage: 'ID da trilha obrigatório' })
  }
  if (!body.nome?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Nome da trilha obrigatório' })
  }
  if (!body.nivelLabel?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Nível da trilha obrigatório' })
  }

  // slug nunca é alterado — o app referencia as trilhas por slug
  const supabase = getServiceClient()
  const { error } = await supabase
    .from('suporte_trilhas')
    .update({
      nome: body.nome.trim(),
      nivel_label: body.nivelLabel.trim(),
      descricao: body.descricao?.trim() || null,
      ordem: Number.isFinite(body.ordem) ? Number(body.ordem) : 0,
      ativo: body.ativo ?? true,
    })
    .eq('id', body.id)
  if (error) return { success: false, error: error.message }

  return { success: true }
})
