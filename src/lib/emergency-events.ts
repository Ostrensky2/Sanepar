/**
 * Eventos emergenciais (Central de dados › Eventos emergenciais).
 *
 * Registro de uma ida a campo fora da rotina das campanhas, por causa de um problema
 * comunicado: entupimento de filtros, cheiro ou gosto na água, floração de algas…
 *
 * Aqui ficam só as regras: listas de opções, rótulos e a conferência do que a tela
 * envia. Nada fala com banco ou tela, para poder ser testado.
 */

/** Atividades feitas em campo. A tela mostra como botões de marcar (vários ao mesmo tempo). */
export const emergencyActivities = [
  { id: "edna", label: "Coleta de eDNA" },
  { id: "water", label: "Coleta de água" },
  { id: "plankton", label: "Coleta de plâncton" },
  { id: "algae", label: "Coleta de algas ou cianobactérias" },
  { id: "sediment", label: "Coleta de sedimento" },
  { id: "dead_organisms", label: "Coleta de peixes ou organismos mortos" },
  { id: "photos", label: "Fotos" },
  { id: "drone", label: "Imagens de drone" },
  { id: "water_quality", label: "Parâmetros de qualidade da água" },
  { id: "inspection", label: "Vistoria visual do local" },
  { id: "local_contact", label: "Conversa com a equipe local" },
  { id: "other", label: "Outra atividade" },
] as const;

export type EmergencyActivityId = (typeof emergencyActivities)[number]["id"];

/** Problema principal que motivou o evento. A tela mostra como lista (drop-down). */
export const emergencyProblems = [
  { id: "filter_clogging", label: "Entupimento de filtros" },
  { id: "contamination", label: "Contaminação" },
  { id: "taste_odor", label: "Cheiro ou gosto na água" },
  { id: "eutrophication", label: "Eutrofização do reservatório" },
  { id: "algal_bloom", label: "Floração de algas ou cianobactérias" },
  { id: "fish_kill", label: "Mortandade de peixes" },
  { id: "color_turbidity", label: "Mudança de cor ou turbidez" },
  { id: "foam_oil", label: "Espuma, óleo ou película na água" },
  { id: "effluent", label: "Lançamento de esgoto ou efluente" },
  { id: "invasive_species", label: "Espécie invasora (ex.: mexilhão-dourado)" },
  { id: "macrophytes", label: "Excesso de plantas aquáticas" },
  { id: "other", label: "Outro problema" },
] as const;

export type EmergencyProblemId = (typeof emergencyProblems)[number]["id"];

export const EMERGENCY_NAME_MAX = 160;
export const EMERGENCY_OTHER_MAX = 160;
export const EMERGENCY_LOCATION_MAX = 200;
export const EMERGENCY_DESCRIPTION_MAX = 8000;

export type EmergencyEvent = {
  id: string;
  name: string;
  /** Data do evento, como foi informada (AAAA-MM-DD). */
  reportedDate: string;
  /** Dia em que a equipe foi ao local (AAAA-MM-DD); vazio quando ainda não foi. */
  visitDate: string;
  activities: EmergencyActivityId[];
  activityOther: string;
  mainProblem: EmergencyProblemId;
  mainProblemOther: string;
  /** Ponto da campanha (SIA), quando o evento foi num ponto da lista. */
  sia: string;
  /** Rio ou reservatório e município, ou o local digitado quando não é um ponto da lista. */
  location: string;
  description: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
};

/** O que a tela envia para gravar. */
export type EmergencyEventInput = Pick<
  EmergencyEvent,
  | "name"
  | "reportedDate"
  | "visitDate"
  | "activities"
  | "activityOther"
  | "mainProblem"
  | "mainProblemOther"
  | "sia"
  | "location"
  | "description"
>;

export function emptyEmergencyEventInput(): EmergencyEventInput {
  return {
    name: "",
    reportedDate: "",
    visitDate: "",
    activities: [],
    activityOther: "",
    mainProblem: "" as EmergencyProblemId,
    mainProblemOther: "",
    sia: "",
    location: "",
    description: "",
  };
}

const activityIds = new Set<string>(emergencyActivities.map((activity) => activity.id));
const problemIds = new Set<string>(emergencyProblems.map((problem) => problem.id));

export function isEmergencyActivityId(value: unknown): value is EmergencyActivityId {
  return typeof value === "string" && activityIds.has(value);
}

export function isEmergencyProblemId(value: unknown): value is EmergencyProblemId {
  return typeof value === "string" && problemIds.has(value);
}

export function emergencyActivityLabel(id: string) {
  return emergencyActivities.find((activity) => activity.id === id)?.label ?? id;
}

export function emergencyProblemLabel(id: string) {
  return emergencyProblems.find((problem) => problem.id === id)?.label ?? id;
}

