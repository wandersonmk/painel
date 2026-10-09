<script setup lang="ts">
// Comprovante de aceite eletrônico dos Termos de Serviço (09/10/2026).
// Documento para enviar como prova em chargeback ou disputa: dados do aceite
// (data/hora com segundos, IP, navegador, versão, hash), as confirmações
// marcadas, como o aceite foi coletado, o link público dos Termos e, em
// anexo, o texto INTEGRAL da versão aceita (snapshot de termos_versoes).
// PDF pela impressão do navegador ("Salvar como PDF").
definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: false,
})

const route = useRoute()
const URL_TERMOS = 'https://app.agzap.com.br/termos-de-servico'
const URL_CLAUSULA_2 = `${URL_TERMOS}#cancelamento`

interface Dados {
  aceite: {
    id: string
    empresa_id: string
    auth_user_id: string
    versao_termos: string
    hash_termos: string
    hash_confere: boolean
    nome_assinante: string
    email_assinante: string | null
    nome_empresa: string | null
    documento_empresa: string | null
    li_termos: boolean
    aceito_termos: boolean
    aceito_cancelamento: boolean
    confirmacoes: string[] | null
    rolou_ate_o_fim: boolean
    tempo_leitura_seg: number | null
    ip: string | null
    user_agent: string | null
    aceito_em: string
  }
  versao: { versao: string; conteudo: string; oficial: boolean } | null
  empresa: { nome: string | null; cnpj: string | null; cpf: string | null; email: string | null } | null
}

const dados = ref<Dados | null>(null)
const carregando = ref(true)
const erro = ref<string | null>(null)
const emitidoEm = ref('')

const dataHoraBR = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })

