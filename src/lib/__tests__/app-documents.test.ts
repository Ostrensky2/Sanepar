import { describe, expect, it } from "vitest";
import { normalizeStoredDocument } from "@/lib/app-documents";

const baseDocument = {
  id: "doc-1",
  title: "Relatório",
  campaign: "Campanha 1",
  point: "SIA-0780",
  date: "14/08/2026",
  type: "Relatórios",
  status: "INSERIDO",
};

describe("document media policy", () => {
  it("aceita somente documento armazenado no Supabase", () => {
    expect(
      normalizeStoredDocument({
        ...baseDocument,
        source: "storage",
        storageBucket: "documents",
        storagePath: "relatorios/doc-1.pdf",
        dropboxUrl: "https://dropbox.com/s/legacy",
      }),
    ).toMatchObject({
      source: "storage",
      storageBucket: "documents",
      storagePath: "relatorios/doc-1.pdf",
      dropboxUrl: undefined,
      originalUrl: undefined,
    });
  });

  it.each([
    ["Drive", "https://drive.google.com/file/d/redacted"],
    ["Dropbox", "https://dropbox.com/s/redacted"],
    ["ausente", ""],
  ])("rejeita documento %s sem Storage", (_label, url) => {
    expect(
      normalizeStoredDocument({
        ...baseDocument,
        source: "link",
        dropboxUrl: url,
        originalUrl: url,
      }),
    ).toBeNull();
  });
});
