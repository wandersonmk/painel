// Termo do Afiliado da Agzap (Programa de Afiliados: link fixo, comissão em
// dinheiro, Rede da 1ª à 5ª conexão) — conteúdo ÚNICO usado pelo modal de
// aceite do portal do afiliado (AfiliadoTermosModal), pela página
// /afiliado/termos e pela página pública /termos-afiliado.
// NÃO é o Termo do Parceiro (licenças pré-pagas): cada pessoa é parceira OU
// afiliada, e cada papel aceita o seu próprio termo.
// Mudou o texto? Suba VERSAO_TERMO_AFILIADO e atualize HASH_TERMO_AFILIADO_OFICIAL
// em server/api/afiliado/termos-aceite.ts (SHA-256 de textoCanonicoTermoAfiliado()).
// Subir a versão faz o modal aparecer de novo para TODOS os afiliados.
// Os percentuais e metas abaixo são os vigentes na data da versão; os valores
// em vigor sempre aparecem no portal (afiliado_regras) — cláusula 5.
// Histórico: 1.0 (09/10/2026) primeira versão.

export const VERSAO_TERMO_AFILIADO = '1.0'
export const DATA_TERMO_AFILIADO_EXTENSO = '9 de outubro de 2026'
export const URL_TERMO_AFILIADO = 'https://painel.agzap.com.br/termos-afiliado'
export const URL_POLITICA_PRIVACIDADE_AFILIADO = 'https://app.agzap.com.br/politica-privacidade'

export interface SecaoTermoAfiliado {
  numero: string
  id: string
  titulo: string
  conteudo: string
}

export interface CategoriaTermoAfiliado {
  id: string
  titulo: string
  descricao: string
  cor: string // classe Tailwind do selo
  destaque?: boolean
  secoes: SecaoTermoAfiliado[]
}

const b = (t: string) => `<strong class="font-medium text-slate-900 dark:text-white">${t}</strong>`
const item = (t: string) =>
  `<li class="flex items-start gap-2"><span class="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0 mt-2"></span><span>${t}</span></li>`
const lista = (itens: string[]) => `<ul class="list-none space-y-2 ml-0">${itens.map(item).join('')}</ul>`
const link = (href: string, t: string) => `<a href="${href}" target="_blank" rel="noopener" class="text-purple-600 dark:text-purple-400 hover:underline">${t}</a>`

const th = (t: string) => `<th class="text-left font-medium px-3 py-2 border-b border-slate-200 dark:border-white/10">${t}</th>`
const td = (t: string) => `<td class="px-3 py-2 border-b border-slate-100 dark:border-white/5">${t}</td>`
const tabela = (cabecalho: string[], linhas: string[][]) => `
  <div class="overflow-x-auto"><table class="w-full text-sm border border-slate-200 dark:border-white/10 rounded-md">
    <thead class="bg-slate-50 dark:bg-white/[0.03]"><tr>${cabecalho.map(th).join('')}</tr></thead>
    <tbody>${linhas.map(l => `<tr>${l.map(td).join('')}</tr>`).join('')}</tbody>
  </table></div>`

