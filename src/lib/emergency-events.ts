/**
 * Eventos emergenciais (Central de dados › Eventos emergenciais).
 *
 * Registro de um problema comunicado fora da rotina das campanhas (entupimento de
 * filtros, cheiro ou gosto na água, floração de algas…) e de cada ida da equipe ao
 * local por causa dele. Um evento pode ter várias idas, com objetivos diferentes.
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
/** "Outra atividade": cabe a descrição de várias atividades. */
export const EMERGENCY_ACTIVITY_OTHER_MAX = 1000;
export const EMERGENCY_OBJECTIVE_MAX = 200;
export const EMERGENCY_VISIT_NOTES_MAX = 4000;
export const EMERGENCY_VISITS_MAX = 50;
export const EMERGENCY_LOCATION_MAX = 200;
export const EMERGENCY_DESCRIPTION_MAX = 8000;

/**
 * Uma ida da equipe ao local. Um mesmo evento pode ter várias idas, cada uma com
 * o seu objetivo (primeira vistoria, nova coleta, conferir a melhora…).
 */
export type EmergencyVisit = {
  /** Identificador da ida dentro do evento (só para a tela saber qual é qual). */
  id: string;
  /** Dia da ida (AAAA-MM-DD). */
  date: string;
  objective: string;
  activities: EmergencyActivityId[];
  /** Descrição livre quando "Outra atividade" está marcada (pode ser mais de uma). */
  activityOther: string;
  notes: string;
};

