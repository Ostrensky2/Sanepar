import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const ALLOWED_BUCKETS = new Set(["documents", "photos"]);

export async function GET(request: Request) {
  const auth = requireApiSession(request);

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para acessar arquivos." },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const bucket = url.searchParams.get("bucket")?.trim();
  const path = url.searchParams.get("path")?.trim();
  const download = url.searchParams.get("download") === "1";

  if (
    !bucket ||
    !ALLOWED_BUCKETS.has(bucket) ||
    !path ||
    path.startsWith("/") ||
    path.split("/").includes("..")
  ) {
    return NextResponse.json({ error: "Arquivo inválido." }, { status: 400 });
  }

  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, 60 * 10, { download });

  if (!error && data?.signedUrl) {
    return NextResponse.redirect(data.signedUrl);
  }

  return NextResponse.json(
    { error: "Não foi possível gerar acesso ao arquivo." },
    { status: 500 },
  );
}
