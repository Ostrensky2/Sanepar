"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  BookOpen,
  ChevronRight,
  DatabaseZap,
  FileText,
  HelpCircle,
  LockKeyhole,
  MapPinned,
  MapPin,
  MessageSquareText,
  Search,
  Target,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type HelpModule = {
  title: string;
  short: string;
  icon: LucideIcon;
  purpose: string;
  whenToUse: string[];
  primaryTasks: Array<{ title: string; steps: string[] }>;
  controls: Array<{ label: string; detail: string }>;
  notes: string[];
  troubleshooting: Array<{ issue: string; action: string }>;
  keywords: string[];
};

const helpModules: HelpModule[] = [
  {
    title: "Início",
    short: "Painel operacional e documentos recentes",
    icon: BookOpen,
    purpose:
      "Reúne a leitura diária do sistema: mapa operacional, situação territorial, legenda de risco e os últimos documentos adicionados ou alterados.",
    whenToUse: [
      "Comece por aqui quando quiser entender o estado geral do monitoramento.",
      "Use o mapa para localizar pontos críticos, pontos efetivos e distribuição espacial.",
      "Confira o painel Documentos para acessar rapidamente os 10 arquivos mais recentes.",
    ],
    primaryTasks: [
      {
        title: "Ler o mapa operacional",
        steps: [
          "Observe a distribuição dos marcadores no mapa.",
          "Use a legenda para separar baixo, médio e alto risco.",
          "Aproxime a região de interesse quando houver concentração de pontos.",
          "Abra o módulo Campanhas ou Pontos se precisar consultar a origem tabular.",
        ],
      },
      {
        title: "Consultar arquivos recentes",
        steps: [
          "Desça até o painel Documentos no Início.",
          "Confira nome do arquivo e data de inclusão ou alteração.",
          "Abra o módulo Documentos para filtrar, compartilhar, baixar ou remover links.",
        ],
      },
    ],
    controls: [
      { label: "Mapa", detail: "Mostra pontos e camadas operacionais disponíveis." },
      { label: "Legenda", detail: "Indica prioridade visual dos marcadores." },
      { label: "Documentos recentes", detail: "Lista os últimos 10 arquivos registrados no app." },
    ],
    notes: [
      "O Início é leitura operacional, não tela de edição.",
      "Dados ausentes no mapa normalmente indicam que a planilha de campo ainda não foi publicada.",
    ],
    troubleshooting: [
      {
        issue: "Mapa sem pontos",
        action: "Verifique no módulo Dados se há planilha de Campo importada e publicada.",
      },
      {
        issue: "Documento recente não aparece",
        action: "Abra Documentos e confirme se o link foi salvo com sucesso.",
      },
    ],
    keywords: ["mapa", "inicio", "documentos recentes", "risco", "painel"],
  },
  {
    title: "Campanhas",
    short: "Campanhas sazonais e resultados vinculados",
    icon: MapPin,
    purpose:
      "Permite alternar campanhas, verificar status, pontos previstos e efetivos, planilhas associadas e painéis analíticos da campanha selecionada.",
    whenToUse: [
      "Use quando precisar analisar uma campanha sazonal específica.",
      "Compare pontos planejados, pontos efetivos e disponibilidade de planilhas.",
      "Confirme se resultados laboratoriais já foram incorporados.",
    ],
    primaryTasks: [
      {
        title: "Selecionar campanha",
        steps: [
          "Use o seletor superior de campanha.",
          "Escolha a campanha desejada pelo nome e estação.",
          "Aguarde a atualização das métricas, mapa e painéis inferiores.",
        ],
      },
      {
        title: "Validar disponibilidade de dados",
        steps: [
          "Confira o card Planilha de campo.",
          "Confira o card Planilha de resultados.",
          "Se algum item estiver zerado ou aguardando, importe a planilha correspondente em Dados.",
        ],
      },
      {
        title: "Interpretar resultados",
        steps: [
          "Use Resumo Analítico para visão consolidada.",
          "Use Parâmetros Críticos para identificar pendências laboratoriais.",
          "Use Evolução da Campanha quando houver série histórica suficiente.",
        ],
      },
    ],
    controls: [
      { label: "Campanha exibida", detail: "Troca todo o contexto da tela." },
      { label: "Status da campanha", detail: "Mostra se está concluída, em preparação ou aguardando calendário." },
      { label: "Mapa da campanha", detail: "Aparece quando há dados de campo publicados." },
    ],
    notes: [
      "Campanhas futuras aparecem como estrutura prevista até receberem dados.",
      "A importação em Dados é a fonte que libera visualizações de campo.",
    ],
    troubleshooting: [
      {
        issue: "Campanha aparece sem mapa",
        action: "Publique a planilha de Campo correspondente no módulo Dados.",
      },
      {
        issue: "Resultados aparecem como aguardando",
        action: "Importe ou publique a planilha de Resultados laboratoriais.",
      },
    ],
    keywords: ["campanha", "sazonal", "resultados", "planilha de campo", "laboratorio"],
  },
  {
    title: "Pontos de Coleta",
    short: "Tabela da planilha de campo",
    icon: MapPinned,
    purpose:
      "Exibe a tabela técnica dos pontos publicados, com campanha, código SIA, data, manancial, município e coordenadas efetivas.",
    whenToUse: [
      "Use quando precisar conferir registros linha a linha.",
      "Use para checar coordenadas, municípios, datas ou códigos SIA.",
      "Use como apoio quando o mapa mostrar algum ponto fora do esperado.",
    ],
    primaryTasks: [
      {
        title: "Conferir pontos importados",
        steps: [
          "Verifique os cards superiores para totais e origem ativa.",
          "Use a tabela para conferir campanha, código e ponto.",
          "Compare latitude e longitude quando houver suspeita de erro de localização.",
        ],
      },
      {
        title: "Investigar dados ausentes",
        steps: [
          "Procure campos com Não informado.",
          "Corrija a planilha de origem no módulo Dados.",
          "Publique novamente a planilha corrigida.",
        ],
      },
    ],
    controls: [
      { label: "Origem ativa", detail: "Informa se a tabela vem da nuvem ou da base local embarcada." },
      { label: "Tabela", detail: "Mostra registros publicados em formato auditável." },
      { label: "Coordenadas", detail: "Mostram latitude e longitude efetivas quando disponíveis." },
    ],
    notes: [
      "Esta tela não edita pontos diretamente.",
      "Alterações permanentes devem vir da planilha publicada em Dados.",
    ],
    troubleshooting: [
      {
        issue: "Tabela vazia",
        action: "Importe e publique uma planilha de Campo no módulo Dados.",
      },
      {
        issue: "Coordenada não informada",
        action: "Revise as colunas de latitude e longitude na planilha de origem.",
      },
    ],
    keywords: ["pontos", "coleta", "sia", "coordenadas", "latitude", "longitude"],
  },
  {
    title: "Ações pontuais",
    short: "Demandas específicas com pontos, fotos e documentos",
    icon: Target,
    purpose:
      "Organiza campanhas sob demanda, com pontos vinculados, mapa específico, resultados, fotos e documentos de evidência.",
    whenToUse: [
      "Use para demandas fora do ciclo sazonal normal.",
      "Use quando uma ocorrência precisar de registro próprio e evidências.",
      "Use para consultar fotos, resultados e documento oficial do evento.",
    ],
    primaryTasks: [
      {
        title: "Abrir uma ação registrada",
        steps: [
          "Escolha a ação no seletor superior.",
          "Confira os cards de pontos, resultados e fotos.",
          "Clique em um ponto no mapa para trocar a ficha lateral.",
        ],
      },
      {
        title: "Analisar evidências",
        steps: [
          "Abra a ficha do ponto selecionado.",
          "Leia objetivos e resultados.",
          "Clique nas fotos para ampliar.",
          "Abra o documento do evento quando houver link vinculado.",
        ],
      },
      {
        title: "Cadastrar ou corrigir ação",
        steps: [
          "Vá ao módulo Dados.",
          "Use a área de ações pontuais para criar ou editar o evento.",
          "Salve pontos, resultados, links de fotos e documento vinculado.",
        ],
      },
    ],
    controls: [
      { label: "Ação exibida", detail: "Troca a demanda operacional em análise." },
      { label: "Mapa", detail: "Mostra somente pontos da ação selecionada." },
      { label: "Galeria de fotos", detail: "Amplia evidências associadas ao ponto." },
    ],
    notes: [
      "Fotos e documentos são links externos, normalmente do Dropbox.",
      "A consistência da ação depende do cadastro completo no módulo Dados.",
    ],
    troubleshooting: [
      {
        issue: "Ação não aparece",
        action: "Confirme se ela foi salva em Dados e se a sincronização local ou nuvem ocorreu.",
      },
      {
        issue: "Foto não carrega",
        action: "Verifique se o link do Dropbox está acessível e compartilhado corretamente.",
      },
    ],
    keywords: ["acao pontual", "fotos", "evidencias", "demanda", "resultados"],
  },
  {
    title: "Dados",
    short: "Importação, publicação e entrada manual",
    icon: DatabaseZap,
    purpose:
      "É o módulo de alimentação do sistema. Nele entram planilhas de campo, resultados, documentos tabulares e registros manuais de ações pontuais.",
    whenToUse: [
      "Use para importar planilhas que alimentam mapas, tabelas e painéis.",
      "Use para revisar prévias antes de publicar.",
      "Use para registrar ações pontuais quando a demanda não vier de planilha sazonal.",
    ],
    primaryTasks: [
      {
        title: "Importar planilha",
        steps: [
          "Escolha o tipo de importação adequado.",
          "Selecione o arquivo local.",
          "Confira a prévia gerada pelo app.",
          "Publique apenas quando os campos principais estiverem corretos.",
        ],
      },
      {
        title: "Publicar dados revisados",
        steps: [
          "Confira totais, colunas reconhecidas e registros inválidos.",
          "Corrija a planilha se a prévia indicar ausência de campos obrigatórios.",
          "Use publicar para tornar os dados visíveis nos módulos operacionais.",
        ],
      },
      {
        title: "Registrar ação pontual",
        steps: [
          "Abra o formulário de ação pontual.",
          "Informe nome do evento, objetivos, pontos e resultados.",
          "Inclua links de fotos e documento oficial, quando houver.",
          "Salve para liberar a consulta em Ações pontuais.",
        ],
      },
    ],
    controls: [
      { label: "Importação", detail: "Recebe planilhas e gera prévia validada." },
      { label: "Publicação", detail: "Torna os dados importados disponíveis no app." },
      { label: "Repositório de planilhas", detail: "Mantém controle dos arquivos tabulares associados." },
    ],
    notes: [
      "Somente categorias autorizadas devem importar ou excluir dados.",
      "A publicação substitui a leitura operacional dos módulos dependentes.",
    ],
    troubleshooting: [
      {
        issue: "Planilha não valida",
        action: "Confira cabeçalhos, tipo de arquivo e colunas obrigatórias.",
      },
      {
        issue: "Dados importados não aparecem no mapa",
        action: "Confirme se a etapa de publicação foi concluída.",
      },
    ],
    keywords: ["dados", "importar", "publicar", "planilha", "xlsx", "csv"],
  },
  {
    title: "Documentos",
    short: "Links oficiais, filtros e compartilhamento",
    icon: FileText,
    purpose:
      "Centraliza documentos oficiais do projeto por meio de links, mantendo busca, filtros, seleção, compartilhamento e abertura rápida.",
    whenToUse: [
      "Use para inserir links oficiais do Dropbox.",
      "Use para localizar relatórios, laudos, mapas, apresentações e documentos institucionais.",
      "Use para compartilhar ou baixar uma seleção de documentos.",
    ],
    primaryTasks: [
      {
        title: "Inserir documento",
        steps: [
          "Clique em inserir link.",
          "Informe título, link do Dropbox, tipo, campanha e observação.",
          "Salve e confirme se o item apareceu na lista.",
        ],
      },
      {
        title: "Encontrar documento",
        steps: [
          "Escolha a aba de tipo documental.",
          "Use busca por título, campanha, ponto ou status.",
          "Ajuste a ordenação numérica ou alfabética quando necessário.",
        ],
      },
      {
        title: "Compartilhar ou baixar",
        steps: [
          "Marque um ou mais documentos.",
          "Use Compartilhamento, Copiar links ou Download.",
          "Para abrir só um item, use o ícone de visualização na linha.",
        ],
      },
    ],
    controls: [
      { label: "Abas", detail: "Filtram por Plano de trabalho, Relatórios, Apresentações, Laudos, Mapas e Institucionais." },
      { label: "Busca", detail: "Localiza documentos por texto." },
      { label: "Ações por linha", detail: "Abrir, baixar, compartilhar, copiar link ou excluir." },
    ],
    notes: [
      "O arquivo permanece no Dropbox; o app guarda o link e os metadados.",
      "Evite cadastrar planilhas neste módulo; planilhas pertencem ao módulo Dados.",
    ],
    troubleshooting: [
      {
        issue: "Link recusado",
        action: "Use um endereço válido do Dropbox ou Dropboxusercontent.",
      },
      {
        issue: "Documento não sincroniza",
        action: "Verifique se o app está em modo nuvem ou se o navegador manteve o armazenamento local.",
      },
    ],
    keywords: ["documentos", "dropbox", "relatorio", "laudo", "mapa", "link"],
  },
  {
    title: "Configurações",
    short: "Acesso, backups, diagnóstico e permissões",
    icon: LockKeyhole,
    purpose:
      "Concentra funções administrativas: pessoas autorizadas, matriz de privilégios, backups, atividade dos membros, diagnóstico, build e sincronização.",
    whenToUse: [
      "Use para cadastrar, editar ou remover pessoas autorizadas.",
      "Use para alterar categoria e permissões funcionais.",
      "Use para executar backups manuais do app e acompanhar backups automáticos do banco.",
      "Use para diagnosticar dados, ambiente local, versão e sincronização.",
    ],
    primaryTasks: [
      {
        title: "Gerenciar pessoas autorizadas",
        steps: [
          "Use o formulário Pessoas autorizadas para cadastrar nome, e-mail, instituição e categoria.",
          "Novos cadastros entram ativos com senha provisória GIA26.",
          "Use editar para alterar nome, e-mail ou categoria.",
          "Use os controles de status, senha e exclusão conforme a necessidade administrativa.",
        ],
      },
      {
        title: "Ajustar privilégios por categoria",
        steps: [
          "Abra Perfis e permissões.",
          "Revise as categorias Admin, Sanepar, UFPR e ATGC.",
          "Ative ou desative funções conforme a matriz operacional.",
          "Evite remover privilégio essencial de Admin para não bloquear a administração.",
        ],
      },
      {
        title: "Operar backups",
        steps: [
          "Use backup manual do APP apenas no localhost.",
          "O backup automático do BD roda diariamente às 12:15 no host configurado.",
          "A retenção mensal preserva os dias 01 e 15 e descarta os demais ao final do mês.",
          "Use restauração do BD com atenção, pois é fluxo administrativo sensível.",
        ],
      },
      {
        title: "Executar diagnóstico",
        steps: [
          "Abra o painel Diagnóstico.",
          "Clique em Verificar agora.",
          "Confira pontos, campanhas, documentos e backups.",
          "Se houver alerta, siga a orientação exibida ou revise o módulo de origem.",
        ],
      },
    ],
    controls: [
      { label: "Pessoas autorizadas", detail: "Cadastro, edição, categoria, senha inicial e status." },
      { label: "Backups", detail: "APP manual, BD automático, retenção e restauração." },
      { label: "Build & Sync Diagnostics", detail: "Mostra versão, commit, ambiente, pendências e sincronização." },
      { label: "Diagnóstico", detail: "Verifica integridade operacional dos dados principais." },
    ],
    notes: [
      "Configurações é área administrativa; alterações afetam a operação inteira.",
      "Backups locais dependem de localhost e do host operacional configurado.",
      "A versão atual é atualizada sempre que o app recebe alteração.",
    ],
    troubleshooting: [
      {
        issue: "Botões de backup desabilitados",
        action: "Acesse pelo localhost no host operacional.",
      },
      {
        issue: "Usuário não acessa função",
        action: "Confira a categoria em Pessoas autorizadas e a matriz de privilégios.",
      },
      {
        issue: "Diagnóstico com alerta",
        action: "Abra o módulo indicado pelo card e corrija a fonte de dados.",
      },
    ],
    keywords: ["configuracoes", "usuarios", "permissoes", "backup", "diagnostico", "versao"],
  },
  {
    title: "Solicitações",
    short: "Demandas Sanepar, status e respostas no sistema",
    icon: MessageSquareText,
    purpose:
      "Organiza pedidos encaminhados à ATGC em formato rastreável, com prioridade, status, solicitante, descrição e resposta registrada no próprio sistema.",
    whenToUse: [
      "Use para registrar demandas, dúvidas, ajustes ou pendências que precisam de acompanhamento.",
      "Use quando a solicitação precisa permanecer visível para a equipe, com histórico de atendimento.",
      "Use para registrar o retorno da ATGC dentro do próprio APP e manter o e-mail apenas como aviso auxiliar.",
    ],
    primaryTasks: [
      {
        title: "Registrar solicitação",
        steps: [
          "Informe assunto, solicitante, instituição, tipo e prioridade.",
          "Use Instituição para indicar a direção da comunicação: Sanepar para ATGC ou ATGC para Sanepar.",
          "Descreva a demanda com tela, campanha, ponto, documento ou dado relacionado.",
          "Registre a solicitação para que ela entre na lista de acompanhamento.",
        ],
      },
      {
        title: "Acompanhar atendimento",
        steps: [
          "Use o filtro de status para separar demandas novas, em andamento e concluídas.",
          "Abra uma solicitação para consultar detalhes e atualização mais recente.",
          "Atualize o status conforme a análise evoluir.",
        ],
      },
      {
        title: "Registrar resposta",
        steps: [
          "Selecione a solicitação em atendimento.",
          "Use um modelo de resposta, se ele ajudar no encaminhamento.",
          "Edite o texto no campo Resposta registrada.",
          "Salve a resposta para preservar o histórico do atendimento no sistema.",
        ],
      },
    ],
    controls: [
      { label: "Nova solicitação", detail: "Registra a demanda com classificação e descrição operacional." },
      { label: "Instituição", detail: "Define se o aviso por e-mail vai para a ATGC ou para a Sanepar." },
      { label: "Acompanhamento", detail: "Lista solicitações por status e prioridade." },
      { label: "Status", detail: "Atualiza o andamento da demanda selecionada." },
      { label: "Resposta registrada", detail: "Guarda o retorno da ATGC na própria solicitação." },
      { label: "Aviso por e-mail", detail: "Abre e-mail pré-preenchido para alertar a equipe responsável." },
    ],
    notes: [
      "O registro no APP deve ser a fonte organizada da demanda e da resposta.",
      "A versão atual guarda solicitações no navegador. Integração com banco e notificações reais pode ser adicionada depois.",
      "Pedidos formais ou institucionais ainda devem respeitar os canais administrativos combinados entre as equipes.",
    ],
    troubleshooting: [
      {
        issue: "Solicitação não aparece em outro computador",
        action: "A versão inicial salva no navegador local; para uso compartilhado será necessário ligar o módulo ao banco.",
      },
      {
        issue: "E-mail não abre",
        action: "Confira se há aplicativo ou conta de e-mail configurada no computador.",
      },
    ],
    keywords: ["solicitacoes", "demandas", "ticket", "resposta", "email", "status"],
  },
];