const a = computed(() => dados.value?.aceite)
const nomeEmpresa = computed(() => dados.value?.empresa?.nome || a.value?.nome_empresa || '—')
const docEmpresa = computed(() => dados.value?.empresa?.cnpj || dados.value?.empresa?.cpf || a.value?.documento_empresa || '—')
const tempoLeitura = computed(() => {
  const s = a.value?.tempo_leitura_seg
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`
})
const confirmacoes = computed(() => {
  const c = a.value?.confirmacoes
  if (Array.isArray(c) && c.length) return c
  return [
    'Li os Termos de Serviço da Agzap até o fim.',
    'Aceito os Termos de Serviço, inclusive as regras de cancelamento, reembolso e chargeback (cláusula 2).',
  ]
})
// Trecho da cláusula 2 (cancelamento, reembolso e chargeback) tirado do texto
// EXATO aceito — do "2.1." até a cláusula 3.
const clausula2 = computed(() => {
  const t = dados.value?.versao?.conteudo || ''
  const ini = t.indexOf('\n\n2.1. ')
  const fim = t.indexOf('\n\n3. ', ini + 1)
  return ini >= 0 ? t.slice(ini + 2, fim > ini ? fim : undefined).trim() : ''
})

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    const resp = await $fetch<{ success: boolean; data: Dados }>('/api/admin/termos-aceite', {
      query: { id: route.params.id },
      headers: await useAdminAuthHeaders(),
    })
    dados.value = resp.data
    emitidoEm.value = dataHoraBR(new Date().toISOString())
  } catch (e: any) {
    erro.value = e?.statusMessage || e?.data?.statusMessage || 'Não foi possível carregar o comprovante.'
  } finally {
    carregando.value = false
  }
}

// Título vira o nome sugerido do PDF ao salvar.
useHead({ title: computed(() => `Comprovante de aceite dos Termos — ${nomeEmpresa.value !== '—' ? nomeEmpresa.value : 'Agzap'}`) })

function imprimir() {
  window.print()
}

onMounted(carregar)
</script>

<template>
  <div class="comprovante-fundo min-h-screen bg-slate-100 py-8 px-4 text-slate-900">
    <!-- Barra de ações (não sai na impressão) -->
    <div class="nao-imprimir max-w-[210mm] mx-auto mb-4 flex items-center justify-between gap-3">
      <p class="text-sm text-slate-500">Comprovante para enviar como prova (chargeback, Procon, processo).</p>
      <button
        type="button"
        :disabled="!dados"
        class="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-sm font-semibold disabled:opacity-50"
        @click="imprimir"
      >
        <i class="fa-solid fa-print" aria-hidden="true" />
        Imprimir / Salvar em PDF
      </button>
    </div>

    <div v-if="carregando" class="max-w-[210mm] mx-auto bg-white rounded-xl p-10 text-center text-slate-500">Carregando…</div>
    <div v-else-if="erro" class="max-w-[210mm] mx-auto bg-white rounded-xl p-10 text-center text-red-600">{{ erro }}</div>

    <article v-else-if="dados && a" id="folha-comprovante" class="max-w-[210mm] mx-auto bg-white shadow-sm rounded-xl px-10 py-10 text-[13px] leading-relaxed">
      <!-- Cabeçalho -->
      <header class="flex items-start justify-between gap-6 pb-5 border-b-2 border-slate-800">
        <img src="/logo.modoClaro.png" alt="Agzap" class="h-10 w-auto" />
        <div class="text-right text-[12px] text-slate-600">
          <p class="font-semibold text-slate-900">Agzap Systems LTDA</p>
          <p>Nome fantasia: Agzap</p>
          <p>CNPJ 60.865.841/0001-93</p>
          <p>contato@agzap.com.br · (11) 91460-0243</p>
          <p>app.agzap.com.br</p>
        </div>
      </header>

      <div class="py-6 text-center">
        <h1 class="text-lg font-semibold tracking-wide">COMPROVANTE DE ACEITE ELETRÔNICO DOS TERMOS DE SERVIÇO</h1>
        <p class="text-[12px] text-slate-500 mt-1">Registro nº {{ a.id }} · emitido em {{ emitidoEm }} (horário de Brasília)</p>
      </div>

      <!-- 1. Partes -->
      <section class="mb-5">
        <h2 class="secao">1. Partes</h2>
        <table class="tabela">
          <tbody>
            <tr><th>Contratada</th><td>Agzap Systems LTDA (nome fantasia Agzap) — CNPJ 60.865.841/0001-93</td></tr>
            <tr><th>Contratante</th><td>{{ nomeEmpresa }} — CPF/CNPJ {{ docEmpresa }}</td></tr>
            <tr><th>E-mail da conta</th><td>{{ dados.empresa?.email || a.email_assinante || '—' }}</td></tr>
          </tbody>
        </table>
      </section>

      <!-- 2. Quem aceitou e quando -->
      <section class="mb-5">
        <h2 class="secao">2. Registro do aceite</h2>
        <table class="tabela">
          <tbody>
            <tr><th>Aceito por</th><td>{{ a.nome_assinante }} (titular da conta)</td></tr>
            <tr><th>E-mail do titular</th><td>{{ a.email_assinante || '—' }}</td></tr>
            <tr><th>Data e hora</th><td><strong class="font-semibold">{{ dataHoraBR(a.aceito_em) }}</strong> (horário de Brasília, UTC−3)</td></tr>
            <tr><th>Data e hora (UTC)</th><td class="font-mono text-[12px]">{{ new Date(a.aceito_em).toISOString() }}</td></tr>
            <tr><th>Endereço IP</th><td class="font-mono text-[12px]">{{ a.ip || '—' }}</td></tr>
            <tr><th>Navegador / dispositivo</th><td class="text-[12px] break-all">{{ a.user_agent || '—' }}</td></tr>
            <tr><th>ID da conta</th><td class="font-mono text-[12px]">{{ a.empresa_id }}</td></tr>
            <tr><th>ID do usuário</th><td class="font-mono text-[12px]">{{ a.auth_user_id }}</td></tr>
          </tbody>
        </table>
      </section>

      <!-- 3. Documento aceito -->
      <section class="mb-5">
        <h2 class="secao">3. Documento aceito</h2>
        <table class="tabela">
          <tbody>
            <tr><th>Documento</th><td>Termos de Serviço da Agzap — versão {{ a.versao_termos }}</td></tr>
            <tr><th>Termos públicos</th><td><a :href="URL_TERMOS" class="link">{{ URL_TERMOS }}</a></td></tr>
            <tr><th>Cláusula 2 (cancelamento, reembolso e chargeback)</th><td><a :href="URL_CLAUSULA_2" class="link">{{ URL_CLAUSULA_2 }}</a></td></tr>
            <tr><th>Código de integridade (SHA-256) do texto aceito</th><td class="font-mono text-[11px] break-all">{{ a.hash_termos }}</td></tr>
            <tr><th>Confere com a versão oficial</th><td>{{ a.hash_confere ? 'Sim — o texto exibido ao titular é idêntico à versão oficial publicada' : 'Não — ver texto exibido no anexo' }}</td></tr>
          </tbody>
        </table>
      </section>

      <!-- 4. Confirmações -->
      <section class="mb-5">
        <h2 class="secao">4. Confirmações marcadas pelo titular</h2>
        <ul class="space-y-2">
          <li v-for="(c, i) in confirmacoes" :key="i" class="flex items-start gap-2">
            <span class="mt-0.5 inline-flex items-center justify-center w-4 h-4 border border-slate-700 text-[11px] leading-none flex-shrink-0">✓</span>
            <span>{{ c }}</span>
          </li>
        </ul>
      </section>

      <!-- 5. Como o aceite foi coletado -->
      <section class="mb-5">
        <h2 class="secao">5. Como o aceite foi coletado</h2>
        <p class="mb-2">
          O aceite dos Termos de Serviço é uma etapa obrigatória do sistema Agzap. Enquanto o titular da conta não aceita a
          versão vigente, o painel fica bloqueado por uma tela de aceite: sem concluí-la, não é possível utilizar a plataforma
          nem contratar o plano. Quem não concorda pode escolher "Não aceito", e o acesso continua bloqueado.
        </p>
        <p class="mb-2">
          Para concluir, o titular precisou rolar o texto integral dos Termos até o fim (só então as opções são liberadas),
          marcar que leu, escolher "Aceito" e clicar em "Salvar e continuar". Leitura até o fim: <strong class="font-semibold">{{ a.rolou_ate_o_fim ? 'Sim' : 'Não' }}</strong>.
          Tempo com a tela de leitura aberta: <strong class="font-semibold">{{ tempoLeitura }}</strong>.
        </p>
        <p>
          O registro foi gravado pelo servidor da Agzap no momento do clique, com a data e a hora do servidor, e não pode ser
          alterado pelo titular. A cópia integral do texto aceito é guardada e reproduzida no anexo deste comprovante.
        </p>
      </section>

      <!-- 6. Cláusula 2 -->
      <section v-if="clausula2" class="mb-5">
        <h2 class="secao">6. Regras de cancelamento, reembolso e chargeback aceitas (cláusula 2)</h2>
        <div class="whitespace-pre-wrap text-[12px] border border-slate-300 rounded-lg p-4 bg-slate-50">{{ clausula2 }}</div>
      </section>

      <footer class="mt-8 pt-4 border-t border-slate-300 text-[11px] text-slate-500">
        Documento gerado pelo painel administrativo da Agzap Systems LTDA (nome fantasia Agzap, CNPJ 60.865.841/0001-93). O aceite eletrônico tem
        validade jurídica nos termos do art. 10, §2º, da MP nº 2.200-2/2001 e do art. 411, II, do Código de Processo Civil.
      </footer>

      <!-- Anexo: texto integral -->
      <section v-if="dados.versao?.conteudo" class="anexo mt-10 pt-6 border-t-2 border-slate-800">
        <h2 class="secao">Anexo — Texto integral dos Termos de Serviço aceitos (versão {{ a.versao_termos }})</h2>
        <div class="whitespace-pre-wrap text-[11.5px] leading-relaxed">{{ dados.versao.conteudo }}</div>
      </section>
    </article>
  </div>
</template>

<style scoped>
.secao {
  font-size: 13px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #0f172a;
  margin-bottom: 0.5rem;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid #cbd5e1;
}
.tabela {
  width: 100%;
  border-collapse: collapse;
}
.tabela th {
  text-align: left;
  vertical-align: top;
  width: 38%;
  padding: 4px 10px 4px 0;
  font-weight: 500;
  color: #475569;
}
.tabela td {
  padding: 4px 0;
  color: #0f172a;
}
.tabela tr + tr th,
.tabela tr + tr td {
  border-top: 1px solid #f1f5f9;
}
.link {
  color: #6d28d9;
  text-decoration: underline;
  word-break: break-all;
}
</style>

<style>
@media print {
  @page { size: A4 portrait; margin: 14mm; }
  html, body { background: #fff !important; }
  .nao-imprimir { display: none !important; }
  .comprovante-fundo { background: #fff !important; padding: 0 !important; min-height: 0 !important; }
  #folha-comprovante {
    box-shadow: none !important;
    border-radius: 0 !important;
    padding: 0 !important;
    max-width: none !important;
  }
  #folha-comprovante tr, #folha-comprovante li { page-break-inside: avoid; }
  #folha-comprovante h2 { page-break-after: avoid; }
  #folha-comprovante .anexo { page-break-before: always; }
}
</style>
