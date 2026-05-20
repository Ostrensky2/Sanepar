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
  MapPin,
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
    headerTitle: "Yva'e - Painel de Monitoramento",
    icon: House,
    group: "regular",
    privilege: "dashboard.view",
  },
  {
    href: "/campanhas/campo",
    label: "Campanhas",
    summary: "sazonais e extraordinárias",
    headerTitle: "Yva'e - Campanhas Sazonais",
    icon: CarFront,
    group: "regular",
    privilege: "campaigns.view",
    children: [
      {
        href: "/campanhas/campo",
        label: "Campo",
        summary: "mapa e pontos da campanha",
        headerTitle: "Yva'e - Campanhas Sazonais",
        icon: MapPin,
        privilege: "campaigns.view",
      },
      {
        href: "/campanhas/diario-de-campo",
        label: "Diário de campo",
        summary: "eventos e registros da equipe",
        headerTitle: "Yva'e - Diário de Campo das Campanhas",
        icon: NotebookPen,
        privilege: "campaigns.view",
      },
    ],
  },
  {
    href: "/pontos",
    label: "Pontos de Coleta",
    summary: "gestão técnica SIA",
    headerTitle: "Monitoramento de Pontos (SIA)",
    icon: MapPin,
    group: "regular",
    privilege: "points.view",
  },
  {
    href: "/campanhas/resultados",
    label: "Resultados",
    summary: "análises e ações",
    headerTitle: "Resultados",
    icon: LineChart,
    group: "results",
    privilege: "campaigns.view",
    children: [
      {
        href: "/campanhas/resultados",
        label: "Monitoramento",
        summary: "análises laboratoriais",
        headerTitle: "Yva'e - Monitoramento",
        icon: FlaskConical,
        privilege: "campaigns.view",
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
    href: "/dados/campo",
    label: "Entrada de dados",
    summary: "importação e curadoria",
    headerTitle: "Entrada de Dados",
    icon: DatabaseZap,
    group: "data",
    privilege: "data.view",
    children: [
      {
        href: "/dados/campo",
        label: "Planilhas de campo",
        summary: "importação de planilhas de campo",
        headerTitle: "Entrada de Dados - Planilhas de Campo",
        icon: NotebookPen,
        privilege: "data.view",
      },
      {
        href: "/dados/diario-de-campo",
        label: "Diário de campo",
        summary: "ocorrências e registros diários",
        headerTitle: "Entrada de Dados - Diário de Campo",
        icon: NotebookPen,
        privilege: "data.view",
      },
      {
        href: "/dados/resultados",
        label: "Planilhas de resultados",
        summary: "importação de planilhas laboratoriais",
        headerTitle: "Entrada de Dados - Planilhas de Resultados",
        icon: FileSpreadsheet,
        privilege: "data.view",
      },
      {
        href: "/dados/acoes-pontuais",
        label: "Registrar ações pontuais",
        summary: "entrada estruturada de ações pontuais",
        headerTitle: "Entrada de Dados - Registrar Ações Pontuais",
        icon: PencilLine,
        privilege: "data.view",
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
    privilege: "documents.view",
  },
  {
    href: "/solicitacoes",
    label: "Solicitações",
    summary: "demandas e retornos",
    headerTitle: "Solicitações Sanepar",
    icon: MessageSquareText,
    group: "support",
  },
  {
    href: "/governanca",
    label: "Configurações",
    summary: "controle do app",
    headerTitle: "Configurações do Sistema",
    icon: Settings2,
    group: "admin",
    privilege: "settings.manage",
  },
  {
    href: "/ajuda",
    label: "Ajuda",
    summary: "central de suporte",
    headerTitle: "Ajuda do Yva'e",
    icon: CircleHelp,
    group: "admin",
  },
];
