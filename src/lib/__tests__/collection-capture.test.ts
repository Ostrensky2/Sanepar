import { describe, expect, it } from "vitest";
import {
  buildCollectionStart,
  buildPositionCapture,
  buildTimeCapture,
  captureRowColumns,
  collectionRestartWarning,
  describeCoordinateSource,
  distanceMeters,
  formatCollectionStart,
  formatDistance,
  gpsProblemFromErrorCode,
  localIsoDate,
  localTimeOfDay,
  normalizeGpsAccuracy,
  parseCoordinateSource,
  plannedPatchForPointChange,
} from "@/lib/collection-capture";

// Ponto planejado e leituras em volta dele (1 milésimo de grau de latitude ≈ 111 m).
const planned = { latitude: -25.4284, longitude: -49.2733 };
const gpsOnPoint = { latitude: -25.42845, longitude: -49.27331, accuracyM: 8.4 };
const gpsFarAway = { latitude: -25.4384, longitude: -49.2733, accuracyM: 10 };

describe("captura automática — hora e data", () => {
  it("usa a data e a hora locais do aparelho, não as de UTC", () => {
    // 21h40 no aparelho: em UTC-3 o dia em UTC já seria o seguinte.
    const now = new Date(2026, 10, 7, 21, 40, 12);

    expect(localIsoDate(now)).toBe("2026-11-07");
    expect(localTimeOfDay(now)).toBe("21:40");
    expect(localTimeOfDay(new Date(2026, 0, 3, 7, 5))).toBe("07:05");
  });

  it("grava a hora, a data e o momento exato do toque", () => {
    const now = new Date(2026, 10, 7, 9, 3, 30);
    const { patch, notices } = buildTimeCapture({ now, currentEntryDate: "2026-11-07" });

    expect(patch).toEqual({
      entryDate: "2026-11-07",
      collectionTime: "09:03",
      collectionStartedAt: now.toISOString(),
    });
    expect(notices).toEqual(["Hora da coleta gravada: 09:03."]);
  });

  it("avisa quando a data do registro muda para hoje", () => {
    const { patch, notices } = buildTimeCapture({
      now: new Date(2026, 10, 7, 9, 3),
      currentEntryDate: "2026-11-05",
    });

    expect(patch.entryDate).toBe("2026-11-07");
    expect(notices[1]).toBe("A data do registro mudou de 05/11/2026 para hoje, 07/11/2026.");
  });

  it("pergunta antes de trocar a hora de um registro que já tem hora", () => {
    const now = new Date(2026, 10, 7, 9, 3);

    expect(collectionRestartWarning({ entryDate: "2026-11-07", collectionTime: "" }, now)).toBe("");
    expect(collectionRestartWarning({ entryDate: "2026-11-05", collectionTime: "" }, now)).toBe("");
    expect(collectionRestartWarning({ entryDate: "2026-11-07", collectionTime: "08:10" }, now)).toBe(
      "Este registro já tem a hora 08:10. Iniciar a coleta de novo troca pela hora de agora e lê o GPS outra vez.",
    );
    expect(collectionRestartWarning({ entryDate: "2026-11-05", collectionTime: "08:10" }, now)).toContain(
      "já tem a hora 08:10 e a data 05/11/2026",
    );
    expect(collectionRestartWarning({ id: "abc", entryDate: "2026-11-05", collectionTime: "" }, now)).toBe(
      "Este registro está com a data 05/11/2026. Iniciar a coleta muda a data para hoje, 07/11/2026.",
    );
  });

  it("mostra o início da coleta na hora do aparelho", () => {
    expect(formatCollectionStart(new Date(2026, 10, 7, 9, 3).toISOString())).toBe("07/11/2026 às 09:03");
    expect(formatCollectionStart(null)).toBe("");
    expect(formatCollectionStart("não é data")).toBe("");
  });
});