export const CATEGORIAS_TERMO_AFILIADO: CategoriaTermoAfiliado[] = [
  {
    id: 'aceite',
    titulo: 'Partes e aceite',
    descricao: 'Quem são as partes e como o aceite fica registrado.',
    cor: 'bg-purple-500',
    secoes: [
      {
        numero: '1',
        id: 'partes-aceite',
        titulo: 'Partes, aceite eletrônico e registro',
        conteudo: `
          <p>Este Termo regula o Programa de Afiliados da ${b('Agzap Systems LTDA')}, nome fantasia ${b('Agzap')}, inscrita no CNPJ sob o nº ${b('60.865.841/0001-93')} ("Agzap"), e a pessoa física ou jurídica cadastrada como afiliada ("Afiliado").</p>
          <p>Quem aceita declara ser maior de 18 anos, plenamente capaz e, quando age em nome de uma empresa, ter poderes para representá-la e obrigá-la a este Termo.</p>
          <p>O aceite é eletrônico e obrigatório: o Afiliado lê este Termo até o fim, marca que leu e que aceita, e confirma. ${b('Sem o aceite, o portal do afiliado não é liberado')}. A Agzap guarda como prova o login, o cadastro do Afiliado, a data e a hora, o endereço IP, o navegador, a versão e o texto exato aceito (identificado por um código único). Esse aceite tem validade jurídica (MP nº 2.200-2/2001, art. 10, §2º) e pode ser apresentado em qualquer disputa. Sempre que este Termo mudar, a nova versão é apresentada para novo aceite.</p>
        `,
      },
    ],
  },
  {
    id: 'programa',
    titulo: 'Como funciona a afiliação',
    descricao: 'O link fixo, a Rede da 1ª à 5ª conexão, as comissões e as metas.',
    cor: 'bg-emerald-500',
    secoes: [
      {
        numero: '2',
        id: 'programa',
        titulo: 'O Programa de Afiliados',
        conteudo: `
          <p>O Afiliado indica a Agzap por um ${b('link fixo e pessoal')} (app.agzap.com.br/login?afiliado=&lt;código&gt;), que aparece no portal. Quem cria a conta na Agzap por esse link passa a ser um cliente trazido por ele.</p>
          ${lista([
            `a Agzap é quem vende, cobra, atende e se relaciona com o cliente. O Afiliado ${b('não vende em nome da Agzap')}, não negocia preço, não promete desconto ou condição que a Agzap não oferece e não recebe pagamento de cliente;`,
            `o Afiliado não compra créditos nem licenças. A revenda por licenças é o Programa de Parceria, que tem termo próprio. ${b('Cada pessoa é parceira ou afiliada, nunca as duas ao mesmo tempo')};`,
            'a conta do próprio Afiliado, ou de empresa dele, não gera comissão.',
          ])}
        `,
      },
      {
        numero: '3',
        id: 'rede',
        titulo: 'A Rede: da 1ª à 5ª conexão',
        conteudo: lista([
          `${b('1ª conexão')}: os clientes que criam a conta pelo link do Afiliado;`,
          `${b('2ª conexão')}: os clientes indicados por um cliente da 1ª conexão (pelo link de indicação que cada cliente tem no aplicativo da Agzap);`,
          `${b('3ª, 4ª e 5ª conexões')}: seguem a mesma regra, uma indicação depois da outra, até a 5ª conexão. Não há comissão além da 5ª conexão;`,
          'vale a indicação registrada no cadastro do cliente quando a conta é criada. Ela não muda depois.',
        ]),
      },
      {
        numero: '4',
        id: 'comissoes',
        titulo: 'Comissões',
        conteudo: `
          <p>O Afiliado recebe uma porcentagem de cada pagamento confirmado dos clientes da sua Rede. Valores vigentes na data desta versão:</p>
          ${tabela(['Conexão', 'Primeiro pagamento', 'Pagamentos seguintes'], [
            ['1ª conexão', '30%', '15%'],
            ['2ª conexão', '5%', '5%'],
            ['3ª conexão', '3%', '3%'],
            ['4ª conexão', '2%', '2%'],
            ['5ª conexão', '2%', '2%'],
          ])}
          ${lista([
            `a base de cálculo é a ${b('mensalidade cadastrada do cliente que pagou')}. Plano pago adiantado (por exemplo, 6 ou 12 meses) gera a comissão do período de uma vez: o 1º mês com o percentual do primeiro pagamento e os demais com o dos pagamentos seguintes;`,
            `${b('a comissão só existe enquanto o cliente paga')}. Cliente em teste, cancelado, inadimplente ou com acesso cortado não gera comissão;`,
            'pagamentos feitos enquanto o Afiliado está bloqueado, ou enquanto o programa está pausado pela Agzap, não geram comissão.',
          ])}
        `,
      },
      {
        numero: '5',
        id: 'metas',
        titulo: 'Metas para liberar as conexões',
        conteudo: `
          <p>A 1ª conexão vale desde a entrada no programa. As demais são liberadas por metas que contam ${b('somente os clientes ativos que o Afiliado trouxe direto')} (1ª conexão), com assinatura ativa e em dia. Metas vigentes na data desta versão:</p>
          ${tabela(['Conexão', 'Clientes ativos diretos necessários'], [
            ['1ª conexão', 'liberada na entrada'],
            ['2ª conexão', '10'],
            ['3ª conexão', '15'],
            ['4ª conexão', '20'],
            ['5ª conexão', '50'],
          ])}
          ${lista([
            'a meta é conferida a cada pagamento. Se o número de clientes ativos diretos cair abaixo da meta, os pagamentos daquela conexão deixam de gerar comissão até a meta voltar a ser batida; o que já foi gerado continua valendo;',
            `${b('os percentuais e as metas em vigor sempre aparecem no portal do afiliado')} e podem ser atualizados pela Agzap, na forma da cláusula 14.`,
          ])}
        `,
      },
    ],
  },
  {
    id: 'saldo',
    titulo: 'Saldo e saque',
    descricao: 'Retenção, estorno, saldo no portal e saque por PIX.',
    cor: 'bg-blue-500',
    secoes: [
      {
        numero: '6',
        id: 'retencao',
        titulo: 'Retenção e liberação',
        conteudo: lista([
          `cada comissão nasce ${b('retida')}: ${b('7 dias')} quando o cliente pagou por PIX ou outro pagamento confirmado pela Agzap, e ${b('15 dias')} quando pagou por cartão;`,
          'ao fim da retenção, se o cliente continua ativo, a comissão fica disponível para saque; se não, ela é cancelada.',
        ]),
      },
      {
        numero: '7',
        id: 'estorno',
        titulo: 'Reembolso, chargeback e estorno',
        conteudo: lista([
          `se o pagamento que gerou a comissão for ${b('reembolsado, contestado (chargeback) ou cancelado')}, a comissão correspondente é estornada, mesmo que já esteja disponível;`,
          'se a comissão estornada já tiver sido sacada, a Agzap pode descontar o valor das próximas comissões do Afiliado;',
          'se a contestação for revertida a favor da Agzap, a comissão volta a valer.',
        ]),
      },
      {
        numero: '8',
        id: 'saque',
        titulo: 'Saldo e saque por PIX',
        conteudo: lista([
          'o portal mostra o saldo retido, disponível, em saque e já sacado, e o extrato de cada comissão;',
          `o Afiliado pede o saque do saldo disponível no portal, quando quiser. O PIX é feito ${b('em até 48 horas')} depois do pedido;`,
          `${b('a chave PIX tem que estar no nome e no CPF ou CNPJ do próprio Afiliado')}, o mesmo do cadastro. Chave de terceiros é recusada;`,
          'hoje não há valor mínimo de saque. Se a Agzap passar a exigir um, ele é informado no portal antes de valer;',
          'a Agzap pode recusar um saque com dado divergente ou suspeita de irregularidade, com o motivo informado no portal. A Agzap não responde por PIX enviado à chave informada errada pelo Afiliado.',
        ]),
      },
      {
        numero: '9',
        id: 'tributos',
        titulo: 'Tributos e documentos fiscais',
        conteudo: lista([
          'o Afiliado é responsável pelos tributos que incidem sobre o que recebe;',
          'a Agzap pode pedir documento fiscal (nota fiscal ou recibo) antes de pagar e fazer as retenções que a lei exigir. Quando houver essa exigência, ela é informada no portal.',
        ]),
      },
    ],
  },
  {
    id: 'conduta',
    titulo: 'Conduta, bloqueio e encerramento',
    descricao: 'O que não pode na divulgação e o que acontece com o saldo no bloqueio.',
    cor: 'bg-rose-500',
    destaque: true,
    secoes: [
      {
        numero: '10',
        id: 'condutas',
        titulo: 'Divulgação e condutas proibidas',
        conteudo: `
          <p>O Afiliado divulga o link de forma honesta e dentro da lei. É proibido:</p>
          ${lista([
            'enviar mensagens em massa ou spam, por WhatsApp, e-mail ou qualquer canal, sem o consentimento de quem recebe, ou desrespeitar as regras do WhatsApp e da Meta;',
            'fazer promessas falsas sobre resultados, preços, descontos, prazos ou garantias da Agzap;',
            'se apresentar como funcionário, sócio ou canal oficial da Agzap, ou alterar a marca Agzap;',
            'criar contas falsas ou de fachada, indicar a si mesmo por outra pessoa ou empresa, ou pagar a mensalidade de um cliente para gerar comissão;',
            'usar dados pessoais de terceiros sem base legal (LGPD) para divulgar o link.',
          ])}
        `,
      },
      {
        numero: '11',
        id: 'bloqueio-encerramento',
        titulo: 'Bloqueio e encerramento',
        conteudo: lista([
          `a Agzap pode ${b('bloquear')} o Afiliado por fraude, irregularidade ou descumprimento deste Termo. Bloqueado, ele não gera comissão nova e não saca o saldo enquanto a situação é analisada. Se a Agzap desbloquear, o saldo volta a poder ser sacado;`,
          `${b('se a afiliação for encerrada pela Agzap enquanto o Afiliado está bloqueado, o saldo retido e o disponível são cancelados e não serão pagos')};`,
          'fora do bloqueio, qualquer das partes pode encerrar a afiliação. O encerramento acontece depois que o saldo do Afiliado for sacado e pago;',
          'depois do encerramento, o link deixa de gerar comissão, os clientes trazidos continuam clientes da Agzap e o histórico de comissões e saques fica registrado.',
        ]),
      },
    ],
  },
  {
    id: 'dados',
    titulo: 'Dados e relação entre as partes',
    descricao: 'LGPD, independência das partes, mudanças no programa e foro.',
    cor: 'bg-slate-500',
    secoes: [
      {
        numero: '12',
        id: 'lgpd',
        titulo: 'Dados pessoais (LGPD)',
        conteudo: `
          <p>A Agzap trata os dados do Afiliado (nome, e-mail, WhatsApp, CPF ou CNPJ, chave PIX e dados de acesso) para o cadastro, o cálculo e o pagamento das comissões, a prevenção a fraudes e o cumprimento de obrigações legais, na forma da Lei nº 13.709/2018 e da ${link(URL_POLITICA_PRIVACIDADE_AFILIADO, 'Política de Privacidade')}.</p>
          ${lista([
            'no portal, o Afiliado vê só o necessário para acompanhar as comissões dos clientes da sua Rede, como nome, situação, plano e valores de comissão;',
            `esses dados são ${b('sigilosos')}: o Afiliado não pode copiar, vender, compartilhar nem usar para outro fim, e deve apagar o que tiver guardado quando a afiliação acabar.`,
          ])}
        `,
      },
      {
        numero: '13',
        id: 'relacao',
        titulo: 'Relação entre as partes',
        conteudo: lista([
          `o Afiliado atua de forma independente. Este Termo ${b('não cria vínculo empregatício')}, societário, de representação comercial ou de agência entre o Afiliado e a Agzap;`,
          'os custos da divulgação (anúncios, ferramentas, deslocamentos) são do Afiliado;',
          'não há exclusividade para nenhuma das partes. O Afiliado pode usar o nome Agzap só para divulgar o próprio link, sem alterar a marca.',
        ]),
      },
      {
        numero: '14',
        id: 'alteracoes',
        titulo: 'Alterações do programa e deste Termo',
        conteudo: lista([
          'a Agzap pode mudar os percentuais, as metas, os prazos de retenção e de saque e as demais regras do programa;',
          `as mudanças ${b('valem daí em diante')}, com aviso prévio no portal. Comissão já gerada segue a regra de quando foi gerada;`,
          'mudança relevante neste Termo exige novo aceite. Quem não concordar pode encerrar a afiliação, na forma da cláusula 11.',
        ]),
      },
      {
        numero: '15',
        id: 'foro',
        titulo: 'Legislação aplicável e foro',
        conteudo: `
          <p>Este Termo é regido pelas leis brasileiras, incluindo o Código Civil, a LGPD (Lei nº 13.709/2018) e o Marco Civil da Internet (Lei nº 12.965/2014). Fica eleito o foro da comarca da sede da Agzap Systems LTDA para resolver qualquer questão oriunda deste Termo, com renúncia a qualquer outro.</p>
        `,
      },
    ],
  },
]

