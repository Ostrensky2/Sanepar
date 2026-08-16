import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectionMock } = vi.hoisted(() => ({ connectionMock: vi.fn().mockResolvedValue(undefined) }));

vi.mock("next/server", () => ({ connection: connectionMock }));

import RootLayout from "@/app/layout";

describe("RootLayout", () => {
  beforeEach(() => connectionMock.mockClear());

  it("aguarda a requisição para que o Next aplique o nonce aos scripts", async () => {
    const layout = await RootLayout({ children: "conteúdo" });

    expect(connectionMock).toHaveBeenCalledOnce();
    expect(layout.type).toBe("html");
  });
});
