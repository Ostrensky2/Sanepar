import { describe, expect, it, vi } from "vitest";
import { continuousResultColor, drawResultMarker, hasLimitedCoverage, RESULT_BANDS, RESULT_PALETTE, resultBand, resultIntervalStops } from "../result-visual";

describe("shared result colors and completeness markers", () => {
  it("colore por quatro faixas fixas, com cinza para a faixa sem sinal relevante", () => {
    for (const [value, color] of RESULT_PALETTE) expect(continuousResultColor(value)).toBe(color);
    expect([0, 0.049, 0.05, 0.149, 0.15, 0.349, 0.35, 0.69, 1].map((value) => resultBand(value).label))
      .toEqual(["Sinal muito baixo", "Sinal muito baixo", "Sinal fraco", "Sinal fraco", "Atenção", "Atenção", "Prioridade", "Prioridade", "Prioridade máxima"]);
    expect(resultBand(0.7).label).toBe("Prioridade máxima"); // faixa reservada: nenhuma observação chega a ela
    expect(continuousResultColor(0.1)).toBe(RESULT_BANDS[1].color);
    expect(RESULT_BANDS[0].color).toBe("#C5CCD3"); // cinza-claro: sinal muito baixo não é "água boa"
    expect(continuousResultColor(-1)).toBe(continuousResultColor(0));
    expect(continuousResultColor(2)).toBe(continuousResultColor(1));
  });

  it("um intervalo atravessa as faixas que contém, com a troca de cor no limite", () => {
    const stops = resultIntervalStops(0.1, 0.25);
    expect(stops.map((stop) => stop.color)).toEqual([RESULT_BANDS[1].color, RESULT_BANDS[2].color, RESULT_BANDS[2].color]);
    expect(stops[0].offset).toBe(0);
    expect(stops[1].offset).toBeCloseTo(1 / 3);
    expect(stops[2].offset).toBe(1);
  });

  it("desenha o zero calculado em cinza e a falta de medição em neutro, com o selo 0/3", () => {
    const zero = recordingContext();
    drawResultMarker(zero.context, 40, 40, { value: 0, lower: 0, upper: 0, included: [true, true, true] });
    expect(zero.fills).toContain(RESULT_BANDS[0].color);
    expect(zero.context.fillText).not.toHaveBeenCalled();
    const unavailable = recordingContext();
    drawResultMarker(unavailable.context, 40, 40, { value: null, lower: 0, upper: 1, included: [false, false, false] });
    expect(unavailable.fills).toContain("#edf4f7");
    expect(unavailable.fills).not.toContain(RESULT_BANDS[0].color);
    expect(unavailable.context.fillText).toHaveBeenCalledWith("0/3", 40, 65);
  });

  it("a cor diz o sinal e o contorno tracejado diz a cobertura, em qualquer nota", () => {
    expect([hasLimitedCoverage(0.07), hasLimitedCoverage(0.199), hasLimitedCoverage(0.2), hasLimitedCoverage(0.6), hasLimitedCoverage(null), hasLimitedCoverage(undefined)])
      .toEqual([true, true, false, false, false, false]);
    const strong = recordingContext();
    drawResultMarker(strong.context, 40, 40, { value: 0.4, lower: 0, upper: 0.6, included: [true, true, false], limitedCoverage: true });
    expect(strong.fills).toContain(RESULT_BANDS[3].color); // sinal forte continua com a sua cor, mesmo com pouca coisa avaliada
    expect(strong.context.setLineDash).toHaveBeenCalledWith([3, 3]);
    expect(strong.context.createLinearGradient).not.toHaveBeenCalled(); // sem COI, mas com nota: cor da faixa, não intervalo
    expect(strong.context.fillText).toHaveBeenCalledWith("2/3", 40, 65);
    const covered = recordingContext();
    drawResultMarker(covered.context, 40, 40, { value: 0.01, lower: 0, upper: 0.2, included: [true, true, true] });
    expect(covered.fills).toContain(RESULT_BANDS[0].color);
    expect(covered.context.setLineDash).not.toHaveBeenCalledWith([3, 3]);
  });

  it("uses a horizontal interval and the exact mask even with a selection halo", () => {
    const record = recordingContext();
    drawResultMarker(record.context, 40, 40, { value: null, lower: 0.4, upper: 0.8, included: [true, false, true] }, true);
    expect(record.context.createLinearGradient).toHaveBeenCalledWith(30, 40, 50, 40);
    expect(record.stops.mock.calls.map((call) => call[1])).toEqual([RESULT_BANDS[3].color, RESULT_BANDS[4].color, RESULT_BANDS[4].color]);
    // Background, interval, then the top / bottom-right / bottom-left segments.
    expect(record.fills.slice(2)).toEqual(["#17354c", "#ffffff", "#17354c"]);
    expect(record.context.fillText).toHaveBeenCalledWith("2/3", 40, 65);
  });
});

function recordingContext() {
  const fills: unknown[] = [];
  const stops = vi.fn();
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 1,
    save: vi.fn(), restore: vi.fn(), setLineDash: vi.fn(), beginPath: vi.fn(), closePath: vi.fn(), arc: vi.fn(), stroke: vi.fn(),
    fill: () => fills.push(ctx.fillStyle), fillRect: vi.fn(), strokeRect: vi.fn(), fillText: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: stops })),
  };
  return { context: ctx as unknown as CanvasRenderingContext2D, fills, stops };
}
