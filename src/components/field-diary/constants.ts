export const campaignOptions = [
  { id: "campanha-1-verao-2026", name: "1ª Campanha - Verão 2026" },
  { id: "campanha-2-outono-2026", name: "2ª Campanha - Outono 2026" },
  { id: "campanha-3", name: "3ª Campanha - Inverno 2026" },
  { id: "campanha-4", name: "4ª Campanha - Primavera 2026" },
  { id: "campanha-5", name: "5ª Campanha - Verão 2027" },
  { id: "campanha-6", name: "6ª Campanha - Outono 2027" },
  { id: "campanha-7", name: "7ª Campanha - Inverno 2027" },
  { id: "campanha-8", name: "8ª Campanha - Primavera 2027" },
  { id: "campanha-9", name: "9ª Campanha - Verão 2028" },
  { id: "acao-pontual", name: "Ação pontual" },
  { id: "deslocamento-tecnico", name: "Deslocamento técnico" },
];

export const campaignCollectionStartDates: Record<string, string> = {
  "campanha-1-verao-2026": "2026-01-01",
  "campanha-2-outono-2026": "2026-06-01",
  "campanha-3": "2026-09-01",
  "campanha-4": "2026-11-01",
  "campanha-5": "2027-01-01",
  "campanha-6": "2027-04-01",
  "campanha-7": "2027-07-01",
  "campanha-8": "2027-10-01",
  "campanha-9": "2028-01-01",
};

export type OperationalStage = "planned" | "recorded" | "occurrence" | "incomplete";

export type ViewMode = "daily" | "list";

export const operationalStageLabels: Record<OperationalStage, string> = {
  planned: "Planejado",
  recorded: "Registrado",
  occurrence: "Com ocorrência",
  incomplete: "Incompleto",
};

export const operationalStageDescriptions: Record<OperationalStage, string> = {
  planned: "Ponto importado ou programado, ainda sem dado operacional de campo.",
  recorded: "Registro com atividade, condição da água, resumo ou coordenada.",
  occurrence: "Registro com ocorrência relevante informada.",
  incomplete: "Registro sem local ou município suficientes para uso operacional.",
};

export const operationalStageClassNames: Record<OperationalStage, string> = {
  planned: "bg-slate-100 text-slate-700",
  recorded: "bg-[var(--brand-green-soft)] text-[var(--brand-navy-strong)]",
  occurrence: "bg-[var(--brand-amber)]/12 text-[var(--brand-amber)]",
  incomplete: "bg-[rgba(186,26,26,0.10)] text-[var(--brand-danger)]",
};

export type FieldDiaryCampaignScope = {
  id: string;
  name: string;
};

export type FieldDiaryPointOption = {
  id: string;
  locationName: string;
  sia: string;
  municipality: string;
};

export const inputClassName =
  "rounded-xl border border-[var(--line-strong)] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20";

export const textareaClassName =
  "min-h-28 rounded-xl border border-[var(--line-strong)] bg-white px-3 py-3 text-sm font-semibold normal-case tracking-normal text-[var(--brand-navy-strong)] outline-none transition placeholder:text-slate-400 focus:border-[var(--brand-blue)] focus:ring-2 focus:ring-[var(--brand-blue)]/20";
