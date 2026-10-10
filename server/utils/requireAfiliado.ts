import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { H3Event } from 'h3'
import { getServiceClient } from './requireSuperAdmin'
import { failPublic } from './apiError'
import { VERSAO_TERMO_AFILIADO } from '~~/app/constants/termosAfiliado'

/**
 * Portal do Afiliado (09/10/2026).
 *
 * As tabelas afiliado_* têm RLS ligado e nenhuma policy: só o service role lê
 * e grava. Toda rota do portal passa por requireAfiliado e filtra SEMPRE pelo
 * afiliado.id que saiu do token — nunca por um id vindo da tela.
 */

// removido_em (09/10/2026): afiliação REMOVIDA pelo admin. Não é bloqueio — a
// pessoa deixou de ser afiliada (ativo também fica false).
export const COLUNAS_AFILIADO
  = 'id, auth_user_id, nome, email, telefone, documento, chave_pix, chave_pix_tipo, pix_declarado_titular, codigo_indicacao, ativo, bloqueado_motivo, removido_em, created_at'

export type TipoChavePix = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria'
export const TIPOS_CHAVE_PIX: readonly TipoChavePix[] = ['cpf', 'cnpj', 'email', 'telefone', 'aleatoria']

export interface AfiliadoRegistro {
  id: string
  auth_user_id: string
  nome: string
  email: string
  telefone: string | null
  documento: string | null
  chave_pix: string | null
  chave_pix_tipo: TipoChavePix | null
  pix_declarado_titular: boolean
  codigo_indicacao: string
  ativo: boolean
  bloqueado_motivo: string | null
  removido_em: string | null
  created_at: string
}

export interface AfiliadoAutenticado {
  userId: string
  afiliado: AfiliadoRegistro
}

/** Valida o Bearer e devolve o id do usuário do Supabase Auth. */
export async function usuarioDoToken(event: H3Event): Promise<string> {
  const authHeader = getHeader(event, 'authorization')
  const token = authHeader?.replace('Bearer ', '')
  if (!token) {
    throw createError({ statusCode: 401, statusMessage: 'Token de autenticação não fornecido' })
  }
  const supabase = createClient(
    process.env.NUXT_PUBLIC_SUPABASE_URL || '',
    process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY || '',
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
  const { data: { user }, error } = await supabase.auth.getUser(token)
  if (error || !user) {
    throw createError({ statusCode: 401, statusMessage: 'Token inválido ou expirado' })
  }
  return user.id
}

/** Registro de afiliado do usuário (ou null). Lança só em erro de banco. */
export async function afiliadoDoUsuario(supabase: SupabaseClient, userId: string): Promise<AfiliadoRegistro | null> {
  const { data, error } = await supabase
    .from('afiliados')
    .select(COLUNAS_AFILIADO)
    .eq('auth_user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as AfiliadoRegistro | null) ?? null
}

export async function requireAfiliado(event: H3Event): Promise<AfiliadoAutenticado> {
  const userId = await usuarioDoToken(event)
  let afiliado: AfiliadoRegistro | null = null
  try {
    afiliado = await afiliadoDoUsuario(getServiceClient(), userId)
  }
  catch (erro) {
    console.error('[requireAfiliado]', erro)
    throw createError({ statusCode: 503, statusMessage: 'Não foi possível conferir seu acesso. Tente novamente.' })
  }
  if (!afiliado || !afiliado.ativo) {
    throw createError({ statusCode: 403, statusMessage: 'Acesso negado: apenas afiliados ativos' })
  }
  return { userId, afiliado }
}

// ───────── Utilitários ─────────

export function emLotes<T>(itens: T[], tamanho = 100): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < itens.length; i += tamanho) lotes.push(itens.slice(i, i + tamanho))
  return lotes
}

type RespostaPagina<T> = PromiseLike<{ data: T[] | null; error: unknown }>

/**
 * `.in()` em lotes de 100 ids, cada lote paginado de 1000 em 1000 (a consulta
 * precisa ter ordem estável). Evita URL gigante e o corte de 1000 linhas.
 */
export async function consultarEmLotes<T>(
  ids: string[],
  consulta: (lote: string[], de: number, ate: number) => RespostaPagina<T>,
): Promise<T[]> {
  const unicos = [...new Set(ids.filter(Boolean))]
  const saida: T[] = []
  for (const lote of emLotes(unicos, 100)) {
    for (let de = 0; ; de += 1000) {
      const { data, error } = await consulta(lote, de, de + 999)
      if (error) throw error
      const pagina = data ?? []
      saida.push(...pagina)
      if (pagina.length < 1000) break
    }
  }
  return saida
}

