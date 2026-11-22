import { describe, expect, it } from "vitest";
import { draftFingerprint } from "../draft-comparison";

describe("Diário: comparação de alterações para fechamento", () => {
  it("novo/edição sem mudança e reversão não sujam", () => {
    const initial = { dailySummary: "", hasOccurrence: false, photos: [] };
    const baseline = draftFingerprint(initial);
    expect(draftFingerprint({ photos: [], hasOccurrence: false, dailySummary: "" })).toBe(baseline);
    expect(draftFingerprint({ ...initial, dailySummary: "nota" })).not.toBe(baseline);
    expect(draftFingerprint({ ...initial, hasOccurrence: true })).not.toBe(baseline);
    expect(draftFingerprint({ ...initial, dailySummary: "" })).toBe(baseline);
  });
  it("foto e início de coleta alteram valores sem depender de evento input", () => {
    const initial = { collectionStartedAt: null, photos: [] };
    expect(draftFingerprint({ ...initial, collectionStartedAt: "2026-11-22T12:00:00Z" })).not.toBe(draftFingerprint(initial));
    expect(draftFingerprint({ ...initial, photos: [{ id: "photo", url: "local" }] })).not.toBe(draftFingerprint(initial));
  });
  it("carga aceita é baseline; alteração/reversão e remoção/desfazer são comparadas por valor", () => {
    const loaded = [{ id: "b", value: "2" }, { id: "a", value: "1" }];
    const baseline = draftFingerprint(loaded);
    expect(draftFingerprint([...loaded].reverse())).toBe(baseline);
    expect(draftFingerprint([{ ...loaded[0], value: "3" }, loaded[1]])).not.toBe(baseline);
    expect(draftFingerprint([loaded[0]])).not.toBe(baseline);
    expect(draftFingerprint([loaded[1], loaded[0]])).toBe(baseline);
    loaded[0].value = "4";
    expect(draftFingerprint(loaded)).not.toBe(baseline);
  });
});
