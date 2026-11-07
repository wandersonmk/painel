/**
 * O que vem em cada plano, montado a partir da linha de `planos_assinatura`: a
 * mesma que `aplicar_plano_assinatura` grava na conta (renovação do painel,
 * renovação do parceiro com crédito e pagamento pela Stripe). Assim a lista
 * mostrada nunca fica diferente do que o cliente recebe. O texto segue o site
 * agzap.com.br e a tela /assinatura do app.
 */
export interface RecursosPlano {
  codigo: string
  nome: string
  maxWhatsapp: number
  maxInstagram: number
  maxWebchat: number
  /** null = sem limite */
  maxFunis: number | null
  maxProfissionais: number
  maxAgentes: number
  /** null = o plano não mexe no limite que a conta já tem */
  maxClientes: number | null
  maxMacros: number
  /** 0 = sem Delivery */
  maxPedidosMes: number
  maxEnviosMes: number
  apiWebhooks: boolean
  documentacao: boolean
  produtos: boolean
  delivery: boolean
  imoveis: boolean
  disparos: boolean
  grupos: boolean
  formularios: boolean
  linkAgenda: boolean
  dominioAgenda: boolean
}

export interface ItemPlano {
  texto: string
  detalhe?: string
}

export interface ItensPlano {
  vem: ItemPlano[]
  naoVem: ItemPlano[]
}

// Não está em `planos_assinatura`: é atendimento da equipe, não trava do sistema.
const SUPORTE: Record<string, string> = {
  start: 'Suporte Padrão',
  pro: 'Suporte Premium',
  enterprise: 'Suporte Premium + videochamada',
  delivery_ate500: 'Suporte Padrão',
  delivery_acima500: 'Suporte Premium + videochamada',
}

const numero = new Intl.NumberFormat('pt-BR')

function quantidade(n: number, um: string, varios: string) {
  return `${numero.format(n)} ${n === 1 ? um : varios}`
}

function contatos(n: number) {
  return n >= 1000 && n % 1000 === 0 ? `${numero.format(n / 1000)} mil contatos` : `${numero.format(n)} contatos`
}

export const ehPlanoDelivery = (codigo: string) => codigo.startsWith('delivery')

export function itensDoPlano(p: RecursosPlano): ItensPlano {
  const vem: ItemPlano[] = []
  const naoVem: ItemPlano[] = []
  const item = (incluso: boolean, texto: string, detalhe?: string) => {
    (incluso ? vem : naoVem).push(detalhe ? { texto, detalhe } : { texto })
  }
  const delivery = ehPlanoDelivery(p.codigo)

  item(p.maxWhatsapp > 0, p.maxWhatsapp > 0 ? quantidade(p.maxWhatsapp, 'canal de WhatsApp', 'canais de WhatsApp') : 'WhatsApp')
  item(p.maxInstagram > 0, p.maxInstagram > 0 ? quantidade(p.maxInstagram, 'canal de Instagram', 'canais de Instagram') : 'Instagram')
  item(p.maxWebchat > 0, p.maxWebchat > 0 ? `${numero.format(p.maxWebchat)} Webchat para site` : 'Webchat para site')
  if (p.maxFunis) item(true, `Até ${numero.format(p.maxFunis)} funis de CRM`)
  item(true, `Até ${numero.format(p.maxProfissionais)} atendentes/profissionais`)
  item(true, quantidade(p.maxAgentes, 'Agente de IA', 'Agentes de IA'))
  if (p.maxClientes) item(true, contatos(p.maxClientes))
  item(true, quantidade(p.maxMacros, 'macro', 'macros'))
  item(true, 'Agendamentos por profissional')
  item(p.linkAgenda, 'Link de agenda por profissional')
  item(p.dominioAgenda, 'URL personalizada da agenda', 'Ex.: seudominio.com.br/nome-profissional')

  if (delivery) {
    item(true, 'PDV')
    item(true, 'Gestor de pedidos delivery')
    item(true, 'App garçom')
    item(true, 'App cozinha')
    item(true, 'App motoboy')
    item(true, 'Cardápio por QR Code na mesa')
    item(true, `Até ${numero.format(p.maxPedidosMes)} pedidos por mês`)
    item(true, 'Produtos ilimitados no cardápio')
    item(true, 'URL meurestaurante.com.br')
  }

  const temDisparos = p.disparos && p.maxEnviosMes > 0
  item(temDisparos, temDisparos ? `${numero.format(p.maxEnviosMes)} disparos por mês pela API Oficial Meta` : 'Disparos em massa')
  item(p.apiWebhooks, p.apiWebhooks && p.documentacao ? 'API, Webhooks e documentação' : 'API e Webhooks')
  item(p.produtos, 'Módulo Produtos (vitrine)')
  if (!delivery) {
    item(p.delivery, p.delivery && p.maxPedidosMes > 0
      ? `Módulo Delivery, até ${numero.format(p.maxPedidosMes)} pedidos por mês`
      : 'Módulo Delivery')
  }
  item(p.imoveis, 'Módulo Imóveis')
  item(p.grupos, 'Grupos de WhatsApp')
  item(p.formularios, 'Formulários')
  item(true, SUPORTE[p.codigo] ?? 'Suporte Padrão')

  return { vem, naoVem }
}
