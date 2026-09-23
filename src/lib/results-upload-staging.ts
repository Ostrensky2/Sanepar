import "server-only";
import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { MAX_IMPORT_FILE_BYTES } from "@/lib/imports/excel";
import { RESULTS_UPLOAD_BUCKET, type StagedResultsUpload } from "@/lib/imports/results-upload-contract";

/**
 * Planilhas de Resultados chegam ao servidor por dois caminhos:
 * - `file`/`files` no próprio formulário (arquivos pequenos ou modo local);
 * - `stagedUploads`: o navegador já enviou o arquivo ao bucket privado por URL
 *   assinada, e o formulário só carrega o caminho. Isso contorna o limite de
 *   4,5 MB de corpo das funções da Vercel.
 */
const STAGED_PATH = /^staging\/[0-9a-f-]{36}\.xlsx$/i;
const STALE_UPLOAD_MS = 24 * 60 * 60 * 1000;

export class ResultsUploadError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function createResultsUploadTicket(client: SupabaseClient, fileName: unknown, size: unknown) {
  if (typeof fileName !== "string" || !/\.xlsx$/i.test(fileName.trim()) || fileName.length > 200) {
    throw new ResultsUploadError(400, "Selecione uma planilha .xlsx válida.");
  }
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    throw new ResultsUploadError(400, "O arquivo enviado está vazio.");
  }
  if (size > MAX_IMPORT_FILE_BYTES) {
    throw new ResultsUploadError(413, "A planilha excede o limite de 12 MB.");
  }
  await pruneStaleResultsUploads(client);
  const { data, error } = await client.storage.from(RESULTS_UPLOAD_BUCKET).createSignedUploadUrl(`staging/${randomUUID()}.xlsx`);
  if (error || !data) {
    throw new ResultsUploadError(502, "Não foi possível preparar o envio da planilha ao armazenamento.");
  }
  return { path: data.path, signedUrl: data.signedUrl };
}

/** Returns the workbooks of a form, in order, plus the staged paths to clean up after publishing. */
export async function resolveResultsUploadFiles(form: FormData, client: SupabaseClient | null, field: "file" | "files") {
  const stagedValue = form.get("stagedUploads");
  if (stagedValue === null) {
    return { files: form.getAll(field), stagedPaths: [] as string[] };
  }
  const staged = parseStagedUploads(stagedValue);
  if (!client) throw new ResultsUploadError(503, "Armazenamento indisponível para ler a planilha enviada.");
  const files = await Promise.all(staged.map(async (item) => {
    const { data, error } = await client.storage.from(RESULTS_UPLOAD_BUCKET).download(item.path);
    if (error || !data) {
      throw new ResultsUploadError(409, "A planilha enviada não está mais disponível. Selecione o arquivo novamente.");
    }
    if (data.size > MAX_IMPORT_FILE_BYTES) throw new ResultsUploadError(413, "A planilha excede o limite de 12 MB.");
    return new File([data], item.name, { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }));
  return { files, stagedPaths: staged.map((item) => item.path) };
}

export async function removeStagedResultsUploads(client: SupabaseClient, paths: string[]) {
  if (!paths.length) return;
  // Best effort: a leftover staged file is pruned by the next upload ticket.
  await client.storage.from(RESULTS_UPLOAD_BUCKET).remove(paths).catch(() => undefined);
}

function parseStagedUploads(value: FormDataEntryValue): StagedResultsUpload[] {
  let parsed: unknown;
  try { parsed = JSON.parse(String(value)); } catch { parsed = null; }
  if (!Array.isArray(parsed) || !parsed.length || parsed.length > 20 || !parsed.every((item) =>
    item && typeof item === "object" &&
    typeof item.path === "string" && STAGED_PATH.test(item.path) &&
    typeof item.name === "string" && /\.xlsx$/i.test(item.name) && item.name.length <= 200)) {
    throw new ResultsUploadError(400, "Referência de planilha enviada inválida. Selecione o arquivo novamente.");
  }
  return parsed as StagedResultsUpload[];
}

async function pruneStaleResultsUploads(client: SupabaseClient) {
  try {
    const { data } = await client.storage.from(RESULTS_UPLOAD_BUCKET).list("staging", { limit: 100, sortBy: { column: "created_at", order: "asc" } });
    const cutoff = Date.now() - STALE_UPLOAD_MS;
    const stale = (data ?? [])
      .filter((item) => item.created_at && Date.parse(item.created_at) < cutoff)
      .map((item) => `staging/${item.name}`);
    if (stale.length) await client.storage.from(RESULTS_UPLOAD_BUCKET).remove(stale);
  } catch {
    // Cleanup never blocks a new upload.
  }
}
