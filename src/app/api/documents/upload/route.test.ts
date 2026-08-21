import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireApiSession: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  upsert: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSession: mocks.requireApiSession,
}));

vi.mock("@/lib/supabase", () => ({
  createOptionalSupabaseClient: () => ({
    storage: {
      from: () => ({ upload: mocks.upload, remove: mocks.remove }),
    },
    from: () => ({ upsert: mocks.upsert }),
  }),
}));

import { POST } from "@/app/api/documents/upload/route";

describe("POST /api/documents/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiSession.mockResolvedValue({ ok: true });
    mocks.upload.mockResolvedValue({ error: null });
    mocks.upsert.mockResolvedValue({ error: null });
  });

  it("grava somente o item enviado, sem snapshot da coleção", async () => {
    const formData = new FormData();
    formData.set("file", new File(["pdf"], "relatorio.pdf", { type: "application/pdf" }));
    formData.set("title", "Relatório dirigido");

    const response = await POST(
      new Request("http://local.test/api/documents/upload", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(201);
    expect(mocks.upload).toHaveBeenCalledOnce();
    expect(mocks.upsert).toHaveBeenCalledOnce();
    const [row, options] = mocks.upsert.mock.calls[0];
    expect(Array.isArray(row)).toBe(false);
    expect(row).toMatchObject({ title: "Relatório dirigido", source: "storage" });
    expect(options).toEqual({ onConflict: "id" });
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
