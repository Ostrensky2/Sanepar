import { describe, expect, it, vi } from "vitest";
import { continuousResultColor, drawResultMarker, RESULT_BANDS, RESULT_PALETTE, resultBand, resultIntervalStops } from "../result-visual";

describe("shared result colors and completeness markers", () => {
  it("colore por quatro faixas fixas, com cinza para a faixa sem sinal relevante", () => {
    for (const [value, color] of RESULT_PALETTE) expect(continuousResultColor(value)).toBe(color);
    expect([0, 0.049, 0.05, 0.149, 0.15, 0.349, 0.35, 0.69, 1].map((value) => resultBand(value).label))
      .toEqual(["Sem sinal relevante", "Sem sinal relevante", "Sinal fraco", "Sinal fraco", "Atenção", "Atenção", "Prioridade", "Prioridade", "Prioridade"]);
    expect(continuousResultColor(0.1)).toBe(RESULT_BANDS[1].color);
    expect(RESULT_BANDS[0].color).toBe("#9AA5B1"); // cinza: silêncio do índice não é "água boa"
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

  it("uses a horizontal interval and the exact mask even with a selection halo", () => {
    const record = recordingContext();
    drawResultMarker(record.context, 40, 40, { value: null, lower: 0.4, upper: 0.8, included: [true, false, true] }, true);
    expect(record.context.createLinearGradient).toHaveBeenCalledWith(30, 40, 50, 40);
    expect(record.stops.mock.calls.map((call) => call[1])).toEqual([RESULT_BANDS[3].color, RESULT_BANDS[3].color]);
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
