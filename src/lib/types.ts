export type Tone = "primary" | "success" | "warning" | "neutral" | "danger";

export type ExecutiveMetric = {
  label: string;
  value: string;
  detail: string;
  tone: Tone;
};

export type CampaignStatus =
  | "planejada"
  | "em_campo"
  | "consolidacao"
  | "publicada";

export type Campaign = {
  id: string;
  name: string;
  status: CampaignStatus;
  period: string;
  objective: string;
  plannedPoints: number;
  deliveredDocuments: number;
  lastUpdate: string;
};

export type MonitoringPointStatus = "estavel" | "alerta" | "revisao";

export type MonitoringPoint = {
  code: string;
  municipality: string;
  className: string;
  status: MonitoringPointStatus;
  latestCampaign: string;
  findings: string;
  attachments: number;
  updatedAt: string;
};

export type RepositoryDocument = {
  title: string;
  category: string;
  audience: "ATGC" | "Sanepar" | "Compartilhado";
  status: "interno" | "revisao" | "publicado";
  source: string;
  updatedAt: string;
};

export type ImportSource = {
  name: string;
  channel: string;
  cadence: string;
  owner: string;
  lastRun: string;
  status: "pronto" | "aguardando" | "manual";
  costNote: string;
};

export type PartnerUpdate = {
  title: string;
  summary: string;
  audience: string;
  updatedAt: string;
};

export type GovernanceRule = {
  title: string;
  description: string;
  owner: string;
};

export type AccessProfile = {
  name: string;
  scope: string;
  permissions: string[];
};

export type SpreadsheetEntity =
  | "pontos"
  | "campanhas"
  | "documentos"
  | "indicadores"
  | "desconhecido";

export type SpreadsheetSheetPreview = {
  name: string;
  rowCount: number;
  columnCount: number;
  headers: string[];
  recommendedEntity: SpreadsheetEntity;
};

export type SpreadsheetPreview = {
  fileName: string;
  fileSize: number;
  sheetCount: number;
  totalRows: number;
  sheets: SpreadsheetSheetPreview[];
};

export type CampaignImportPreview = SpreadsheetPreview & {
  campaignPoints?: {
    total: number;
    original: number;
    effective: number;
    missingFields: string[];
  };
};