/** Todas as páginas de uma consulta simples (ordem estável obrigatória). */
export async function consultarPaginado<T>(
  consulta: (de: number, ate: number) => RespostaPagina<T>,
): Promise<T[]> {
  const saida: T[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await consulta(de, de + 999)
    if (error) throw error
    const pagina = data ?? []
    saida.push(...pagina)
    if (pagina.length < 1000) break
  }
  return saida
}

/** Soma em centavos: dinheiro nunca soma em ponto flutuante solto. */
export function somarValores(valores: Array<number | string | null | undefined>): number {
  const centavos = valores.reduce<number>((acc, v) => acc + Math.round(Number(v ?? 0) * 100), 0)
  return centavos / 100
}

export function primeiroNome(nome: string | null | undefined): string | null {
  const limpo = String(nome ?? '').trim()
  if (!limpo) return null
  return limpo.split(/\s+/)[0] || null
}

// ───────── Situação do cliente na rede ─────────

export type SituacaoRede = 'pagando' | 'cadastrado' | 'atrasado' | 'cancelado'

export interface EmpresaSituacao {
  subscription_status?: string | null
  subscription_renews_at?: string | null
  trial_ends_at?: string | null
  ativo?: boolean | null
}

/**
 * pagando   = active e (sem vencimento ou vencimento no futuro) — o mesmo
 *             critério de "ativo" que a função do banco usa no modelo A;
 * cadastrado = em teste, ou sem nenhuma data de cobrança/teste;
 * atrasado  = active/past_due com vencimento no passado, ou expired;
 * cancelado = canceled ou empresa desativada.
 */
export function situacaoEmpresa(e: EmpresaSituacao, agora = Date.now()): SituacaoRede {
  const status = String(e.subscription_status ?? '').toLowerCase()
  if (e.ativo === false || status === 'canceled' || status === 'cancelled') return 'cancelado'
  const renova = e.subscription_renews_at ? new Date(e.subscription_renews_at).getTime() : null
  if (status === 'active') return renova === null || renova > agora ? 'pagando' : 'atrasado'
  if (status === 'past_due' || status === 'unpaid' || status === 'expired') return 'atrasado'
  if (status === 'trial' || status === 'trialing') return 'cadastrado'
  if (!e.subscription_renews_at && !e.trial_ends_at) return 'cadastrado'
  return renova !== null && renova <= agora ? 'atrasado' : 'cadastrado'
}

// ───────── Regras e conexões (modelo A) ─────────

export interface RegraConexao {
  conexao: number
  percentual_primeira: number
  percentual_recorrente: number
  meta_clientes: number
}

export async function carregarRegras(supabase: SupabaseClient): Promise<RegraConexao[]> {
  const { data, error } = await supabase
    .from('afiliado_regras')
    .select('conexao, percentual_primeira, percentual_recorrente, meta_clientes')
    .order('conexao')
  if (error) throw error
  return (data ?? []).map((r: any) => ({
    conexao: Number(r.conexao),
    percentual_primeira: Number(r.percentual_primeira ?? 0),
    percentual_recorrente: Number(r.percentual_recorrente ?? 0),
    meta_clientes: Number(r.meta_clientes ?? 0),
  }))
}

/**
 * Modelo A: a conexão N libera quando o afiliado tem meta_clientes clientes
 * ATIVOS que ele trouxe direto. Mesmo laço da afiliado_registrar_comissao():
 * para na primeira meta não batida. A 1ª conexão está sempre liberada.
 */
export function conexoesLiberadas(proprios: number, regras: RegraConexao[]): number {
  let liberadas = 1
  const ordenadas = regras.filter(r => r.conexao >= 2).sort((a, b) => a.conexao - b.conexao)
  for (const r of ordenadas) {
    if (proprios < r.meta_clientes) break
    liberadas = r.conexao
  }
  return liberadas
}

export interface ConfigAfiliado {
  ativo: boolean
  saque_minimo: number
  prazo_saque_horas: number
}

