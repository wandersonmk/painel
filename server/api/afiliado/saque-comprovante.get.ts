import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { requireAfiliado } from '~~/server/utils/requireAfiliado'

/**
 * GET /api/afiliado/saque-comprovante?saqueId=<uuid>
 *
 * Baixa o arquivo do comprovante do PIX de um saque do próprio afiliado (só
 * saque pago com arquivo). O atributo download do <a> não funciona com o R2
 * (outra origem), então o arquivo passa por aqui com
 * Content-Disposition: attachment.
 *
 * A chave no R2 sai da URL gravada, e só vale se for da pasta deste saque
 * (afiliados/saques/<saqueId>/<uuid>.<ext>).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const ARQUIVO_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp|pdf)$/i
const TIPOS: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf' }

function dataSaoPaulo(iso: string | null | undefined) {
  const d = iso ? new Date(iso) : new Date()
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(Number.isNaN(d.getTime()) ? new Date() : d)
}

export default defineEventHandler(async (event) => {
  const { afiliado } = await requireAfiliado(event)

  const saqueId = String(getQuery(event).saqueId ?? '')
  if (!UUID_RE.test(saqueId)) {
    throw createError({ statusCode: 400, statusMessage: 'saqueId invalido' })
  }

  const { data: saque, error } = await getServiceClient()
    .from('afiliado_saques')
    .select('id, status, pago_em, comprovante_url')
    .eq('id', saqueId)
    .eq('afiliado_id', afiliado.id)
    .maybeSingle()
  if (error?.code === '42703') {
    // Coluna comprovante_url ainda não existe no banco.
    throw createError({ statusCode: 404, statusMessage: 'Comprovante não encontrado.' })
  }
  if (error) {
    console.error('[api:afiliado/saque-comprovante]', error)
    throw createError({ statusCode: 500, statusMessage: 'Não foi possível baixar o comprovante.' })
  }
  const s = saque as { status: string; pago_em: string | null; comprovante_url: string | null } | null
  if (!s || s.status !== 'pago' || !s.comprovante_url) {
    throw createError({ statusCode: 404, statusMessage: 'Comprovante não encontrado.' })
  }

  const base = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '')
  const prefixo = `${base}/afiliados/saques/${saqueId}/`
  const arquivo = s.comprovante_url.startsWith(prefixo) ? s.comprovante_url.slice(prefixo.length) : ''
  const ext = ARQUIVO_RE.exec(arquivo)?.[1]?.toLowerCase()
  if (!base || !ext) {
    throw createError({ statusCode: 404, statusMessage: 'Comprovante não encontrado.' })
  }

  const accountId = process.env.R2_ACCOUNT_ID || ''
  const accessKeyId = process.env.R2_ACCESS_KEY_ID || ''
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || ''
  const bucket = process.env.R2_BUCKET_NAME || ''
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    console.error('[api:afiliado/saque-comprovante] variaveis R2_* faltando no ambiente')
    throw createError({ statusCode: 503, statusMessage: 'Não foi possível baixar o comprovante agora.' })
  }
  const client = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  })

  let corpo: Uint8Array
  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: bucket, Key: `afiliados/saques/${saqueId}/${arquivo}` }))
    if (!obj.Body) throw new Error('corpo vazio')
    corpo = await obj.Body.transformToByteArray()
  } catch (e: any) {
    const status = e?.$metadata?.httpStatusCode
    console.error('[api:afiliado/saque-comprovante] r2', { saqueId, status, nome: e?.name })
    throw createError({
      statusCode: status === 404 ? 404 : 502,
      statusMessage: status === 404 ? 'Comprovante não encontrado.' : 'Não foi possível baixar o comprovante agora.',
    })
  }

  setResponseHeaders(event, {
    'Content-Type': TIPOS[ext]!,
    'Content-Length': String(corpo.byteLength),
    'Content-Disposition': `attachment; filename="comprovante-saque-${dataSaoPaulo(s.pago_em)}.${ext}"`,
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
  })
  return Buffer.from(corpo.buffer, corpo.byteOffset, corpo.byteLength)
})
