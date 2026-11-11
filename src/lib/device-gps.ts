/**
 * Leitura do GPS do aparelho pelo navegador. É o único ponto que toca em
 * `navigator.geolocation`; a regra do que fazer com a leitura fica em
 * lib/collection-capture, que é pura e testada.
 */

import { gpsProblemFromErrorCode, type GpsProblem, type GpsReading } from "@/lib/collection-capture";

export type DeviceGpsResult = { gps: GpsReading; problem: null } | { gps: null; problem: GpsProblem };

export const DEVICE_GPS_TIMEOUT_MS = 15000;

/** Nunca rejeita: sem leitura, devolve o motivo. */
export function readDeviceGps(timeoutMs = DEVICE_GPS_TIMEOUT_MS): Promise<DeviceGpsResult> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ gps: null, problem: "unsupported" });
  }

  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: DeviceGpsResult) => {
      if (!settled) {
        settled = true;
        clearTimeout(guard);
        resolve(result);
      }
    };
    // Alguns navegadores não chamam nenhum dos retornos quando a pessoa fecha o
    // pedido de permissão sem responder. O formulário não pode ficar esperando.
    const guard = setTimeout(() => settle({ gps: null, problem: "timeout" }), timeoutMs + 5000);

    try {
      navigator.geolocation.getCurrentPosition(
        (position) =>
          settle({
            gps: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              accuracyM: Number.isFinite(position.coords.accuracy) ? position.coords.accuracy : null,
            },
            problem: null,
          }),
        (error) => settle({ gps: null, problem: gpsProblemFromErrorCode(error?.code) }),
        { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 },
      );
    } catch {
      settle({ gps: null, problem: "unavailable" });
    }
  });
}
