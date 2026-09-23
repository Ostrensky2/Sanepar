import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import { ResultsUploadError, createResultsUploadTicket } from "@/lib/results-upload-staging";

export const runtime = "nodejs";

/** Emite uma URL assinada para o navegador enviar a planilha direto ao bucket privado. */
export async function POST(request: Request) {
  const auth = await requireApiSession(request, "data.import");
  if (!auth.ok) return auth.response;

  const client = createOptionalSupabaseClient();
  if (!client) return noStoreJson({ error: "Armazenamento indisponível.", code: "storage_unavailable" }, 503);

  let body: { fileName?: unknown; size?: unknown } | null = null;
  try { body = await request.json(); } catch { body = null; }
  if (!body || typeof body !== "object") return noStoreJson({ error: "Informe o arquivo a enviar." }, 400);

  try {
    return noStoreJson(await createResultsUploadTicket(client, body.fileName, body.size));
  } catch (error) {
    if (error instanceof ResultsUploadError) return noStoreJson({ error: error.message }, error.status);
    return noStoreJson({ error: "Não foi possível preparar o envio da planilha ao armazenamento." }, 502);
  }
}

function noStoreJson(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
}
