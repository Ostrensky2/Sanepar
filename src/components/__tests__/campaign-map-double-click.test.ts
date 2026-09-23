import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { nextDoubleClickPoint } from "../campaign-hydro-map";

describe("result map double-click", () => {
  it("focuses a first/different point and returns the same point to the regional view", () => {
    expect(nextDoubleClickPoint(null, "C2|1")).toBe("C2|1");
    expect(nextDoubleClickPoint("C2|1", "C2|1")).toBeNull();
    expect(nextDoubleClickPoint("C2|1", "C2|2")).toBe("C2|2");
    expect(nextDoubleClickPoint(null, "C1|1")).toBe("C1|1");
  });
  it("keeps result selection zoom-free and consumes the double-click gesture", () => {
    const source = readFileSync(new URL("../campaign-hydro-map.tsx", import.meta.url), "utf8");
    expect(source).toContain('zoomOnSelect && markerMode !== "resultIndex"');
    const handler = source.slice(source.indexOf("onDoubleClick={(event) =>"), source.indexOf("style={{ cursor:"));
    expect(handler).toContain("event.preventDefault()");
    expect(handler).toContain("event.stopPropagation()");
    expect(handler).toContain("resetToDefaultView()");
    expect(handler).toContain("setZoom(maxZoom)");
    expect(source).toContain("fittedPointsKeyRef.current = fitKey;\n    doubleClickPointRef.current = null;");
  });
});
