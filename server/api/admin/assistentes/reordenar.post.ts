import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { ids } = await readBody<{ ids: string[] }>(event)

  if (!Array.isArray(ids) || ids.length === 0) {
    throw createError({ statusCode: 400, statusMessage: 'Lista de IDs obrigatória' })
  }

  const supabase = getServiceClient()
  // Grava a posição (ordem) de cada modelo conforme a sequência recebida
  const results = await Promise.all(
    ids.map((id, idx) =>
      supabase.from('assistente_modelos').update({ ordem: idx + 1 }).eq('id', id),
    ),
  )

  const erro = results.find(r => r.error)
  if (erro?.error) return { success: false, error: erro.error.message }

  return { success: true }
})
