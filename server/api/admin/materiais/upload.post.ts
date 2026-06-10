import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'

const BUCKET = 'parceiro-materiais'
const MAX_BYTES = 100 * 1024 * 1024 // 100 MB

function detectarTipo(mime: string): 'imagem' | 'video' | 'pdf' | null {
  if (mime.startsWith('image/')) return 'imagem'
  if (mime.startsWith('video/')) return 'video'
  if (mime === 'application/pdf') return 'pdf'
  return null
}

function nomeSeguro(nome: string) {
  return nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\-]+/g, '-')
    .replace(/-+/g, '-')
    .slice(-120)
}

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const partes = await readMultipartFormData(event)
  if (!partes) throw createError({ statusCode: 400, statusMessage: 'Envio inválido' })

  const arquivo = partes.find(p => p.name === 'file' && p.filename)
  const titulo = partes.find(p => p.name === 'titulo')?.data.toString('utf-8').trim()
  const descricao = partes.find(p => p.name === 'descricao')?.data.toString('utf-8').trim()

  if (!arquivo?.data?.length) {
    throw createError({ statusCode: 400, statusMessage: 'Arquivo obrigatório' })
  }
  if (arquivo.data.length > MAX_BYTES) {
    throw createError({ statusCode: 400, statusMessage: 'Arquivo acima de 100 MB — para vídeos grandes, prefira publicar como aula no YouTube' })
  }

  const mime = arquivo.type || 'application/octet-stream'
  const tipo = detectarTipo(mime)
  if (!tipo) {
    throw createError({ statusCode: 400, statusMessage: 'Formato não permitido — envie imagem, vídeo ou PDF' })
  }

  const nomeOriginal = arquivo.filename || 'arquivo'
  const path = `${tipo}/${Date.now()}-${nomeSeguro(nomeOriginal)}`

  const supabase = getServiceClient()
  const { error: upErr } = await supabase.storage
    .from(BUCKET)
    .upload(path, arquivo.data, { contentType: mime, upsert: false })
  if (upErr) return { success: false, error: `Falha no upload: ${upErr.message}` }

  const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path)

  const { error } = await supabase.from('parceiro_materiais').insert({
    titulo: titulo || nomeOriginal,
    descricao: descricao || null,
    tipo,
    arquivo_path: path,
    arquivo_url: pub.publicUrl,
    arquivo_nome: nomeOriginal,
    tamanho_bytes: arquivo.data.length,
  })
  if (error) {
    // Não deixa arquivo órfão no bucket se o registro falhar
    await supabase.storage.from(BUCKET).remove([path])
    return { success: false, error: error.message }
  }

  return { success: true }
})
