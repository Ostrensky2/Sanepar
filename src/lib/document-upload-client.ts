type UploadFields = { file: File; title: string; campaign: string; point: string; type: string };
type Ticket = { signedUrl: string; receipt: string; expires: number };
// Memory only. A failed finalize retries the same item, not the binary upload.
const uploaded = new WeakMap<File, Ticket>();

export async function readDocumentUploadResponse(response: Response): Promise<Record<string, unknown>> {
  let payload: Record<string, unknown> | null = null;
  try {
    const parsed: unknown = await response.json();
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) payload = parsed as Record<string, unknown>;
  } catch { /* Platform/proxy errors are not necessarily JSON. */ }
  if (!response.ok || !payload) {
    const message = typeof payload?.error === "string" ? payload.error
      : response.status === 413 ? "O envio excedeu o limite do servidor. Atualize a página e tente novamente."
      : `O envio não foi confirmado (HTTP ${response.status}). Tente novamente.`;
    throw new Error(message);
  }
  return payload;
}
export async function uploadDocumentDirect(fields: UploadFields) {
  const { file, ...metadata } = fields;
  let ticket = uploaded.get(file);
  if (ticket && ticket.expires <= Date.now()) { uploaded.delete(file); ticket = undefined; }
  if (!ticket) {
    const response = await fetch("/api/documents/upload", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "prepare", ...metadata, fileName: file.name, size: file.size, mimeType: file.type }),
    });
    const payload = await readDocumentUploadResponse(response);
    if (typeof payload.signedUrl !== "string" || typeof payload.receipt !== "string" || typeof payload.expires !== "number") {
      throw new Error("O servidor retornou uma autorização de envio inválida.");
    }
    ticket = payload as Ticket;
    // Same multipart PUT format as the existing results-upload client/supabase-js.
    const body = new FormData();
    body.append("cacheControl", "3600");
    body.append("", file);
    const sent = await fetch(ticket.signedUrl, { method: "PUT", body, credentials: "omit", headers: { "x-upsert": "false" } });
    if (!sent.ok) await readDocumentUploadResponse(sent);
    uploaded.set(file, ticket);
  }
  const result = await fetch("/api/documents/upload", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "finalize", receipt: ticket.receipt }),
  });
  const payload = await readDocumentUploadResponse(result);
  uploaded.delete(file);
  return payload;
}
