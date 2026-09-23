import { describe, expect, it, vi } from "vitest";
import { continuousResultColor, drawResultMarker, RESULT_PALETTE, resultIntervalStops } from "../result-visual";

describe("shared result colors and completeness markers", () => {
  it("keeps all six anchors fixed and interpolates between adjacent anchors", () => {
    for (const [value, color] of RESULT_PALETTE) expect(continuousResultColor(value)).toBe(color);
    expect(continuousResultColor(0.1)).toBe("#60B95D");
    expect(continuousResultColor(-1)).toBe(continuousResultColor(0));
    expect(continuousResultColor(2)).toBe(continuousResultColor(1));
  });

  it("limits a .4–.8 interval to yellow, orange and red, preserving interior stops", () => {
    const stops = resultIntervalStops(0.4, 0.8);
    expect(stops.map((stop) => stop.color)).toEqual(["#FFD43B", "#F46D23", "#D7191C"]);
    expect(stops[0].offset).toBe(0);
    expect(stops[1].offset).toBeCloseTo(0.5);
    expect(stops[2].offset).toBe(1);
  });

  it("draws numeric zero green but unavailable neutral with an explicit 0/3 badge", () => {
    const zero = recordingContext();
    drawResultMarker(zero.context, 40, 40, { value: 0, lower: 0, upper: 0, included: [true, true, true] });
    expect(zero.fills).toContain("#1A9850");
    expect(zero.context.fillText).not.toHaveBeenCalled();
    const unavailable = recordingContext();
    drawResultMarker(unavailable.context, 40, 40, { value: null, lower: 0, upper: 1, included: [false, false, false] });
    expect(unavailable.fills).toContain("#edf4f7");
    expect(unavailable.fills).not.toContain("#1A9850");
    expect(unavailable.context.fillText).toHaveBeenCalledWith("0/3", 40, 65);
  });

  it("uses a horizontal interval and the exact mask even with a selection halo", () => {
    const record = recordingContext();
    drawResultMarker(record.context, 40, 40, { value: null, lower: 0.4, upper: 0.8, included: [true, false, true] }, true);
    expect(record.context.createLinearGradient).toHaveBeenCalledWith(30, 40, 50, 40);
    expect(record.stops.mock.calls.map((call) => call[1])).toEqual(["#FFD43B", "#F46D23", "#D7191C"]);
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
