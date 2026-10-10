// Termo do Parceiro da Agzap (Programa de Parceria, licenças pré-pagas) —
// conteúdo ÚNICO usado pelo modal de aceite do portal (ParceiroTermosModal),
// pela página /parceiro/termos e pela página pública /termos-parceiro.
// Mudou o texto? Suba VERSAO_TERMO_PARCEIRO e atualize HASH_TERMO_PARCEIRO_OFICIAL
// em server/api/parceiro/termos-aceite.ts (SHA-256 de textoCanonicoTermoParceiro()).
// Subir a versão faz o modal aparecer de novo para TODOS os parceiros.
// Histórico: 1.0 comissão; 2.0/2.1 licenças pré-pagas (aceite só com data em
// parceiros.dados_split); 3.0 (09/10/2026) prova completa do aceite, Agzap
// Systems LTDA + CNPJ, sigilo e LGPD dos dados dos clientes, continuidade.

export const VERSAO_TERMO_PARCEIRO = '3.0'
export const DATA_TERMO_PARCEIRO_EXTENSO = '9 de outubro de 2026'
export const URL_TERMO_PARCEIRO = 'https://painel.agzap.com.br/termos-parceiro'
export const URL_POLITICA_PRIVACIDADE = 'https://app.agzap.com.br/politica-privacidade'

export interface SecaoTermoParceiro {
  numero: string
  id: string
  titulo: string
  conteudo: string
}

export interface CategoriaTermoParceiro {
  id: string
  titulo: string
  descricao: string
  cor: string // classe Tailwind do selo
  destaque?: boolean
  secoes: SecaoTermoParceiro[]
}

const b = (t: string) => `<strong class="font-semibold text-slate-900 dark:text-white">${t}</strong>`
const item = (t: string) =>
  `<li class="flex items-start gap-2"><span class="w-1.5 h-1.5 rounded-full bg-slate-400 flex-shrink-0 mt-2"></span><span>${t}</span></li>`
const lista = (itens: string[]) => `<ul class="list-none space-y-2 ml-0">${itens.map(item).join('')}</ul>`
const link = (href: string, t: string) => `<a href="${href}" target="_blank" rel="noopener" class="text-purple-600 dark:text-purple-400 hover:underline font-medium">${t}</a>`

