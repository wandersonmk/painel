import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { requireAfiliado, situacaoRecebimento, temSaqueAberto } from '~~/server/utils/requireAfiliado'

/** GET /api/afiliado/dados — dados para receber do próprio afiliado logado. */
export default defineEventHandler(async (event) => {
  const { afiliado } = await requireAfiliado(event)
  try {
    const saqueAberto = await temSaqueAberto(getServiceClient(), afiliado.id)
    const recebimento = situacaoRecebimento(afiliado)
    return {
      success: true as const,
      data: {
        nome: afiliado.nome,
        email: afiliado.email,
        telefone: afiliado.telefone,
        documento: afiliado.documento,
        chave_pix: afiliado.chave_pix,
        chave_pix_tipo: afiliado.chave_pix_tipo,
        pix_declarado_titular: afiliado.pix_declarado_titular === true,
        completo: recebimento.completo,
        faltando: recebimento.faltando,
        saque_aberto: saqueAberto,
      },
    }
  }
  catch (erro) {
    return failPublic(erro, 'afiliado/dados', 'Não foi possível carregar seus dados.')
  }
})