export const SECOES_TERMO_AFILIADO: SecaoTermoAfiliado[] = CATEGORIAS_TERMO_AFILIADO.flatMap(c => c.secoes)
export const NUMERO_SECAO_CONTATO_AFILIADO = '16'

// Texto das 2 caixas do aceite. O servidor monta e grava o texto EXATO
// (com nome e documento do Afiliado) em afiliado_termos_aceites.confirmacoes.
export function textosConfirmacaoAfiliado(afiliado?: { nome?: string | null; documento?: string | null } | null): string[] {
  const emNome = afiliado?.nome ? `, em nome de ${afiliado.nome}${afiliado.documento ? ` (${afiliado.documento})` : ''}` : ''
  return [
    'Li o Termo do Afiliado da Agzap até o fim.',
    `Aceito o Termo do Afiliado, inclusive as regras de comissão, retenção e estorno (cláusulas 4 a 7), o saque por PIX só para chave no meu nome (cláusula 8) e o cancelamento do saldo se a afiliação for encerrada com bloqueio (cláusula 11)${emNome}.`,
  ]
}

// Texto canônico (sem HTML) — o mesmo cálculo roda no navegador (texto
// enviado no aceite) e no script que gera HASH_TERMO_AFILIADO_OFICIAL.
export function textoCanonicoTermoAfiliado(): string {
  const limpar = (html: string) =>
    html
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<li[^>]*>/g, '\n- ')
      .replace(/<\/t[dh]>/g, ' | ')
      .replace(/<\/(p|div|ul|li|tr)>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&nbsp;/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
  const partes = [`Termo do Afiliado da Agzap — versão ${VERSAO_TERMO_AFILIADO}`]
  for (const s of SECOES_TERMO_AFILIADO) partes.push(`${s.numero}. ${s.titulo}\n${limpar(s.conteudo)}`)
  return partes.join('\n\n')
}
