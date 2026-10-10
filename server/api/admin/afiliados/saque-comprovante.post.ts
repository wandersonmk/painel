import { randomUUID } from 'node:crypto'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'

/**
 * POST /api/admin/afiliados/saque-comprovante (multipart: saqueId + arquivo)
 *
 * Sobe o comprovante do PIX de um saque de afiliado para o R2 e devolve a URL
 * pública: afiliados/saques/<saqueId>/<uuid>.<ext>.
 *
 * - Saque aberto ('solicitado'): só sobe. A URL vai junto no "Confirmar
 *   pagamento" (saque-pagar grava em comprovante_url).
 * - Saque já pago: sobe e grava direto em comprovante_url (anexar depois).
 * - Saque recusado: não aceita.
 *
 * Aceita JPEG, PNG, WEBP e PDF até 4 MB (o limite do corpo na Vercel é 4,5 MB;
 * a tela já reduz a imagem antes de enviar). O tipo é conferido pelos
 * primeiros bytes do arquivo, não pelo que o navegador diz.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const LIMITE_BYTES = 4 * 1024 * 1024

type Tipo = { ext: 'jpg' | 'png' | 'webp' | 'pdf'; contentType: string }

/** Tipo real pelos primeiros bytes (assinatura do arquivo). */
function detectarTipo(b: Buffer): Tipo | null {
  if (b.length >= 3 && b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return { ext: 'jpg', contentType: 'image/jpeg' }
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return { ext: 'png', contentType: 'image/png' }
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return { ext: 'webp', contentType: 'image/webp' }
  if (b.length >= 5 && b.toString('ascii', 0, 5) === '%PDF-') return { ext: 'pdf', contentType: 'application/pdf' }
  return null
}

function configR2() {
  const accountId = process.env.R2_ACCOUNT_ID || ''
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || ''
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || ''
  const bucket = process.env.R2_BUCKET_NAME || ''
  const publicUrl = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '')
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket || !publicUrl) return null
  return {
    bucket,
    publicUrl,
    client: new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
    }),
  }
}

export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  let partes: Awaited<ReturnType<typeof readMultipartFormData>>
  try {
    partes = await readMultipartFormData(event)
  } catch {
    partes = undefined
  }
  if (!partes?.length) return { success: false, error: 'Envie o arquivo do comprovante.' }

  const saqueId = partes.find(p => p.name === 'saqueId' && !p.filename)?.data?.toString('utf8').trim() ?? ''
  if (!UUID_RE.test(saqueId)) {
    throw createError({ statusCode: 400, statusMessage: 'saqueId invalido' })
  }

  const arquivo = partes.find(p => p.name === 'arquivo' && p.filename)
  if (!arquivo?.data?.length) return { success: false, error: 'Envie o arquivo do comprovante.' }
  if (arquivo.data.length > LIMITE_BYTES) {
    return { success: false, error: 'O arquivo passa de 4 MB. Envie uma imagem ou um PDF menor.' }
  }
  const tipo = detectarTipo(arquivo.data)
  if (!tipo) return { success: false, error: 'Formato não aceito. Envie uma imagem (JPG, PNG ou WEBP) ou um PDF.' }

  const supabase = getServiceClient()
  const { data: saque, error: erroSaque } = await supabase
    .from('afiliado_saques')
    .select('id, status')
    .eq('id', saqueId)
    .maybeSingle()
  if (erroSaque) return failPublic(erroSaque, 'admin/afiliados/saque-comprovante', 'Não foi possível conferir o saque.')
  if (!saque) return { success: false, error: 'Saque não encontrado.' }
  const status = (saque as any).status as string
  if (status === 'recusado') return { success: false, error: 'Este saque foi recusado: não dá para anexar comprovante.' }

  const r2 = configR2()
  if (!r2) {
    console.error('[api:admin/afiliados/saque-comprovante] variaveis R2_* faltando no ambiente')
    return { success: false, error: 'O armazenamento de arquivos não está configurado. Avise o suporte técnico.' }
  }

  const key = `afiliados/saques/${saqueId}/${randomUUID()}.${tipo.ext}`
  try {
    await r2.client.send(new PutObjectCommand({
      Bucket: r2.bucket,
      Key: key,
      Body: arquivo.data,
      ContentType: tipo.contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }))
  } catch (e) {
    return failPublic(e, 'admin/afiliados/saque-comprovante:r2', 'Não foi possível enviar o comprovante. Tente de novo.')
  }
  const url = `${r2.publicUrl}/${key}`

  // Saque aberto: a URL é gravada no "Confirmar pagamento".
  if (status !== 'pago') return { success: true, data: { url, salvo: false } }

  // Saque já pago: grava agora (anexar depois do pagamento).
  const prefixo = `${r2.publicUrl}/afiliados/saques/${saqueId}/`
  const { data: anterior } = await supabase
    .from('afiliado_saques')
    .select('comprovante_url')
    .eq('id', saqueId)
    .maybeSingle()
  const { data: salvo, error: erroSalvar } = await supabase
    .from('afiliado_saques')
    .update({ comprovante_url: url, updated_at: new Date().toISOString() })
    .eq('id', saqueId)
    .eq('status', 'pago')
    .select('id')
    .maybeSingle()
  if (erroSalvar || !salvo) {
    if (erroSalvar) console.error('[api:admin/afiliados/saque-comprovante] salvar url', erroSalvar)
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key })).catch(() => {})
    return { success: false, error: 'Não foi possível salvar o comprovante neste saque.' }
  }

  // Trocou um comprovante antigo deste mesmo saque: apaga o arquivo velho.
  const urlAnterior = String((anterior as any)?.comprovante_url ?? '')
  if (urlAnterior && urlAnterior !== url && urlAnterior.startsWith(prefixo)) {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: urlAnterior.slice(r2.publicUrl.length + 1) }))
      .catch(e => console.error('[api:admin/afiliados/saque-comprovante] apagar arquivo antigo', e))
  }

  return { success: true, data: { url, salvo: true } }
})
