/**
 * Estado global do modal "conta bloqueada" do parceiro.
 * Ativado pelo polling do layout, pelos middlewares e pelo login.
 */
export function useContaBloqueada() {
  const bloqueado = useState<boolean>('conta_bloqueada', () => false)
  return { bloqueado }
}
