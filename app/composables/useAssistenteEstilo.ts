// Vocabulário de ícones e cores dos modelos de assistente.
// As classes Tailwind são escritas por extenso (o JIT precisa do nome completo);
// este arquivo está dentro de `content` do tailwind.config, então é escaneado.

export interface AssistenteCor {
  key: string
  label: string
  swatch: string // botão sólido do seletor
  soft: string   // fundo do ícone (card/preview)
  text: string   // cor do ícone/texto
}

export const ASSISTENTE_CORES: AssistenteCor[] = [
  { key: 'violet', label: 'Violeta', swatch: 'bg-violet-500', soft: 'bg-violet-100 dark:bg-violet-500/15', text: 'text-violet-600 dark:text-violet-400' },
  { key: 'purple', label: 'Roxo', swatch: 'bg-purple-500', soft: 'bg-purple-100 dark:bg-purple-500/15', text: 'text-purple-600 dark:text-purple-400' },
  { key: 'indigo', label: 'Índigo', swatch: 'bg-indigo-500', soft: 'bg-indigo-100 dark:bg-indigo-500/15', text: 'text-indigo-600 dark:text-indigo-400' },
  { key: 'blue', label: 'Azul', swatch: 'bg-blue-500', soft: 'bg-blue-100 dark:bg-blue-500/15', text: 'text-blue-600 dark:text-blue-400' },
  { key: 'sky', label: 'Celeste', swatch: 'bg-sky-500', soft: 'bg-sky-100 dark:bg-sky-500/15', text: 'text-sky-600 dark:text-sky-400' },
  { key: 'cyan', label: 'Ciano', swatch: 'bg-cyan-500', soft: 'bg-cyan-100 dark:bg-cyan-500/15', text: 'text-cyan-600 dark:text-cyan-400' },
  { key: 'teal', label: 'Turquesa', swatch: 'bg-teal-500', soft: 'bg-teal-100 dark:bg-teal-500/15', text: 'text-teal-600 dark:text-teal-400' },
  { key: 'emerald', label: 'Esmeralda', swatch: 'bg-emerald-500', soft: 'bg-emerald-100 dark:bg-emerald-500/15', text: 'text-emerald-600 dark:text-emerald-400' },
  { key: 'green', label: 'Verde', swatch: 'bg-green-500', soft: 'bg-green-100 dark:bg-green-500/15', text: 'text-green-600 dark:text-green-400' },
  { key: 'amber', label: 'Âmbar', swatch: 'bg-amber-500', soft: 'bg-amber-100 dark:bg-amber-500/15', text: 'text-amber-600 dark:text-amber-400' },
  { key: 'orange', label: 'Laranja', swatch: 'bg-orange-500', soft: 'bg-orange-100 dark:bg-orange-500/15', text: 'text-orange-600 dark:text-orange-400' },
  { key: 'red', label: 'Vermelho', swatch: 'bg-red-500', soft: 'bg-red-100 dark:bg-red-500/15', text: 'text-red-600 dark:text-red-400' },
  { key: 'rose', label: 'Rosé', swatch: 'bg-rose-500', soft: 'bg-rose-100 dark:bg-rose-500/15', text: 'text-rose-600 dark:text-rose-400' },
  { key: 'pink', label: 'Rosa', swatch: 'bg-pink-500', soft: 'bg-pink-100 dark:bg-pink-500/15', text: 'text-pink-600 dark:text-pink-400' },
  { key: 'slate', label: 'Cinza', swatch: 'bg-slate-500', soft: 'bg-slate-100 dark:bg-slate-500/15', text: 'text-slate-600 dark:text-slate-400' },
]

const COR_PADRAO = ASSISTENTE_CORES[0]!

/** Resolve uma cor por chave, com fallback seguro para o token padrão. */
export function corDoAssistente(key: string | null | undefined): AssistenteCor {
  return ASSISTENTE_CORES.find(c => c.key === key) || COR_PADRAO
}

/** Ícones FontAwesome solid sugeridos por segmento (nome sem o prefixo fa-solid). */
export const ASSISTENTE_ICONES: string[] = [
  'fa-robot', 'fa-wand-magic-sparkles', 'fa-comments', 'fa-headset',
  'fa-paw', 'fa-building', 'fa-scale-balanced', 'fa-stethoscope',
  'fa-tooth', 'fa-scissors', 'fa-utensils', 'fa-mug-hot',
  'fa-car', 'fa-graduation-cap', 'fa-dumbbell', 'fa-house',
  'fa-cart-shopping', 'fa-briefcase', 'fa-heart-pulse', 'fa-spa',
  'fa-wrench', 'fa-gem', 'fa-camera', 'fa-plane',
  'fa-shirt', 'fa-leaf', 'fa-bell-concierge', 'fa-palette',
]
