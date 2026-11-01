/**
 * Vocabulário do Diário de campo, alinhado ao IAGen
 * (G:\Aplicativos\CSC\web\src\lib\field-diary\vocabularies.ts).
 *
 * Cada lista começa com os termos do IAGen, na mesma ordem e grafia, e depois traz os
 * termos que só o Sanepar usa. Os termos antigos do Sanepar continuam aceitos na
 * leitura e na importação: são traduzidos pela tabela de equivalência abaixo, que é
 * a mesma aplicada aos registros gravados pela migration
 * 20261101120000_field_diary_coordinates_status_vocabulary.sql.
 */

export const activityOptions: string[] = [
  // IAGen
  "Coleta de eDNA",
  "Coleta de zooplâncton",
  "Pesca experimental",
  "Medição de parâmetros",
  "Registro fotográfico",
  "Reconhecimento do ponto",
  // Só Sanepar
  "Deslocamento entre pontos",
  "Contato com equipe local",
  "Coleta não realizada",
  "Outra atividade",
];

export const waterVisualConditionOptions: string[] = [
  // IAGen
  "Água clara",
  "Água turva",
  "Presença de sedimento",
  "Presença de espuma",
  "Presença de macrófitas",
  "Presença de óleo ou película",
  "Odor perceptível",
  // Só Sanepar
  "Alteração de cor",
  "Material flutuante",
  "Presença aparente de floração",
  "Resíduos",
  "Peixes ou organismos mortos",
  "Nível de água visualmente baixo",
  "Outra condição",
];

export const weatherConditionOptions = [
  // IAGen
  "Céu limpo",
  "Parcialmente nublado",
  "Nublado",
  "Chuva fraca",
  "Chuva forte",
  "Vento forte",
  // Só Sanepar
  "Tempestade",
  "Neblina",
  "Não informado",
] as const;

export const pointAccessibilityOptions = [
  // IAGen
  "Acesso normal",
  "Acesso difícil",
  "Acesso bloqueado",
  "Acesso somente por embarcação",
  // Só Sanepar (entre "normal" e "difícil")
  "Acesso moderado",
] as const;

export const occurrenceTypeOptions: string[] = [
  // IAGen
  "Condição climática",
  "Falha de equipamento",
  "Acesso impedido",
  "Segurança",
  "Alteração ambiental observada",
  // Só Sanepar
  "Ponto inacessível",
  "Coleta parcial",
  "Coleta não realizada",
  "Atraso operacional",
  "Demanda recebida em campo",
  // IAGen (sempre por último)
  "Outra",
];

export type WeatherCondition = (typeof weatherConditionOptions)[number];
export type PointAccessibility = (typeof pointAccessibilityOptions)[number];

export type VocabularyKind =
  | "activities"
  | "waterVisualConditions"
  | "weatherConditions"
  | "pointAccessibility"
  | "occurrenceType";

/**
 * Tabela de equivalência: termo antigo do Sanepar -> termo novo.
 * Termos que já existem na lista nova não aparecem aqui (ficam como estão).
 * Mantida em sincronia com a migration (teste field-diary-vocabulary.test.ts).
 */
export const LEGACY_VOCABULARY_EQUIVALENCE: Record<VocabularyKind, Record<string, string>> = {
  activities: {
    "Coleta realizada": "Coleta de eDNA",
    "Vistoria visual": "Reconhecimento do ponto",
    "Medição em campo": "Medição de parâmetros",
  },
  waterVisualConditions: {
    "Aparentemente normal": "Água clara",
    "Turbidez visual elevada": "Água turva",
    "Espuma": "Presença de espuma",
  },
  weatherConditions: {
    "Sol": "Céu limpo",
    "Sol entre nuvens": "Parcialmente nublado",
    "Nublado Pós Chuva": "Nublado",
    "Chuvoso": "Chuva fraca",
    "Garoando": "Chuva fraca",
    "Nublado / Neblina": "Neblina",
  },
  pointAccessibility: {
    "Fácil": "Acesso normal",
    "Moderado": "Acesso moderado",
    "Difícil": "Acesso difícil",
    "Inacessível": "Acesso bloqueado",
  },
  occurrenceType: {
    "Problema de acesso ao ponto": "Acesso impedido",
    "Problema com equipamento": "Falha de equipamento",
    "Condição climática adversa": "Condição climática",
    "Outro": "Outra",
  },
};

/**
 * "Coleta realizada" era genérica. Quando o registro tem ID de zooplâncton, a coleta
 * de zooplâncton também aconteceu e entra na lista ao lado da coleta de eDNA.
 */
export const LEGACY_GENERIC_COLLECTION = "Coleta realizada";

const OPTIONS_BY_KIND: Record<VocabularyKind, readonly string[]> = {
  activities: activityOptions,
  waterVisualConditions: waterVisualConditionOptions,
  weatherConditions: weatherConditionOptions,
  pointAccessibility: pointAccessibilityOptions,
  occurrenceType: occurrenceTypeOptions,
};

function comparable(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

/**
 * Traduz um termo para o vocabulário atual. Reconhece o termo novo e o antigo sem
 * diferenciar maiúsculas e acentos. Um termo desconhecido volta como veio (sem
 * espaços nas pontas): nada é descartado em silêncio.
 */
export function canonicalVocabularyTerm(kind: VocabularyKind, value: unknown): string {
  const text = String(value ?? "").trim();

  if (!text) {
    return "";
  }

  const key = comparable(text);
  const current = OPTIONS_BY_KIND[kind].find((option) => comparable(option) === key);

  if (current) {
    return current;
  }

  const legacy = Object.entries(LEGACY_VOCABULARY_EQUIVALENCE[kind]).find(
    ([oldTerm]) => comparable(oldTerm) === key,
  );

  return legacy ? legacy[1] : text;
}

export function isCurrentVocabularyTerm(kind: VocabularyKind, value: unknown) {
  return OPTIONS_BY_KIND[kind].some((option) => option === value);
}

/** Lista de multisseleção (atividades, condições da água) já traduzida e sem repetição. */
export function canonicalVocabularyList(
  kind: "activities" | "waterVisualConditions",
  values: unknown,
  context: { zooplanktonId?: string | null } = {},
): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const result: string[] = [];

  for (const value of values) {
    const raw = String(value ?? "").trim();

    if (!raw) {
      continue;
    }

    const terms = [canonicalVocabularyTerm(kind, raw)];

    if (
      kind === "activities" &&
      comparable(raw) === comparable(LEGACY_GENERIC_COLLECTION) &&
      String(context.zooplanktonId ?? "").trim()
    ) {
      terms.push("Coleta de zooplâncton");
    }

    for (const term of terms) {
      if (term && !result.includes(term)) {
        result.push(term);
      }
    }
  }

  return result;
}

export function canonicalWeatherCondition(value: unknown): WeatherCondition | "" {
  const term = canonicalVocabularyTerm("weatherConditions", value);
  return isCurrentVocabularyTerm("weatherConditions", term) ? (term as WeatherCondition) : "";
}

export function canonicalPointAccessibility(value: unknown): PointAccessibility | "" {
  const term = canonicalVocabularyTerm("pointAccessibility", value);
  return isCurrentVocabularyTerm("pointAccessibility", term) ? (term as PointAccessibility) : "";
}

export function canonicalOccurrenceType(value: unknown): string {
  return canonicalVocabularyTerm("occurrenceType", value);
}
