import { expect, it, vi } from "vitest";
import { GET } from "./route";

const auth = vi.hoisted(() => vi.fn());
vi.mock("@/lib/api-auth", () => ({ requireApiSession: auth }));
vi.mock("server-only", () => ({}));

it.each([401, 403])("preserva a negativa %i sem conteúdo", async status => {
  auth.mockResolvedValue({ ok: false, response: new Response(null, { status }) });
  const request = new Request("http://localhost/api/results/curation/library");
  const response = await GET(request);
  expect(auth).toHaveBeenCalledWith(request, "data.view");
  expect(response.status).toBe(status);
  expect(await response.text()).toBe("");
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});

it("entrega o acervo ao leitor autorizado com cache privado desativado", async () => {
  auth.mockResolvedValue({ ok: true });
  const response = await GET(new Request("http://localhost/api/results/curation/library"));
  expect(response.status).toBe(200);
  expect(response.headers.get("Cache-Control")).toBe("private, no-store");
  const library = await response.json();
  expect(library.version).toBe("fichas-ecologia/1.2.0");
  expect(library.counts).toEqual({ cards: 39, identities: 31, sources: 39 });
  expect(library.counts.cards).toBe(library.cards.length);
  expect(library.sources.length).toBe(library.counts.sources);
});
