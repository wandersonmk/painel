import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

const BUCKET = 'parceiro-materiais'

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const { id } = await readBody<{ id: string }>(event)

  if (!id) throw createError({ statusCode: 400, statusMessage: 'id obrigatório' })

  const supabase = getServiceClient()
  const { data: material, error: getErr } = await supabase
    .from('parceiro_materiais')
    .select('arquivo_path')
    .eq('id', id)
    .maybeSingle()
  if (getErr) return { success: false, error: getErr.message }
  if (!material) return { success: true }

  const { error } = await supabase.from('parceiro_materiais').delete().eq('id', id)
  if (error) return { success: false, error: error.message }

  // Remove o arquivo do bucket (best-effort: o registro já saiu)
  await supabase.storage.from(BUCKET).remove([material.arquivo_path]).catch(() => {})

  return { success: true }
})
