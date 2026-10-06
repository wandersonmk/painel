import { requireSuperAdmin, getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import {
  CAMPOS_INDICACAO,
  type EmpresaAgzap,
  empresasPorDocumentos,
  empresasPorTelefone,
  maisAntigoPrimeiro,
  vincularIndicacoesAEmpresas,
} from '~~/server/utils/parceiroIndicacoes'
import { identificarDocumento } from '~~/shared/utils/documento'
import { normalizarTelefoneBr, variantesTelefoneBr } from '~~/shared/utils/telefoneBr'

type Via = 'documento' | 'telefone'

/**
 * Consulta do admin: de qual parceiro é a indicação deste cliente?
 *
 * Aceita CPF, CNPJ ou telefone (com ou sem 55, com ou sem o 9º dígito).
 * Um número de 11 dígitos pode ser CPF e celular ao mesmo tempo: quando é
 * válido como os dois, busca pelos dois e diz por onde cada resultado bateu.
 *
 * Devolve os registros de parceiros (o mais antigo primeiro) e as contas da
 * Agzap com o mesmo documento/telefone, com o parceiro vinculado a cada uma.
 */
export default defineEventHandler(async (event) => {
  await requireSuperAdmin(event)

  const q = String(getQuery(event).q ?? '').trim().slice(0, 40)
  const doc = identificarDocumento(q)
  const telefone = normalizarTelefoneBr(q)
  if (!doc && !telefone) {
    return {
      success: false as const,
      error: 'Digite um CPF ou CNPJ válido, ou um telefone com DDD.',
    }
  }

  const supabase = getServiceClient()
  const selectIndicacao = `${CAMPOS_INDICACAO}, parceiros ( id, nome, email, telefone, ativo )`

  try {
    const achadas = new Map<string, { linha: any; via: Set<Via> }>()
    const anotar = (linhas: any[] | null, via: Via) => {
      for (const l of linhas ?? []) {
        const item = achadas.get(l.id) ?? { linha: l, via: new Set<Via>() }
        item.via.add(via)
        achadas.set(l.id, item)
      }
    }

    if (doc) {
      const { data, error } = await supabase
        .from('parceiro_indicacoes')
        .select(selectIndicacao)
        .eq('documento', doc.documento)
      if (error) throw error
      anotar(data, 'documento')
    }
    if (telefone) {
      const { data, error } = await supabase
        .from('parceiro_indicacoes')
        .select(selectIndicacao)
        .in('telefone', variantesTelefoneBr(telefone))
        .order('created_at', { ascending: true })
        .limit(50)
      if (error) throw error
      anotar(data, 'telefone')
    }

    // Contas da Agzap com o mesmo documento / telefone.
    const contas = new Map<string, { empresa: EmpresaAgzap; via: Set<Via> }>()
    const anotarConta = (lista: EmpresaAgzap[], via: Via) => {
      for (const e of lista) {
        const item = contas.get(e.id) ?? { empresa: e, via: new Set<Via>() }
        item.via.add(via)
        contas.set(e.id, item)
      }
    }
    if (doc) anotarConta((await empresasPorDocumentos(supabase, [doc.documento])).get(doc.documento) ?? [], 'documento')
    if (telefone) anotarConta(await empresasPorTelefone(supabase, telefone), 'telefone')

    // Registro sem empresa_id cujo documento já tem conta: liga agora.
    const linhas = [...achadas.values()].map(a => a.linha)
    try {
      const novos = await vincularIndicacoesAEmpresas(supabase, linhas)
      for (const l of linhas) if (!l.empresa_id && novos.has(l.id)) l.empresa_id = novos.get(l.id)
    }
    catch (erro) {
      // Só complemento: a consulta segue mesmo sem ligar o registro à conta.
      console.error('[api:admin/indicacoes/consultar] vincular', erro)
    }

    // Conta ligada a um registro mas que não bateu na busca (ex.: a conta
    // trocou de telefone): entra também, para o admin ver a data dela.
    const faltando = [...new Set(linhas.map(l => l.empresa_id).filter(id => id && !contas.has(id)))] as string[]
    const empresaPorId = new Map<string, EmpresaAgzap>([...contas.values()].map(c => [c.empresa.id, c.empresa]))
    if (faltando.length) {
      const { data, error } = await supabase
        .from('empresas')
        .select('id, nome, nome_cliente, created_at, subscription_status, ativo, cnpj, cpf, whatsapp')
        .in('id', faltando)
      if (error) throw error
      for (const e of (data ?? []) as EmpresaAgzap[]) empresaPorId.set(e.id, e)
    }

    // Parceiro vinculado (carteira) de cada conta encontrada.
    const idsContas = [...contas.keys()]
    const parceiroDaConta = new Map<string, string>()
    if (idsContas.length) {
      const { data, error } = await supabase
        .from('parceiro_empresas')
        .select('empresa_id, ativo, parceiros ( nome )')
        .in('empresa_id', idsContas)
        .eq('ativo', true)
      if (error) throw error
      for (const v of (data ?? []) as any[]) {
        if (v.parceiros?.nome) parceiroDaConta.set(v.empresa_id, v.parceiros.nome)
      }
    }

    const indicacoes = [...achadas.values()]
      .sort((a, b) => maisAntigoPrimeiro(a.linha, b.linha))
      .map(({ linha, via }) => {
        const conta = linha.empresa_id ? empresaPorId.get(linha.empresa_id) : null
        return {
          id: linha.id,
          documento: linha.documento,
          documento_tipo: linha.documento_tipo,
          nome_cliente: linha.nome_cliente,
          telefone: linha.telefone,
          observacao: linha.observacao,
          created_at: linha.created_at,
          updated_at: linha.updated_at,
          encontrado_por: [...via],
          parceiro: linha.parceiros
            ? {
                id: linha.parceiros.id,
                nome: linha.parceiros.nome,
                email: linha.parceiros.email,
                telefone: linha.parceiros.telefone,
                ativo: linha.parceiros.ativo,
              }
            : null,
          conta: conta ? { id: conta.id, nome: conta.nome, created_at: conta.created_at } : null,
        }
      })

    return {
      success: true as const,
      data: {
        busca: {
          documento: doc ? { valor: doc.documento, tipo: doc.tipo } : null,
          telefone,
        },
        indicacoes,
        contas: [...contas.values()]
          .sort((a, b) => maisAntigoPrimeiro(a.empresa, b.empresa))
          .map(({ empresa, via }) => ({
            id: empresa.id,
            nome: empresa.nome,
            responsavel: empresa.nome_cliente?.trim() || null,
            whatsapp: empresa.whatsapp,
            created_at: empresa.created_at,
            subscription_status: empresa.subscription_status,
            ativo: empresa.ativo,
            encontrado_por: [...via],
            parceiro_vinculado: parceiroDaConta.get(empresa.id) ?? null,
          })),
      },
    }
  }
  catch (erro) {
    return failPublic(erro, 'admin/indicacoes/consultar', 'Não foi possível consultar agora. Tente novamente.')
  }
})