export async function carregarConfig(supabase: SupabaseClient): Promise<ConfigAfiliado> {
  const { data, error } = await supabase
    .from('afiliado_config')
    .select('ativo, saque_minimo, prazo_saque_horas')
    .eq('id', true)
    .maybeSingle()
  if (error) throw error
  const c = data as { ativo?: boolean; saque_minimo?: number | string; prazo_saque_horas?: number } | null
  return {
    ativo: c?.ativo !== false,
    saque_minimo: Number(c?.saque_minimo ?? 0) || 0,
    prazo_saque_horas: Number(c?.prazo_saque_horas ?? 48) || 48,
  }
}

// ───────── Dados para receber ─────────

export interface SituacaoRecebimento {
  completo: boolean
  faltando: string[]
}

/** Dados de PIX completos: nome, CPF/CNPJ, chave, tipo e a declaração de titularidade. */
export function situacaoRecebimento(a: Pick<AfiliadoRegistro, 'nome' | 'documento' | 'chave_pix' | 'chave_pix_tipo' | 'pix_declarado_titular'>): SituacaoRecebimento {
  const faltando: string[] = []
  if (String(a.nome ?? '').trim().length < 2) faltando.push('nome completo')
  const doc = String(a.documento ?? '')
  if (!/^\d{11}$/.test(doc) && !/^\d{14}$/.test(doc)) faltando.push('CPF ou CNPJ')
  if (!a.chave_pix || !a.chave_pix_tipo) faltando.push('chave PIX')
  else if ((a.chave_pix_tipo === 'cpf' || a.chave_pix_tipo === 'cnpj') && a.chave_pix.replace(/\D/g, '') !== doc) {
    faltando.push('chave PIX igual ao seu CPF/CNPJ')
  }
  if (a.pix_declarado_titular !== true) faltando.push('declaração de que a chave é sua')
  return { completo: faltando.length === 0, faltando }
}

/**
 * Termo do Afiliado: saque e dados do PIX exigem o aceite da versão VIGENTE
 * (VERSAO_TERMO_AFILIADO; mudou o texto → sobe a versão e o hash juntos, ver
 * server/api/afiliado/termos-aceite.ts). Mesmo critério do GET do aceite, que
 * abre o modal: vale a linha de afiliado_termos_aceites desta versão.
 * Sem aceite → 403. Não deu para conferir (erro de banco) → 503: nunca libera
 * o saque às cegas.
 */
export async function exigirAceiteTermoAfiliado(supabase: SupabaseClient, afiliadoId: string): Promise<void> {
  const { data, error } = await supabase
    .from('afiliado_termos_aceites')
    .select('afiliado_id')
    .eq('afiliado_id', afiliadoId)
    .eq('versao_termos', VERSAO_TERMO_AFILIADO)
    .limit(1)
    .maybeSingle()
  if (error) {
    console.error('[afiliado:exigirAceiteTermoAfiliado]', error)
    throw createError({ statusCode: 503, statusMessage: 'Não foi possível conferir o aceite do Termo do Afiliado. Tente novamente.' })
  }
  if (!data) {
    throw createError({ statusCode: 403, statusMessage: 'Aceite o Termo do Afiliado para continuar.' })
  }
}

export async function temSaqueAberto(supabase: SupabaseClient, afiliadoId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('afiliado_saques')
    .select('id')
    .eq('afiliado_id', afiliadoId)
    .eq('status', 'solicitado')
    .limit(1)
  if (error) throw error
  return (data ?? []).length > 0
}

// ───────── Retenção → disponível ─────────

/**
 * Comissões 'retido' com liberar_em vencido: viram 'disponivel' se o cliente
 * que pagou continua com assinatura ativa; senão, 'cancelado'. Cada UPDATE
 * repete .eq('status', 'retido'), então duas chamadas ao mesmo tempo nunca
 * mexem duas vezes na mesma linha. Best-effort: erro só vai para o log.
 */
