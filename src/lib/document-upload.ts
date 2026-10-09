import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { filterTabs, type DocumentType, type StoredDocument } from "@/lib/app-documents";
import { getAuthConfiguration } from "@/lib/supabase-auth";

const BUCKET = "documents";
const MAX_BYTES = 50 * 1024 * 1024;
const MIME_TYPES = new Set([
  "application/pdf", "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "text/csv",
]);
type Receipt = { actor: string; expires: number; document: StoredDocument };
export class DocumentUploadError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
function signingKey() {
  const key = getAuthConfiguration().secretKey;
  if (!key) throw new DocumentUploadError(503, "Servidor de envio indisponível.");
  return key;
}
function signature(payload: string) {
  return createHmac("sha256", signingKey()).update(`document-upload:v1:${payload}`).digest();
}
function text(value: unknown, fallback: string) {
  if (value !== undefined && typeof value !== "string") throw new DocumentUploadError(400, "Metadados inválidos.");
  const result = typeof value === "string" ? value.trim() : "";
  if (result.length > 500) throw new DocumentUploadError(400, "Metadados muito longos.");
  return result || fallback;
}
export async function prepareDocumentUpload(client: SupabaseClient, actor: string, input: Record<string, unknown>) {
  const name = text(input.fileName, "");
  if (!name || name.length > 200 || /[\\/\x00-\x1f]/.test(name)) throw new DocumentUploadError(400, "Nome de arquivo inválido.");
  if (typeof input.size !== "number" || !Number.isSafeInteger(input.size) || input.size <= 0) throw new DocumentUploadError(400, "Arquivo vazio ou tamanho inválido.");
  if (input.size > MAX_BYTES) throw new DocumentUploadError(413, "O arquivo excede o limite de 50 MB.");
  if (typeof input.mimeType !== "string" || !MIME_TYPES.has(input.mimeType)) throw new DocumentUploadError(400, "Tipo de arquivo não permitido para documentos.");
  if (input.type !== undefined && !filterTabs.includes(input.type as DocumentType)) throw new DocumentUploadError(400, "Categoria de documento inválida.");
  // No new secret, bucket or policy: fail closed unless the existing bucket is private.
  signingKey();
  const { data: bucket, error: bucketError } = await client.storage.getBucket(BUCKET);
  if (bucketError || !bucket || bucket.public !== false) throw new DocumentUploadError(503, "Armazenamento privado indisponível.");
  const id = randomUUID();
  const now = new Date();
  const extension = name.match(/\.([a-zA-Z0-9]{1,10})$/)?.[1].toLowerCase() ?? "bin";
  const actorPath = createHmac("sha256", signingKey()).update(`document-actor:${actor}`).digest("hex");
  const document: StoredDocument = {
    id, title: text(input.title, name), campaign: text(input.campaign, "Documento inserido"),
    point: text(input.point, "Repositório oficial"), type: (input.type as DocumentType) ?? "Relatórios",
    date: new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short", year: "numeric" }).format(now),
    updatedAt: now.toISOString(), status: "INSERIDO", source: "storage", originalName: name,
    mimeType: input.mimeType, size: input.size, storageBucket: BUCKET,
    storagePath: `uploads/${actorPath}/${id}.${extension}`,
  };
  const expires = now.getTime() + 2 * 60 * 60 * 1000;
  const payload = Buffer.from(JSON.stringify({ actor, expires, document } satisfies Receipt)).toString("base64url");
  const receipt = `${payload}.${signature(payload).toString("base64url")}`;
  const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(document.storagePath!, { upsert: false });
  if (error || !data) throw new DocumentUploadError(502, "Não foi possível preparar o envio ao armazenamento.");
  return { signedUrl: data.signedUrl, receipt, expires };
}
function readReceipt(value: unknown, actor: string): Receipt {
  if (typeof value !== "string" || value.length > 12000) throw new DocumentUploadError(400, "Comprovante de envio inválido.");
  const [payload, mac, extra] = value.split(".");
  if (!payload || !mac || extra || !/^[\w-]+$/.test(mac)) throw new DocumentUploadError(400, "Comprovante de envio inválido.");
  const actual = Buffer.from(mac, "base64url"), expected = signature(payload);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new DocumentUploadError(400, "Comprovante de envio inválido.");
  let decoded: Receipt;
  try { decoded = JSON.parse(Buffer.from(payload, "base64url").toString()); }
  catch { throw new DocumentUploadError(400, "Comprovante de envio inválido."); }
  if (decoded.actor !== actor) throw new DocumentUploadError(403, "Este envio pertence a outra sessão de usuário.");
  if (!Number.isFinite(decoded.expires) || decoded.expires <= Date.now()) throw new DocumentUploadError(410, "O prazo deste envio terminou. Selecione o arquivo novamente.");
  return decoded;
}
export async function finalizeDocumentUpload(client: SupabaseClient, actor: string, receipt: unknown) {
  const { document } = readReceipt(receipt, actor);
  const { data, error } = await client.storage.from(BUCKET).info(document.storagePath!);
  if (error || !data) throw new DocumentUploadError(409, "O arquivo ainda não foi confirmado no armazenamento. Tente novamente.");
  if (typeof data.size !== "number" || data.size !== document.size || data.contentType !== document.mimeType || data.size > MAX_BYTES) {
    throw new DocumentUploadError(409, "O arquivo armazenado não corresponde ao envio autorizado.");
  }
  // A retry keeps the signed ID and original metadata; it never overwrites another item.
  const expectedRow = {
    id: document.id, title: document.title, dropbox_url: null, original_url: null,
    campaign: document.campaign, point: document.point, date_label: document.date,
    type: document.type, status: document.status, source: document.source,
    original_name: document.originalName, mime_type: document.mimeType, size_bytes: document.size,
    storage_bucket: document.storageBucket, storage_path: document.storagePath, updated_at: document.updatedAt,
  };
  const { error: insertError } = await client.from("app_documents").upsert(expectedRow, { onConflict: "id", ignoreDuplicates: true });
  // Never remove on uncertain DB outcome: a concurrent retry may already have published it.
  // Abandoned objects remain private; cleanup requires a separate verified orphan inventory.
  if (insertError) throw new DocumentUploadError(503, "Arquivo recebido, mas a publicação não foi confirmada. Tente novamente sem trocar o arquivo.");
  // INSERT ... ON CONFLICT DO NOTHING does not prove what the existing row contains.
  let persisted: Record<string, unknown>;
  try {
    const result = await client.from("app_documents")
      .select(Object.keys(expectedRow).join(",")).eq("id", document.id).maybeSingle<Record<string, unknown>>();
    if (result.error || !result.data) throw new Error("Unconfirmed read");
    persisted = result.data;
  } catch {
    throw new DocumentUploadError(503, "Não foi possível confirmar os metadados publicados. Tente novamente sem trocar o arquivo.");
  }
  const matches = Object.entries(expectedRow).every(([key, value]) =>
    key === "updated_at"
      ? typeof persisted[key] === "string" && Date.parse(persisted[key]) === Date.parse(String(value))
      : persisted[key] === value,
  );
  if (!matches) throw new DocumentUploadError(409, "Este identificador já contém metadados diferentes. A publicação não foi confirmada.");
  return document;
}
