import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const PHOTOS_BUCKET = "photos";
const MAX_PHOTO_SIZE_BYTES = 20 * 1024 * 1024;
const ALLOWED_PHOTO_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg"]);
const PHOTO_CONTEXT_PATHS: Record<string, string> = {
  "field-diary": "diario-de-campo",
  "point-actions": "acoes-pontuais",
};

export async function POST(request: Request) {
  const auth = requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para receber fotos." },
      { status: 503 },
    );
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Foto não informada." }, { status: 400 });
  }

  if (!ALLOWED_PHOTO_MIME_TYPES.has(file.type)) {
    return NextResponse.json({ error: "Envie uma imagem PNG ou JPG." }, { status: 400 });
  }

  if (file.size > MAX_PHOTO_SIZE_BYTES) {
    return NextResponse.json({ error: "A foto excede o limite de 20 MB." }, { status: 400 });
  }

  const context = normalizePathPart(formData.get("context"));
  const folder = PHOTO_CONTEXT_PATHS[context] ?? PHOTO_CONTEXT_PATHS["point-actions"];
  const pointId = normalizePathPart(formData.get("pointId")) || "ponto";
  const date = normalizePathPart(formData.get("entryDate"));
  const id = crypto.randomUUID();
  const extension = file.name.includes(".") ? file.name.split(".").pop() : "jpg";
  const storagePath = [folder, date, pointId, `${id}.${extension}`].filter(Boolean).join("/");
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  const { error } = await supabase.storage.from(PHOTOS_BUCKET).upload(storagePath, fileBuffer, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    return NextResponse.json(
      {
        error: "Não foi possível enviar a foto para o Supabase Storage.",
        details: error.message,
      },
      { status: 500 },
    );
  }

  const params = new URLSearchParams({
    bucket: PHOTOS_BUCKET,
    path: storagePath,
  });

  return NextResponse.json({
    url: `/api/documents/file?${params.toString()}`,
    bucket: PHOTOS_BUCKET,
    path: storagePath,
  });
}

function normalizePathPart(value: FormDataEntryValue | null) {
  return typeof value === "string"
    ? value
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
    : "";
}
