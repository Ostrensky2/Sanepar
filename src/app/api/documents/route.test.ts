import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  order: vi.fn(),
  returns: vi.fn(),
  delete: vi.fn(),
  in: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSession: mocks.requireApiSession,
}));

vi.mock("@/lib/supabase", () => ({
  APP_DOCUMENTS_SNAPSHOT_FILE_NAME: "documents.json",
  createOptionalSupabaseClient: () => ({
    from: () => ({
      select: () => ({ order: mocks.order }),
      delete: mocks.delete,
      upsert: mocks.upsert,
    }),
  }),
}));

import { DELETE, GET, PUT } from "@/app/api/documents/route";

describe("/api/documents mutation boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({ ok: true });
    mocks.order.mockReturnValue({ returns: mocks.returns });
    mocks.returns.mockResolvedValue({
      data: [
        {
          id: "doc-1",
          title: "Documento",
          dropbox_url: "https://example.test/documento.pdf",
          original_url: "https://example.test/documento.pdf",
          campaign: "Campanha",
          point: "Ponto",
          date_label: "21/08/2026",
          type: "Relatórios",
          status: "INSERIDO",
          source: "link",
          original_name: null,
          mime_type: null,
          size_bytes: null,
          storage_bucket: null,
          storage_path: null,
          updated_at: "2026-08-21T12:00:00.000Z",
        },
      ],
      error: null,
    });
    mocks.delete.mockReturnValue({ in: mocks.in });
    mocks.in.mockResolvedValue({ error: null });
  });

  it("GET apenas lê e não executa mutações", async () => {
    const response = await GET(new Request("http://local.test/api/documents"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      documents: [{ id: "doc-1", source: "link" }],
      persistence: "cloud",
    });
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("PUT de snapshot falha fechado com 405 antes de autenticação ou banco", async () => {
    const response = await PUT();

    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("GET, DELETE");
    expect(mocks.requireApiSession).not.toHaveBeenCalled();
    expect(mocks.delete).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("DELETE remove somente os IDs explicitamente enviados", async () => {
    const response = await DELETE(
      new Request("http://local.test/api/documents", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: ["doc-2"] }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.in).toHaveBeenCalledWith("id", ["doc-2"]);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});