describe("captura automática — posição", () => {
  it("grava a posição do GPS com 6 casas e a precisão informada", () => {
    const result = buildPositionCapture({ gps: gpsOnPoint, planned, hadCoordinates: false });

    expect(result.patch).toEqual({
      latitude: "-25.428450",
      longitude: "-49.273310",
      coordinateSource: "gps",
      gpsAccuracyM: 8.4,
    });
    expect(result.notices).toEqual(["Posição gravada pelo GPS do celular (precisão de 8 m)."]);
    expect(result.farFromPlanned).toBeNull();
    expect(result.needsCoordinateCheck).toBe(false);
  });

  it("troca a coordenada que já estava no registro pela leitura do GPS", () => {
    const result = buildPositionCapture({ gps: gpsOnPoint, planned: null, hadCoordinates: true });

    expect(result.patch.coordinateSource).toBe("gps");
    expect(result.patch.latitude).toBe("-25.428450");
  });

  it("avisa quando o celular está longe do ponto planejado", () => {
    const result = buildPositionCapture({ gps: gpsFarAway, planned, hadCoordinates: false });

    expect(result.patch.coordinateSource).toBe("gps");
    expect(result.farFromPlanned?.distanceM).toBeGreaterThan(1100);
    expect(result.farFromPlanned?.distanceM).toBeLessThan(1125);
  });

  it("não avisa de realocação quando a distância cabe na incerteza do GPS", () => {
    // 333 m do ponto, mas com 150 m de incerteza: no melhor caso está a 183 m.
    const reading = { latitude: -25.4314, longitude: -49.2733, accuracyM: 150 };
    const result = buildPositionCapture({ gps: reading, planned, hadCoordinates: false });

    expect(result.farFromPlanned).toBeNull();
    // A precisão ruim, por si, pede conferência.
    expect(result.needsCoordinateCheck).toBe(true);
    expect(result.notices[0]).toContain("precisão baixa (150 m)");
  });

  it("sem GPS, nunca troca a coordenada que já está no registro", () => {
    const result = buildPositionCapture({ gps: null, gpsProblem: "timeout", planned, hadCoordinates: true });

    expect(result.patch).toEqual({});
    expect(result.needsCoordinateCheck).toBe(true);
    expect(result.notices).toEqual([
      "O GPS demorou demais para responder: a coordenada que já estava no registro foi mantida. Confira.",
    ]);
  });

  it("sem GPS e sem coordenada, usa a planejada do ponto e marca a origem", () => {
    const result = buildPositionCapture({ gps: null, gpsProblem: "unavailable", planned, hadCoordinates: false });

    expect(result.patch).toEqual({
      latitude: "-25.428400",
      longitude: "-49.273300",
      coordinateSource: "planned",
      gpsAccuracyM: null,
    });
    expect(result.needsCoordinateCheck).toBe(true);
    expect(result.notices[0]).toBe(
      "Sem sinal de GPS: usei a coordenada planejada do ponto. Confira e corrija se a coleta foi em outro lugar.",
    );
  });

  it("diz quando a coordenada planejada veio de outra campanha", () => {
    const result = buildPositionCapture({
      gps: null,
      planned: { ...planned, fromOtherCampaign: true },
      hadCoordinates: false,
    });

    expect(result.notices[0]).toContain("a de outra campanha, porque esta ainda não tem a dela");
  });

  it("sem GPS, sem coordenada e sem ponto planejado, pede para digitar", () => {
    const result = buildPositionCapture({ gps: null, gpsProblem: "unsupported", planned: null, hadCoordinates: false });

    expect(result.patch).toEqual({});
    expect(result.notices).toEqual(["Este aparelho não informa a localização: digite a latitude e a longitude."]);
  });

  it("explica como liberar a localização quando o celular negou", () => {
    const result = buildPositionCapture({ gps: null, gpsProblem: "denied", planned, hadCoordinates: false });

    expect(result.notices[0]).toContain("O celular não liberou a localização para o aplicativo");
    expect(result.notices[1]).toContain("libere a localização deste site");
    expect(gpsProblemFromErrorCode(1)).toBe("denied");
    expect(gpsProblemFromErrorCode(2)).toBe("unavailable");
    expect(gpsProblemFromErrorCode(3)).toBe("timeout");
    expect(gpsProblemFromErrorCode(undefined)).toBe("unavailable");
  });

  it("o botão Iniciar coleta junta hora, data e posição", () => {
    const now = new Date(2026, 10, 7, 9, 3);
    const result = buildCollectionStart({ now, currentEntryDate: "2026-11-07", gps: gpsOnPoint, planned, hadCoordinates: false });

    expect(result.patch).toMatchObject({
      entryDate: "2026-11-07",
      collectionTime: "09:03",
      latitude: "-25.428450",
      coordinateSource: "gps",
    });
    expect(result.notices).toEqual([
      "Hora da coleta gravada: 09:03.",
      "Posição gravada pelo GPS do celular (precisão de 8 m).",
    ]);
  });

  it("coordenada planejada acompanha a troca de ponto; GPS e digitada não mudam", () => {
    const other = { latitude: -25.5, longitude: -49.1 };

    expect(plannedPatchForPointChange("planned", other)).toEqual({
      latitude: "-25.500000",
      longitude: "-49.100000",
      coordinateSource: "planned",
      gpsAccuracyM: null,
    });
    expect(plannedPatchForPointChange("planned", null)).toEqual({
      latitude: "",
      longitude: "",
      coordinateSource: null,
      gpsAccuracyM: null,
    });
    expect(plannedPatchForPointChange("gps", other)).toBeNull();
    expect(plannedPatchForPointChange("manual", other)).toBeNull();
    expect(plannedPatchForPointChange(null, other)).toBeNull();
  });
});