const generalTopics = [
  {
    title: "Como usar este Ajuda",
    body: "Selecione um módulo na coluna lateral para ver rotinas, controles, regras e solução de problemas. A busca encontra tópicos por módulo, ação ou palavra-chave.",
  },
  {
    title: "Fluxo básico do app",
    body: "Dados alimenta o sistema, Início mostra a visão operacional, Campanhas e Pontos detalham a base de campo, Documentos guarda links oficiais e Configurações administra acesso, backups e diagnóstico.",
  },
  {
    title: "Onde editar informações",
    body: "Edite dados de campo em Dados, documentos em Documentos e usuários em Configurações. Telas de consulta, como Início e Pontos, evitam edição direta para preservar rastreabilidade.",
  },
];

export default function AjudaPage() {
  const [query, setQuery] = useState("");
  const [activeTitle, setActiveTitle] = useState(helpModules[0].title);
  const normalizedQuery = normalize(query);
  const filteredModules = useMemo(() => {
    if (!normalizedQuery) {
      return helpModules;
    }

    return helpModules.filter((module) => normalize(searchableText(module)).includes(normalizedQuery));
  }, [normalizedQuery]);
  const activeModule =
    filteredModules.find((module) => module.title === activeTitle) ??
    filteredModules[0] ??
    helpModules.find((module) => module.title === activeTitle) ??
    helpModules[0];
  const ActiveIcon = activeModule.icon;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5">
      <section className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5">
        <div className="grid gap-4 lg:grid-cols-[1fr_minmax(340px,0.52fr)] lg:items-center">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-blue-soft)] text-[var(--brand-navy)]">
              <HelpCircle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--brand-teal)]">
                Central de suporte
              </p>
              <h1 className="heading-font mt-1 text-2xl font-black text-[var(--brand-navy-strong)]">
                Ajuda do Yva&apos;e
              </h1>
              <p className="mt-1 max-w-2xl text-justify text-sm leading-6 text-[var(--ink-soft)]">
                Guia operacional por módulo, com instruções de uso, controles e correção de problemas.
              </p>
            </div>
          </div>
          <label className="flex h-11 items-center gap-3 rounded-xl border border-[var(--line-strong)] bg-white px-4">
            <Search className="h-4 w-4 text-[var(--ink-soft)]" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-sm font-semibold outline-none"
              placeholder="Buscar módulo, ação, erro ou palavra-chave..."
            />
          </label>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <aside className="rounded-2xl border border-[var(--line-ghost)] bg-white/90 p-4 xl:sticky xl:top-4 xl:self-start">
          <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--ink-soft)]">
            Módulos
          </p>
          <div className="mt-3 grid gap-2">
            {filteredModules.map((module) => {
              const Icon = module.icon;
              const isActive = module.title === activeModule.title;

              return (
                <button
                  key={module.title}
                  type="button"
                  onClick={() => setActiveTitle(module.title)}
                  className={cn(
                    "grid grid-cols-[36px_1fr_auto] items-center gap-3 rounded-xl border px-3 py-3 text-left transition",
                    isActive
                      ? "border-[var(--brand-teal)] bg-[var(--brand-teal-soft)]"
                      : "border-transparent hover:border-[var(--line-ghost)] hover:bg-[var(--surface-soft)]",
                  )}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[var(--brand-teal)] shadow-sm">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-black text-[var(--brand-navy-strong)]">
                      {module.title}
                    </span>
                    <span className="mt-0.5 block truncate text-[11px] font-semibold text-[var(--ink-soft)]">
                      {module.short}
                    </span>
                  </span>
                  <ChevronRight className={cn("h-4 w-4 text-[var(--ink-soft)]", isActive && "text-[var(--brand-teal)]")} />
                </button>
              );
            })}
          </div>

          {!filteredModules.length ? (
            <div className="mt-4 rounded-xl border border-dashed border-[var(--line-strong)] bg-[var(--surface-soft)] p-4 text-sm font-semibold text-[var(--ink-soft)]">
              Nenhum módulo encontrado.
            </div>
          ) : null}
        </aside>

        <div className="space-y-4">
          <section className="grid gap-4 lg:grid-cols-3">
            {generalTopics.map((topic) => (
              <article key={topic.title} className="rounded-2xl border border-[var(--line-ghost)] bg-white/88 p-4">
                <p className="text-sm font-black text-[var(--brand-navy-strong)]">{topic.title}</p>
                <p className="mt-2 text-justify text-sm leading-6 text-[var(--ink-soft)]">{topic.body}</p>
              </article>
            ))}
          </section>

          <article className="rounded-2xl border border-[var(--line-ghost)] bg-white/92 p-5">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--line-ghost)] pb-4">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-teal-soft)] text-[var(--brand-teal)]">
                  <ActiveIcon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--brand-teal)]">
                    Módulo selecionado
                  </p>
                  <h2 className="heading-font mt-1 text-2xl font-black text-[var(--brand-navy-strong)]">
                    {activeModule.title}
                  </h2>
                  <p className="mt-2 max-w-3xl text-justify text-sm leading-6 text-[var(--ink-soft)]">
                    {activeModule.purpose}
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-black text-[var(--brand-navy-strong)]">
                {activeModule.primaryTasks.length} rotinas
              </span>
            </header>

            <div className="mt-5 grid gap-5 2xl:grid-cols-[1fr_360px]">
              <div className="space-y-5">
                <HelpBlock title="Quando usar">
                  <ul className="grid gap-2">
                    {activeModule.whenToUse.map((item) => (
                      <li key={item} className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-justify text-sm font-semibold leading-6 text-[var(--brand-navy-strong)]">
                        {item}
                      </li>
                    ))}
                  </ul>
                </HelpBlock>

                <HelpBlock title="Rotinas principais">
                  <div className="grid gap-3">
                    {activeModule.primaryTasks.map((task, index) => (
                      <section key={task.title} className="rounded-xl border border-[var(--line-ghost)] bg-white p-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[var(--brand-blue-soft)] text-xs font-black text-[var(--brand-navy)]">
                            {index + 1}
                          </span>
                          <h3 className="text-sm font-black text-[var(--brand-navy-strong)]">{task.title}</h3>
                        </div>
                        <ol className="mt-3 grid gap-2">
                          {task.steps.map((step) => (
                            <li key={step} className="grid grid-cols-[18px_1fr] gap-2 text-justify text-sm leading-6 text-[var(--ink-soft)]">
                              <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--brand-teal)]" />
                              <span>{step}</span>
                            </li>
                          ))}
                        </ol>
                      </section>
                    ))}
                  </div>
                </HelpBlock>
              </div>

              <aside className="space-y-4">
                <HelpBlock title="Controles da tela">
                  <div className="grid gap-2">
                    {activeModule.controls.map((control) => (
                      <div key={control.label} className="rounded-xl border border-[var(--line-ghost)] bg-white p-3">
                        <p className="text-xs font-black text-[var(--brand-navy-strong)]">{control.label}</p>
                        <p className="mt-1 text-justify text-xs leading-5 text-[var(--ink-soft)]">{control.detail}</p>
                      </div>
                    ))}
                  </div>
                </HelpBlock>

                <HelpBlock title="Regras importantes">
                  <ul className="grid gap-2">
                    {activeModule.notes.map((note) => (
                      <li key={note} className="rounded-xl bg-[var(--surface-soft)] px-3 py-2 text-justify text-xs font-semibold leading-5 text-[var(--ink-soft)]">
                        {note}
                      </li>
                    ))}
                  </ul>
                </HelpBlock>

                <HelpBlock title="Problemas comuns">
                  <div className="grid gap-2">
                    {activeModule.troubleshooting.map((item) => (
                      <div key={item.issue} className="rounded-xl border border-[rgba(197,122,0,0.24)] bg-[rgba(197,122,0,0.05)] p-3">
                        <p className="text-xs font-black text-[var(--brand-navy-strong)]">{item.issue}</p>
                        <p className="mt-1 text-justify text-xs leading-5 text-[var(--ink-soft)]">{item.action}</p>
                      </div>
                    ))}
                  </div>
                </HelpBlock>
              </aside>
            </div>
          </article>
        </div>
      </section>
    </div>
  );
}

function HelpBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-3 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--ink-soft)]">
        {title}
      </h3>
      {children}
    </section>
  );
}

function searchableText(module: HelpModule) {
  return [
    module.title,
    module.short,
    module.purpose,
    ...module.whenToUse,
    ...module.primaryTasks.flatMap((task) => [task.title, ...task.steps]),
    ...module.controls.flatMap((control) => [control.label, control.detail]),
    ...module.notes,
    ...module.troubleshooting.flatMap((item) => [item.issue, item.action]),
    ...module.keywords,
  ].join(" ");
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}
