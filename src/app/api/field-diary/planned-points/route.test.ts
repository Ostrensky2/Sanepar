import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), read: vi.fn(), published: vi.fn() }));
vi.mock("@/lib/api-auth", () => ({ requireApiSession: mocks.auth }));
vi.mock("@/lib/private-campaign-points", () => ({ readPrivateCampaignPoints: mocks.read }));
vi.mock("@/lib/supabase", () => ({ getLatestPublishedCampaignImport: mocks.published }));

import { GET } from "./route";

const points = [
  {
    waterBody: "Rio Pequeno",
    code: "SIA-0771",
    municipality: "São José dos Pinhais",
    campaign: "2ª Campanha - Outono 2026",
    original: { lat: -25.5, lon: -49.2 },
    photoUrl: "privado",
    createdByName: "Equipe A",
    problems: "texto interno",
  },
  // O mesmo ponto em outro dia da mesma campanha: sai uma vez só.
  {
    waterBody: "Rio Pequeno",
    code: "SIA-0771",
    municipality: "São José dos Pinhais",
    campaign: "2ª Campanha - Outono 2026",
    original: { lat: -25.5, lon: -49.2 },
  },
  // Sem coordenada: não serve para achar o ponto mais próximo.
  { waterBody: "Rio Sem Mapa", code: "SIA-0999", municipality: "Curitiba", campaign: "2ª Campanha", original: null },
];

const request = () => new Request("http://localhost/api/field-diary/planned-points");

describe("pontos com coordenada planejada", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ ok: true });
    mocks.read.mockReturnValue(points);
    mocks.published.mockResolvedValue(null);
  });

  it("exige a permissão de registrar coleta antes de ler qualquer ponto", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });

    expect((await GET(request())).status).toBe(403);
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), "data.import");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.published).not.toHaveBeenCalled();
  });

  it("devolve só o ponto e a coordenada, sem foto, equipe ou observações, e sem cache", async () => {
    const response = await GET(request());

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      points: [
        {
          sia: "SIA-0771",
          locationName: "Rio Pequeno",
          municipality: "São José dos Pinhais",
          campaign: "2ª Campanha - Outono 2026",
          latitude: -25.5,
          longitude: -49.2,
        },
      ],
    });
  });

  it("usa a planilha publicada quando não há a cópia local", async () => {
    mocks.read.mockReturnValue([]);
    mocks.published.mockResolvedValue({ points: points.slice(0, 1) });

    expect((await (await GET(request())).json()).points).toHaveLength(1);
  });
});
