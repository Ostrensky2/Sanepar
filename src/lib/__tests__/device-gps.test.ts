import { afterEach, describe, expect, it, vi } from "vitest";
import { readDeviceGps } from "@/lib/device-gps";

type Success = (position: { coords: { latitude: number; longitude: number; accuracy: number } }) => void;
type Failure = (error: { code: number }) => void;

function stubGeolocation(getCurrentPosition: (success: Success, failure: Failure, options?: unknown) => void) {
  const spy = vi.fn(getCurrentPosition);
  vi.stubGlobal("navigator", { geolocation: { getCurrentPosition: spy } });
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("leitura do GPS do aparelho", () => {
  it("devolve a posição e a precisão, pedindo leitura nova e precisa", async () => {
    const spy = stubGeolocation((success) =>
      success({ coords: { latitude: -25.4284, longitude: -49.2733, accuracy: 6.2 } }),
    );

    await expect(readDeviceGps()).resolves.toEqual({
      gps: { latitude: -25.4284, longitude: -49.2733, accuracyM: 6.2 },
      problem: null,
    });
    expect(spy.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
  });

  it.each([
    [1, "denied"],
    [2, "unavailable"],
    [3, "timeout"],
  ] as const)("erro %i do navegador vira o motivo %s, sem lançar exceção", async (code, problem) => {
    stubGeolocation((_success, failure) => failure({ code }));

    await expect(readDeviceGps()).resolves.toEqual({ gps: null, problem });
  });

  it("aparelho sem localização não trava o formulário", async () => {
    vi.stubGlobal("navigator", {});

    await expect(readDeviceGps()).resolves.toEqual({ gps: null, problem: "unsupported" });
  });

  it("desiste sozinho quando o navegador nunca responde", async () => {
    vi.useFakeTimers();
    stubGeolocation(() => undefined);

    const pending = readDeviceGps(1000);
    await vi.advanceTimersByTimeAsync(6000);

    await expect(pending).resolves.toEqual({ gps: null, problem: "timeout" });
  });

  it("trata como sem sinal quando o navegador recusa a chamada", async () => {
    stubGeolocation(() => {
      throw new Error("SecurityError");
    });

    await expect(readDeviceGps()).resolves.toEqual({ gps: null, problem: "unavailable" });
  });
});
