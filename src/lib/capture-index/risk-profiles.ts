import { effects, matchCard } from "./effect-catalog";
import { formatCaptureIndex } from "./format";

/** Perfil de risco biológico de uma captação identificável (campanha + SIA).
 * Associa a nota 0.8 da categoria aos tipos de efeito com contribuição documentada naquela observação.
 * Nada é inferido de outra campanha, de outro ponto ou do nome do táxon: só fichas do catálogo de efeitos. */
export const riskProfileDefinitions = [
  { key: "operacional", label: "Risco biológico operacional", domain: "Operacional", effects: ["odour", "diatom", "fouling", "larvae"] },
  { key: "sanitario", label: "Risco biológico sanitário", domain: "Saúde humana", effects: ["cyanotoxins", "fecal"] },
] as const;
export type RiskProfileKey = (typeof riskProfileDefinitions)[number]["key"];
export type RiskProfileState = "com sinal documentado" | "sem sinal documentado" | "sem estimativa" | "sem medição";
export type RiskProfile = {
  key: RiskProfileKey; label: string; state: RiskProfileState;
  /** Nota 0.8 da categoria; `null` quando não há estimativa ou medição. Zero é nota calculada. */
  value: number | null; score: string;
  /** Tipos de efeito com contribuição positiva; `determining` = no marcador que definiu a nota da categoria. */
  effects: { id: string; title: string; determining: boolean }[];
  /** Contribuições positivas da categoria sem tipo de efeito catalogado. */
  otherContributions: number;
  summary: string;
};
type ProfileScore = { score: number; component: string | null; contributions: readonly { ficha: string; component: string; q: number }[] } | null;
type ProfileRow = { scores: Record<string, ProfileScore>; estimate?: string; general: number | null };

const titles = new Map<string, string>(effects.map(effect => [effect.id, effect.title]));

export function captureRiskProfiles(row: ProfileRow): RiskProfile[] {
  return riskProfileDefinitions.map(({ key, label, domain, effects: allowed }) => {
    const score = row.scores[domain] ?? null;
    if (!score) {
      const state: RiskProfileState = row.estimate === "sem medição" || (row.estimate === undefined && row.general === null) ? "sem medição" : "sem estimativa";
      return { key, label, state, value: null, score: state, effects: [], otherContributions: 0, summary: state === "sem medição" ? "Sem medição" : "Sem estimativa" };
    }
    const found = new Map<string, boolean>();
    let other = 0;
    for (const item of score.contributions) {
      if (!(item.q > 0)) continue;
      const id = matchCard(item.ficha, domain, item.component);
      if (!id || !(allowed as readonly string[]).includes(id)) { other++; continue; }
      found.set(id, (found.get(id) ?? false) || item.component === score.component);
    }
    const list = allowed.filter(id => found.has(id)).map(id => ({ id, title: titles.get(id) ?? id, determining: found.get(id) === true }));
    const text = formatCaptureIndex(score.score);
    const state: RiskProfileState = score.score > 0 ? "com sinal documentado" : "sem sinal documentado";
    const parts = [...list.map(item => item.title), ...(other ? [`${other} outra(s) contribuição(ões) documentada(s)`] : [])];
    return { key, label, state, value: score.score, score: text, effects: list, otherContributions: other,
      summary: `${text} · ${parts.length ? parts.join("; ") : "nenhum tipo de efeito com contribuição documentada"}` };
  });
}
