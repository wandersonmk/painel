export default defineNuxtRouteMiddleware(() => {
  const user = useSupabaseUser()
  if (user.value) {
    return navigateTo('/dashboard', { replace: true })
  }
})
