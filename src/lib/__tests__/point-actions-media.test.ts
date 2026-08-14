import { afterEach, describe, expect, it, vi } from "vitest";
import { readPointActionsFromStorage } from "@/lib/point-actions";

describe("point-actions media policy", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("remove fotos externas do mesmo contrato usado pelo leitor local", () => {
    const internalUrl =
      "/api/documents/file?bucket=photos&path=acoes-pontuais%2Fsia-0780.png";
    vi.stubGlobal("window", {
      location: { hostname: "localhost" },
      localStorage: {
        getItem: () =>
          JSON.stringify([
            {
              id: "action-1",
              eventName: "Ação",
              objectives: "Objetivo",
              createdAt: "14/08/2026",
              points: [
                {
                  id: "point-1",
                  photos: [
                    { url: "https://legacy.invalid/photo.png", originalUrl: "externa" },
                    { url: internalUrl, originalUrl: "https://legacy.invalid/source.png" },
                  ],
                },
              ],
            },
          ]),
      },
    });

    expect(readPointActionsFromStorage()[0].points[0].photos).toEqual([
      { url: internalUrl },
    ]);
  });
});
