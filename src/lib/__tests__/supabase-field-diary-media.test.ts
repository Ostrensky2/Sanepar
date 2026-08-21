import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://supabase.test";
  process.env.SUPABASE_SECRET_KEY = "test-service-key";

  return {
    rows: vi.fn(),
    select: vi.fn(),
  };
});

vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table !== "field_diary_entries") {
        throw new Error(`Tabela inesperada: ${table}`);
      }

      return {
        select: (columns: string) => {
          mocks.select(columns);
          return { returns: mocks.rows };
        },
      };
    },
  }),
}));

import { getFieldDiaryCampaignMediaCandidates } from "@/lib/supabase";

describe("getFieldDiaryCampaignMediaCandidates", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("retorna somente identidade canônica e mídia interna sem ocultar conflitos", async () => {
    const primary =
      "/api/documents/file?bucket=photos&path=diario%2Fcampanha-2%2Fsia-0780.jpg";
    const conflict =
      "/api/documents/file?bucket=photos&path=diario%2Fcampanha-2%2Fsia-0780-b.jpg";

    mocks.rows.mockResolvedValue({
      data: [
        diaryRow("campanha-2-outono-2026", "Campanha 2", "SIA-0780", [primary]),
        diaryRow(null, "2", "780", [primary, conflict]),
        diaryRow("campanha-2-outono-2026", "Campanha 2", "SIA-0780/0999", [primary]),
        diaryRow("campanha-2-outono-2026", "Campanha 2", null, [primary]),
        diaryRow("campanha-10", "Campanha alheia", "SIA-0780", [primary]),
        diaryRow("campanha-2-outono-2026", "Campanha 2", "SIA-0780", [
          "https://example.test/foto.jpg",
          "/api/documents/file?bucket=documents&path=foto.jpg",
        ]),
      ],
      error: null,
    });

    await expect(getFieldDiaryCampaignMediaCandidates()).resolves.toEqual([
      {
        campaignKey: "campanha-2-outono-2026",
        siaKey: "sia:780",
        photoUrl: primary,
      },
      {
        campaignKey: "campanha-2-outono-2026",
        siaKey: "sia:780",
        photoUrl: conflict,
      },
    ]);
    expect(mocks.select).toHaveBeenCalledWith("campaign_id,campaign_name,sia,photos");
  });

  it("falha fechado quando a leitura não está disponível", async () => {
    mocks.rows.mockResolvedValue({ data: null, error: { message: "indisponível" } });

    await expect(getFieldDiaryCampaignMediaCandidates()).resolves.toEqual([]);
  });
});

function diaryRow(
  campaignId: string | null,
  campaignName: string,
  sia: string | null,
  photoUrls: string[],
) {
  return {
    campaign_id: campaignId,
    campaign_name: campaignName,
    sia,
    photos: photoUrls.map((url, index) => ({ id: `foto-${index}`, url })),
  };
}
