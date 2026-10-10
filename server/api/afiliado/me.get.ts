import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { afiliadoDoUsuario, usuarioDoToken } from '~~/server/utils/requireAfiliado'

/**
 * GET /api/afiliado/me — "sou afiliado?" para o login, os middlewares e o
 * layout. Não dá 403 para quem não é afiliado: devolve data null, e a tela
 * decide para onde mandar. Só o próprio registro, pelo usuário do token.
 * Afiliação REMOVIDA (removido_em, 09/10/2026) também devolve null: a pessoa
 * deixou de ser afiliada — não é bloqueio, então nunca vê "acesso bloqueado".
 */
export default defineEventHandler(async (event) => {
  const userId = await usuarioDoToken(event)
  try {
    const a = await afiliadoDoUsuario(getServiceClient(), userId)
    return {
      success: true as const,
      data: a && !a.removido_em
        ? {
            id: a.id,
            nome: a.nome,
            ativo: a.ativo,
            bloqueado_motivo: a.ativo ? null : (a.bloqueado_motivo ?? null),
            codigo_indicacao: a.codigo_indicacao,
          }
        : null,
    }
  }
  catch (erro) {
    return failPublic(erro, 'afiliado/me', 'Não foi possível conferir seu acesso.')
  }
})
