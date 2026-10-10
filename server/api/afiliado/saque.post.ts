import { getServiceClient } from '~~/server/utils/requireSuperAdmin'
import { failPublic } from '~~/server/utils/apiError'
import { aplicarRateLimit } from '~~/server/utils/parceiroLicencas'
import {
  carregarConfig,
  consultarPaginado,
  exigirAceiteTermoAfiliado,
  normalizarLiberacoes,
  requireAfiliado,
  situacaoRecebimento,
  somarValores,
  temSaqueAberto,
} from '~~/server/utils/requireAfiliado'

/**
 * POST /api/afiliado/saque — o afiliado logado pede o saque de tudo o que
 * está "disponível". O pedido cai no painel da Agzap (Afiliados › Saques) e o
 * PIX sai em até prazo_saque_horas (48 h) na chave dele. Nada é enviado por
 * WhatsApp daqui: depois do pedido, a tela pergunta se o afiliado quer avisar
 * a Agzap pelo WhatsApp dele (link wa.me que ele mesmo abre).
 *
 * Exige: Termo do Afiliado vigente aceito, dados do PIX completos e no nome
 * dele, nenhum saque aberto e o mínimo de afiliado_config. O liga/desliga do
 * programa (afiliado_config.ativo) NÃO trava saque: desligado, só para de gerar
 * comissão nova; o que já foi ganho continua valendo (regra da tela de Regras).
 *
 * Corrida: (1) dois pedidos juntos → fica só o saque mais antigo, o outro se
 * apaga antes de pegar comissão; (2) as comissões entram no saque num UPDATE
 * único com status = 'disponivel' no WHERE, então nenhuma entra em dois
 * saques. Se o valor movido for diferente do calculado, o saque é ajustado;
 * se não sobrou nada, ele é apagado.
 */
const COLUNAS_SAQUE = 'id, valor, chave_pix, chave_pix_tipo, titular_nome, titular_documento, status, solicitado_em, prazo_em'

