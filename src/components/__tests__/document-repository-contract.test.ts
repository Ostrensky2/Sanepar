import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { uploadDocumentDirect } from "@/lib/document-upload-client";

describe("document repository persistence contract", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("hidrata por GET sem auto-PUT ou migração destrutiva", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/components/document-repository.tsx"),
      "utf8",
    );

    expect(source).toContain('fetch("/api/documents", { cache: "no-store" })');
    expect(source).not.toContain('method: "PUT"');
    expect(source).not.toContain("saveDocumentsToCloud");
    expect(source).not.toContain("APP_DOCUMENTS_CLOUD_MIGRATION_KEY");
    expect(source).not.toContain("mergeStoredDocuments");
    expect(source).toContain("if (!hasHydratedDocumentsRef.current)");
    expect(source).toContain('import { uploadDocumentDirect } from "@/lib/document-upload-client"');
    expect(source).toContain("await uploadDocumentDirect({ ...formState, file: formState.file })");
    expect(source).toContain('method: "DELETE"');
  });

  it("publica somente o item pelo helper, sem PUT de snapshot", async () => {
    const signedUrl = "https://storage.example.test/signed/document";
    const result = { document: { id: "document-id" } };
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(Response.json({ signedUrl, receipt: "receipt", expires: Date.now() + 60_000 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(Response.json(result));
    vi.stubGlobal("fetch", fetchMock);
    const file = new File(["document"], "document.pdf", { type: "application/pdf" });

    await expect(uploadDocumentDirect({ file, title: "Documento", campaign: "C1", point: "1", type: "report" }))
      .resolves.toEqual(result);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const [prepare, binary, finalize] = fetchMock.mock.calls;
    expect(prepare[0]).toBe("/api/documents/upload");
    expect(prepare[1].method).toBe("POST");
    expect(JSON.parse(prepare[1].body)).toEqual({
      action: "prepare", title: "Documento", campaign: "C1", point: "1", type: "report",
      fileName: file.name, size: file.size, mimeType: file.type,
    });
    expect(binary[0]).toBe(signedUrl);
    expect(binary[1]).toMatchObject({ method: "PUT", credentials: "omit", headers: { "x-upsert": "false" } });
    expect(finalize[0]).toBe("/api/documents/upload");
    expect(finalize[1].method).toBe("POST");
    expect(JSON.parse(finalize[1].body)).toEqual({ action: "finalize", receipt: "receipt" });
    expect(fetchMock.mock.calls.some(([url]) => url === "/api/documents")).toBe(false);
  });
});