export async function normalizarLiberacoes(supabase: SupabaseClient, afiliadoId: string): Promise<boolean> {
  try {
    const agora = new Date().toISOString()
    const vencidas = await consultarPaginado<{ id: string; empresa_pagante_id: string }>((de, ate) =>
      supabase
        .from('afiliado_comissoes')
        .select('id, empresa_pagante_id')
        .eq('afiliado_id', afiliadoId)
        .eq('status', 'retido')
        .lte('liberar_em', agora)
        .order('id')
        .range(de, ate),
    )
    if (!vencidas.length) return true

    const empresas = await consultarEmLotes<{ id: string; subscription_status: string | null }>(
      vencidas.map(v => v.empresa_pagante_id),
      (lote, de, ate) => supabase.from('empresas').select('id, subscription_status').in('id', lote).order('id').range(de, ate),
    )
    const ativas = new Set(empresas.filter(e => e.subscription_status === 'active').map(e => e.id))
    const liberar = vencidas.filter(v => ativas.has(v.empresa_pagante_id)).map(v => v.id)
    const cancelar = vencidas.filter(v => !ativas.has(v.empresa_pagante_id)).map(v => v.id)

    for (const lote of emLotes(liberar, 100)) {
      const { error } = await supabase
        .from('afiliado_comissoes')
        .update({ status: 'disponivel', liberado_em: agora, updated_at: agora })
        .in('id', lote)
        .eq('afiliado_id', afiliadoId)
        .eq('status', 'retido')
      if (error) throw error
    }
    for (const lote of emLotes(cancelar, 100)) {
      const { error } = await supabase
        .from('afiliado_comissoes')
        .update({
          status: 'cancelado',
          motivo_estorno: 'O cliente não está mais ativo',
          estornado_em: agora,
          updated_at: agora,
        })
        .in('id', lote)
        .eq('afiliado_id', afiliadoId)
        .eq('status', 'retido')
      if (error) throw error
    }
    return true
  }
  catch (erro) {
    console.error('[afiliado:normalizarLiberacoes]', erro)
    return false
  }
}

// ───────── Remover afiliação (09/10/2026) ─────────

/** Nota que a remoção deixa em bloqueado_motivo (o backfill de removido_em procura por ela). */
export const NOTA_AFILIACAO_REMOVIDA = 'Afiliação removida pelo admin'

/**
 * Motivo do bloqueio que existia ANTES da remoção (sem as notas de remoção).
 * null = a afiliação foi removida sem bloqueio (a pessoa pode voltar pelo
 * cadastro); com texto = foi removida bloqueada (só a Agzap reativa).
 */
export function motivoBloqueioAntesDaRemocao(motivo: string | null | undefined): string | null {
  const linhas = String(motivo || '')
    .split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith(NOTA_AFILIACAO_REMOVIDA))
  return linhas.length ? linhas.join(' ') : null
}

export const COLUNAS_REMOCAO_AFILIADO = 'id, nome, ativo, bloqueado_motivo, removido_em'

export interface AfiliadoParaRemocao {
  id: string
  nome: string
  ativo: boolean
  bloqueado_motivo: string | null
  removido_em?: string | null
}

export interface PreviaRemocaoAfiliacao {
  previa: true
  nome: string
  clientes: number
  retido: number
  disponivel: number
  banido: boolean
  motivoBloqueio: string | null
  apagaria: boolean
  bloqueio: string | null
}

type RespostaRemocao<T> = { success: true; data: T } | { success: false; error: string }

/**
 * Regra única de "Remover afiliação", usada pela rota remover-afiliacao e pela
 * troca automática de papel do tornar-parceiro:
 *  - saque aberto → recusa;
 *  - saldo (retido + disponível) → só remove quem está BLOQUEADO com motivo; aí
 *    o saldo é cancelado e não é pago;
 *  - sem histórico (clientes, comissões, saques) → apaga o cadastro;
 *  - com histórico → ativo = false + removido_em + nota em bloqueado_motivo.
 * `previa` só conta o que vai acontecer. Afiliação já removida: recusa.
 */
