import { primeiroNome, requireAfiliado } from '~~/server/utils/requireAfiliado'

/**
 * GET /api/afiliado/link — link fixo do afiliado logado. Nunca muda: é o
 * codigo_indicacao gravado no cadastro. Quem cria a conta por ele vira a
 * 1ª conexão deste afiliado (o app grava afiliado_empresas no cadastro).
 */
const APP_URL = 'https://app.agzap.com.br'

export default defineEventHandler(async (event) => {
  const { afiliado } = await requireAfiliado(event)
  const codigo = afiliado.codigo_indicacao
  if (!codigo) {
    return { success: false as const, error: 'Seu link ainda não foi gerado. Fale com a Agzap.' }
  }
  return {
    success: true as const,
    data: {
      codigo,
      url: `${APP_URL}/login?afiliado=${encodeURIComponent(codigo)}`,
      primeiro_nome: primeiroNome(afiliado.nome) ?? afiliado.nome,
    },
  }
})
