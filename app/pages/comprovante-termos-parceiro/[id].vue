<script setup lang="ts">
// Comprovante de aceite eletrônico do Termo do Parceiro (09/10/2026).
// Mesmo modelo do comprovante dos Termos de Serviço das empresas: dados do
// aceite (data/hora com segundos, IP, navegador, versão, hash), as
// confirmações marcadas, como o aceite foi coletado, o link público do Termo
// e, em anexo, o texto INTEGRAL da versão aceita (snapshot de termos_versoes).
// PDF pela impressão do navegador ("Salvar como PDF").
import { URL_TERMO_PARCEIRO } from '~/constants/termosParceiro'

definePageMeta({
  middleware: ['auth', 'super-admin'],
  layout: false,
})

const route = useRoute()

interface Dados {
  aceite: {
    id: string
    parceiro_id: string
    auth_user_id: string
    versao_termos: string
    hash_termos: string
    hash_confere: boolean
    nome_assinante: string
    email_assinante: string | null
    documento_parceiro: string | null
    telefone_parceiro: string | null
    confirmacoes: string[] | null
    rolou_ate_o_fim: boolean
    tempo_leitura_seg: number | null
    ip: string | null
    user_agent: string | null
    aceito_em: string
  }
  versao: { versao: string; conteudo: string; oficial: boolean } | null
  parceiro: { nome: string | null; email: string | null; telefone: string | null; documento: string | null } | null
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
const nomeParceiro = computed(() => dados.value?.parceiro?.nome || a.value?.nome_assinante || '—')
const docParceiro = computed(() => dados.value?.parceiro?.documento || a.value?.documento_parceiro || '—')
const tempoLeitura = computed(() => {
  const s = a.value?.tempo_leitura_seg
  if (s == null) return '—'
  const m = Math.floor(s / 60)
  return m > 0 ? `${m} min ${s % 60} s` : `${s} s`
})
const confirmacoes = computed(() => (Array.isArray(a.value?.confirmacoes) ? a.value!.confirmacoes! : []))

async function carregar() {
  carregando.value = true
  erro.value = null
  try {
    const resp = await $fetch<{ success: boolean; data: Dados }>('/api/admin/parceiro-termos-aceite', {
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
useHead({ title: computed(() => `Comprovante de aceite do Termo do Parceiro — ${nomeParceiro.value !== '—' ? nomeParceiro.value : 'Agzap'}`) })

function imprimir() {
  window.print()
}

onMounted(carregar)
</script>

<template>
  <div class="comprovante-fundo min-h-screen bg-slate-100 py-8 px-4 text-slate-900">
    <!-- Barra de ações (não sai na impressão) -->
    <div class="nao-imprimir max-w-[210mm] mx-auto mb-4 flex items-center justify-between gap-3">
      <p class="text-sm text-slate-500">Comprovante para enviar como prova em disputa com o parceiro.</p>
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
          <p>painel.agzap.com.br</p>
        </div>
      </header>

      <div class="py-6 text-center">
        <h1 class="text-lg font-semibold tracking-wide">COMPROVANTE DE ACEITE ELETRÔNICO DO TERMO DO PARCEIRO</h1>
        <p class="text-[12px] text-slate-500 mt-1">Registro nº {{ a.id }} · emitido em {{ emitidoEm }} (horário de Brasília)</p>
      </div>

      <!-- 1. Partes -->
      <section class="mb-5">
        <h2 class="secao">1. Partes</h2>
        <table class="tabela">
          <tbody>
            <tr><th>Agzap</th><td>Agzap Systems LTDA (nome fantasia Agzap) — CNPJ 60.865.841/0001-93</td></tr>
            <tr><th>Parceiro</th><td>{{ nomeParceiro }} — CPF/CNPJ {{ docParceiro }}</td></tr>
            <tr><th>E-mail do parceiro</th><td>{{ dados.parceiro?.email || a.email_assinante || '—' }}</td></tr>
            <tr><th>Telefone</th><td>{{ dados.parceiro?.telefone || a.telefone_parceiro || '—' }}</td></tr>
          </tbody>
        </table>
      </section>

      <!-- 2. Registro do aceite -->
      <section class="mb-5">
        <h2 class="secao">2. Registro do aceite</h2>
        <table class="tabela">
          <tbody>
            <tr><th>Aceito por</th><td>{{ a.nome_assinante }}</td></tr>
            <tr><th>Data e hora</th><td><strong class="font-semibold">{{ dataHoraBR(a.aceito_em) }}</strong> (horário de Brasília, UTC−3)</td></tr>
            <tr><th>Data e hora (UTC)</th><td class="font-mono text-[12px]">{{ new Date(a.aceito_em).toISOString() }}</td></tr>
            <tr><th>Endereço IP</th><td class="font-mono text-[12px]">{{ a.ip || '—' }}</td></tr>
            <tr><th>Navegador / dispositivo</th><td class="text-[12px] break-all">{{ a.user_agent || '—' }}</td></tr>
            <tr><th>ID do parceiro</th><td class="font-mono text-[12px]">{{ a.parceiro_id }}</td></tr>
            <tr><th>ID do login</th><td class="font-mono text-[12px]">{{ a.auth_user_id }}</td></tr>
          </tbody>
        </table>
      </section>

      <!-- 3. Documento aceito -->
      <section class="mb-5">
        <h2 class="secao">3. Documento aceito</h2>
        <table class="tabela">
          <tbody>
            <tr><th>Documento</th><td>Termo do Parceiro da Agzap — versão {{ a.versao_termos }}</td></tr>
            <tr><th>Termo público</th><td><a :href="URL_TERMO_PARCEIRO" class="link">{{ URL_TERMO_PARCEIRO }}</a></td></tr>
            <tr><th>Código de integridade (SHA-256) do texto aceito</th><td class="font-mono text-[11px] break-all">{{ a.hash_termos }}</td></tr>
            <tr><th>Confere com a versão oficial</th><td>{{ a.hash_confere ? 'Sim — o texto exibido ao parceiro é idêntico à versão oficial publicada' : 'Não — ver texto exibido no anexo' }}</td></tr>
          </tbody>
        </table>
      </section>

      <!-- 4. Confirmações -->
      <section class="mb-5">
        <h2 class="secao">4. Confirmações marcadas pelo parceiro</h2>
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
          O aceite do Termo do Parceiro é uma etapa obrigatória do portal do parceiro da Agzap. Enquanto o parceiro não aceita
          a versão vigente, o portal fica bloqueado por uma tela de aceite que não pode ser fechada; quem não concorda só
          consegue sair da conta.
        </p>
        <p class="mb-2">
          Para concluir, o parceiro precisou rolar o texto integral do Termo até o fim (só então as opções são liberadas),
          marcar as duas confirmações acima e clicar em "Salvar e continuar". Leitura até o fim: <strong class="font-semibold">{{ a.rolou_ate_o_fim ? 'Sim' : 'Não' }}</strong>.
          Tempo com a tela de leitura aberta: <strong class="font-semibold">{{ tempoLeitura }}</strong>.
        </p>
        <p>
          O registro foi gravado pelo servidor da Agzap no momento do clique, com a data e a hora do servidor, e não pode ser
          alterado pelo parceiro. A cópia integral do texto aceito é guardada e reproduzida no anexo deste comprovante.
        </p>
      </section>

      <footer class="mt-8 pt-4 border-t border-slate-300 text-[11px] text-slate-500">
        Documento gerado pelo painel administrativo da Agzap Systems LTDA (nome fantasia Agzap, CNPJ 60.865.841/0001-93). O aceite eletrônico tem
        validade jurídica nos termos do art. 10, §2º, da MP nº 2.200-2/2001 e do art. 411, II, do Código de Processo Civil.
      </footer>

      <!-- Anexo: texto integral -->
      <section v-if="dados.versao?.conteudo" class="anexo mt-10 pt-6 border-t-2 border-slate-800">
        <h2 class="secao">Anexo — Texto integral do Termo do Parceiro aceito (versão {{ a.versao_termos }})</h2>
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
