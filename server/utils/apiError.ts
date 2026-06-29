// Loga o erro real no servidor e devolve uma mensagem genérica ao cliente.
// Evita vazar detalhes internos (nomes de colunas/constraints do Postgres,
// mensagens do Stripe/Auth) para o navegador.
export function failPublic(
  error: unknown,
  contexto: string,
  mensagem = 'Não foi possível concluir a operação. Tente novamente.',
) {
  console.error(`[api:${contexto}]`, error)
  return { success: false as const, error: mensagem }
}
