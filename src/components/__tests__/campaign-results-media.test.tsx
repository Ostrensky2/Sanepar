import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { CampaignHydroMapPoint } from "@/components/campaign-hydro-map";
import { SelectedResultPoint } from "@/components/campaign-results-panels";
import { hydrateResultPointPhotos } from "@/components/campaigns-page-content";
import type { FieldDiaryEntry } from "@/lib/field-diary";

const campaignId = "campanha-2-outono-2026";

function point(sia: number): CampaignHydroMapPoint {
  return {
    id: `resultado-${sia}`,
    code: `SIA-${String(sia).padStart(4, "0")}`,
    point: `Ponto ${sia}`,
    campaign: "Campanha 2",
    municipality: "Paraná",
    waterBody: `Rio ${sia}`,
    original: null,
    effective: { lat: -25, lon: -49 },
    accessibility: "",
    waterAspect: "",
    weatherConditions: "",
    problems: "",
    photoUrl: "",
    riskLevel: "baixo",
    score: 0.5,
  };
}

function diary(sia: number | string, urls: string[], entryCampaignId = campaignId) {
  return {
    campaignId: entryCampaignId,
    sia: typeof sia === "number" ? `SIA-${String(sia).padStart(4, "0")}` : sia,
    photos: urls.map((url, index) => ({ id: `foto-${index}`, url })),
  } as FieldDiaryEntry;
}

function photoUrl(sia: number, suffix = "a") {
  return `/api/documents/file?bucket=photos&path=${encodeURIComponent(
    `diario-de-campo/2026-07-01/2-campanha-outono-2026-sia-${String(sia).padStart(4, "0")}/${suffix}.jpg`,
  )}`;
}

describe("mídia dos resultados por campanha", () => {
  it("hidrata os 74 resultados C2 somente por campaignId + SIA e não materializa SIAs externos", () => {
    const points = Array.from({ length: 74 }, (_, index) => point(index + 1));
    const entries = [
      ...points.map((_, index) => diary(index + 1, [photoUrl(index + 1)])),
      diary(257, [photoUrl(257)]),
      diary("SIA-305/1037", [photoUrl(305)]),
    ];

    const hydrated = hydrateResultPointPhotos(points, { campaignId }, entries);

    expect(hydrated).toHaveLength(74);
    expect(hydrated.every((item) => item.photoUrl.startsWith("/api/documents/file?bucket=photos&"))).toBe(true);
    expect(hydrated.some((item) => item.code === "SIA-0257" || item.code.includes("305"))).toBe(false);
  });

  it("consolida duplicata inequívoca e falha fechado em conflito, campanha alheia ou URL externa", () => {
    const url = photoUrl(174);
    const base = point(174);

    expect(hydrateResultPointPhotos([base], { campaignId }, [
      diary(174, []),
      diary(174, [url]),
      diary(174, [url]),
    ])[0].photoUrl).toBe(url);

    for (const entries of [
      [diary(174, [url]), diary(174, [photoUrl(174, "conflito")])],
      [diary(174, [url], "campanha-1-verao-2026")],
      [diary(174, ["https://example.test/foto.jpg"])],
      [diary("sem-sia", [url])],
    ]) {
      expect(hydrateResultPointPhotos([base], { campaignId }, entries)[0]).toMatchObject({
        photoUrl: "",
        photos: [],
      });
    }
  });

  it("renderiza foto acessível e fallback explícito", () => {
    const url = photoUrl(780);
    const withPhoto = renderToStaticMarkup(
      <SelectedResultPoint point={{ ...point(780), municipality: "Pinhais", photoUrl: url }} />,
    );
    const withoutPhoto = renderToStaticMarkup(<SelectedResultPoint point={point(780)} />);

    expect(withPhoto).toContain(`src="${url.replaceAll("&", "&amp;")}"`);
    expect(withPhoto).toContain("Foto de campo do ponto SIA-0780 em Pinhais");
    expect(withoutPhoto).toContain("Foto de campo indisponível");
  });

  it("usa a mesma seleção na ficha, no mapa e na tabela", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/campaign-results-panels.tsx"),
      "utf8",
    );

    expect(source).toContain("<SelectedResultPoint point={selectedPoint} />");
    expect(source).toContain("selectedPointId={selectedPoint.id}");
    expect(source).toContain("onSelectPoint={(point) => setSelectedPointId(point.id)}");
    expect(source).toContain("onClick={() => setSelectedPointId(municipality.priorityPoint.id)}");
  });
});
