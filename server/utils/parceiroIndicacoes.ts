import type { SupabaseClient } from '@supabase/supabase-js'
import { formatarDocumento, normalizarDocumento } from '~~/shared/utils/documento'
import { formatarTelefoneBr, variantesTelefoneBr } from '~~/shared/utils/telefoneBr'

/**
 * Cartela de indicações do parceiro (tabela parceiro_indicacoes).
 *
 * Aqui ficam só as buscas que cruzam a cartela com as contas da Agzap
 * (tabela empresas). As regras de CPF/CNPJ e telefone estão em shared/utils
 * porque a tela usa as mesmas para a máscara e a validação.
 */

export const CAMPOS_INDICACAO
  = 'id, parceiro_id, documento, documento_tipo, nome_cliente, telefone, observacao, empresa_id, created_at, updated_at'

export interface EmpresaAgzap {
  id: string
  nome: string | null
  nome_cliente: string | null
  created_at: string
  subscription_status: string | null
  ativo: boolean | null
  cnpj: string | null
  cpf: string | null
  whatsapp: string | null
}

const CAMPOS_EMPRESA = 'id, nome, nome_cliente, created_at, subscription_status, ativo, cnpj, cpf, whatsapp'

/** Data no fuso de Brasília, para as mensagens que voltam para a tela. */
export function dataBr(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** Espaços repetidos viram um só; sem espaço nas pontas. */
export function limparTexto(bruto: unknown, maximo: number): string {
  return String(bruto ?? '').replace(/\s+/g, ' ').trim().slice(0, maximo)
}

/** Ordena por created_at comparando o instante, não o texto da data. */
export function maisAntigoPrimeiro(a: { created_at: string }, b: { created_at: string }) {
  return Date.parse(a.created_at) - Date.parse(b.created_at)
}

function emLotes<T>(lista: T[], tamanho: number): T[][] {
  const lotes: T[][] = []
  for (let i = 0; i < lista.length; i += tamanho) lotes.push(lista.slice(i, i + tamanho))
  return lotes
}

/**
 * Contas da Agzap com o mesmo CPF/CNPJ. Em `empresas` o CNPJ fica com máscara
 * e o campo cpf só com dígitos (às vezes com um CNPJ dentro), então a busca
 * tenta as duas formas nas duas colunas. Devolve um mapa documento → contas,
 * a mais antiga primeiro.
 */
export async function empresasPorDocumentos(
  supabase: SupabaseClient,
  documentos: string[],
): Promise<Map<string, EmpresaAgzap[]>> {
  const pedidos = new Set(documentos.map(normalizarDocumento).filter(Boolean))
  const resultado = new Map<string, EmpresaAgzap[]>()
  if (!pedidos.size) return resultado

  const vistas = new Map<string, EmpresaAgzap>()
  for (const lote of emLotes([...pedidos], 40)) {
    const candidatos = [...new Set(lote.flatMap(d => [d, formatarDocumento(d)]))]
    const [porCnpj, porCpf] = await Promise.all([
      supabase.from('empresas').select(CAMPOS_EMPRESA).in('cnpj', candidatos),
      supabase.from('empresas').select(CAMPOS_EMPRESA).in('cpf', candidatos),
    ])
    if (porCnpj.error) throw porCnpj.error
    if (porCpf.error) throw porCpf.error
    for (const e of [...(porCnpj.data ?? []), ...(porCpf.data ?? [])] as EmpresaAgzap[]) vistas.set(e.id, e)
  }

  for (const e of vistas.values()) {
    for (const doc of new Set([normalizarDocumento(e.cnpj), normalizarDocumento(e.cpf)])) {
      if (!doc || !pedidos.has(doc)) continue
      const lista = resultado.get(doc) ?? []
      lista.push(e)
      resultado.set(doc, lista)
    }
  }
  for (const lista of resultado.values()) lista.sort(maisAntigoPrimeiro)
  return resultado
}

/**
 * Contas da Agzap com o mesmo WhatsApp: com e sem 55, com e sem o 9º dígito
 * e com a máscara "(11) 99999-9999", que é como alguns cadastros gravaram.
 */
export async function empresasPorTelefone(supabase: SupabaseClient, telefone: string): Promise<EmpresaAgzap[]> {
  const variantes = variantesTelefoneBr(telefone)
  if (!variantes.length) return []
  const candidatos = [...new Set(variantes.flatMap(v => [v, v.slice(2), formatarTelefoneBr(v)]))]
  const { data, error } = await supabase.from('empresas').select(CAMPOS_EMPRESA).in('whatsapp', candidatos)
  if (error) throw error
  return ((data ?? []) as EmpresaAgzap[]).sort(maisAntigoPrimeiro)
}

/**
 * Preenche empresa_id das indicações cujo documento já tem conta na Agzap.
 * Só grava o que ainda está vazio; devolve o mapa id da indicação → empresa.
 */
export async function vincularIndicacoesAEmpresas(
  supabase: SupabaseClient,
  indicacoes: Array<{ id: string; documento: string; empresa_id: string | null }>,
): Promise<Map<string, string>> {
  const vinculos = new Map<string, string>()
  const pendentes = indicacoes.filter(i => !i.empresa_id)
  if (!pendentes.length) return vinculos

  const porDocumento = await empresasPorDocumentos(supabase, pendentes.map(i => i.documento))
  for (const ind of pendentes) {
    const empresa = porDocumento.get(ind.documento)?.[0]
    if (!empresa) continue
    vinculos.set(ind.id, empresa.id)
    // Best-effort: se a gravação falhar, a próxima leitura tenta de novo.
    // updated_at fica de fora: ele marca edição feita pelo parceiro.
    const { error } = await supabase
      .from('parceiro_indicacoes')
      .update({ empresa_id: empresa.id })
      .eq('id', ind.id)
      .is('empresa_id', null)
    if (error) console.error('[parceiroIndicacoes:vincular]', error)
  }
  return vinculos
}
