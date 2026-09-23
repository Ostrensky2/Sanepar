import type { ComponentType, SVGProps } from "react";
import {
  AlertTriangle,
  BookOpen,
  Calculator,
  CarFront,
  DatabaseZap,
  FileSpreadsheet,
  FileText,
  CircleHelp,
  FlaskConical,
  House,
  LayoutDashboard,
  LineChart,
  ListChecks,
  NotebookPen,
  PencilLine,
  Settings2,
  Target,
} from "lucide-react";
import type { PrivilegeKey } from "@/lib/access-control";

type NavigationIcon = ComponentType<SVGProps<SVGSVGElement>>;

/**
 * Seção interna de um destino do menu. Não aparece no menu lateral: vira aba
 * (SectionTabs) dentro da página e entra na busca e no breadcrumb.
 */
export type NavigationChild = {
  href: string;
  label: string;
  summary: string;
  headerTitle: string;
  icon?: NavigationIcon;
  privilege?: PrivilegeKey;
};

export type NavigationItem = {
  href: string;
  label: string;
  summary: string;
  headerTitle: string;
  icon: NavigationIcon;
  group: "consult" | "data" | "support";
  privilege?: PrivilegeKey;
  children?: NavigationChild[];
};

export const navigationGroupLabels: Record<NavigationItem["group"], string> = {
  consult: "Consultar",
  data: "Abastecer",
  support: "Apoio",
};

export const navigationItems: NavigationItem[] = [
  {
    href: "/",
    label: "Início",
    summary: "painel de monitoramento",
    headerTitle: "Painel de Monitoramento",
    icon: House,
    group: "consult",
    privilege: "nav.home",
  },
  {
    href: "/campanhas/campo",
    label: "Campanhas e resultados",
    summary: "campo, percurso e resultados por campanha",
    headerTitle: "Campanhas e resultados",
    icon: CarFront,
    group: "consult",
    privilege: "nav.campaigns",
    children: [
      {
        href: "/campanhas/campo",
        label: "Campo",
        summary: "percurso, pontos e diário da campanha",
        headerTitle: "Campo",
        icon: CarFront,
      },
      {
        href: "/campanhas/resultados",
        label: "Resultados",
        summary: "índices e análises laboratoriais (monitoramento)",
        headerTitle: "Resultados",
        icon: FlaskConical,
        privilege: "nav.results",
      },
    ],
  },
  {
    href: "/resultados/impactos",
    label: "Ciência e método",
    summary: "impactos potenciais e como o índice é calculado",
    headerTitle: "Ciência e método",
    icon: BookOpen,
    group: "consult",
    privilege: "nav.results",
    children: [
      {
        href: "/resultados/impactos",
        label: "Impactos potenciais",
        summary: "associações, ocorrências e referências",
        headerTitle: "Impactos potenciais",
        icon: BookOpen,
      },
      {
        href: "/resultados/calculos",
        label: "Como o índice é calculado",
        summary: "passo a passo do cálculo e valores por ponto",
        headerTitle: "Como o índice é calculado",
        icon: Calculator,
      },
    ],
  },
  {
    href: "/acoes-pontuais",
    label: "Atividades complementares",
    summary: "demandas pontuais da Sanepar",
    headerTitle: "Atividades complementares",
    icon: Target,
    group: "consult",
    privilege: "nav.results",
    children: [
      {
        href: "/acoes-pontuais",
        label: "Consultar",
        summary: "atividades registradas",
        headerTitle: "Atividades complementares",
        icon: Target,
      },
      {
        href: "/dados/acoes-pontuais",
        label: "Registrar",
        summary: "nova atividade complementar",
        headerTitle: "Registrar atividade complementar",
        icon: PencilLine,
        privilege: "nav.data",
      },
    ],
  },
  {
    href: "/documentos",
    label: "Documentos",
    summary: "repositório oficial",
    headerTitle: "Documentos",
    icon: FileText,
    group: "consult",
    privilege: "nav.documents",
  },
  {
    href: "/dados",
    label: "Central de dados",
    summary: "status, importações e pendências",
    headerTitle: "Central de dados",
    icon: DatabaseZap,
    group: "data",
    privilege: "nav.data",
    children: [
      {
        href: "/dados",
        label: "Visão geral",
        summary: "o que falta em cada campanha",
        headerTitle: "Central de dados",
        icon: LayoutDashboard,
      },
      {
        href: "/dados/status",
        label: "Fase e etapas",
        summary: "fase, datas e etapas de cada campanha",
        headerTitle: "Fase e etapas da campanha",
        icon: ListChecks,
      },
      {
        href: "/dados/diario-de-campo",
        label: "Diário de campo",
        summary: "registros diários e importação da planilha de campo",
        headerTitle: "Diário de campo",
        icon: NotebookPen,
      },
      {
        href: "/dados/resultados",
        label: "Planilhas de resultados",
        summary: "publicação dos resultados laboratoriais",
        headerTitle: "Planilhas de resultados",
        icon: FileSpreadsheet,
      },
      {
        href: "/dados/pendencias",
        label: "Pendências",
        summary: "conflitos de importação a decidir",
        headerTitle: "Pendências de importação",
        icon: AlertTriangle,
      },
    ],
  },
  {
    href: "/governanca",
    label: "Configurações",
    summary: "usuários, backups e diagnóstico",
    headerTitle: "Configurações",
    icon: Settings2,
    group: "support",
    privilege: "nav.settings",
  },
  {
    href: "/ajuda",
    label: "Ajuda",
    summary: "como usar cada tela",
    headerTitle: "Ajuda",
    icon: CircleHelp,
    group: "support",
    privilege: "nav.help",
  },
];

