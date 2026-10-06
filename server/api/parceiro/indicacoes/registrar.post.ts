import { requireParceiro } from '~~/server/utils/requireParceiro'
import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { aplicarRateLimit, registrarAuditoria } from '~~/server/utils/parceiroLicencas'
import {
  CAMPOS_INDICACAO,
  dataBr,
  empresasPorDocumentos,
  limparTexto,
} from '~~/server/utils/parceiroIndicacoes'
import { identificarDocumento } from '~~/shared/utils/documento'
import { normalizarTelefoneBr, variantesTelefoneBr } from '~~/shared/utils/telefoneBr'

/**
 * O parceiro registra um cliente que indicou: CPF/CNPJ, nome e telefone.
 *
 * - O CPF/CNPJ é único entre TODOS os parceiros: o primeiro registro fica com
 *   a indicação. Para outro parceiro, a resposta diz só que já foi registrado,
 *   sem revelar por quem.
 * - O mesmo telefone também não pode ser registrado por outro parceiro (com ou
 *   sem o 9º dígito). O próprio parceiro pode repetir o telefone em outro
 *   CPF/CNPJ (ex.: duas empresas do mesmo dono).
 * - Se já existe conta na Agzap com o mesmo documento, o registro é aceito e
 *   fica ligado a ela; o admin vê na consulta qual data veio primeiro.
 */
export default defineEventHandler(async (event) => {
  const { userId, parceiro } = await requireParceiro(event)
  const body = await readBody<{ documento?: string; nome?: string; telefone?: string; observacao?: string }>(event)

  const doc = identificarDocumento(body?.documento)
  if (!doc) {
    return { success: false as const, campo: 'documento', error: 'CPF ou CNPJ inválido. Confira os números.' }
  }
  const nome = limparTexto(body?.nome, 120)
  if (nome.length < 2) {
    return { success: false as const, campo: 'nome', error: 'Informe o nome do cliente.' }
  }
  const telefone = normalizarTelefoneBr(body?.telefone)
  if (!telefone) {
    return {
      success: false as const,
      campo: 'telefone',
      error: 'Telefone inválido. Informe DDD + número, ex.: (11) 99999-9999.',
    }
  }
  const observacao = limparTexto(body?.observacao, 500) || null
  const rotuloDoc = doc.tipo === 'cpf' ? 'CPF' : 'CNPJ'

  // Limite por parceiro: também dificulta "testar" documentos em massa.
  aplicarRateLimit(`indicacao:${parceiro.id}`, 20, 60_000)

  const supabase = getServiceClient()

  async function mensagemDocumentoJaRegistrado() {
    const { data: existente } = await supabase
      .from('parceiro_indicacoes')
      .select('parceiro_id, created_at')
      .eq('documento', doc!.documento)
      .maybeSingle()
    if (!existente) return null
    return existente.parceiro_id === parceiro.id
      ? `Você já registrou esse ${rotuloDoc} em ${dataBr(existente.created_at)}.`
      : `Esse ${rotuloDoc} já foi registrado por outro parceiro.`
  }

  const jaRegistrado = await mensagemDocumentoJaRegistrado()
  if (jaRegistrado) return { success: false as const, campo: 'documento', error: jaRegistrado }

  const { data: mesmoTelefone, error: telErr } = await supabase
    .from('parceiro_indicacoes')
    .select('id')
    .in('telefone', variantesTelefoneBr(telefone))
    .neq('parceiro_id', parceiro.id)
    .limit(1)
  if (telErr) return failPublic(telErr, 'parceiro/indicacoes/registrar', 'Não foi possível registrar agora. Tente novamente.')
  if (mesmoTelefone?.length) {
    return { success: false as const, campo: 'telefone', error: 'Esse telefone já foi registrado por outro parceiro.' }
  }

  // Conta já existente na Agzap com o mesmo documento: liga o registro a ela.
  let empresaId: string | null = null
  try {
    empresaId = (await empresasPorDocumentos(supabase, [doc.documento])).get(doc.documento)?.[0]?.id ?? null
  }
  catch (erro) {
    console.error('[api:parceiro/indicacoes/registrar] empresa', erro)
  }

  const { data: criada, error } = await supabase
    .from('parceiro_indicacoes')
    .insert({
      parceiro_id: parceiro.id,
      documento: doc.documento,
      documento_tipo: doc.tipo,
      nome_cliente: nome,
      telefone,
      observacao,
      empresa_id: empresaId,
      created_by: userId,
    })
    .select(CAMPOS_INDICACAO)
    .single()

  if (error) {
    // Dois registros do mesmo documento ao mesmo tempo: o índice único decide.
    if (error.code === '23505') {
      const msg = await mensagemDocumentoJaRegistrado()
      return { success: false as const, campo: 'documento', error: msg || `Esse ${rotuloDoc} já foi registrado.` }
    }
    return failPublic(error, 'parceiro/indicacoes/registrar', 'Não foi possível registrar agora. Tente novamente.')
  }

  await registrarAuditoria(supabase, event, {
    parceiro_id: parceiro.id,
    empresa_id: empresaId,
    ator_user_id: userId,
    ator_papel: 'parceiro',
    acao: 'indicacao_registrada',
    estado_novo: { id: criada.id, documento: doc.documento, documento_tipo: doc.tipo, nome_cliente: nome, telefone },
    origem: 'painel_parceiro',
  })

  return { success: true as const, data: { id: criada.id } }
})
