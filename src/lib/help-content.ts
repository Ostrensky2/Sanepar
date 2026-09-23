/**
 * Conteúdo da Ajuda, compartilhado pela página /ajuda e pelo painel lateral
 * aberto pelo botão "?" em cada tela.
 */
import { BookOpen, DatabaseZap, FileText, FlaskConical, LockKeyhole, MapPin, NotebookPen, Target } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type HelpModule = {
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

export const helpModules: HelpModule[] = [
  {
    title: "Início",
    short: "Visão geral: números, evolução, mapa e campanhas",
    icon: BookOpen,
    purpose:
      "Mostra o estado do monitoramento de uma vez: os números da campanha mais recente, a evolução do índice entre campanhas, o mapa com o índice de cada ponto e o andamento das campanhas.",
    whenToUse: [
      "Comece por aqui para saber como está o monitoramento.",
      "Use a evolução para comparar campanhas ou acompanhar um ponto ao longo do tempo.",
      "Use o mapa para achar um ponto e abrir o resultado completo dele.",
    ],
    primaryTasks: [
      {
        title: "Acompanhar um ponto ao longo das campanhas",
        steps: [
          "Em Evolução do índice geral, digite o SIA, o manancial ou o município.",
          "Escolha a sugestão: as colunas passam a mostrar o valor do ponto em cada campanha.",
          "Coluna com faixa colorida = ponto parcial naquela campanha (faltou um conjunto).",
        ],
      },
      {
        title: "Ler o mapa do índice",
        steps: [
          "Escolha a campanha e o índice (geral, ambiental, operacional ou saúde humana).",
          "A cor do ponto é o índice, na escala de 0 a 1; o anel mostra quantos conjuntos entraram no cálculo.",
          "Clique num ponto para ver o painel com os valores e o botão Ver resultado completo.",
        ],
      },
    ],
    controls: [
      { label: "?", detail: "Ao lado de cada título, explica aquele bloco." },
      { label: "Evolução do índice geral", detail: "Média de cada campanha ou valores de um ponto escolhido." },
      { label: "Mapa do índice", detail: "Cor = índice de 0 a 1; anel = conjuntos usados." },
    ],
    notes: [
      "O Início é só consulta; nada é editado aqui.",
      "“Provisório” quer dizer que o laboratório ainda não informou a qualidade dos conjuntos.",
    ],
    troubleshooting: [
      {
        issue: "Ponto não aparece no mapa",
        action: "O ponto pode estar sem coordenada válida. Ele continua nos totais e nas tabelas de Campanhas e resultados.",
      },
      {
        issue: "Campanha sem coluna na evolução",
        action: "Os resultados dessa campanha ainda não foram publicados em Central de dados → Planilhas de resultados.",
      },
    ],
    keywords: ["mapa", "inicio", "evolucao", "indice", "painel"],
  },
  {
    title: "Campanhas e resultados",
    short: "Campo e resultados de cada campanha",
    icon: MapPin,
    purpose:
      "Reúne tudo de uma campanha em duas abas: Campo (percurso, calendário e diário) e Resultados (panorama, prioridades, organismos e fichas dos pontos).",
    whenToUse: [
      "Use para ver o que foi coletado, onde e quando.",
      "Use para saber quais pontos pedem atenção primeiro e por quê.",
      "Use para gerar a ficha de um ou mais pontos em PDF, impressão ou XLSX.",
    ],
    primaryTasks: [
      {
        title: "Achar os pontos que pedem atenção",
        steps: [
          "Na aba Resultados, abra Prioridades.",
          "Os cinco cartões são os pontos completos com maior índice geral.",
          "Clique em Abrir ficha para ver os organismos que mais pesaram e o que confirmar em laboratório.",
        ],
      },
      {
        title: "Gerar fichas de pontos",
        steps: [
          "Abra Exportar fichas de pontos (PDF ou XLSX) e marque os pontos.",
          "Ficha-síntese: uma página com índices, o que mais pesou e os organismos dominantes.",
          "Relatório detalhado: acrescenta as evidências da literatura, da que mais pesou para a que menos pesou.",
          "XLSX: planilha completa, com todos os campos da fonte.",
        ],
      },
      {
        title: "Consultar o campo",
        steps: [
          "Na aba Campo, clique num dia do calendário para ver os pontos coletados nele.",
          "Clique num ponto do mapa para ver data, manancial, fotos e coordenadas.",
        ],
      },
    ],
    controls: [
      { label: "Campanha exibida", detail: "Troca todo o conteúdo da tela; a fase aparece ao lado do nome." },
      { label: "Selos Ciano · Bact · COI", detail: "Mostram qual conjunto entrou no cálculo do ponto." },
      { label: "Faixa colorida", detail: "Ponto parcial: o valor fica entre o menor e o maior valor possível." },
    ],
    notes: [
      "Os índices vão de 0 a 1 e são relativos aos pontos da campanha; não são classes de risco.",
      "A edição de campo fica em Central de dados → Diário de campo.",
    ],
    troubleshooting: [
      {
        issue: "Aba Resultados sem dados",
        action: "Publique a planilha da campanha em Central de dados → Planilhas de resultados.",
      },
      {
        issue: "Ficha demora a gerar",
        action: "A ficha confere todas as páginas da fonte antes de gerar. Aguarde a mensagem de conclusão.",
      },
    ],
    keywords: ["campanha", "resultados", "prioridades", "ficha", "pdf", "campo", "calendario"],
  },
  {
    title: "Diário de campo",
    short: "O que aconteceu em cada dia de coleta",
    icon: NotebookPen,
    purpose:
      "Guarda o registro de cada ponto coletado: dia, local, situação, resumo operacional, fotos e ocorrências. Cada campanha tem o seu diário.",
    whenToUse: [
      "Use para saber o que foi coletado em cada dia.",
      "Use para encontrar ocorrências e pendências de campo.",
      "Use para registrar ou importar o que aconteceu em campo.",
    ],
    primaryTasks: [
      {
        title: "Consultar um dia",
        steps: [
          "Escolha a campanha.",
          "No calendário, D = dia da campanha e pt = pontos registrados; vermelho = dia com ocorrência.",
          "Clique no dia: a tabela ao lado mostra os pontos daquele dia.",
        ],
      },
      {
        title: "Registrar ou importar",
        steps: [
          "Abra Central de dados → Diário de campo.",
          "Use Novo registro para lançar um ponto manualmente.",
          "Use Importar planilha para carregar a planilha-síntese da campanha ou vários registros de uma vez; a prévia mostra o que muda antes de gravar.",
        ],
      },
    ],
    controls: [
      { label: "Calendário", detail: "Dias com coleta; dias de outro mês têm borda tracejada e levam ao mês deles." },
      { label: "Filtros", detail: "Busca por texto, dia, ponto e situação." },
    ],
    notes: [
      "O diário não substitui relatórios técnicos, laudos ou comunicações formais.",
    ],
    troubleshooting: [
      {
        issue: "Diário sem registros",
        action: "Registre ou importe em Central de dados → Diário de campo.",
      },
      {
        issue: "Registro não aparece",
        action: "Clique em Limpar nos filtros e confira a campanha escolhida.",
      },
    ],
    keywords: ["diario de campo", "ocorrencia", "pendencia", "calendario", "coleta"],
  },
  {
    title: "Ciência e método",
    short: "Como o índice é calculado e o que a literatura diz",
    icon: FlaskConical,
    purpose:
      "Explica o índice com números reais: escolha um ponto e veja, passo a passo, como os organismos detectados viraram o índice de 0 a 1. Traz também o catálogo de efeitos descritos na literatura para cada organismo.",
    whenToUse: [
      "Use para entender por que um ponto tem o índice que tem.",
      "Use para consultar os efeitos descritos para um organismo e as referências.",
      "Use Valores por ponto para ver o valor de cada conjunto em cada domínio.",
    ],
    primaryTasks: [
      {
        title: "Refazer o cálculo de um ponto",
        steps: [
          "Abra Como o índice é calculado → Passo a passo.",
          "Escolha a campanha e o ponto (a lista segue o ranking).",
          "Escolha o conjunto e o domínio: os passos 1 a 4 e 6 mostram os números deles.",
          "No passo 5, a grade mostra como os três conjuntos formam o índice geral.",
        ],
      },
      {
        title: "Consultar efeitos de um organismo",
        steps: [
          "Abra Impactos potenciais → Efeitos descritos.",
          "Pesquise o organismo ou filtre por domínio, nota e tipo de evidência.",
          "Use Onde ocorrem para ver em quais pontos ele foi detectado.",
        ],
      },
    ],
    controls: [
      { label: "Metodologia completa (PDF)", detail: "Documento técnico do método, em nova aba." },
      { label: "Ver fórmula", detail: "Mostra a fórmula de cada passo, para quem quiser." },
    ],
    notes: [
      "Esta área só consulta; nada altera o cálculo publicado.",
      "Organismo sem nota na literatura fica fora da conta; não conta como zero.",
    ],
    troubleshooting: [
      {
        issue: "Ponto parcial no passo a passo",
        action: "O conjunto que faltou aparece como “fora”; o índice geral vira uma faixa possível.",
      },
    ],
    keywords: ["metodo", "calculo", "indice", "formula", "impactos", "literatura", "referencias"],
  },
  {
    title: "Atividades complementares",
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
          "Use a área de atividades complementares para criar ou editar o evento.",
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
      "Fotos e documentos são servidos pelo armazenamento privado do Supabase.",
      "A consistência da ação depende do cadastro completo no módulo Dados.",
    ],
    troubleshooting: [
      {
        issue: "Ação não aparece",
        action: "Confirme se ela foi salva em Dados e se a sincronização local ou nuvem ocorreu.",
      },
      {
        issue: "Foto não carrega",
        action: "Atualize a página; se a indisponibilidade persistir, registre a ocorrência para suporte.",
      },
    ],
    keywords: ["acao pontual", "fotos", "evidencias", "demanda", "resultados"],
  },
  {
    title: "Central de dados",
    short: "Checklist, importação, publicação e pendências",
    icon: DatabaseZap,
    purpose:
      "É por aqui que os dados entram no Yva’e: a fase de cada campanha, os registros de campo e as planilhas de resultados. A Visão geral mostra, campanha por campanha, o que já foi feito e o que falta.",
    whenToUse: [
      "Use a Visão geral para saber o que falta em cada campanha.",
      "Use “Tenho uma planilha. Onde importo?” quando não souber a tela certa: o app lê as abas e indica o caminho.",
      "Use Pendências para decidir conflitos entre o que está no app e o que veio da planilha.",
    ],
    primaryTasks: [
      {
        title: "Importar a planilha de campo",
        steps: [
          "Abra Diário de campo e clique em Importar planilha (é o único caminho para dados de campo).",
          "Envie a planilha-síntese da campanha (aba Campanhas) ou a de registros (aba Registros).",
          "Confira a prévia: novos, atualizados, inalterados, conflitos e ausentes. Nada é gravado antes da confirmação.",
          "Confirme. Fotos indicadas por link são copiadas para o app e conflitos vão para Pendências.",
        ],
      },
      {
        title: "Publicar resultados do laboratório",
        steps: [
          "Abra Planilhas de resultados e selecione o arquivo.",
          "Confira na prévia as campanhas encontradas e desmarque as que não quer publicar.",
          "Publique. A publicação anterior de cada campanha marcada é substituída por inteiro; as demais ficam como estão.",
        ],
      },
      {
        title: "Atualizar a fase de uma campanha",
        steps: [
          "Abra Fase e etapas e escolha a campanha.",
          "Marque as etapas concluídas; o app sugere a fase correspondente.",
          "Salve. Início e Campanhas e resultados passam a mostrar a fase nova.",
        ],
      },
    ],
    controls: [
      { label: "Visão geral", detail: "Checklist por campanha e o assistente “Onde importo?”." },
      { label: "Fase e etapas", detail: "Fase, datas e etapas de cada campanha." },
      { label: "Diário de campo", detail: "Registros de campo, um a um ou pela planilha (importador único)." },
      { label: "Planilhas de resultados", detail: "Prévia e publicação das planilhas do laboratório." },
      { label: "Pendências", detail: "Conflitos de importação à espera de decisão." },
    ],
    notes: [
      "Somente categorias autorizadas podem importar, publicar ou excluir dados.",
      "Enquanto a campanha está aberta, a planilha atualiza o que foi importado antes; depois de revisado no app, o app prevalece e a diferença vira pendência.",
      "Atividades complementares são registradas em Atividades complementares › Registrar.",
    ],
    troubleshooting: [
      {
        issue: "Planilha não valida",
        action: "Confira se usou o modelo certo (botão Baixar modelo) e se as abas e cabeçalhos estão com os nomes do modelo.",
      },
      {
        issue: "Pontos importados não aparecem no mapa",
        action: "O mapa da campanha usa só os registros do Diário. Confira se a importação foi confirmada (não só pré-visualizada) e se o ponto tem coordenada.",
      },
    ],
    keywords: ["dados", "importar", "publicar", "planilha", "xlsx", "csv"],
  },
  {
    title: "Documentos",
    short: "Arquivos oficiais, filtros e compartilhamento",
    icon: FileText,
    purpose:
      "Centraliza documentos oficiais do projeto no armazenamento privado do Supabase, mantendo busca, filtros, seleção, compartilhamento e abertura rápida.",
    whenToUse: [
      "Use para enviar documentos oficiais.",
      "Use para localizar relatórios, laudos, mapas, apresentações e documentos institucionais.",
      "Use para compartilhar ou baixar uma seleção de documentos.",
    ],
    primaryTasks: [
      {
        title: "Inserir documento",
        steps: [
          "Clique em Enviar arquivo.",
          "Selecione o arquivo e informe título, tipo, campanha e observação.",
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
      { label: "Abas", detail: "Filtram por Plano de trabalho, Relatórios, Resultados, Apresentações, Laudos, Mapas e Institucionais." },
      { label: "Busca", detail: "Localiza documentos por texto." },
      { label: "Ações por linha", detail: "Abrir, baixar, compartilhar, copiar link ou excluir." },
    ],
    notes: [
      "O arquivo permanece no armazenamento privado do Supabase e o acesso ocorre pelo aplicativo.",
      "Evite cadastrar planilhas neste módulo; planilhas pertencem ao módulo Dados.",
    ],
    troubleshooting: [
      {
        issue: "Arquivo recusado",
        action: "Confirme o formato aceito e tente enviar o arquivo novamente.",
      },
      {
        issue: "Documento não sincroniza",
        action: "Verifique se o app está em modo nuvem ou se o navegador manteve o armazenamento local.",
      },
    ],
    keywords: ["documentos", "arquivo", "relatorio", "laudo", "mapa", "supabase"],
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
          "Novos cadastros recebem um convite individual para definir a própria senha.",
          "Use editar para alterar nome, e-mail ou categoria.",
          "Use os controles de status, reenvio de convite e exclusão conforme a necessidade administrativa.",
        ],
      },
      {
        title: "Ajustar privilégios por categoria",
        steps: [
          "Abra Perfis e permissões.",
          "Revise as categorias Admin, Sanepar, Tecpar, UFPR e ATGC.",
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
      { label: "Pessoas autorizadas", detail: "Cadastro, convite individual, categoria e status." },
      { label: "Backups", detail: "APP manual, BD automático, retenção e restauração." },
      { label: "Build & Sync Diagnostics", detail: "Mostra versão, commit, ambiente, pendências e sincronização." },
      { label: "Diagnóstico", detail: "Verifica integridade operacional dos dados principais." },
    ],
    notes: [
      "Configurações é área administrativa; alterações afetam a operação inteira.",
      "Cada painel respeita seu próprio privilégio: uma categoria pode entrar em Configurações vendo apenas o painel liberado, como só Pessoas autorizadas.",
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
];

export const generalTopics = [
  {
    title: "Como usar esta Ajuda",
    body: "Selecione um módulo na coluna lateral para ver rotinas, controles, regras e solução de problemas. A busca encontra tópicos por módulo, ação ou palavra-chave.",
  },
  {
    title: "Fluxo básico do app",
    body: "Central de dados alimenta o sistema. Início mostra a visão geral, Campanhas e resultados detalha o campo e os resultados de cada campanha, Ciência e método explica o cálculo, Documentos guarda os arquivos oficiais e Configurações cuida de acesso, backups e diagnóstico.",
  },
  {
    title: "Onde editar informações",
    body: "Edite planilhas e registros em Central de dados, documentos em Documentos e usuários em Configurações. Telas de consulta, como Início e Campanhas e resultados, evitam edição direta para preservar rastreabilidade.",
  },
];

/** Tela de origem (?tela=/rota) → módulo da Ajuda aberto diretamente. */
export function helpModuleForPath(path: string | null) {
  if (!path) return null;
  if (path === "/") return "Início";
  if (path === "/campanhas/campo") return "Campanhas e resultados";
  if (path === "/campanhas/resultados") return "Campanhas e resultados";
  if (path.startsWith("/resultados/")) return "Ciência e método";
  if (path === "/dados/diario-de-campo") return "Diário de campo";
  if (path === "/acoes-pontuais" || path === "/dados/acoes-pontuais") return "Atividades complementares";
  if (path === "/dados" || path.startsWith("/dados/")) return "Central de dados";
  if (path === "/documentos") return "Documentos";
  if (path === "/governanca") return "Configurações";
  return null;
}

/** Módulo da Ajuda correspondente à rota, ou null. */
export function findHelpModuleForPath(path: string | null) {
  const title = helpModuleForPath(path);
  return title ? helpModules.find((module) => module.title === title) ?? null : null;
}