export const CATEGORIAS_TERMO_PARCEIRO: CategoriaTermoParceiro[] = [
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
          <p>Este Termo regula o Programa de Parceria da ${b('Agzap Systems LTDA')}, nome fantasia ${b('Agzap')}, inscrita no CNPJ sob o nº ${b('60.865.841/0001-93')} ("Agzap"), no modelo de revenda por licenças pré-pagas, e a pessoa física ou jurídica cadastrada como parceira ("Parceiro").</p>
          <p>Quem aceita declara ser maior de 18 anos, plenamente capaz e, quando age em nome de uma empresa, ter poderes para representá-la e obrigá-la a este Termo. A relação é de parceria comercial, sem vínculo empregatício, societário ou de representação legal.</p>
          <p>O aceite é eletrônico e obrigatório: o Parceiro lê este Termo até o fim, marca que leu e que aceita, e confirma. ${b('Sem o aceite, o portal do parceiro não é liberado')}. A Agzap guarda como prova o login, o cadastro do Parceiro, a data e a hora, o endereço IP, o navegador, a versão e o texto exato aceito (identificado por um código único). Esse aceite tem validade jurídica (MP nº 2.200-2/2001, art. 10, §2º) e pode ser apresentado em qualquer disputa. Sempre que este Termo mudar, a nova versão é apresentada para novo aceite.</p>
        `,
      },
    ],
  },
  {
    id: 'creditos',
    titulo: 'A parceria e os créditos',
    descricao: 'Licenças pré-pagas, compra, liberação e consumo definitivo dos créditos.',
    cor: 'bg-rose-500',
    destaque: true,
    secoes: [
      {
        numero: '2',
        id: 'objeto',
        titulo: 'Objeto da parceria',
        conteudo: `
          <p>O Parceiro ${b('compra licenças da Agzap antecipadamente')} e as revende ao cliente final por conta e risco próprios. Não há pagamento de comissão da Agzap ao Parceiro neste modelo.</p>
          ${lista([
            `Cada licença adquirida vira um ${b('crédito')} na carteira do Parceiro;`,
            `crédito de ${b('30 dias')} autoriza uma renovação de 30 dias corridos para um cliente;`,
            `crédito de ${b('12 meses')} autoriza uma renovação de 12 meses para um cliente;`,
            `a ativação ou renovação de qualquer cliente consome exatamente ${b('1 crédito')}.`,
          ])}
        `,
      },
      {
        numero: '3',
        id: 'compra-creditos',
        titulo: 'Compra e liberação dos créditos',
        conteudo: lista([
          `O pagamento à Agzap e a liberação dos créditos são ${b('processos distintos')}: os créditos entram na carteira somente após a Agzap confirmar o pagamento;`,
          `os valores vigentes de compra são exibidos na página ${b('Créditos')} do portal e podem ser atualizados pela Agzap a qualquer momento;`,
          'cada movimentação de crédito fica registrada em extrato permanente, disponível ao Parceiro para consulta.',
        ]),
      },
      {
        numero: '4',
        id: 'consumo-definitivo',
        titulo: 'Consumo do crédito é definitivo',
        conteudo: `
          <p>Esta é a regra mais importante deste Termo. Depois de confirmada a renovação, o crédito é ${b('consumido em definitivo e não retorna ao saldo')} em nenhuma hipótese, incluindo:</p>
          ${lista([
            'cancelamento do cliente final;',
            'inadimplência do cliente final perante o Parceiro;',
            'bloqueio do cliente, seja pelo Parceiro ou pela Agzap;',
            'desvinculação ou transferência do cliente para outro parceiro;',
            'estorno ou chargeback da cobrança feita pelo Parceiro ao cliente final;',
            'exclusão administrativa do cliente.',
          ])}
          <p>Correções por erro operacional só podem ser lançadas pela Agzap, mediante análise, e ficam registradas em auditoria; o histórico original nunca é apagado.</p>
        `,
      },
    ],
  },
  {
    id: 'operacao',
    titulo: 'Cobrança e operação',
    descricao: 'Cobrança do cliente final, o que o Parceiro faz e o que é exclusivo da Agzap.',
    cor: 'bg-blue-500',
    secoes: [
      {
        numero: '5',
        id: 'cobranca-cliente',
        titulo: 'Cobrança do cliente final',
        conteudo: lista([
          `O Parceiro tem ${b('liberdade total de precificação')} na revenda ao cliente final;`,
          `a cobrança do cliente final é feita ${b('diretamente pelo Parceiro')}, fora da estrutura de pagamentos da Agzap;`,
          'a Agzap fatura para o Parceiro; o Parceiro fatura para o cliente final;',
          'a Agzap não controla, não intermedia e não se responsabiliza pela situação financeira do cliente final perante o Parceiro;',
          `o Parceiro é o ${b('responsável pela cobrança, pelas promessas comerciais, pela entrega e pelo relacionamento')} com o cliente que revendeu.`,
        ]),
      },
      {
        numero: '6',
        id: 'pode-fazer',
        titulo: 'O que o Parceiro pode fazer',
        conteudo: lista([
          'Visualizar apenas os clientes vinculados a ele pela Agzap;',
          'acompanhar status, vencimento, dias restantes e uso de instâncias e assistentes;',
          'ativar ou renovar um cliente vinculado, consumindo um crédito disponível;',
          'bloquear e desbloquear o acesso de um cliente vinculado a ele;',
          'consultar o extrato dos próprios créditos;',
          'solicitar à Agzap novos créditos, exclusões, instâncias, números ou assistentes adicionais.',
        ]),
      },
      {
        numero: '7',
        id: 'exclusivo-agzap',
        titulo: 'O que é exclusivo da Agzap',
        conteudo: `
          ${lista([
            `${b('Exclusão de clientes')} e qualquer alteração estrutural da conta;`,
            `quantidade de ${b('instâncias, números e assistentes')} de cada cliente;`,
            'vínculo, transferência e desvinculação de clientes entre parceiros;',
            'concessão, correção e ajuste de créditos;',
            'renovação administrativa, que não consome crédito do Parceiro;',
            `bloqueio administrativo, que ${b('prevalece')} sobre o bloqueio comercial do Parceiro.`,
          ])}
          <p>Bloquear um cliente não apaga dados, não altera o vencimento e não devolve crédito. Desbloquear não renova e não consome crédito.</p>
        `,
      },
    ],
  },
  {
    id: 'conduta',
    titulo: 'Marca, conduta e penalidades',
    descricao: 'Como representar a Agzap, o que é proibido e as consequências.',
    cor: 'bg-orange-500',
    secoes: [
      {
        numero: '8',
        id: 'representacao',
        titulo: 'Representação da marca Agzap',
        conteudo: lista([
          'Agir com ética, honestidade e profissionalismo em todas as interações com clientes e potenciais clientes;',
          'não prometer funcionalidades, prazos ou condições que não existam na plataforma;',
          'não denegrir, difamar ou prejudicar a imagem da Agzap, de seus clientes ou de outros parceiros;',
          'não se apresentar como funcionário ou representante legal da Agzap.',
        ]),
      },
      {
        numero: '9',
        id: 'condutas-proibidas',
        titulo: 'Condutas proibidas',
        conteudo: `
          <p>É ${b('expressamente proibido')} ao Parceiro, sob pena de suspensão imediata e demais sanções:</p>
          ${lista([
            `${b('tentar burlar, manipular ou explorar falhas')} do sistema, do painel, das APIs ou do banco de dados da Agzap, incluindo qualquer tentativa de gerar crédito, alterar saldo, mover vencimento, liberar módulo, ampliar limite ou ativar cliente fora do fluxo oficial do painel;`,
            `criar, ativar, renovar ou modificar contas de cliente por ${b('requisição direta à API, ao banco de dados, a scripts ou a automações')} não fornecidos oficialmente pela Agzap para essa finalidade;`,
            `${b('explorar uma falha encontrada')} em vez de comunicá-la imediatamente à Agzap; encontrar um erro que gere vantagem e usá-lo é conduta dolosa, não descuido;`,
            'contornar, remover ou neutralizar mecanismos de licenciamento, autenticação ou controle de acesso da plataforma, bem como praticar engenharia reversa não autorizada;',
            'tentar acessar clientes, saldos ou dados de outro parceiro, ou áreas administrativas da Agzap;',
            'compartilhar suas credenciais de acesso com terceiros, ou usar credenciais de terceiros;',
            'usar indevidamente dados pessoais de clientes, em desacordo com a cláusula 11 e com a LGPD (Lei nº 13.709/2018);',
            'praticar spam, publicidade enganosa ou abordagens abusivas em nome da Agzap.',
          ])}
          <p>${b('Tudo é registrado.')} Cada operação no portal grava autoria, data, hora, endereço IP e o estado anterior e posterior do dado em trilha de auditoria permanente, e os registros de acesso são mantidos nos termos do art. 15 da Lei nº 12.965/2014 (Marco Civil da Internet). Divergências entre saldo, consumo e renovações são conferidas periodicamente pela Agzap.</p>
        `,
      },
      {
        numero: '10',
        id: 'penalidades',
        titulo: 'Penalidades e responsabilização',
        conteudo: `
          <p>O descumprimento de qualquer regra deste Termo poderá resultar em ${b('suspensão ou desligamento do programa, sem aviso prévio')}. Comprovada tentativa de burlar o sistema ou violação de dados, aplicam-se cumulativamente:</p>
          ${lista([
            `${b('banimento definitivo do Programa de Parceria')}, com encerramento imediato do acesso ao portal e sem direito a indenização;`,
            `${b('cancelamento dos créditos')} e reversão das ativações e renovações originadas da conduta; os clientes envolvidos voltam ao estado anterior;`,
            `${b('cobrança do valor de tabela')} de todas as licenças obtidas sem o devido pagamento, acrescida de perdas e danos e lucros cessantes;`,
            `${b('suspensão preventiva')} do acesso e das operações durante a apuração de qualquer suspeita ou divergência contábil, em processo administrativo interno com direito de manifestação;`,
            `${b('responsabilização civil e criminal')}, com uso dos registros de auditoria e de acesso como prova, e comunicação às autoridades competentes.`,
          ])}
          <p>A título de esclarecimento, e sem prejuízo de outros dispositivos aplicáveis ao caso concreto, condutas de manipulação de sistema informático podem caracterizar, na legislação brasileira:</p>
          ${lista([
            `${b('invasão de dispositivo informático')}: art. 154-A do Código Penal (Lei nº 12.737/2012, com redação da Lei nº 14.155/2021), reclusão de 1 a 4 anos e multa, com pena maior se houver prejuízo econômico ou obtenção de segredo comercial;`,
            `${b('estelionato e fraude eletrônica')}: art. 171, caput e § 2º-A do Código Penal (Lei nº 14.155/2021), reclusão de 4 a 8 anos e multa quando a vantagem ilícita é obtida por meio de dispositivo eletrônico ou informação fraudulenta;`,
            `${b('furto mediante fraude por meio eletrônico')}: art. 155, § 4º-B do Código Penal, reclusão de 4 a 8 anos e multa;`,
            `${b('falsidade ideológica')}: art. 299 do Código Penal, quando houver inserção ou alteração de declaração falsa em registro do sistema;`,
            `${b('violação de direito autoral de programa de computador')}: art. 12 da Lei nº 9.609/1998, inclusive quanto a burlar mecanismo de licenciamento, com pena agravada quando praticada com intuito de lucro;`,
            `${b('responsabilidade civil e enriquecimento sem causa')}: arts. 186, 187, 402, 403, 884 e 927 do Código Civil, com dever de reparar o dano e devolver o proveito obtido sem causa;`,
            `${b('sanções de proteção de dados')}: Lei nº 13.709/2018 (LGPD), se a conduta envolver dados pessoais de clientes.`,
          ])}
          <p>A responsabilidade alcança o Parceiro pessoa física ou jurídica, seus sócios, prepostos e qualquer terceiro que atue a seu mando ou com suas credenciais.</p>
        `,
      },
    ],
  },
  {
    id: 'dados',
    titulo: 'Dados, sigilo e LGPD',
    descricao: 'O que o Parceiro vê, o sigilo dos dados dos clientes (inclusive Delivery e Imóveis) e a LGPD.',
    cor: 'bg-pink-500',
    secoes: [
      {
        numero: '11',
        id: 'sigilo-lgpd',
        titulo: 'Sigilo e proteção dos dados dos clientes',
        conteudo: `
          <p>Os dados que os clientes colocam na plataforma, como mensagens, contatos, pedidos e endereços do Delivery, imóveis, proprietários, interessados e agendamentos, ${b('pertencem a cada cliente e ficam resguardados dentro da Agzap')}, protegidos pela LGPD (Lei nº 13.709/2018).</p>
          ${lista([
            `No portal, o Parceiro vê ${b('apenas dados cadastrais e de assinatura')} dos clientes vinculados a ele (nome da empresa, situação, vencimento e uso de recursos), nunca o conteúdo das contas.`,
            `Se um cliente der ao Parceiro acesso à própria conta (por exemplo, para implantação ou suporte), o Parceiro age ${b('em nome desse cliente e só para a tarefa autorizada')}: não pode copiar, exportar, guardar, vender, repassar ou usar esses dados para qualquer outra finalidade, inclusive para prospecção própria ou de terceiros.`,
            'As informações do portal (clientes, saldos, movimentações, materiais) são confidenciais e de uso exclusivo da parceria.',
            `Qualquer suspeita de vazamento, acesso indevido ou perda de dados deve ser comunicada à Agzap ${b('imediatamente, em até 24 horas')}, pelo canal oficial.`,
            'Encerrada a parceria ou o acesso concedido pelo cliente, o Parceiro deve apagar qualquer dado de cliente que tenha em seu poder.',
            'O sigilo vale durante a parceria e por 5 anos depois do seu encerramento, sem prejuízo dos prazos legais.',
            'O Parceiro responde e indeniza a Agzap e os clientes por danos, multas e reclamações causados pelo uso indevido de dados, sem prejuízo da cláusula 10.',
          ])}
          <p>Os dados pessoais do próprio Parceiro (cadastro, acessos e aceites) são tratados pela Agzap conforme a ${link(URL_POLITICA_PRIVACIDADE, 'Política de Privacidade')}.</p>
        `,
      },
    ],
  },
  {
    id: 'continuidade',
    titulo: 'Continuidade',
    descricao: 'Morte, doença, falência ou força maior: o que acontece com o serviço, os clientes e os créditos.',
    cor: 'bg-violet-500',
    secoes: [
      {
        numero: '12',
        id: 'continuidade-agzap',
        titulo: 'Se algo acontecer com a Agzap',
        conteudo: `
          <p>Em caso de morte, doença ou incapacidade de sócios ou administradores da Agzap, recuperação judicial, falência ou evento de força maior que afete a empresa, a plataforma ${b('continua sendo operada')} pelos sócios remanescentes, administradores, sucessores legais ou pessoas formalmente autorizadas pela Agzap (ou nomeadas pela Justiça), que assumem as obrigações deste Termo. Os dados dos clientes continuam protegidos com o mesmo sigilo, e o saldo de créditos e o vínculo dos clientes do Parceiro são preservados. Em recuperação judicial ou falência, valem as regras da Lei nº 11.101/2005.</p>
        `,
      },
      {
        numero: '13',
        id: 'continuidade-parceiro',
        titulo: 'Se algo acontecer com o Parceiro',
        conteudo: `
          <p>Em caso de morte, doença ou incapacidade do Parceiro, ou de recuperação judicial, falência, dissolução ou força maior que afete a empresa do Parceiro:</p>
          ${lista([
            `os ${b('clientes vinculados não ficam sem atendimento')}: as contas e os dados deles continuam na Agzap, ativos até o vencimento já pago, e a Agzap pode assumir o suporte e as renovações administrativamente;`,
            `a carteira pode ser continuada por ${b('sócio, sucessor, inventariante, administrador judicial ou pessoa formalmente autorizada')}, mediante pedido pelo canal oficial, documentos que comprovem os poderes e novo aceite deste Termo;`,
            `até a confirmação, a Agzap pode suspender o acesso ao portal e ${b('não entrega dados a quem não comprovar poderes')};`,
            'créditos não consumidos são tratados com quem comprovar a sucessão, nos termos da cláusula 16.',
          ])}
        `,
      },
    ],
  },
  {
    id: 'gerais',
    titulo: 'Regras gerais',
    descricao: 'Infraestrutura de terceiros, suporte, alterações, encerramento e foro.',
    cor: 'bg-slate-500',
    secoes: [
      {
        numero: '14',
        id: 'infraestrutura',
        titulo: 'Infraestrutura de terceiros',
        conteudo: `
          <p>A plataforma depende de APIs oficiais da Meta (WhatsApp) e de outros fornecedores de infraestrutura. Mudanças de política, indisponibilidade, bloqueio de número ou alteração de regras por parte desses terceiros estão fora do controle da Agzap e não geram direito a devolução de créditos. Consultoria técnica avançada, quando oferecida, é opcional e pode ser cobrada à parte.</p>
        `,
      },
      {
        numero: '15',
        id: 'suporte',
        titulo: 'Suporte e treinamento',
        conteudo: lista([
          'A Agzap disponibiliza aulas, materiais de divulgação e suporte ao Parceiro pelo portal;',
          `o suporte ao ${b('cliente final')} é de responsabilidade primária do Parceiro, que pode escalar à Agzap questões técnicas da plataforma.`,
        ]),
      },
      {
        numero: '16',
        id: 'alteracoes-vigencia',
        titulo: 'Alterações, vigência e encerramento',
        conteudo: lista([
          'A Agzap pode atualizar este Termo; alterações relevantes são comunicadas pelo portal e exigem novo aceite;',
          'a parceria pode ser encerrada por qualquer das partes a qualquer momento;',
          `no encerramento, ${b('créditos não consumidos')} serão tratados conforme negociação direta com a Agzap; créditos já consumidos não são reembolsáveis;`,
          'as obrigações de sigilo e proteção de dados (cláusula 11) continuam valendo após o encerramento.',
        ]),
      },
      {
        numero: '17',
        id: 'foro',
        titulo: 'Legislação aplicável e foro',
        conteudo: `
          <p>Este Termo é regido pelas leis brasileiras, incluindo o Código Civil, a LGPD (Lei nº 13.709/2018) e o Marco Civil da Internet (Lei nº 12.965/2014). Fica eleito o foro da comarca da sede da Agzap Systems LTDA para resolver qualquer questão oriunda deste Termo, com renúncia a qualquer outro.</p>
        `,
      },
    ],
  },
]

export const SECOES_TERMO_PARCEIRO: SecaoTermoParceiro[] = CATEGORIAS_TERMO_PARCEIRO.flatMap(c => c.secoes)
export const NUMERO_SECAO_CONTATO_PARCEIRO = '18'

// Texto das 2 caixas do aceite. O servidor monta e grava o texto EXATO
// (com nome e documento do Parceiro) em parceiro_termos_aceites.confirmacoes.
export function textosConfirmacaoParceiro(parceiro?: { nome?: string | null; documento?: string | null } | null): string[] {
  const emNome = parceiro?.nome ? `, em nome de ${parceiro.nome}${parceiro.documento ? ` (${parceiro.documento})` : ''}` : ''
  return [
    'Li o Termo do Parceiro da Agzap até o fim.',
    `Aceito o Termo do Parceiro, inclusive o consumo definitivo dos créditos (cláusula 4), as penalidades (cláusula 10) e as regras de sigilo e LGPD (cláusula 11)${emNome}.`,
  ]
}

// Texto canônico (sem HTML) — o mesmo cálculo roda no navegador (texto
// enviado no aceite) e no script que gera HASH_TERMO_PARCEIRO_OFICIAL.
export function textoCanonicoTermoParceiro(): string {
  const limpar = (html: string) =>
    html
      .replace(/<br\s*\/?>/g, '\n')
      .replace(/<li[^>]*>/g, '\n- ')
      .replace(/<\/t[dh]>/g, ' | ')
      .replace(/<\/(p|div|ul|li|tr)>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n')
      .split('\n').map(l => l.trim()).filter(Boolean).join('\n')
  const partes = [`Termo do Parceiro da Agzap — versão ${VERSAO_TERMO_PARCEIRO}`]
  for (const s of SECOES_TERMO_PARCEIRO) partes.push(`${s.numero}. ${s.titulo}\n${limpar(s.conteudo)}`)
  return partes.join('\n\n')
}
