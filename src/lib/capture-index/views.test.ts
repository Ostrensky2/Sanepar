import { describe, expect, it, vi } from "vitest";
import { captureIndexRows } from "./index";
import { captureResultViews } from "./views";
const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));
import { GET } from "@/app/api/results/capture-index/route";

describe("vistas do índice de captação", () => {
  it("separa a população de cada campanha da coorte medida em todas e usa P90 empírico", () => {
    const sample = captureIndexRows()[0];
    const row = (campaign: number, sia: string, general: number | null) => ({
      ...sample,
      campaign,
      sia,
      general,
    });
    const rows = [
      row(1, "1", 0),
      row(1, "2", 1),
      row(2, "1", 0.4),
      row(2, "2", null),
      row(3, "1", 0.2),
    ];
    const { network, points, history, point } = captureResultViews(rows);
    expect(network[0].all).toEqual({
      total: 2,
      measured: 2,
      mean: 0.5,
      p90: 1,
    });
    expect(network[0].cohort).toEqual({
      total: 1,
      measured: 1,
      mean: 0,
      p90: 0,
    });
    expect(network[1].all.measured).toBe(1);
    expect([points, history, point]).toEqual([[], [], null]);
    const selected = captureResultViews(rows, 2, "2");
    expect(selected.history).toEqual([
      { campaign: 1, present: true, score: 1 },
      { campaign: 2, present: true, score: null },
      { campaign: 3, present: false, score: null },
    ]);
    expect(selected.point?.general).toBe("sem medição");
  });
  it("usa as fronteiras inclusivas oficiais nos histogramas do índice e de cada categoria", () => {
    const values = [
      null,
      0,
      0.04999,
      0.05,
      0.14999,
      0.15,
      0.34999,
      0.35,
      0.69999,
      0.7,
      1,
    ];
    const sample = captureIndexRows().find((row) => row.scores.Ambiental)!;
    const rows = values.map((value, i) => ({
      ...sample,
      campaign: 1,
      sia: String(i + 1),
      general: value,
      scores: {
        ...sample.scores,
        Ambiental:
          value === null ? null : { ...sample.scores.Ambiental!, score: value },
      },
    }));
    const result = captureResultViews(rows, 1);
    for (const series of [result.network[0], result.categories[0]]) {
      expect(series.bins).toEqual([2, 2, 2, 2, 2]);
      expect(series.missing).toBe(1);
      expect(
        [...series.bins, series.missing].reduce(
          (fraction, count) => fraction + count / rows.length,
          0,
        ),
      ).toBeCloseTo(1, 12);
    }
  });
  it("fecha as distribuições e a cobertura sobre os pontos da campanha, sem lista de instalações por categoria", () => {
    for (const n of [1, 2, 3]) {
      const rows = captureIndexRows(n);
      const result = captureResultViews(rows, n);
      for (const category of result.categories) {
        expect(category.bins.reduce((a, b) => a + b, category.missing)).toBe(
          rows.length,
        );
        expect(Object.keys(category).sort()).toEqual([
          "bins",
          "missing",
          "name",
        ]);
      }
      for (const marker of result.markers)
        expect(marker.usable).toBe(
          rows.filter(
            (row) => row.components[marker.name].status === "disponível",
          ).length,
        );
      expect(result.point).toBeNull();
    }
  });
  it("mantém a autorização e rejeita campanha ou SIA ambíguos antes de expor resultados", async () => {
    const get = (q: string) =>
      GET(
        new Request(
          "http://localhost/api/results/capture-index?format=views" + q,
        ),
      );
    auth.mockResolvedValue({
      ok: false,
      response: new Response(null, { status: 403 }),
    });
    expect((await get("&campaign=3")).status).toBe(403);
    auth.mockResolvedValue({ ok: true });
    for (const q of [
      "&campaign=4",
      "&sia=1",
      "&campaign=3&sia=1&sia=2",
      "&campaign=3&sia=1x",
    ])
      expect((await get(q)).status).toBe(422);
    const res = await get("&campaign=3");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect((await res.json()).point).toBeNull();
  });
});