export async function removerAfiliacaoDoAfiliado(
  supabase: SupabaseClient,
  afiliado: AfiliadoParaRemocao,
  opcoes: { previa?: boolean; nota?: string } = {},
): Promise<RespostaRemocao<PreviaRemocaoAfiliacao | { nome: string; apagado: boolean; saldoCancelado: number }>> {
  const contexto = 'admin/remover-afiliacao'
  if (afiliado.removido_em) return { success: false, error: 'A afiliação desta pessoa já foi removida.' }

  const [clientes, comissoes, saques, abertos] = await Promise.all([
    supabase.from('afiliado_empresas').select('id', { count: 'exact', head: true }).eq('afiliado_id', afiliado.id),
    supabase.from('afiliado_comissoes').select('id', { count: 'exact', head: true }).eq('afiliado_id', afiliado.id),
    supabase.from('afiliado_saques').select('id', { count: 'exact', head: true }).eq('afiliado_id', afiliado.id),
    supabase.from('afiliado_saques').select('id', { count: 'exact', head: true }).eq('afiliado_id', afiliado.id).eq('status', 'solicitado'),
  ])
  const erro = clientes.error || comissoes.error || saques.error || abertos.error
  if (erro) return failPublic(erro, contexto, 'Não foi possível remover a afiliação.')

  const semHistorico = (clientes.count ?? 0) === 0 && (comissoes.count ?? 0) === 0 && (saques.count ?? 0) === 0

  const { data: pendentes, error: saldoErr } = await supabase
    .from('afiliado_comissoes')
    .select('id, valor, status')
    .eq('afiliado_id', afiliado.id)
    .in('status', ['retido', 'disponivel'])
  if (saldoErr) return failPublic(saldoErr, contexto, 'Não foi possível remover a afiliação.')
  const soma = (st: string) => (pendentes || []).filter((c: any) => c.status === st).reduce((t: number, c: any) => t + Number(c.valor || 0), 0)
  const retido = soma('retido')
  const disponivel = soma('disponivel')
  const temSaldo = retido + disponivel > 0
  // Banido = bloqueado pelo admin com motivo (botão Bloquear da tela Afiliados).
  const banido = !afiliado.ativo && !!afiliado.bloqueado_motivo?.trim()

  const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  let bloqueio: string | null = null
  if ((abertos.count ?? 0) > 0) {
    bloqueio = 'Este afiliado tem um saque aberto. Pague ou recuse o saque em Afiliados › Saques antes de tirar a afiliação.'
  }
  else if (temSaldo && !banido) {
    bloqueio = `Este afiliado tem ${brl(retido + disponivel)} de saldo (${brl(disponivel)} disponível e ${brl(retido)} retido). `
      + 'Para tirar a afiliação, primeiro o saldo precisa ser sacado e pago (Afiliados › Saques) '
      + 'ou o afiliado precisa ser bloqueado com um motivo (Bloquear, na tela Afiliados). Bloqueado, o saldo é cancelado na remoção.'
  }

  if (opcoes.previa) {
    return {
      success: true,
      data: {
        previa: true,
        nome: afiliado.nome,
        clientes: clientes.count ?? 0,
        retido,
        disponivel,
        banido,
        motivoBloqueio: banido ? afiliado.bloqueado_motivo : null,
        apagaria: semHistorico,
        bloqueio,
      },
    }
  }

  if (bloqueio) return { success: false, error: bloqueio }

  const agora = new Date().toISOString()
  const hoje = new Date().toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

  // Bloqueado com saldo: o saldo é cancelado (não será pago), com o motivo registrado.
  if (temSaldo) {
    const { error } = await supabase
      .from('afiliado_comissoes')
      .update({
        status: 'cancelado',
        motivo_estorno: `Afiliação removida em ${hoje}; afiliado bloqueado: ${afiliado.bloqueado_motivo!.trim().slice(0, 300)}`,
        estornado_em: agora,
        updated_at: agora,
      })
      .in('id', (pendentes || []).map((c: any) => c.id))
      .in('status', ['retido', 'disponivel'])
    if (error) return failPublic(error, contexto, 'Não foi possível cancelar o saldo. Nada foi alterado.')
  }

  if (semHistorico) {
    const { error } = await supabase.from('afiliados').delete().eq('id', afiliado.id)
    if (error) return failPublic(error, contexto, 'Não foi possível remover a afiliação.')
    return { success: true, data: { nome: afiliado.nome, apagado: true, saldoCancelado: 0 } }
  }

  // Mantém o motivo do bloqueio (se havia) e anota a remoção embaixo.
  const nota = `${opcoes.nota || NOTA_AFILIACAO_REMOVIDA} em ${hoje}`
  const motivo = [banido ? afiliado.bloqueado_motivo!.trim() : null, nota].filter(Boolean).join('\n')
  const { error } = await supabase
    .from('afiliados')
    .update({ ativo: false, bloqueado_motivo: motivo, removido_em: agora, updated_at: agora })
    .eq('id', afiliado.id)
  if (error) return failPublic(error, contexto, 'Não foi possível remover a afiliação.')

  return { success: true, data: { nome: afiliado.nome, apagado: false, saldoCancelado: temSaldo ? retido + disponivel : 0 } }
}