export default defineEventHandler(async (event) => {
  const { afiliado } = await requireAfiliado(event)

  try {
    aplicarRateLimit(`afiliado-saque:${afiliado.id}`, 3, 60_000)
  }
  catch {
    return { success: false as const, error: 'Muitas tentativas seguidas. Aguarde um minuto e tente de novo.' }
  }

  const recebimento = situacaoRecebimento(afiliado)
  if (!recebimento.completo) {
    return {
      success: false as const,
      codigo: 'DADOS_INCOMPLETOS',
      error: `Complete seus dados para receber antes de sacar (falta: ${recebimento.faltando.join(', ')}).`,
    }
  }

  const supabase = getServiceClient()

  // Sem o aceite da versão vigente do Termo do Afiliado, não há saque (403).
  await exigirAceiteTermoAfiliado(supabase, afiliado.id)

  try {
    if (await temSaqueAberto(supabase, afiliado.id)) {
      return { success: false as const, codigo: 'SAQUE_ABERTO', error: 'Você já tem um saque em andamento.' }
    }

    await normalizarLiberacoes(supabase, afiliado.id)
    const config = await carregarConfig(supabase)

    const disponiveis = await consultarPaginado<{ id: string; valor: number | string }>((de, ate) =>
      supabase
        .from('afiliado_comissoes')
        .select('id, valor')
        .eq('afiliado_id', afiliado.id)
        .eq('status', 'disponivel')
        .order('id')
        .range(de, ate),
    )
    const total = somarValores(disponiveis.map(d => d.valor))
    if (total <= 0) {
      return { success: false as const, error: 'Você ainda não tem valor disponível para saque.' }
    }
    if (total < config.saque_minimo) {
      const minimo = config.saque_minimo.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      return { success: false as const, error: `O saque mínimo é de ${minimo}.` }
    }

    const agora = new Date()
    const prazo = new Date(agora.getTime() + config.prazo_saque_horas * 3600_000)

    // Foto do PIX no momento do pedido: se o afiliado mudar a chave depois, o
    // admin paga na chave que estava valendo quando ele pediu.
    const { data: saque, error: errSaque } = await supabase
      .from('afiliado_saques')
      .insert({
        afiliado_id: afiliado.id,
        valor: total,
        chave_pix: afiliado.chave_pix,
        chave_pix_tipo: afiliado.chave_pix_tipo,
        titular_nome: afiliado.nome,
        titular_documento: afiliado.documento,
        status: 'solicitado',
        solicitado_em: agora.toISOString(),
        prazo_em: prazo.toISOString(),
      })
      .select(COLUNAS_SAQUE)
      .single()
    if (errSaque || !saque) {
      return failPublic(errSaque, 'afiliado/saque:insert', 'Não foi possível pedir o saque agora. Tente novamente.')
    }

    const apagarSaque = async (motivo: string) => {
      const { error: errDel } = await supabase.from('afiliado_saques').delete().eq('id', saque.id).eq('afiliado_id', afiliado.id)
      if (errDel) console.error(`[api:afiliado/saque] saque não apagado (${motivo})`, saque.id, errDel)
    }

    // Trava de corrida (não há índice único de "um saque aberto por afiliado"
    // no banco): dois pedidos ao mesmo tempo (duplo clique, duas abas) passam
    // juntos pelo temSaqueAberto e inserem duas linhas. Fica só a mais antiga
    // (created_at, id); a outra se apaga ANTES de pegar qualquer comissão.
    const { data: primeiroAberto, error: errAbertos } = await supabase
      .from('afiliado_saques')
      .select('id')
      .eq('afiliado_id', afiliado.id)
      .eq('status', 'solicitado')
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (errAbertos) {
      await apagarSaque('conferência de duplicado falhou')
      return failPublic(errAbertos, 'afiliado/saque:duplicado', 'Não foi possível pedir o saque agora. Tente novamente.')
    }
    if (primeiroAberto && primeiroAberto.id !== saque.id) {
      await apagarSaque('pedido duplicado')
      return { success: false as const, codigo: 'SAQUE_ABERTO', error: 'Você já tem um saque em andamento.' }
    }

    // Move TODAS as comissões 'disponivel' do afiliado para este saque num
    // UPDATE só (atômico): ou move tudo, ou nada. Uma comissão nunca entra em
    // dois saques, porque o WHERE repete status = 'disponivel'.
    const { data: movidasResp, error: erroMover } = await supabase
      .from('afiliado_comissoes')
      .update({ status: 'em_saque', saque_id: saque.id, updated_at: agora.toISOString() })
      .eq('afiliado_id', afiliado.id)
      .eq('status', 'disponivel')
      .select('id, valor')
    if (erroMover) {
      // Nada foi movido (comando único). Se a resposta se perdeu mas o banco
      // moveu, a FK de saque_id impede o DELETE e o saque fica de pé.
      await apagarSaque('falha ao mover comissões')
      return failPublic(erroMover, 'afiliado/saque:mover', 'Não foi possível pedir o saque agora. Tente novamente.')
    }
    let movidas = (movidasResp ?? []) as Array<{ valor: number | string }>
    // Muitas linhas: soma pelo que ficou preso no saque, página a página.
    if (movidas.length >= 1000) {
      try {
        movidas = await consultarPaginado<{ id: string; valor: number | string }>((de, ate) =>
          supabase
            .from('afiliado_comissoes')
            .select('id, valor')
            .eq('saque_id', saque.id)
            .eq('status', 'em_saque')
            .order('id')
            .range(de, ate),
        )
      }
      catch (erroSoma) {
        console.error('[api:afiliado/saque] soma das comissões movidas', saque.id, erroSoma)
      }
    }
    const totalMovido = somarValores(movidas.map(l => l.valor))

    if (totalMovido <= 0) {
      await apagarSaque('saque vazio')
      return { success: false as const, error: 'Não havia mais valor disponível. Atualize a página.' }
    }

    let saqueFinal = saque as Record<string, any>
    if (totalMovido !== total) {
      const { data: ajustado, error: errAjuste } = await supabase
        .from('afiliado_saques')
        .update({ valor: totalMovido, updated_at: new Date().toISOString() })
        .eq('id', saque.id)
        .eq('afiliado_id', afiliado.id)
        .select(COLUNAS_SAQUE)
        .single()
      if (errAjuste) console.error('[api:afiliado/saque] valor do saque não ajustado', saque.id, errAjuste)
      else if (ajustado) saqueFinal = ajustado
    }

    return {
      success: true as const,
      data: {
        ...saqueFinal,
        valor: Number(saqueFinal.valor ?? totalMovido),
        prazo_horas: config.prazo_saque_horas,
        // Para a mensagem opcional no WhatsApp da Agzap (enviada pelo próprio afiliado).
        afiliado: {
          nome: afiliado.nome,
          email: afiliado.email,
          telefone: afiliado.telefone,
          documento: afiliado.documento,
          codigo_indicacao: afiliado.codigo_indicacao,
        },
      },
    }
  }
  catch (erro) {
    return failPublic(erro, 'afiliado/saque', 'Não foi possível pedir o saque agora. Tente novamente.')
  }
})
