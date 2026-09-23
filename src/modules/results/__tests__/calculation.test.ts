import { describe, expect, it } from "vitest";

import { calculateAggregates, calculateComponentIndex, calculateWeightedSignal } from "../calculation";
import type { AnalyticalSet, ResultDomain } from "../types";

const domains = (value: number | null): Record<ResultDomain, number | null> => ({
  environmental: value,
  operational: value,
  humanHealth: value,
});

describe("SANEPAR-INDICE-0.3", () => {
  it("mantém reads sem score no denominador", () => {
    const result = calculateWeightedSignal([
      { reads: 30, score: 3 },
      { reads: 70, score: null },
    ]);
    expect(result.totalReads).toBe(100);
    expect(result.coverage).toBe(0.3);
    expect(result.signal).toBe(0.3);
    expect(result.index).toBeCloseTo(calculateComponentIndex(0.3), 15);
  });

  it.each([
    [3, "complete", Math.sqrt((0.4 ** 2 + 0.2 ** 2 + 0.6 ** 2) / 3), Math.sqrt((0.4 ** 2 + 0.2 ** 2 + 0.6 ** 2) / 3)],
    [2, "partial_2", Math.sqrt((0.4 ** 2 + 0.2 ** 2) / 3), Math.sqrt((0.4 ** 2 + 0.2 ** 2 + 1) / 3)],
    [1, "partial_1", Math.sqrt(0.4 ** 2 / 3), Math.sqrt((0.4 ** 2 + 2) / 3)],
    [0, "unavailable", 0, 1],
  ] as const)("aplica limites sem imputação para k=%i", (k, completeness, lower, upper) => {
    const values = [0.4, 0.2, 0.6];
    const sets = ["bacteria", "cyanobacteria", "coi"] as const;
    const components = Object.fromEntries(sets.map((set, index) => [
      set,
      domains(index < k ? values[index] : null),
    ])) as Record<AnalyticalSet, Record<ResultDomain, number | null>>;
    const result = calculateAggregates(components);
    expect(result.usedSetCount).toBe(k);
    expect(result.completeness).toBe(completeness);
    expect(result.domains.environmental.lower).toBeCloseTo(lower, 15);
    expect(result.domains.environmental.upper).toBeCloseTo(upper, 15);
    expect(result.overall.value === null).toBe(k < 3);
  });

  it("trata componente zero utilizável como presente", () => {
    const result = calculateAggregates({
      bacteria: domains(0),
      cyanobacteria: domains(0.2),
      coi: domains(0.4),
    });
    expect(result.usedSetCount).toBe(3);
    expect(result.overall.value).not.toBeNull();
  });

  it("rejeita reads inválidos antes do retorno antecipado", () => {
    expect(() => calculateWeightedSignal([{ reads: Number.NaN, score: null }])).toThrow("Reads devem ser finitos");
    expect(() => calculateWeightedSignal([{ reads: -1, score: null }])).toThrow("Reads devem ser finitos");
  });
});
