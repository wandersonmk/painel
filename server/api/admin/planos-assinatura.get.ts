import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { lerRecursosPlanos } from '~~/server/utils/parceiroLicencas'

// Planos que a renovação pelo painel pode aplicar, com o que cada um grava na
// conta (renovação e aba Preços mostram "o que vem no plano").
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)
  try {
    return { planos: await lerRecursosPlanos(getServiceClient(), { comPreco: true }) }
  } catch (e) {
    console.error('[api:admin/planos-assinatura]', e)
    throw createError({ statusCode: 500, statusMessage: 'Não consegui carregar os planos' })
  }
})
