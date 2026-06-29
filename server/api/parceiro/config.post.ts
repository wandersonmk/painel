import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
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
  const chave = (pixChave || '').trim()
  if (chave.length < 5 || chave.length > 140) {
    throw createError({ statusCode: 400, statusMessage: 'Chave PIX inválida' })
  }
  const nome = (titularNome || '').trim()
  if (nome.length < 3 || nome.length > 120) {
    throw createError({ statusCode: 400, statusMessage: 'Nome do titular inválido' })
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
      chave,
      titular_nome: nome,
      // Armazena só os dígitos validados (não o input cru/com máscara).
      titular_documento: docDigitos,
      atualizado_em: new Date().toISOString(),
    },
  }

  const { error } = await supabase
    .from('parceiros')
    .update({ dados_split: dadosSplit, updated_at: new Date().toISOString() })
    .eq('id', parceiro.id)
  if (error) return failPublic(error, 'parceiro/config', 'Não foi possível salvar seus dados.')

  return { success: true }
})
