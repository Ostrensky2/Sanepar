import { describe, expect, it } from "vitest";
import { captureIndexRows } from "./index";
import { isCaptureView } from "./result-tabs";
import { captureResultViews } from "./views";

describe("subabas de Resultados na captação", () => {
  it("aceita só as seis subabas conhecidas", () => {
    for (const v of ["rede", "campanha", "mapa", "efeitos", "exoticas", "ponto"]) expect(isCaptureView(v)).toBe(true);
    for (const v of ["Rede", "operacional", "", undefined, 3]) expect(isCaptureView(v)).toBe(false);
  });
  it("a tabela da campanha segue a posição publicada e lê só a campanha escolhida", () => {
    const view = captureResultViews(captureIndexRows(), 3);
    const rows = captureIndexRows(3).filter(r => r.general !== null);
    expect(view.ranking).toHaveLength(rows.length);
    expect(view.ranking.map(r => r.rank)).toEqual([...rows.map(r => r.rank)].sort((a, b) => (a ?? 0) - (b ?? 0)));
    expect(view.ranking[0].general).toBe(Math.max(...rows.map(r => r.general as number)));
    expect(view.campaignStats.max).toBe(view.ranking[0].general);
    expect(view.campaignStats.measured).toBe(rows.length);
  });
});
