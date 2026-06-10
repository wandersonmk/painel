import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { validarCpfCnpj } from '~~/shared/utils/documento'

const TIPOS_PIX = ['cpf', 'cnpj', 'celular', 'email', 'aleatoria']

export default defineEventHandler(async (event) => {
  const { parceiro } = await requireParceiro(event)
  const { pixTipo, pixChave, titularNome, titularDocumento } = await readBody<{
    pixTipo: string
    pixChave: string
    titularNome: string
    titularDocumento?: string
  }>(event)

  if (!TIPOS_PIX.includes(pixTipo)) {
    throw createError({ statusCode: 400, statusMessage: 'Tipo de chave PIX inválido' })
  }
  if (!pixChave?.trim() || pixChave.trim().length < 5) {
    throw createError({ statusCode: 400, statusMessage: 'Chave PIX inválida' })
  }
  if (!titularNome?.trim() || titularNome.trim().length < 3) {
    throw createError({ statusCode: 400, statusMessage: 'Nome do titular obrigatório' })
  }
  const docDigitos = (titularDocumento || '').replace(/\D/g, '')
  if (!validarCpfCnpj(docDigitos)) {
    throw createError({ statusCode: 400, statusMessage: 'CPF/CNPJ do titular inválido' })
  }

  const supabase = getServiceClient()
  const dadosSplit = {
    ...(parceiro.dados_split || {}),
    pix: {
      tipo: pixTipo,
      chave: pixChave.trim(),
      titular_nome: titularNome.trim(),
      titular_documento: titularDocumento?.trim() || null,
      atualizado_em: new Date().toISOString(),
    },
  }

  const { error } = await supabase
    .from('parceiros')
    .update({ dados_split: dadosSplit, updated_at: new Date().toISOString() })
    .eq('id', parceiro.id)
  if (error) return { success: false, error: error.message }

  return { success: true }
})
