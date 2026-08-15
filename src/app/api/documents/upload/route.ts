import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import { filterTabs, type DocumentType, type StoredDocument } from "@/lib/app-documents";

export const runtime = "nodejs";

const DOCUMENTS_BUCKET = "documents";
const MAX_DOCUMENT_SIZE_BYTES = 50 * 1024 * 1024;
const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
]);

export async function POST(request: Request) {
  const auth = await requireApiSession(request, "documents.manage");

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para receber arquivos." },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Arquivo não informado." }, { status: 400 });
  }

  if (!ALLOWED_DOCUMENT_MIME_TYPES.has(file.type)) {
    return NextResponse.json(
      { error: "Tipo de arquivo não permitido para documentos." },
      { status: 400 },
    );
  }

  if (file.size > MAX_DOCUMENT_SIZE_BYTES) {
    return NextResponse.json(
      { error: "O arquivo excede o limite de 50 MB." },
      { status: 400 },
    );
  }

  const type = normalizeDocumentType(formData.get("type"));
  const title = normalizeText(formData.get("title")) || file.name;
  const campaign = normalizeText(formData.get("campaign")) || "Documento inserido";
  const point = normalizeText(formData.get("point")) || "Repositório oficial";
  const now = new Date();
  const id = crypto.randomUUID();
  const storagePath = buildStoragePath(type, id, file.name);
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .upload(storagePath, fileBuffer, {
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json(
      {
        error: "Não foi possível enviar o arquivo para o Supabase Storage.",
        details: uploadError.message,
      },
      { status: 500 },
    );
  }

  const document: StoredDocument = {
    id,
    title,
    campaign,
    point,
    date: new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    }).format(now),
    updatedAt: now.toISOString(),
    type,
    status: "INSERIDO",
    source: "storage",
    originalName: file.name,
    mimeType: file.type,
    size: file.size,
    storageBucket: DOCUMENTS_BUCKET,
    storagePath,
  };

  const { error: insertError } = await supabase.from("app_documents").upsert(
    {
      id: document.id,
      title: document.title,
      dropbox_url: null,
      original_url: null,
      campaign: document.campaign,
      point: document.point,
      date_label: document.date,
      type: document.type,
      status: document.status,
      source: document.source,
      original_name: document.originalName,
      mime_type: document.mimeType,
      size_bytes: document.size,
      storage_bucket: document.storageBucket,
      storage_path: document.storagePath,
      updated_at: document.updatedAt,
    },
    { onConflict: "id" },
  );

  if (insertError) {
    await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]);
    return NextResponse.json(
      { error: "Arquivo enviado, mas os metadados não foram salvos." },
      { status: 500 },
    );
  }

  return NextResponse.json({ document, persistence: "cloud" }, { status: 201 });
}

function normalizeDocumentType(value: FormDataEntryValue | null): DocumentType {
  return filterTabs.includes(value as DocumentType) ? (value as DocumentType) : "Relatórios";
}

function normalizeText(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : "";
}

function buildStoragePath(type: DocumentType, id: string, fileName: string) {
  const extension = fileName.includes(".") ? fileName.split(".").pop() : "bin";
  const safeType = type
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

  return `${safeType || "documentos"}/${id}.${extension}`;
}
