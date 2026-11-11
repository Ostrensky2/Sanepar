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
  },
  {
    waterBody: "Rio Miringuava",
    code: "SIA-0136",
    municipality: "São José dos Pinhais",
    campaign: "2ª Campanha - Outono 2026",
    original: { lat: -25.6, lon: -49.3 },
  },
];

function request(query: Record<string, string>) {
  return new Request(`http://localhost/api/field-diary/planned-coordinate?${new URLSearchParams(query)}`);
}

describe("coordenada planejada de um ponto", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ ok: true });
    mocks.read.mockReturnValue(points);
    mocks.published.mockResolvedValue(null);
  });

  it("exige a permissão de registrar coleta antes de ler qualquer ponto", async () => {
    mocks.auth.mockResolvedValue({ ok: false, response: new Response(null, { status: 403 }) });

    expect((await GET(request({ sia: "SIA-0771" }))).status).toBe(403);
    expect(mocks.auth).toHaveBeenCalledWith(expect.anything(), "data.import");
    expect(mocks.read).not.toHaveBeenCalled();
    expect(mocks.published).not.toHaveBeenCalled();
  });

  it("devolve só a coordenada do ponto pedido, sem mais nada do ponto e sem cache", async () => {
    const response = await GET(
      request({ sia: "0771", locationName: "Rio Pequeno", campaignId: "campanha-2-outono-2026" }),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      planned: { latitude: -25.5, longitude: -49.2, fromOtherCampaign: false },
    });
  });

  it("sem ponto informado ou sem coordenada conhecida, devolve vazio", async () => {
    expect(await (await GET(request({}))).json()).toEqual({ planned: null });
    expect(await (await GET(request({ sia: "SIA-9999" }))).json()).toEqual({ planned: null });
  });

  it("usa a planilha publicada quando não há a cópia local", async () => {
    mocks.read.mockReturnValue([]);
    mocks.published.mockResolvedValue({ points });

    expect(await (await GET(request({ sia: "SIA-0136" }))).json()).toEqual({
      planned: { latitude: -25.6, longitude: -49.3, fromOtherCampaign: true },
    });
  });
});
