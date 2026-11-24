import { expect, it } from "vitest";
import { captureIndexRows, captureIndexView } from "./index";
import { summarizeEffects } from "./effect-summary";
import { sampleEffects } from "./sample-effects";

it("reconcilia os nove tipos de cada extrato com o agregado das três campanhas", () => {
  let observations = 0;
  for (const campaign of [1,2,3]) {
    const rows = captureIndexRows(campaign);
    const readings = rows.map(row => sampleEffects(captureIndexView(row)));
    observations += rows.length;
    const aggregate = summarizeEffects(rows, campaign);
    expect(aggregate.effects).toHaveLength(9);
    for (const [index, effect] of aggregate.effects.entries()) {
      const samples = readings.map(reading => reading[index]);
      expect(samples.every(s => s.effect.id === effect.id)).toBe(true);
      if (!effect.component) {
        expect(samples.every(s => s.status === (effect.developing ? "Em desenvolvimento" : "Não avaliado pelo método"))).toBe(true);
        continue;
      }
      expect(samples.filter(s => s.usable)).toHaveLength(effect.denominator!);
      expect({
        winning: samples.filter(s => s.contributions.some(c => c.determining)).length,
        other: samples.filter(s => s.contributions.length && !s.contributions.some(c => c.determining)).length,
        low: samples.filter(s => s.alerts.length).length,
      }).toEqual(effect.counts);
    }
  }
  expect(observations).toBe(225);
});
