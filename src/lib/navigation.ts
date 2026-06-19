import type { ComponentType, SVGProps } from "react";
import {
  CarFront,
  DatabaseZap,
  FileText,
  CircleHelp,
  FileSpreadsheet,
  FlaskConical,
  House,
  LineChart,
  MessageSquareText,
  NotebookPen,
  PencilLine,
  Settings2,
  Target,
} from "lucide-react";
import type { PrivilegeKey } from "@/lib/access-control";

type NavigationIcon = ComponentType<SVGProps<SVGSVGElement>>;

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
  group: "regular" | "results" | "data" | "support" | "admin";
  privilege?: PrivilegeKey;
  children?: NavigationChild[];
};

export const navigationItems: NavigationItem[] = [
  {
    href: "/",
    label: "Início",
    summary: "painel operacional",
    headerTitle: "Painel de Monitoramento",
    icon: House,
    group: "regular",
    privilege: "nav.home",
  },
  {
    href: "/campanhas/campo",
    label: "Campanhas",
    summary: "sazonais e extraordinárias",
    headerTitle: "Campanhas Sazonais",
    icon: CarFront,
    group: "regular",
    privilege: "nav.campaigns",
  },
  {
    href: "/campanhas/resultados",
    label: "Resultados",
    summary: "análises e ações",
    headerTitle: "Resultados",
    icon: LineChart,
    group: "results",
    privilege: "nav.results",
    children: [
      {
        href: "/campanhas/resultados",
        label: "Monitoramento",
        summary: "análises laboratoriais",
        headerTitle: "Monitoramento",
        icon: FlaskConical,
      },
      {
        href: "/acoes-pontuais",
        label: "Ações Pontuais",
        summary: "demandas Sanepar",
        headerTitle: "Ações Pontuais Sanepar",
        icon: Target,
      },
    ],
  },
  {
    href: "/dados/status",
    label: "Entrada de dados",
    summary: "importação e curadoria",
    headerTitle: "Entrada de Dados",
    icon: DatabaseZap,
    group: "data",
    privilege: "nav.data",
    children: [
      {
        href: "/dados/status",
        label: "Status de campanha",
        summary: "andamento e etapas do projeto",
        headerTitle: "Entrada de Dados - Status de Campanha",
        icon: LineChart,
      },
      {
        href: "/dados/campo",
        label: "Planilhas de campo",
        summary: "importação de planilhas de campo",
        headerTitle: "Entrada de Dados - Planilhas de Campo",
        icon: NotebookPen,
      },
      {
        href: "/dados/diario-de-campo",
        label: "Diário de campo",
        summary: "ocorrências e registros diários",
        headerTitle: "Entrada de Dados - Diário de Campo",
        icon: NotebookPen,
      },
      {
        href: "/dados/resultados",
        label: "Planilhas de resultados",
        summary: "importação de planilhas laboratoriais",
        headerTitle: "Entrada de Dados - Planilhas de Resultados",
        icon: FileSpreadsheet,
      },
      {
        href: "/dados/acoes-pontuais",
        label: "Registrar ações pontuais",
        summary: "entrada estruturada de ações pontuais",
        headerTitle: "Entrada de Dados - Registrar Ações Pontuais",
        icon: PencilLine,
      },
    ],
  },
  {
    href: "/documentos",
    label: "Documentos",
    summary: "repositório oficial",
    headerTitle: "Repositório Oficial de Documentos",
    icon: FileText,
    group: "support",
    privilege: "nav.documents",
  },
  {
    href: "/solicitacoes",
    label: "Solicitações",
    summary: "demandas e retornos",
    headerTitle: "Solicitações Sanepar",
    icon: MessageSquareText,
    group: "support",
    privilege: "nav.requests",
  },
  {
    href: "/governanca",
    label: "Configurações",
    summary: "controle do app",
    headerTitle: "Configurações do Sistema",
    icon: Settings2,
    group: "admin",
    privilege: "nav.settings",
  },
  {
    href: "/ajuda",
    label: "Ajuda",
    summary: "central de suporte",
    headerTitle: "Ajuda",
    icon: CircleHelp,
    group: "admin",
    privilege: "nav.help",
  },
];

const routePrivilegeOverrides: Record<string, PrivilegeKey[]> = {
  "/campanhas": ["nav.campaigns"],
  "/dados": ["nav.data"],
  "/diario-de-campo": ["nav.campaigns"],
  "/acoes-pontuais": ["nav.results"],
  "/acoes-pontuais/ver": ["nav.results"],
  "/acoes-pontuais/registrar": ["nav.data"],
};

export function getNavigationAccessForPath(pathname: string) {
  const override = routePrivilegeOverrides[pathname];

  if (override) {
    return {
      item: null,
      child: null,
      requiredPrivileges: override,
    };
  }

  const item = navigationItems.find(
    (navigationItem) =>
      navigationItem.href === pathname ||
      navigationItem.children?.some((child) => child.href === pathname),
  );

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

export function getBreadcrumbsForPath(pathname: string) {
  const normalizedPath = pathname === "" ? "/" : pathname;
  const item = navigationItems.find(
    (navigationItem) =>
      navigationItem.href === normalizedPath ||
      navigationItem.children?.some((child) => child.href === normalizedPath),
  );

  if (item) {
    const child = item.children?.find((navigationChild) => navigationChild.href === normalizedPath);
    return [
      { href: "/", label: "Início" },
      ...(item.href === "/" ? [] : [{ href: item.href, label: item.label }]),
      ...(child ? [{ href: child.href, label: child.label }] : []),
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
      group: item.headerTitle,
      keywords: `${item.label} ${item.summary} ${item.headerTitle}`,
    },
    ...(item.children ?? []).map((child) => ({
      href: child.href,
      label: child.label,
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
