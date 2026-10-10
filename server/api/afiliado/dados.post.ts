import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { aplicarRateLimit } from '~~/server/utils/parceiroLicencas'
import {
  COLUNAS_AFILIADO,
  TIPOS_CHAVE_PIX,
  exigirAceiteTermoAfiliado,
  requireAfiliado,
  situacaoRecebimento,
  temSaqueAberto,
} from '~~/server/utils/requireAfiliado'
import type { AfiliadoRegistro, TipoChavePix } from '~~/server/utils/requireAfiliado'
import { identificarDocumento } from '~~/shared/utils/documento'
import { normalizarTelefoneBr } from '~~/shared/utils/telefoneBr'

/**
 * POST /api/afiliado/dados — o afiliado logado salva os dados para receber.
 *
 * - A chave PIX tem que estar no nome e no CPF/CNPJ dele: chave de terceiros
 *   é recusada. Chave do tipo CPF/CNPJ precisa ser o próprio documento; nos
 *   outros tipos vale a declaração de titularidade (obrigatória).
 * - Com saque 'solicitado' em andamento, chave, tipo e documento não mudam
 *   (o saque já foi pedido para aquela chave).
 * - Só atualiza a linha do próprio afiliado (id do token).
 */
const EMAIL_RE = /^[^\s@,;()<>]+@[^\s@,;()<>]+\.[^\s@,;()<>]+$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

export default defineEventHandler(async (event) => {
  const { afiliado } = await requireAfiliado(event)

  try {
    aplicarRateLimit(`afiliado-dados:${afiliado.id}`, 10, 60_000)
  }
  catch {
    return { success: false as const, error: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.' }
  }

  const body = await readBody<{
    nome?: string
    documento?: string
    telefone?: string
    chave_pix_tipo?: string
    chave_pix?: string
    pix_declarado_titular?: boolean
  }>(event).catch(() => null)

  const nome = String(body?.nome ?? '').replace(/\s+/g, ' ').trim()
  if (nome.length < 2 || nome.length > 120 || !nome.includes(' ')) {
    return { success: false as const, campo: 'nome', error: 'Informe seu nome completo (nome e sobrenome).' }
  }

  const doc = identificarDocumento(body?.documento)
  if (!doc) {
    return { success: false as const, campo: 'documento', error: 'CPF ou CNPJ inválido. Confira os números.' }
  }
  if (!/^\d+$/.test(doc.documento)) {
    return { success: false as const, campo: 'documento', error: 'Por enquanto só aceitamos CPF ou CNPJ com números.' }
  }

  const telefone = normalizarTelefoneBr(body?.telefone)
  if (!telefone) {
    return { success: false as const, campo: 'telefone', error: 'WhatsApp inválido. Informe DDD + número, ex.: (11) 99999-9999.' }
  }

  const tipo = String(body?.chave_pix_tipo ?? '') as TipoChavePix
  if (!TIPOS_CHAVE_PIX.includes(tipo)) {
    return { success: false as const, campo: 'chave_pix_tipo', error: 'Escolha o tipo da chave PIX.' }
  }

  const bruta = String(body?.chave_pix ?? '').trim()
  let chave = ''
  if (tipo === 'cpf' || tipo === 'cnpj') {
    chave = bruta.replace(/\D/g, '')
    if (doc.tipo !== tipo || chave !== doc.documento) {
      return {
        success: false as const,
        campo: 'chave_pix',
        error: tipo === 'cpf'
          ? 'A chave CPF precisa ser o mesmo CPF informado acima.'
          : 'A chave CNPJ precisa ser o mesmo CNPJ informado acima.',
      }
    }
  }
  else if (tipo === 'email') {
    chave = bruta.toLowerCase()
    if (chave.length > 77 || !EMAIL_RE.test(chave)) {
      return { success: false as const, campo: 'chave_pix', error: 'Chave de e-mail inválida.' }
    }
  }
  else if (tipo === 'telefone') {
    const n = normalizarTelefoneBr(bruta)
    if (!n) {
      return { success: false as const, campo: 'chave_pix', error: 'Chave de telefone inválida. Informe DDD + número.' }
    }
    chave = `+${n}`
  }
  else {
    chave = bruta.toLowerCase()
    if (!UUID_RE.test(chave)) {
      return { success: false as const, campo: 'chave_pix', error: 'Chave aleatória inválida. Copie a chave completa do app do seu banco.' }
    }
  }

  if (body?.pix_declarado_titular !== true) {
    return {
      success: false as const,
      campo: 'pix_declarado_titular',
      error: 'Confirme que a chave PIX está no seu nome e no seu CPF/CNPJ.',
    }
  }

  const supabase = getServiceClient()

  const mudaPix = chave !== (afiliado.chave_pix ?? '')
    || tipo !== afiliado.chave_pix_tipo
    || doc.documento !== (afiliado.documento ?? '')
  // Dados do PIX (chave, tipo, documento) só mudam com o Termo do Afiliado
  // vigente aceito (403). Nome e WhatsApp sozinhos não exigem.
  if (mudaPix) await exigirAceiteTermoAfiliado(supabase, afiliado.id)

  try {
    if (mudaPix && await temSaqueAberto(supabase, afiliado.id)) {
      return {
        success: false as const,
        campo: 'chave_pix',
        error: 'Você tem um saque em andamento. Os dados do PIX só podem mudar depois que ele for pago.',
      }
    }

    const { data, error } = await supabase
      .from('afiliados')
      .update({
        nome,
        documento: doc.documento,
        telefone,
        chave_pix: chave,
        chave_pix_tipo: tipo,
        pix_declarado_titular: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', afiliado.id)
      .select(COLUNAS_AFILIADO)
      .single()

    if (error) {
      if ((error as { code?: string }).code === '23505') {
        return {
          success: false as const,
          campo: 'documento',
          error: `Este ${doc.tipo === 'cpf' ? 'CPF' : 'CNPJ'} já está em outro cadastro de afiliado.`,
        }
      }
      return failPublic(error, 'afiliado/dados:salvar', 'Não foi possível salvar seus dados. Tente novamente.')
    }

    const a = data as AfiliadoRegistro
    const recebimento = situacaoRecebimento(a)
    return {
      success: true as const,
      data: {
        nome: a.nome,
        email: a.email,
        telefone: a.telefone,
        documento: a.documento,
        chave_pix: a.chave_pix,
        chave_pix_tipo: a.chave_pix_tipo,
        pix_declarado_titular: a.pix_declarado_titular === true,
        completo: recebimento.completo,
        faltando: recebimento.faltando,
        saque_aberto: !mudaPix ? await temSaqueAberto(supabase, a.id) : false,
      },
    }
  }
  catch (erro) {
    return failPublic(erro, 'afiliado/dados', 'Não foi possível salvar seus dados. Tente novamente.')
  }
})
