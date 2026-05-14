export async function useToastSafe() {
  const toast = useToast()
  return {
    success: toast.success,
    error: toast.error,
    warning: toast.warning,
    info: toast.info,
  }
}
