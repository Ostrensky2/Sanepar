import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import { DocumentUploadError, prepareDocumentUpload, finalizeDocumentUpload } from "@/lib/document-upload";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = await requireApiSession(request, "documents.manage");
  if (!auth.ok) return auth.response;
  const client = createOptionalSupabaseClient();
  if (!client) return NextResponse.json({ error: "Supabase não configurado para receber arquivos." }, { status: 503 });
  // Binary files go directly to Storage, never through a Vercel function.
  if (!request.headers.get("content-type")?.includes("application/json")) {
    return NextResponse.json({ error: "Atualize a página para usar o envio direto de documentos." }, { status: 415 });
  }
  try {
    const raw = await request.text();
    if (raw.length > 16000) throw new DocumentUploadError(413, "Solicitação de envio muito grande.");
    let input: Record<string, unknown>;
    try { input = JSON.parse(raw); } catch { throw new DocumentUploadError(400, "Solicitação inválida."); }
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new DocumentUploadError(400, "Solicitação inválida.");
    if (input.action === "prepare") {
      return NextResponse.json(await prepareDocumentUpload(client, auth.session.userId, input), { headers: { "Cache-Control": "no-store" } });
    }
    if (input.action === "finalize") {
      const document = await finalizeDocumentUpload(client, auth.session.userId, input.receipt);
      return NextResponse.json({ document, persistence: "cloud" }, { status: 201, headers: { "Cache-Control": "no-store" } });
    }
    throw new DocumentUploadError(400, "Ação de envio inválida.");
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof DocumentUploadError ? error.message : "O envio não foi confirmado. Tente novamente." },
      { status: error instanceof DocumentUploadError ? error.status : 502 },
    );
  }
}
