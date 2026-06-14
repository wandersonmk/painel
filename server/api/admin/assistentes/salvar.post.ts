import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

interface Body {
  id?: string
  nome: string
  segmento?: string | null
  descricao?: string | null
  icone?: string | null
  cor?: string | null
  personalidade?: string | null
  instrucaoPrincipal: string
  requerApi?: boolean
  integracaoVideoUrl?: string | null
  ordem?: number
  ativo?: boolean
}

function slugify(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove marcas de acento (após NFD)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    || 'assistente'
}

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<Body>(event)

  if (!body.nome?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Nome obrigatório' })
  }
  if (!body.instrucaoPrincipal?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'A instrução principal é obrigatória' })
  }

  const requerApi = body.requerApi ?? false
  const videoUrl = body.integracaoVideoUrl?.trim() || null
  // Quando requer integração, o vídeo de configuração é obrigatório
  if (requerApi && !videoUrl) {
    throw createError({ statusCode: 400, statusMessage: 'Informe a URL do vídeo que ensina a configurar a integração' })
  }

  const supabase = getServiceClient()

  const payload: Record<string, unknown> = {
    nome: body.nome.trim(),
    segmento: body.segmento?.trim() || null,
    descricao: body.descricao?.trim() || null,
    icone: body.icone?.trim() || 'fa-robot',
    cor: body.cor?.trim() || 'violet',
    personalidade: body.personalidade?.trim() || null,
    instrucao_principal: body.instrucaoPrincipal.trim(),
    requer_api: requerApi,
    integracao_video_url: videoUrl,
    ordem: Number.isFinite(body.ordem) ? Number(body.ordem) : 0,
    ativo: body.ativo ?? true,
  }

  if (body.id) {
    // Edição — slug é fixo (referência do app), não é alterado
    const { error } = await supabase.from('assistente_modelos').update(payload).eq('id', body.id)
    if (error) return { success: false, error: error.message }
    return { success: true }
  }

  // Criação — gera um slug único a partir do nome
  const base = slugify(body.nome)
  const { data: existentes, error: slugErr } = await supabase
    .from('assistente_modelos')
    .select('slug')
    .like('slug', `${base}%`)
  if (slugErr) return { success: false, error: slugErr.message }

  const usados = new Set((existentes || []).map(r => r.slug))
  let slug = base
  let n = 2
  while (usados.has(slug)) slug = `${base}-${n++}`

  const { error } = await supabase.from('assistente_modelos').insert({ ...payload, slug })
  if (error) return { success: false, error: error.message }

  return { success: true }
})
