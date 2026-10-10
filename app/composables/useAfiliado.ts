import type { SupabaseClient } from '@supabase/supabase-js'
import { formatarDocumento } from '~~/shared/utils/documento'
import { formatPhone } from '~/utils/phone'

/**
 * Portal do Afiliado (09/10/2026). As tabelas afiliado_* não têm policy de
 * RLS, então o "sou afiliado?" passa sempre pela rota /api/afiliado/me.
 */
export interface AfiliadoMe {
  id: string
  nome: string
  ativo: boolean
  bloqueado_motivo: string | null
  codigo_indicacao: string
}

export const MENSAGEM_AFILIADO_BLOQUEADO = 'Seu acesso de afiliado está bloqueado. Fale com a Agzap.'

// Papel REMOVIDO não é bloqueio (09/10/2026): quem não tem papel nenhum no
// painel recebe o aviso normal de "sem acesso", nunca "Conta bloqueada".
export const MENSAGEM_SEM_ACESSO_PAINEL = 'Esta conta não tem acesso ao Painel Agzap. Ele é só para administradores, parceiros e afiliados.'
export const MENSAGEM_PARCERIA_ENCERRADA = 'Seu acesso ao portal do parceiro foi encerrado.'
export const MENSAGEM_AFILIACAO_ENCERRADA = 'Seu acesso ao portal do afiliado foi encerrado.'

export const ERRO_SEM_SESSAO = 'SEM_SESSAO'

/**
 * Papel de parceiro do login (leitura direta: a policy de RLS deixa o parceiro
 * ler a própria linha).
 *  - 'ativo'    → portal do parceiro;
 *  - 'suspenso' → ativo = false sem removido_em: modal "Conta bloqueada";
 *  - null       → não é parceiro OU a parceria foi REMOVIDA (removido_em).
 * Lança em erro de leitura (quem chama decide se ignora).
 */
export type SituacaoParceiro = 'ativo' | 'suspenso' | null

export async function situacaoParceiroLogado(supabase: SupabaseClient, authUserId: string): Promise<SituacaoParceiro> {
  let resp: { data: any; error: any } = await supabase
    .from('parceiros')
    .select('id, ativo, removido_em')
    .eq('auth_user_id', authUserId)
    .maybeSingle()
  // Banco sem a coluna removido_em (SQL ainda não rodado): lê como antes.
  if (resp.error?.code === '42703') {
    resp = await supabase.from('parceiros').select('id, ativo').eq('auth_user_id', authUserId).maybeSingle()
  }
  if (resp.error) throw resp.error
  const p = resp.data as { ativo: boolean; removido_em?: string | null } | null
  if (!p || p.removido_em) return null
  return p.ativo ? 'ativo' : 'suspenso'
}

/**
 * Lança em erro de rede ou sem sessão (Error(ERRO_SEM_SESSAO)); null = não é
 * afiliado. O cliente do Supabase pode vir de quem chama (middleware), para
 * não depender do contexto do Nuxt depois de um await.
 */
