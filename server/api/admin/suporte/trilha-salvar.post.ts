import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

// Grupos da página de Aulas do app (useSuporteVideos.ts → GRUPOS_TRILHA) e cores
// com tema pronto lá (TEMAS_TRILHA). Valor fora da lista cai no padrão.
const GRUPOS = ['comece', 'atendimento', 'ia', 'modulos', 'avancado', 'crescimento']
const CORES = ['emerald', 'sky', 'indigo', 'orange', 'teal', 'violet', 'rose', 'cyan', 'amber', 'pink', 'slate', 'fuchsia', 'lime']

function slugTexto(texto: string): string {
  return String(texto || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '')
}

/**
 * Cria (sem id) ou edita (com id) uma trilha. O slug nasce do nome na criação e
 * nunca muda depois: o app abre trilhas por /suporte?trilha=<slug>.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  const body = await readBody<{
    id?: string
    nome: string
    nivelLabel: string
    descricao?: string | null
    icone?: string | null
    cor?: string | null
    grupo?: string | null
    ordem?: number
    ativo?: boolean
  }>(event)

  if (!body.nome?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Nome da trilha obrigatório' })
  }
  if (!body.nivelLabel?.trim()) {
    throw createError({ statusCode: 400, statusMessage: 'Selo da trilha obrigatório' })
  }
  const icone = (body.icone || '').trim().replace(/^fa-solid\s+/, '')
  if (icone && !/^fa-[a-z0-9-]+$/.test(icone)) {
    throw createError({ statusCode: 400, statusMessage: 'Ícone inválido — use o nome do Font Awesome, ex.: fa-robot' })
  }

  const payload = {
    nome: body.nome.trim(),
    nivel_label: body.nivelLabel.trim(),
    descricao: body.descricao?.trim() || null,
    icone: icone || 'fa-graduation-cap',
    cor: CORES.includes(body.cor || '') ? body.cor! : 'violet',
    grupo: GRUPOS.includes(body.grupo || '') ? body.grupo! : 'modulos',
    ordem: Number.isFinite(body.ordem) ? Number(body.ordem) : 0,
    ativo: body.ativo ?? true,
  }

  const supabase = getServiceClient()
  if (body.id) {
    const { error } = await supabase.from('suporte_trilhas').update(payload).eq('id', body.id)
    if (error) return { success: false, error: error.message }
    return { success: true, id: body.id }
  }

  // Nova trilha: slug único a partir do nome.
  const base = slugTexto(payload.nome) || 'trilha'
  const { data: existentes } = await supabase.from('suporte_trilhas').select('slug').like('slug', `${base}%`)
  const usados = new Set(((existentes || []) as { slug: string }[]).map(t => t.slug))
  let slug = base
  for (let n = 2; usados.has(slug); n++) slug = `${base}-${n}`

  const { data, error } = await supabase.from('suporte_trilhas').insert({ ...payload, slug }).select('id').single()
  if (error) return { success: false, error: error.message }
  return { success: true, id: (data as { id: string } | null)?.id }
})
