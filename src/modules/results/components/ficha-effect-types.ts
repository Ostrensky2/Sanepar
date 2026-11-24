/**
 * Tipo de efeito de cada ficha, para os filtros do catálogo de impactos.
 *
 * As fichas da revisão de 23/11 trazem o tema (T01 a T15). As fichas mais antigas trazem o código do catálogo anterior
 * (A1, O5, S7…), sem nome. A tabela abaixo dá a cada código antigo um tipo de efeito, reaproveitando os temas quando
 * o efeito é o mesmo. É só agrupamento para consulta: não muda gravidade, aplicabilidade nem nota.
 * Base de cada linha: a descrição dos efeitos que as fichas daquele código registram.
 */
export const effectTypes = {
  "animal-toxicity": "Toxicidade para animais",
  "animal-disease": "Doença em animais",
  "plant-disease": "Doença em plantas",
  invasive: "Espécie invasora",
  environment: "Floração e alteração do ambiente",
  "other-environment": "Outros efeitos ambientais",
  odour: "Gosto e odor",
  fouling: "Biofilme e incrustação",
  clogging: "Obstrução de filtros e telas",
  larvae: "Larvas em sistemas",
  corrosion: "Ferro, manganês e corrosão",
  nitrification: "Nitrificação",
  treatment: "Subprodutos e tratamento",
  "other-operational": "Outros efeitos operacionais",
  cyanotoxins: "Cianotoxinas",
  pathogen: "Patógeno ou oportunista",
  fecal: "Indicador de contaminação fecal",
  "parasite-host": "Hospedeiro de parasita",
  "other-health": "Outros efeitos à saúde",
} as const;
export type EffectTypeId = keyof typeof effectTypes;

const byCode: Record<string, EffectTypeId> = {
  // Temas da revisão de 23/11
  T01: "environment", T02: "invasive", T03: "fouling", T04: "clogging", T05: "larvae", T06: "odour", T07: "odour", T08: "cyanotoxins",
  T09: "animal-toxicity", T10: "pathogen", T11: "fecal", T12: "nitrification", T13: "corrosion", T14: "treatment", T15: "other-operational",
  // Códigos do catálogo anterior
  A1: "animal-toxicity", // toxicidade para animais (cianobactérias e toxinas na fauna)
  A3: "animal-disease", // infecção ou doença em peixes, anfíbios e outros animais
  A6: "invasive", // espécie introduzida que desloca a biota nativa
  A7: "environment", // alteração física do ambiente (ex.: revolvimento do sedimento)
  A9: "plant-disease", // doença em plantas
  O1: "fouling", // incrustação em estruturas (mexilhão-dourado, Cordylophora)
  O3: "treatment", // comprometimento do tratamento
  O5: "odour", // gosto e odor (geosmina, 2-MIB)
  O6: "corrosion", // bactérias do ferro e corrosão
  O7: "larvae", // larvas em unidades de tratamento
  O8: "other-operational",
  O9: "clogging", // bactérias filamentosas
  S1: "fecal", // contaminação fecal e veiculação hídrica
  S2: "pathogen", // Legionella
  S3: "cyanotoxins", // produção de cianotoxinas
  S4: "other-health", // animais que causam dano direto a pessoas
  S5: "parasite-host", // caramujos hospedeiros de Schistosoma
  S7: "pathogen", // infecção humana documentada
};
const fallback: Record<string, EffectTypeId> = { Ambiental: "other-environment", Operacional: "other-operational", "Saúde humana": "other-health" };

export function effectTypeOf(code: string, domain: string): EffectTypeId {
  return byCode[code] ?? fallback[domain] ?? "other-environment";
}