export async function conferirAfiliadoLogado(supabase?: SupabaseClient): Promise<AfiliadoMe | null> {
  const client = supabase ?? useSupabaseClient()
  const { data: { session } } = await client.auth.getSession()
  if (!session?.access_token) throw new Error(ERRO_SEM_SESSAO)
  const resp = await $fetch<{ success: boolean; data?: AfiliadoMe | null; error?: string }>('/api/afiliado/me', {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!resp.success) throw new Error(resp.error || 'Não foi possível conferir seu acesso.')
  return resp.data ?? null
}

/** Igual a conferirAfiliadoLogado, mas nunca lança: qualquer falha vira null. */
export async function buscarAfiliadoLogado(supabase?: SupabaseClient): Promise<AfiliadoMe | null> {
  try {
    return await conferirAfiliadoLogado(supabase)
  }
  catch {
    return null
  }
}

/**
 * Sai só desta sessão (scope local). O mesmo login pode estar aberto no app
 * da Agzap — quem já é cliente pode ser afiliado com a mesma conta — e o
 * signOut padrão (global) derrubaria o app junto.
 */
export async function sairDaContaAfiliado(supabase?: SupabaseClient) {
  const client = supabase ?? useSupabaseClient()
  // Estado do useAuth: limpar é só cosmético, então não pode derrubar a saída
  // quando chamado fora de um contexto do Nuxt (ex.: setInterval do layout).
  let sessao: { value: unknown } | null = null
  try {
    sessao = useState('auth_session')
  }
  catch { /* fora de contexto */ }
  try {
    await client.auth.signOut({ scope: 'local' })
  }
  catch { /* sem sessão: nada a fazer */ }
  if (sessao) sessao.value = null
}

/** Mensagem de erro legível de um $fetch (statusMessage do servidor primeiro). */
export function erroAfiliado(err: any, padrao: string) {
  return String(err?.data?.statusMessage || err?.statusMessage || err?.message || padrao)
}

export const ROTULO_TIPO_CHAVE_PIX: Record<string, string> = {
  cpf: 'CPF',
  cnpj: 'CNPJ',
  email: 'E-mail',
  telefone: 'Telefone',
  aleatoria: 'Aleatória',
}

/** Chave PIX para exibir: documento e telefone com máscara, o resto como veio. */
export function formatarChavePix(chave: string | null | undefined, tipo: string | null | undefined): string {
  if (!chave) return '—'
  if (tipo === 'cpf' || tipo === 'cnpj') return formatarDocumento(chave)
  if (tipo === 'telefone') return formatPhone(chave) ?? chave
  return chave
}

// ───────── Aviso opcional do saque no WhatsApp da Agzap ─────────
// O pedido de saque já cai no painel (Afiliados › Saques). A mensagem é só um
// aviso extra, que o afiliado decide mandar do WhatsApp DELE (link wa.me); a
// Agzap nunca dispara mensagem automática. Mesmo número da administração usado
// no ParceiroBloqueadoModal / ParceiroSolicitarModal e nos Termos.
export const WHATSAPP_AGZAP_ADMIN = '5511914600243'

export interface DadosAvisoSaque {
  saque: {
    id: string
    valor: number
    chave_pix: string | null
    chave_pix_tipo: string | null
    titular_nome?: string | null
    titular_documento?: string | null
    solicitado_em: string
    prazo_em?: string | null
  }
  afiliado: {
    nome: string | null
    email: string | null
    telefone: string | null
    documento: string | null
    codigo_indicacao: string | null
  }
}

/** Número curto do pedido (8 primeiros caracteres do id), para citar na conversa. */
export function idCurtoSaque(id: string | null | undefined): string {
  return String(id ?? '').replace(/-/g, '').slice(0, 8).toUpperCase() || '—'
}

export function mensagemAvisoSaque({ saque, afiliado }: DadosAvisoSaque): string {
  const TZ = 'America/Sao_Paulo'
  const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(v || 0))
  const dataHora = (s: string | null | undefined) => {
    if (!s) return '—'
    const d = new Date(s)
    return `${d.toLocaleDateString('pt-BR', { timeZone: TZ })} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: TZ })}`
  }
  const tipoChave = ROTULO_TIPO_CHAVE_PIX[saque.chave_pix_tipo ?? ''] ?? 'chave'
  const titular = saque.titular_nome || afiliado.nome || '—'
  const docTitular = saque.titular_documento || afiliado.documento
  const linhas = [
    'Olá! Acabei de pedir um saque no Portal do Afiliado Agzap.',
    '',
    `*Pedido de saque #${idCurtoSaque(saque.id)}*`,
    `Valor: *${brl(saque.valor)}*`,
    `Pedido em: ${dataHora(saque.solicitado_em)}`,
    ...(saque.prazo_em ? [`Prazo do PIX: até ${dataHora(saque.prazo_em)}`] : []),
    '',
    '*Afiliado*',
    `Nome: ${afiliado.nome || '—'}`,
    `E-mail: ${afiliado.email || '—'}`,
    `WhatsApp: ${afiliado.telefone ? (formatPhone(afiliado.telefone) ?? afiliado.telefone) : '—'}`,
    `CPF/CNPJ: ${afiliado.documento ? formatarDocumento(afiliado.documento) : '—'}`,
    `Código de afiliado: ${afiliado.codigo_indicacao || '—'}`,
    '',
    '*PIX*',
    `Chave (${tipoChave}): ${formatarChavePix(saque.chave_pix, saque.chave_pix_tipo)}`,
    `Titular declarado: ${titular}${docTitular ? ` (${formatarDocumento(docTitular)})` : ''}`,
  ]
  return linhas.join('\n')
}

export function linkAvisoSaqueWhatsApp(dados: DadosAvisoSaque): string {
  return `https://wa.me/${WHATSAPP_AGZAP_ADMIN}?text=${encodeURIComponent(mensagemAvisoSaque(dados))}`
}

/**
 * Abre o WhatsApp a partir do clique (gesto do usuário, então o navegador não
 * bloqueia). Use num <a :href="link" target="_blank"> com @click: se o
 * window.open for barrado, NÃO cancela o clique e o próprio link abre a
 * conversa. Devolve true quando abriu pelo window.open.
 */
export function abrirLinkNoClique(evento: MouseEvent, link: string): boolean {
  let janela: Window | null = null
  try {
    janela = window.open(link, '_blank')
  }
  catch {
    janela = null
  }
  if (!janela) return false
  try {
    janela.opener = null
  }
  catch { /* outra origem: nada a fazer */ }
  evento.preventDefault()
  return true
}
