import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { sendEmail } from "@/lib/email";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import {
  getRequestRecipient,
  isSupportRequest,
  type SupportRequest,
} from "@/lib/support-requests";

export const runtime = "nodejs";

function buildEmailText(request: SupportRequest) {
  return [
    "Uma nova solicitação foi registrada no sistema Yva'e Monitoramento.",
    "",
    `Assunto: ${request.title}`,
    `Solicitante: ${request.requester}`,
    `Instituição: ${request.institution}`,
    `Tipo: ${request.type}`,
    `Prioridade: ${request.priority}`,
    `Status: ${request.status}`,
    "",
    "Descrição:",
    request.description,
    "",
    request.response
      ? `Resposta registrada:\n${request.response}`
      : "Resposta registrada: ainda não informada.",
    "",
    "Acesse o módulo Solicitações para acompanhar e responder.",
  ].join("\n");
}

export async function POST(httpRequest: Request) {
  const auth = requireApiSession(httpRequest);

  if (!auth.ok) {
    return auth.response;
  }

  const payload = (await httpRequest.json().catch(() => ({}))) as {
    request?: unknown;
  };

  if (!isSupportRequest(payload.request)) {
    return NextResponse.json(
      { delivered: false, message: "Solicitação inválida." },
      { status: 400 },
    );
  }

  const request = payload.request;
  const recipient = getRequestRecipient(request);

  const result = await sendEmail({
    to: recipient,
    subject: `Solicitação Yva'e: ${request.title}`,
    text: buildEmailText(request),
  });

  if (result.delivered) {
    const supabase = createOptionalSupabaseClient();

    if (supabase) {
      await supabase
        .from("support_requests")
        .update({
          notified: true,
          notified_at: new Date().toISOString(),
        })
        .eq("id", request.id);
    }
  }

  return NextResponse.json(
    {
      delivered: result.delivered,
      recipient,
      message: result.message,
    },
    { status: result.delivered ? 200 : 502 },
  );
}