/** Ícone genérico usado quando uma página auxiliar não tem entrada no menu. */
export const fallbackNavigationIcon: NavigationIcon = LineChart;

const routePrivilegeOverrides: Record<string, PrivilegeKey[]> = {
  // Registrar atividade é tarefa de quem abastece; não exige também a consulta de resultados.
  "/dados/acoes-pontuais": ["nav.data"],
  // A aba Resultados mantém o privilégio próprio de consulta de resultados.
  "/campanhas/resultados": ["nav.results"],
};

export function findNavigationItem(pathname: string) {
  return navigationItems.find(
    (navigationItem) =>
      navigationItem.href === pathname ||
      navigationItem.children?.some((child) => child.href === pathname),
  );
}

/** Destino do menu que deve aparecer ativo para a rota (inclui as seções internas). */
export function isNavigationItemActive(item: NavigationItem, pathname: string) {
  return pathname === item.href || Boolean(item.children?.some((child) => child.href === pathname));
}

export function getNavigationAccessForPath(pathname: string) {
  const override = routePrivilegeOverrides[pathname];

  if (override) {
    return {
      item: null,
      child: null,
      requiredPrivileges: override,
    };
  }

  const item = findNavigationItem(pathname);

  if (!item) {
    return null;
  }

  const child = item.children?.find((navigationChild) => navigationChild.href === pathname);

  return {
    item,
    child,
    requiredPrivileges: [item.privilege, child?.privilege].filter(Boolean) as PrivilegeKey[],
  };
}

/**
 * Trilha de navegação. A página atual é o último item; a barra superior mostra
 * só os ancestrais, porque o título da página já aparece no H1.
 */
export function getBreadcrumbsForPath(pathname: string) {
  const normalizedPath = pathname === "" ? "/" : pathname;
  const item = findNavigationItem(normalizedPath);

  if (item) {
    const child = item.children?.find((navigationChild) => navigationChild.href === normalizedPath);
    const childIsLanding = child?.href === item.href;
    return [
      { href: "/", label: "Início" },
      ...(item.href === "/" ? [] : [{ href: item.href, label: item.label }]),
      ...(child && !childIsLanding ? [{ href: child.href, label: child.label }] : []),
    ];
  }

  const segments = normalizedPath.split("/").filter(Boolean);
  if (segments.length === 0) {
    return [{ href: "/", label: "Início" }];
  }

  return [
    { href: "/", label: "Início" },
    ...segments.map((segment, index) => ({
      href: `/${segments.slice(0, index + 1).join("/")}`,
      label: formatSegmentLabel(segment),
    })),
  ];
}

export function getSearchableNavigationItems() {
  return navigationItems.flatMap((item) => [
    {
      href: item.href,
      label: item.label,
      group: navigationGroupLabels[item.group],
      keywords: `${item.label} ${item.summary} ${item.headerTitle}`,
    },
    ...(item.children ?? [])
      .filter((child) => child.href !== item.href)
      .map((child) => ({
        href: child.href,
        label: child.headerTitle,
        group: item.label,
        keywords: `${child.label} ${child.summary} ${child.headerTitle} ${item.label}`,
      })),
  ]);
}

function formatSegmentLabel(segment: string) {
  return segment
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}
