export interface EmpresaAssinatura {
  subscription_plan?: string | null
  subscription_period?: string | null
  trial_ends_at?: string | null
  subscription_renews_at?: string | null
}

/**
 * Status que a empresa volta a ter ao ser desbloqueada.
 *
 * Regra única usada tanto pelo /api/admin/reativar quanto pelo desbloqueio do
 * parceiro: desbloquear não renova nada — só recalcula o status a partir das
 * datas que já estavam gravadas.
 */
export function calcularStatusReativacao(
  empresa: EmpresaAssinatura | null | undefined,
  agora = new Date(),
): 'active' | 'trial' | 'expired' {
  const isTrial = empresa?.subscription_plan === 'free'
    || empresa?.subscription_period === 'trial'
    || (empresa?.subscription_period?.startsWith('trial') ?? false)

  if (isTrial) {
    const trial = empresa?.trial_ends_at ? new Date(empresa.trial_ends_at) : null
    return trial && trial >= agora ? 'trial' : 'expired'
  }

  const renew = empresa?.subscription_renews_at ? new Date(empresa.subscription_renews_at) : null
  return renew && renew >= agora ? 'active' : 'expired'
}
