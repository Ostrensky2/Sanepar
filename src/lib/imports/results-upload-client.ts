import { readResultsApiPayload } from "@/lib/imports/results-client";
import type { StagedResultsUpload } from "@/lib/imports/results-upload-contract";

/** Folga abaixo do limite de 4,5 MB de corpo das funções da Vercel. */
const DIRECT_FORM_LIMIT_BYTES = 4 * 1024 * 1024;

/**
 * Envia a planilha direto ao armazenamento privado do Supabase por URL assinada,
 * sem passar pelo corpo da função da Vercel (limite de 4,5 MB).
 * Retorna null quando o armazenamento não está configurado (modo local): nesse
 * caso o arquivo segue no próprio formulário, como antes.
 */
export async function stageResultsWorkbook(file: File, signal?: AbortSignal): Promise<StagedResultsUpload | null> {
  const ticketResponse = await fetch("/api/imports/results/upload", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ fileName: file.name, size: file.size }),
    signal,
  });
  if (ticketResponse.status === 503) return null;
  const ticket = await readResultsApiPayload<{ path: string; signedUrl: string }>(
    ticketResponse,
    "Não foi possível preparar o envio da planilha.",
  );
  // Sem área de envio disponível, arquivos pequenos ainda cabem no formulário.
  if (ticketResponse.status >= 500 && file.size <= DIRECT_FORM_LIMIT_BYTES) return null;
  if (!ticketResponse.ok || "error" in ticket) {
    throw new Error("error" in ticket ? ticket.error : "Não foi possível preparar o envio da planilha.");
  }

  // Mesmo formato que o supabase-js usa em uploadToSignedUrl.
  const body = new FormData();
  body.append("cacheControl", "3600");
  body.append("", file);
  const upload = await fetch(ticket.signedUrl, { method: "PUT", body, headers: { "x-upsert": "false" }, signal });
  if (!upload.ok) {
    throw new Error(`O envio da planilha ao armazenamento falhou (HTTP ${upload.status}). Tente novamente.`);
  }
  return { path: ticket.path, name: file.name };
}

/** Anexa as planilhas ao formulário: referência ao arquivo já enviado ou o próprio arquivo. */
export function appendResultsWorkbooks(
  form: FormData,
  field: "file" | "files",
  files: File[],
  staged: Array<StagedResultsUpload | null>,
) {
  if (files.length && staged.every((item): item is StagedResultsUpload => item !== null)) {
    form.set("stagedUploads", JSON.stringify(staged));
    return;
  }
  for (const file of files) form.append(field, file);
}