/** Problema como aparece na lista: "Outro problema" mostra o que foi digitado. */
export function emergencyProblemText(event: Pick<EmergencyEvent, "mainProblem" | "mainProblemOther">) {
  return event.mainProblem === "other" && event.mainProblemOther
    ? event.mainProblemOther
    : emergencyProblemLabel(event.mainProblem);
}

/** Atividades como aparecem na lista, na ordem das opções; "Outra atividade" mostra o que foi digitado. */
export function emergencyActivitiesText(event: Pick<EmergencyEvent, "activities" | "activityOther">) {
  return emergencyActivities
    .filter((activity) => event.activities.includes(activity.id))
    .map((activity) => (activity.id === "other" && event.activityOther ? event.activityOther : activity.label));
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Data AAAA-MM-DD que existe no calendário (31/02 não passa). */
export function isValidIsoDate(value: string) {
  const match = ISO_DATE.exec(value);

  if (!match) {
    return false;
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    year >= 2000 &&
    year <= 2100 &&
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** AAAA-MM-DD → DD/MM/AAAA. */
export function formatEmergencyDate(value: string) {
  const match = ISO_DATE.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function cleanText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, max) : "";
}

/** Texto longo: mantém as quebras de linha, tira espaços sobrando nas pontas. */
function cleanLongText(value: unknown, max: number) {
  return typeof value === "string" ? value.replace(/\r\n?/g, "\n").trim().slice(0, max) : "";
}

export type EmergencyInputCheck =
  | { ok: true; event: EmergencyEventInput }
  | { ok: false; error: string; field: keyof EmergencyEventInput };

/**
 * Confere e limpa o que veio da tela. As mesmas regras valem na tela (para avisar
 * antes de enviar) e no servidor (que não confia na tela).
 */
export function normalizeEmergencyEventInput(value: unknown): EmergencyInputCheck {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const name = cleanText(raw.name, EMERGENCY_NAME_MAX);
  const reportedDate = typeof raw.reportedDate === "string" ? raw.reportedDate.trim() : "";
  const visitDate = typeof raw.visitDate === "string" ? raw.visitDate.trim() : "";
  const activities = Array.isArray(raw.activities)
    ? emergencyActivities.map((activity) => activity.id).filter((id) => (raw.activities as unknown[]).includes(id))
    : [];
  const mainProblem = raw.mainProblem;
  const description = cleanLongText(raw.description, EMERGENCY_DESCRIPTION_MAX);
  const activityOther = activities.includes("other") ? cleanText(raw.activityOther, EMERGENCY_OTHER_MAX) : "";
  const mainProblemOther = mainProblem === "other" ? cleanText(raw.mainProblemOther, EMERGENCY_OTHER_MAX) : "";
  const sia = cleanText(raw.sia, 40);
  const location = cleanText(raw.location, EMERGENCY_LOCATION_MAX);

  if (!name) {
    return { ok: false, field: "name", error: "Informe o nome do evento." };
  }

  if (!reportedDate) {
    return { ok: false, field: "reportedDate", error: "Informe a data do evento." };
  }

  if (!isValidIsoDate(reportedDate)) {
    return { ok: false, field: "reportedDate", error: "A data do evento não é uma data válida." };
  }

  if (visitDate && !isValidIsoDate(visitDate)) {
    return { ok: false, field: "visitDate", error: "A data de ida ao local não é uma data válida." };
  }

  if (visitDate && visitDate < reportedDate) {
    return {
      ok: false,
      field: "visitDate",
      error: "A ida ao local ficou antes da data do evento. Confira as duas datas.",
    };
  }

  if (!isEmergencyProblemId(mainProblem)) {
    return { ok: false, field: "mainProblem", error: "Escolha o problema principal." };
  }

  if (mainProblem === "other" && !mainProblemOther) {
    return { ok: false, field: "mainProblemOther", error: "Escreva qual foi o problema principal." };
  }

  if (activities.includes("other") && !activityOther) {
    return { ok: false, field: "activityOther", error: "Escreva qual foi a outra atividade." };
  }

  if (!description) {
    return { ok: false, field: "description", error: "Descreva o que aconteceu." };
  }

  return {
    ok: true,
    event: {
      name,
      reportedDate,
      visitDate,
      activities,
      activityOther,
      mainProblem,
      mainProblemOther,
      sia,
      location,
      description,
    },
  };
}

/** Mais recentes primeiro (data do evento), e depois pelo nome. */
export function sortEmergencyEvents<T extends Pick<EmergencyEvent, "reportedDate" | "name" | "createdAt">>(events: T[]) {
  return [...events].sort(
    (a, b) =>
      b.reportedDate.localeCompare(a.reportedDate) ||
      b.createdAt.localeCompare(a.createdAt) ||
      a.name.localeCompare(b.name, "pt-BR"),
  );
}
