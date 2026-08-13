import { ref } from 'vue'

export interface ParceiroInfo {
  id: string
  nome: string
  ativo: boolean
}

/**
 * Identidade do parceiro logado. Tudo de carteira e crédito está em
 * `useParceiroLicencas` — este composable só resolve "quem é o parceiro".
 */
export const useParceiro = () => {
  const parceiro = ref<ParceiroInfo | null>(null)

  /** Retorna o registro do parceiro vinculado ao usuário logado (ou null). */
  const checkParceiro = async (): Promise<ParceiroInfo | null> => {
    try {
      const supabase = useSupabaseClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        parceiro.value = null
        return null
      }

      const { data, error } = await supabase
        .from('parceiros')
        .select('id, nome, ativo')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (error || !data) {
        parceiro.value = null
        return null
      }

      parceiro.value = data as ParceiroInfo
      return parceiro.value
    } catch {
      parceiro.value = null
      return null
    }
  }

  return { parceiro, checkParceiro }
}
