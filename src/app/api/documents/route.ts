import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  APP_DOCUMENTS_SNAPSHOT_FILE_NAME,
  createOptionalSupabaseClient,
} from "@/lib/supabase";
import {
  normalizeStoredDocuments,
  type DocumentType,
  type StoredDocument,
} from "@/lib/app-documents";

export const runtime = "nodejs";

type AppDocumentRow = {
  id: string;
  title: string;
  dropbox_url: string;
  campaign: string;
  point: string;
  date_label: string;
  type: DocumentType;
  status: string;
  source: "link";
  updated_at: string;
};

type AppDocumentSnapshotRow = {
  points: unknown;
  created_at: string;
};

export async function GET(request: Request) {
  const auth = requireApiSession(request);

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ documents: [], persistence: "browser" });
  }

  const { data, error: appDocumentsError } = await supabase
    .from("app_documents")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<AppDocumentRow[]>();

  if (appDocumentsError) {
    const snapshotResult = await readDocumentsFromCampaignSnapshot(supabase);

    if (!snapshotResult.error) {
      return NextResponse.json({
        documents: snapshotResult.documents,
        persistence: "cloud",
      });
    }

    return NextResponse.json(
      {
        documents: [],
        persistence: "cloud-error",
        error: "Não foi possível ler documentos na nuvem.",
        details: {
          appDocuments: appDocumentsError.message,
          campaignSnapshot: snapshotResult.error,
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    documents: normalizeStoredDocuments((data ?? []).map(fromRow)),
    persistence: "cloud",
  });
}

export async function PUT(request: Request) {
  const auth = requireApiSession(request, "documents.manage");

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para salvar documentos." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as { documents?: unknown };
  const documents = normalizeStoredDocuments(payload.documents);

  if (!Array.isArray(payload.documents)) {
    return NextResponse.json(
      { error: "A lista de documentos é inválida." },
      { status: 400 },
    );
  }

  const { data: existingRows, error: existingRowsError } = await supabase
    .from("app_documents")
    .select("id")
    .returns<{ id: string }[]>();

  if (existingRowsError) {
    return NextResponse.json(
      { error: "Não foi possível ler os documentos na nuvem." },
      { status: 500 },
    );
  }

  const nextIds = new Set(documents.map((document) => document.id));
  const removedIds = (existingRows ?? [])
    .map((row) => row.id)
    .filter((id) => !nextIds.has(id));

  if (removedIds.length) {
    const { error: deleteError } = await supabase
      .from("app_documents")
      .delete()
      .in("id", removedIds);

    if (deleteError) {
      return NextResponse.json(
        { error: "Não foi possível sincronizar exclusões de documentos na nuvem." },
        { status: 500 },
      );
    }
  }

  if (documents.length) {
    const { error: upsertError } = await supabase.from("app_documents").upsert(
      documents.map(toRow),
      { onConflict: "id" },
    );

    if (upsertError) {
      return NextResponse.json(
        { error: "Não foi possível salvar documentos na nuvem." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ documents, persistence: "cloud" });
}

export async function DELETE(request: Request) {
  const auth = requireApiSession(request, "documents.manage");

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para excluir documentos." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as { ids?: unknown };
  const ids = Array.isArray(payload.ids)
    ? payload.ids.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
    : [];

  if (!ids.length) {
    return NextResponse.json(
      { error: "A lista de documentos para exclusão é inválida." },
      { status: 400 },
    );
  }

  const { error } = await supabase.from("app_documents").delete().in("id", ids);

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível excluir documentos na nuvem." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ids, persistence: "cloud" });
}

async function readDocumentsFromCampaignSnapshot(
  supabase: NonNullable<ReturnType<typeof createOptionalSupabaseClient>>,
): Promise<{ documents: StoredDocument[]; error: string | null }> {
  const { data, error } = await supabase
    .from("campaign_imports")
    .select("points, created_at")
    .eq("file_name", APP_DOCUMENTS_SNAPSHOT_FILE_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<AppDocumentSnapshotRow>();

  if (error) {
    return { documents: [], error: error.message };
  }

  return {
    documents: normalizeStoredDocuments(data?.points),
    error: null,
  };
}

function fromRow(row: AppDocumentRow): StoredDocument {
  return {
    id: row.id,
    title: row.title,
    dropboxUrl: row.dropbox_url,
    campaign: row.campaign,
    point: row.point,
    date: row.date_label,
    updatedAt: row.updated_at,
    type: row.type,
    status: row.status,
    source: "link",
  };
}

function toRow(document: StoredDocument) {
  return {
    id: document.id,
    title: document.title,
    dropbox_url: document.dropboxUrl,
    campaign: document.campaign,
    point: document.point,
    date_label: document.date,
    type: document.type,
    status: document.status,
    source: document.source,
    updated_at: new Date().toISOString(),
  };
}
