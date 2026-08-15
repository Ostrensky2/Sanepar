import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import {
  isSupportRequest,
  normalizeInstitution,
  type SupportRequest,
} from "@/lib/support-requests";

export const runtime = "nodejs";

type SupportRequestRow = {
  id: string;
  title: string;
  requester: string;
  institution: string;
  type: string;
  priority: string;
  description: string;
  response: string;
  response_updated_at: string | null;
  status: string;
  notified: boolean;
  notified_at: string | null;
  created_at_label: string;
  updated_at: string;
};

function fromRow(row: SupportRequestRow): SupportRequest {
  return {
    id: row.id,
    title: row.title,
    requester: row.requester,
    institution: normalizeInstitution(row.institution),
    type: row.type,
    priority: row.priority as SupportRequest["priority"],
    description: row.description,
    response: row.response ?? "",
    responseUpdatedAt: row.response_updated_at ?? undefined,
    status: row.status as SupportRequest["status"],
    notified: Boolean(row.notified),
    notifiedAt: row.notified_at ?? undefined,
    createdAt: row.created_at_label,
    updatedAt: row.updated_at,
  };
}

function toRow(request: SupportRequest) {
  return {
    id: request.id,
    title: request.title,
    requester: request.requester,
    institution: request.institution,
    type: request.type,
    priority: request.priority,
    description: request.description,
    response: request.response ?? "",
    response_updated_at: request.responseUpdatedAt ?? null,
    status: request.status,
    notified: Boolean(request.notified),
    notified_at: request.notifiedAt ?? null,
    created_at_label: request.createdAt,
    updated_at: new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  const auth = await requireApiSession(request);

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ requests: [], persistence: "browser" });
  }

  const { data, error } = await supabase
    .from("support_requests")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<SupportRequestRow[]>();

  if (error) {
    return NextResponse.json({ requests: [], persistence: "browser" });
  }

  return NextResponse.json({
    requests: data.map(fromRow),
    persistence: "cloud",
  });
}

export async function PUT(request: Request) {
  const auth = await requireApiSession(request);

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para salvar solicitações." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as { requests?: unknown };
  const requests = Array.isArray(payload.requests)
    ? payload.requests.filter(isSupportRequest)
    : null;

  if (!requests) {
    return NextResponse.json(
      { error: "A lista de solicitações é inválida." },
      { status: 400 },
    );
  }

  const { data: existingRows, error: readError } = await supabase
    .from("support_requests")
    .select("id")
    .returns<{ id: string }[]>();

  if (readError) {
    return NextResponse.json(
      { error: "Não foi possível ler as solicitações na nuvem." },
      { status: 500 },
    );
  }

  const nextIds = new Set(requests.map((item) => item.id));
  const removedIds = (existingRows ?? [])
    .map((row) => row.id)
    .filter((id) => !nextIds.has(id));

  if (removedIds.length) {
    const { error: deleteError } = await supabase
      .from("support_requests")
      .delete()
      .in("id", removedIds);

    if (deleteError) {
      return NextResponse.json(
        { error: "Não foi possível remover solicitações na nuvem." },
        { status: 500 },
      );
    }
  }

  if (requests.length) {
    const { error: upsertError } = await supabase
      .from("support_requests")
      .upsert(requests.map(toRow), { onConflict: "id" });

    if (upsertError) {
      return NextResponse.json(
        { error: "Não foi possível salvar solicitações na nuvem." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ requests, persistence: "cloud" });
}
