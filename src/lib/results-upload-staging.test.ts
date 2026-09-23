import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createResultsUploadTicket, removeStagedResultsUploads, resolveResultsUploadFiles } from "./results-upload-staging";

const path = "staging/11111111-1111-4111-8111-111111111111.xlsx";

function storageClient(overrides: Record<string, unknown> = {}) {
  const bucket = {
    createSignedUploadUrl: vi.fn().mockResolvedValue({ data: { path, signedUrl: "https://x.supabase.co/sign", token: "t" }, error: null }),
    download: vi.fn().mockResolvedValue({ data: new Blob(["xlsx-bytes"]), error: null }),
    list: vi.fn().mockResolvedValue({ data: [{ name: "old.xlsx", created_at: "2020-01-01T00:00:00Z" }], error: null }),
    remove: vi.fn().mockResolvedValue({ data: [], error: null }),
    ...overrides,
  };
  const from = vi.fn(() => bucket);
  return { client: { storage: { from } } as unknown as SupabaseClient, bucket, from };
}

describe("envio direto de planilhas de Resultados", () => {
  it("emite URL assinada no bucket privado e limpa envios antigos", async () => {
    const { client, bucket, from } = storageClient();
    await expect(createResultsUploadTicket(client, "Banco.xlsx", 7_234_998)).resolves.toEqual({ path, signedUrl: "https://x.supabase.co/sign" });
    expect(from).toHaveBeenCalledWith("results-uploads");
    expect(bucket.remove).toHaveBeenCalledWith(["staging/old.xlsx"]);
  });

  it("recusa arquivo não .xlsx, vazio ou acima de 12 MB", async () => {
    const { client } = storageClient();
    await expect(createResultsUploadTicket(client, "x.csv", 10)).rejects.toMatchObject({ status: 400 });
    await expect(createResultsUploadTicket(client, "x.xlsx", 0)).rejects.toMatchObject({ status: 400 });
    await expect(createResultsUploadTicket(client, "x.xlsx", 13 * 1024 * 1024)).rejects.toMatchObject({ status: 413 });
  });

  it("mantém o envio pelo formulário quando não há referência ao bucket", async () => {
    const form = new FormData();
    const file = new File(["abc"], "pequena.xlsx");
    form.append("file", file);
    const resolved = await resolveResultsUploadFiles(form, null, "file");
    expect(resolved.stagedPaths).toEqual([]);
    expect((resolved.files[0] as File).name).toBe("pequena.xlsx");
  });

  it("lê a planilha enviada ao bucket com o nome original", async () => {
    const { client, bucket } = storageClient();
    const form = new FormData();
    form.set("stagedUploads", JSON.stringify([{ path, name: "Banco_Sanepar.xlsx" }]));
    const resolved = await resolveResultsUploadFiles(form, client, "file");
    expect(bucket.download).toHaveBeenCalledWith(path);
    expect(resolved.stagedPaths).toEqual([path]);
    const [file] = resolved.files as File[];
    expect(file.name).toBe("Banco_Sanepar.xlsx");
    expect(await file.text()).toBe("xlsx-bytes");
    await removeStagedResultsUploads(client, resolved.stagedPaths);
    expect(bucket.remove).toHaveBeenCalledWith([path]);
  });

  it("recusa caminhos fora da área de envio e arquivos já removidos", async () => {
    const { client } = storageClient({ download: vi.fn().mockResolvedValue({ data: null, error: { message: "not found" } }) });
    const outside = new FormData();
    outside.set("stagedUploads", JSON.stringify([{ path: "../documents/x.xlsx", name: "x.xlsx" }]));
    await expect(resolveResultsUploadFiles(outside, client, "file")).rejects.toMatchObject({ status: 400 });
    const missing = new FormData();
    missing.set("stagedUploads", JSON.stringify([{ path, name: "x.xlsx" }]));
    await expect(resolveResultsUploadFiles(missing, client, "file")).rejects.toMatchObject({ status: 409 });
  });
});