export type EmergencyEvent = {
  id: string;
  name: string;
  /** Data do evento, como foi informada (AAAA-MM-DD). */
  reportedDate: string;
  /** Idas ao local, da mais antiga para a mais recente. Vazio enquanto ninguém foi. */
  visits: EmergencyVisit[];
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
  "name" | "reportedDate" | "visits" | "mainProblem" | "mainProblemOther" | "sia" | "location" | "description"
>;

/** Identificador novo para uma ida (no navegador ou no servidor). */
export function newEmergencyVisitId() {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;

  if (cryptoApi?.randomUUID) {
    return cryptoApi.randomUUID();
  }

  return `ida-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function emptyEmergencyVisit(): EmergencyVisit {
  return { id: newEmergencyVisitId(), date: "", objective: "", activities: [], activityOther: "", notes: "" };
}

export function emptyEmergencyEventInput(): EmergencyEventInput {
  return {
    name: "",
    reportedDate: "",
    visits: [emptyEmergencyVisit()],
    mainProblem: "" as EmergencyProblemId,
    mainProblemOther: "",
    sia: "",
    location: "",
    description: "",
  };
}

/** Ida sem nada preenchido: a tela mostra um bloco vazio e ele não conta como ida. */
export function isBlankEmergencyVisit(visit: Partial<Record<keyof EmergencyVisit, unknown>>) {
  const filled = (value: unknown) => typeof value === "string" && value.trim() !== "";

  return (
    !filled(visit.date) &&
    !filled(visit.objective) &&
    !filled(visit.notes) &&
    !filled(visit.activityOther) &&
    !(Array.isArray(visit.activities) && visit.activities.some(isEmergencyActivityId))
  );
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
export function emergencyActivitiesText(visit: Pick<EmergencyVisit, "activities" | "activityOther">) {
  return emergencyActivities
    .filter((activity) => visit.activities.includes(activity.id))
    .map((activity) => (activity.id === "other" && visit.activityOther ? visit.activityOther : activity.label));
}

/** "1ª ida", "2ª ida"… */
export function emergencyVisitOrdinal(index: number) {
  return `${index + 1}ª ida`;
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
  | {
      ok: false;
      error: string;
      field: keyof EmergencyEventInput | `visits.${keyof EmergencyVisit}`;
      /** Posição da ida com problema, na ordem em que a tela mostrou (começa em 0). */
      visitIndex?: number;
    };

type VisitCheck =
  | { ok: true; visit: EmergencyVisit }
  | { ok: false; error: string; field: `visits.${keyof EmergencyVisit}` };

const VISIT_ID = /^[A-Za-z0-9-]{1,64}$/;

function normalizeVisit(value: unknown, reportedDate: string, label: string): VisitCheck {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const id = typeof raw.id === "string" && VISIT_ID.test(raw.id) ? raw.id : newEmergencyVisitId();
  const date = typeof raw.date === "string" ? raw.date.trim() : "";
  const activities = Array.isArray(raw.activities)
    ? emergencyActivities.map((activity) => activity.id).filter((activityId) => (raw.activities as unknown[]).includes(activityId))
    : [];
  const activityOther = activities.includes("other") ? cleanLongText(raw.activityOther, EMERGENCY_ACTIVITY_OTHER_MAX) : "";

  if (!date) {
    return { ok: false, field: "visits.date", error: `${label}: informe a data da ida ao local.` };
  }

  if (!isValidIsoDate(date)) {
    return { ok: false, field: "visits.date", error: `${label}: a data da ida ao local não é uma data válida.` };
  }

  if (date < reportedDate) {
    return {
      ok: false,
      field: "visits.date",
      error: `${label}: a ida ao local ficou antes da data do evento. Confira as duas datas.`,
    };
  }

  if (activities.includes("other") && !activityOther) {
    return { ok: false, field: "visits.activityOther", error: `${label}: descreva a outra atividade feita.` };
  }

  return {
    ok: true,
    visit: {
      id,
      date,
      objective: cleanText(raw.objective, EMERGENCY_OBJECTIVE_MAX),
      activities,
      activityOther,
      notes: cleanLongText(raw.notes, EMERGENCY_VISIT_NOTES_MAX),
    },
  };
}

/** Idas da mais antiga para a mais recente; no mesmo dia, mantém a ordem em que foram lançadas. */
export function sortEmergencyVisits<T extends Pick<EmergencyVisit, "date">>(visits: T[]) {
  return visits
    .map((visit, index) => ({ visit, index }))
    .sort((a, b) => a.visit.date.localeCompare(b.visit.date) || a.index - b.index)
    .map(({ visit }) => visit);
}

/**
 * Confere e limpa o que veio da tela. As mesmas regras valem na tela (para avisar
 * antes de enviar) e no servidor (que não confia na tela).
 */
export function normalizeEmergencyEventInput(value: unknown): EmergencyInputCheck {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const name = cleanText(raw.name, EMERGENCY_NAME_MAX);
  const reportedDate = typeof raw.reportedDate === "string" ? raw.reportedDate.trim() : "";
  const mainProblem = raw.mainProblem;
  const description = cleanLongText(raw.description, EMERGENCY_DESCRIPTION_MAX);
  const mainProblemOther = mainProblem === "other" ? cleanText(raw.mainProblemOther, EMERGENCY_OTHER_MAX) : "";
  const sia = cleanText(raw.sia, 40);
  const location = cleanText(raw.location, EMERGENCY_LOCATION_MAX);
  const rawVisits = Array.isArray(raw.visits) ? (raw.visits as unknown[]) : [];

  if (!name) {
    return { ok: false, field: "name", error: "Informe o nome do evento." };
  }

  if (!reportedDate) {
    return { ok: false, field: "reportedDate", error: "Informe a data do evento." };
  }

  if (!isValidIsoDate(reportedDate)) {
    return { ok: false, field: "reportedDate", error: "A data do evento não é uma data válida." };
  }

  if (!isEmergencyProblemId(mainProblem)) {
    return { ok: false, field: "mainProblem", error: "Escolha o problema principal." };
  }

  if (mainProblem === "other" && !mainProblemOther) {
    return { ok: false, field: "mainProblemOther", error: "Escreva qual foi o problema principal." };
  }

  const visits: EmergencyVisit[] = [];
  const usedIds = new Set<string>();

  for (const [index, rawVisit] of rawVisits.entries()) {
    if (isBlankEmergencyVisit((rawVisit ?? {}) as Record<string, unknown>)) {
      continue;
    }

    const checked = normalizeVisit(rawVisit, reportedDate, emergencyVisitOrdinal(index));

    if (!checked.ok) {
      return { ...checked, visitIndex: index };
    }

    // Duas idas com o mesmo identificador (cópia malfeita): a segunda ganha um novo.
    const visit = usedIds.has(checked.visit.id) ? { ...checked.visit, id: newEmergencyVisitId() } : checked.visit;
    usedIds.add(visit.id);
    visits.push(visit);
  }

  if (visits.length > EMERGENCY_VISITS_MAX) {
    return { ok: false, field: "visits", error: `Um evento pode ter até ${EMERGENCY_VISITS_MAX} idas ao local.` };
  }

  if (!description) {
    return { ok: false, field: "description", error: "Descreva o que aconteceu." };
  }

  return {
    ok: true,
    event: {
      name,
      reportedDate,
      visits: sortEmergencyVisits(visits),
      mainProblem,
      mainProblemOther,
      sia,
      location,
      description,
    },
  };
}

/**
 * Lê as idas gravadas no banco (coluna jsonb). O que não tem data válida é descartado,
 * atividade que saiu da lista some, e o resto fica como foi gravado.
 */
export function parseStoredEmergencyVisits(value: unknown): EmergencyVisit[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const visits = value.flatMap((item): EmergencyVisit[] => {
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return [];
    }

    const raw = item as Record<string, unknown>;
    const date = typeof raw.date === "string" ? raw.date.slice(0, 10) : "";

    if (!isValidIsoDate(date)) {
      return [];
    }

    const activities = Array.isArray(raw.activities) ? raw.activities.filter(isEmergencyActivityId) : [];

    return [{
      id: typeof raw.id === "string" && VISIT_ID.test(raw.id) ? raw.id : `ida-${date}`,
      date,
      objective: typeof raw.objective === "string" ? raw.objective : "",
      activities: emergencyActivities.map((activity) => activity.id).filter((id) => activities.includes(id)),
      activityOther: typeof raw.activityOther === "string" ? raw.activityOther : "",
      notes: typeof raw.notes === "string" ? raw.notes : "",
    }];
  });

  return sortEmergencyVisits(visits);
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

/** O evento como o formulário o edita. */
export function emergencyEventToInput(event: EmergencyEvent): EmergencyEventInput {
  return {
    name: event.name,
    reportedDate: event.reportedDate,
    visits: event.visits.map((visit) => ({ ...visit, activities: [...visit.activities] })),
    mainProblem: event.mainProblem,
    mainProblemOther: event.mainProblemOther,
    sia: event.sia,
    location: event.location,
    description: event.description,
  };
}

const mergeableFields = [
  ["name", "Nome do evento"],
  ["reportedDate", "Data do evento"],
  ["mainProblem", "Problema principal"],
  ["mainProblemOther", "Problema principal"],
  ["sia", "Ponto da campanha"],
  ["location", "Local"],
  ["description", "Descrição do fato"],
] as const;

function sameVisit(a: EmergencyVisit | undefined, b: EmergencyVisit | undefined) {
  if (!a || !b) return a === b;
  return (
    a.date === b.date &&
    a.objective === b.objective &&
    a.activityOther === b.activityOther &&
    a.notes === b.notes &&
    [...a.activities].sort().join() === [...b.activities].sort().join()
  );
}

export type EmergencyMergeResult = {
  merged: EmergencyEventInput;
  /** Campos (e idas) que as duas pessoas mudaram de jeito diferente: ficou a versão de quem está salvando. */
  conflicts: string[];
};

/**
 * Junta duas edições do mesmo evento feitas ao mesmo tempo (comparação em três vias):
 * `base` é o evento como estava quando esta tela abriu, `mine` o que esta tela quer
 * gravar e `theirs` o que outra pessoa gravou nesse meio-tempo.
 *
 * - Campo que só uma pessoa mudou fica com a mudança dela.
 * - Ida acrescentada por qualquer uma das duas entra; ida apagada por uma e não
 *   mexida pela outra sai; ida mexida por uma e apagada pela outra fica (nada some
 *   sem aviso).
 * - Quando as duas mudaram o mesmo campo ou a mesma ida, fica a versão desta tela e
 *   o campo vai para `conflicts`, para a pessoa conferir antes de salvar.
 */
export function mergeEmergencyEventEdits(
  base: EmergencyEventInput,
  mine: EmergencyEventInput,
  theirs: EmergencyEventInput,
): EmergencyMergeResult {
  const conflicts = new Set<string>();
  const merged = { ...theirs } as EmergencyEventInput;
  const target = merged as Record<string, unknown>;

  for (const [field, label] of mergeableFields) {
    const changedByMe = mine[field] !== base[field];
    const changedByThem = theirs[field] !== base[field];

    if (changedByMe) {
      target[field] = mine[field];
      if (changedByThem && theirs[field] !== mine[field]) conflicts.add(label);
    }
  }

  const baseById = new Map(base.visits.map((visit) => [visit.id, visit]));
  const mineById = new Map(mine.visits.map((visit) => [visit.id, visit]));
  const theirsById = new Map(theirs.visits.map((visit) => [visit.id, visit]));
  const ids = [...new Set([...theirs.visits, ...mine.visits, ...base.visits].map((visit) => visit.id))];
  const visits: EmergencyVisit[] = [];

  for (const id of ids) {
    const original = baseById.get(id);
    const mineVisit = mineById.get(id);
    const theirVisit = theirsById.get(id);
    const changedByMe = !sameVisit(original, mineVisit);
    const changedByThem = !sameVisit(original, theirVisit);

    // Quem mexeu decide; se os dois mexeram, fica a versão desta tela (ou a outra, se esta apagou).
    const chosen = changedByMe ? mineVisit ?? (changedByThem ? theirVisit : undefined) : theirVisit;

    if (changedByMe && changedByThem && !sameVisit(mineVisit, theirVisit)) {
      const reference = mineVisit ?? theirVisit ?? original;
      conflicts.add(`Ida de ${reference ? formatEmergencyDate(reference.date) || "data em branco" : "data em branco"}`);
    }

    if (chosen) visits.push({ ...chosen, activities: [...chosen.activities] });
  }

  merged.visits = sortEmergencyVisits(visits);
  return { merged, conflicts: [...conflicts] };
}