describe("captura automática — utilitários", () => {
  it("mede distâncias em metros", () => {
    expect(distanceMeters(planned, planned)).toBe(0);
    // 1 grau de latitude ≈ 111,2 km.
    expect(distanceMeters({ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 })).toBeCloseTo(111195, -2);
    expect(formatDistance(183.4)).toBe("180 m");
    expect(formatDistance(1234)).toBe("1,2 km");
  });

  it("só aceita origem e precisão válidas", () => {
    expect(parseCoordinateSource("gps")).toBe("gps");
    expect(parseCoordinateSource("planned")).toBe("planned");
    expect(parseCoordinateSource("manual")).toBe("manual");
    expect(parseCoordinateSource("satélite")).toBeNull();
    expect(parseCoordinateSource(undefined)).toBeNull();
    expect(normalizeGpsAccuracy("12.34")).toBe(12.3);
    expect(normalizeGpsAccuracy(0)).toBe(0);
    expect(normalizeGpsAccuracy(-1)).toBeNull();
    expect(normalizeGpsAccuracy("")).toBeNull();
    expect(normalizeGpsAccuracy(Number.NaN)).toBeNull();
    expect(normalizeGpsAccuracy(5_000_000)).toBeNull();
  });

  it("descreve a origem da coordenada em português", () => {
    expect(describeCoordinateSource("gps", 8.4)).toBe("GPS do celular, precisão de 8 m");
    expect(describeCoordinateSource("gps", null)).toBe("GPS do celular");
    expect(describeCoordinateSource("planned", 8)).toBe("Coordenada planejada do ponto");
    expect(describeCoordinateSource("manual", null)).toBe("Digitada");
    expect(describeCoordinateSource(null, 8)).toBe("");
  });

  it("monta colunas que respeitam as regras do banco", () => {
    const base = { latitude: "-25.428400", longitude: "-49.273300", collectionStartedAt: "2026-11-07T12:03:00.000Z" };

    expect(captureRowColumns({ ...base, coordinateSource: "gps", gpsAccuracyM: 8.44 })).toEqual({
      coordinate_source: "gps",
      gps_accuracy_m: 8.4,
      collection_started_at: "2026-11-07T12:03:00.000Z",
    });
    // Precisão só existe quando a origem é o GPS.
    expect(captureRowColumns({ ...base, coordinateSource: "manual", gpsAccuracyM: 8 }).gps_accuracy_m).toBeNull();
    // Origem só existe com a coordenada completa.
    expect(captureRowColumns({ ...base, longitude: "", coordinateSource: "gps", gpsAccuracyM: 8 })).toEqual({
      coordinate_source: null,
      gps_accuracy_m: null,
      collection_started_at: "2026-11-07T12:03:00.000Z",
    });
    expect(captureRowColumns({ latitude: "-25.4", longitude: "-49.2", coordinateSource: "inventada" })).toEqual({
      coordinate_source: null,
      gps_accuracy_m: null,
      collection_started_at: null,
    });
  });
});
