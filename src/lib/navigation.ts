import type { ComponentType, SVGProps } from "react";
import {
  CarFront,
  DatabaseZap,
  FileText,
  House,
  MapPin,
  Settings2,
  Target,
} from "lucide-react";

type NavigationIcon = ComponentType<SVGProps<SVGSVGElement>>;

export type NavigationItem = {
  href: string;
  label: string;
  summary: string;
  headerTitle: string;
  icon: NavigationIcon;
};

export const navigationItems: NavigationItem[] = [
  {
    href: "/",
    label: "Início",
    summary: "painel operacional",
    headerTitle: "Yva'e - Painel de Monitoramento",
    icon: House,
  },
  {
    href: "/campanhas",
    label: "Campanhas",
    summary: "sazonais e extraordinárias",
    headerTitle: "Yva'e - Campanhas Sazonais",
    icon: CarFront,
  },
  {
    href: "/pontos",
    label: "Pontos de Coleta",
    summary: "gestão técnica SIA",
    headerTitle: "Monitoramento de Pontos (SIA)",
    icon: MapPin,
  },
  {
    href: "/acoes-pontuais",
    label: "Ações pontuais",
    summary: "demandas Sanepar",
    headerTitle: "Ações Pontuais Sanepar",
    icon: Target,
  },
  {
    href: "/dados",
    label: "Dados",
    summary: "importação e curadoria",
    headerTitle: "Dados e Importações",
    icon: DatabaseZap,
  },
  {
    href: "/documentos",
    label: "Documentos",
    summary: "repositório oficial",
    headerTitle: "Repositório Oficial de Documentos",
    icon: FileText,
  },
  {
    href: "/governanca",
    label: "Configurações",
    summary: "controle do app",
    headerTitle: "Configurações do Sistema",
    icon: Settings2,
  },
];
