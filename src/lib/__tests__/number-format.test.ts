import { describe, expect, it } from "vitest";
import { formatNumber, formatProportionAsPercent, isCoordinateField } from "../number-format";

describe("formatNumber", () => {
  it("never shows more than three decimals", () => {
    expect(formatNumber(0.333149)).toBe("0,333");
    expect(formatNumber(0.00612345)).toBe("0,006");
    expect(formatNumber(12.5)).toBe("12,5");
  });

  it("keeps thousands separators for integers", () => {
    expect(formatNumber(1827)).toBe("1.827");
  });

  it("does not turn tiny non-zero values into zero", () => {
    expect(formatNumber(0.0004)).toBe("< 0,001");
    expect(formatNumber(0)).toBe("0");
  });
});

describe("formatProportionAsPercent", () => {
  it("shows proportions as percentages with one decimal", () => {
    expect(formatProportionAsPercent(0.7137)).toBe("71,4%");
    expect(formatProportionAsPercent(0.006)).toBe("0,6%");
  });
});

describe("coordenadas", () => {
  it("são reconhecidas pelo rótulo", () => {
    for (const label of ["Latitude", "Longitude efetiva", "Coordenadas", "lat", "lon"]) expect(isCoordinateField(label)).toBe(true);
    for (const label of ["Cobertura", "Índice geral", "Reads"]) expect(isCoordinateField(label)).toBe(false);
  });
});
