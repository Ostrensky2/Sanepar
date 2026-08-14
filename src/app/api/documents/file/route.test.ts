import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("@/lib/api-auth", () => ({
  requireApiSession: () => ({ ok: true }),
}));

vi.mock("@/lib/supabase", () => ({
  createOptionalSupabaseClient: () => ({
    storage: {
      from: () => storage,
    },
  }),
}));

import { GET } from "@/app/api/documents/file/route";

describe("GET /api/documents/file private-only", () => {
  beforeEach(() => {
    storage.createSignedUrl.mockReset();
    storage.getPublicUrl.mockReset();
  });

  it("preserva o redirecionamento para URL assinada", async () => {
    storage.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://storage.invalid/signed-redacted" },
      error: null,
    });

    const response = await GET(
      new Request(
        "http://local.test/api/documents/file?bucket=photos&path=private%2Fphoto.png",
      ),
    );

    expect(response.status).toBe(307);
    expect(storage.createSignedUrl).toHaveBeenCalledWith("private/photo.png", 600, {
      download: false,
    });
  });

  it("falha fechado quando a assinatura falha, sem consultar URL pública", async () => {
    storage.createSignedUrl.mockResolvedValue({
      data: null,
      error: { message: "signing failed" },
    });

    const response = await GET(
      new Request(
        "http://local.test/api/documents/file?bucket=photos&path=private%2Fphoto.png",
      ),
    );

    expect(response.status).toBe(500);
    expect(response.headers.get("location")).toBeNull();
    expect(storage.getPublicUrl).not.toHaveBeenCalled();
  });

  it.each([
    ["bucket inválido", "bucket=public&path=private%2Fphoto.png"],
    ["traversal", "bucket=photos&path=..%2Fsecret.png"],
  ])("bloqueia %s antes do storage", async (_label, query) => {
    const response = await GET(
      new Request(`http://local.test/api/documents/file?${query}`),
    );

    expect(response.status).toBe(400);
    expect(storage.createSignedUrl).not.toHaveBeenCalled();
    expect(storage.getPublicUrl).not.toHaveBeenCalled();
  });
});
