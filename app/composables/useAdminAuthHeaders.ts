export async function useAdminAuthHeaders(): Promise<Record<string, string>> {
  const supabase = useSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) {
    throw new Error('Sessão expirada. Faça login novamente.')
  }
  return { Authorization: `Bearer ${session.access_token}` }
}
