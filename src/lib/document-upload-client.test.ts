import { afterEach, describe, expect, it, vi } from "vitest";
import { readDocumentUploadResponse, uploadDocumentDirect } from "./document-upload-client";
afterEach(() => vi.unstubAllGlobals());
describe("document direct upload", () => {
  it.each(["Request Entity Too Large", "<html>Request Entity Too Large</html>"])("handles non-JSON 413: %s", async (body) => {
    await expect(readDocumentUploadResponse(new Response(body, { status: 413 }))).rejects.toThrow("limite do servidor");
  });
  it("handles non-JSON 502 without leaking the body", async () => {
    await expect(readDocumentUploadResponse(new Response("private proxy error", { status: 502 }))).rejects.toThrow("HTTP 502");
  });
  it("preserves permission error", async () => {
    await expect(readDocumentUploadResponse(Response.json({ error: "Sem permissão" }, { status: 403 }))).rejects.toThrow("Sem permissão");
  });
  it.each([4, 6 * 1024 * 1024])("sends binary %i only to Storage, retries only finalize", async (size) => {
    const file = new File(["test"], "original.pdf", { type: "application/pdf" });
    Object.defineProperty(file, "size", { value: size });
    const fetcher = vi.fn()
      .mockResolvedValueOnce(Response.json({ signedUrl: "https://storage.invalid/upload", receipt: "receipt", expires: Date.now() + 60000 }))
      .mockResolvedValueOnce(Response.json({ Key: "stored" }))
      .mockResolvedValueOnce(Response.json({ error: "Tente novamente" }, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ document: { id: "one" } }, { status: 201 }));
    vi.stubGlobal("fetch", fetcher);
    const fields = { file, title: "Original", campaign: "C2", point: "P", type: "Relatórios" };
    await expect(uploadDocumentDirect(fields)).rejects.toThrow("Tente novamente");
    expect(await uploadDocumentDirect(fields)).toEqual({ document: { id: "one" } });
    expect(fetcher).toHaveBeenCalledTimes(4);
    const calls = fetcher.mock.calls;
    expect(JSON.parse(calls[0][1].body)).toMatchObject({ action: "prepare", size, fileName: "original.pdf" });
    expect(calls[1][0]).toBe("https://storage.invalid/upload");
    expect(calls[1][1]).toMatchObject({ method: "PUT", credentials: "omit", headers: { "x-upsert": "false" } });
    expect(calls[1][1].body).toBeInstanceOf(FormData);
    expect(JSON.parse(calls[2][1].body)).toEqual({ action: "finalize", receipt: "receipt" });
    expect(calls[3][1].body).toBe(calls[2][1].body);
  });
});
