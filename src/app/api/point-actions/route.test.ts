import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  primaryData: [] as unknown[],
  primaryError: null as unknown,
  snapshotData: null as unknown,
  snapshotError: null as unknown,
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSession: () => ({ ok: true }),
}));

vi.mock("@/lib/supabase", () => ({
  POINT_ACTIONS_SNAPSHOT_FILE_NAME: "__point_actions__",
  createOptionalSupabaseClient: () => ({
    from: (table: string) =>
      table === "point_actions"
        ? {
            select: () => ({
              order: () => ({
                returns: async () => ({
                  data: state.primaryData,
                  error: state.primaryError,
                }),
              }),
            }),
          }
        : {
            select: () => ({
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({
                      data: state.snapshotData,
                      error: state.snapshotError,
                    }),
                  }),
                }),
              }),
            }),
          },
  }),
}));

import { GET } from "@/app/api/point-actions/route";

const internalUrl =
  "/api/documents/file?bucket=photos&path=acoes-pontuais%2Fsia-0780.png";

function points() {
  return [
    {
      id: "point-1",
      waterBody: "Rio",
      dates: "2026-08-14",
      municipality: "Pinhais",
      effectiveLat: -25,
      effectiveLon: -49,
      results: "Resultado",
      photos: [
        { id: "external", url: "https://legacy.invalid/photo.png", caption: "externa" },
        {
          id: "internal",
          url: internalUrl,
          originalUrl: "https://legacy.invalid/source.png",
          caption: "interna",
        },
      ],
    },
  ];
}

function snapshotAction() {
  return {
    id: "action-1",
    eventName: "Ação",
    objectives: "Objetivo",
    createdAt: "14/08/2026",
    points: points(),
  };
}

describe("GET /api/point-actions private media", () => {
  beforeEach(() => {
    state.primaryData = [];
    state.primaryError = null;
    state.snapshotData = null;
    state.snapshotError = null;
  });

  it("sanitiza fotos retornadas pela tabela point_actions", async () => {
    state.primaryData = [
      {
        id: "action-1",
        event_name: "Ação",
        objectives: "Objetivo",
        document: null,
        created_at_label: "14/08/2026",
        points: points(),
        updated_at: "2026-08-14T00:00:00Z",
      },
    ];

    const response = await GET(new Request("http://local.test/api/point-actions"));
    const payload = await response.json();

    expect(payload.actions[0].points[0].photos).toEqual([
      { id: "internal", url: internalUrl, caption: "interna" },
    ]);
  });

  it("sanitiza fotos do fallback campaign snapshot", async () => {
    state.primaryError = { message: "table unavailable" };
    state.snapshotData = { points: [snapshotAction()] };

    const response = await GET(new Request("http://local.test/api/point-actions"));
    const payload = await response.json();

    expect(payload.persistence).toBe("cloud-snapshot");
    expect(payload.actions[0].points[0].photos).toEqual([
      { id: "internal", url: internalUrl, caption: "interna" },
    ]);
  });
});
