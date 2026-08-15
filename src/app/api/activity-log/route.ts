import { NextResponse } from "next/server";
import { requireApiSession, requireTrustedOrigin } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import type { ActivityKind, ActivityLogEntry } from "@/lib/activity-log";

export const runtime = "nodejs";

type DbActivityLogRow = {
  id: string;
  user_id: string;
  name: string;
  email: string;
  role: string;
  kind: ActivityKind;
  target: string;
  detail: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  const auth = await requireApiSession(request, "settings.activity");
  if (!auth.ok) return auth.response;
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ activities: [], persistence: "browser" });
  }

  const { data, error } = await supabase
    .from("app_activity_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(1000)
    .returns<DbActivityLogRow[]>();

  if (error) {
    return NextResponse.json(
      { activities: [], persistence: "error", error: error.message },
      { status: 200 },
    );
  }

  const activities: ActivityLogEntry[] = (data ?? []).map((row) => ({
    id: row.id,
    timestamp: row.created_at,
    kind: row.kind,
    userId: row.user_id,
    name: row.name,
    email: row.email,
    role: row.role,
    target: row.target,
    detail: row.detail ?? "",
  }));

  return NextResponse.json({ activities, persistence: "cloud" });
}

export async function POST(request: Request) {
  if (!requireTrustedOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const supabase = createOptionalSupabaseClient();

  let payload: Partial<ActivityLogEntry> = {};

  try {
    payload = (await request.json()) as Partial<ActivityLogEntry>;
  } catch {
    return NextResponse.json({ error: "Payload JSON inválido." }, { status: 400 });
  }

  const userId = auth.session.userId;
  const name = auth.session.name;
  const email = auth.session.email;
  const role = auth.session.role;
  const kind = payload.kind;
  const target = payload.target;
  const detail = payload.detail ?? "";
  const id = payload.id || `${Date.now()}-${crypto.randomUUID()}`;
  const timestamp = payload.timestamp || new Date().toISOString();

  if (!userId || !name || !email || !kind || !target) {
    return NextResponse.json(
      { error: "Dados incompletos para registrar atividade." },
      { status: 400 },
    );
  }

  if (!supabase) {
    return NextResponse.json({ success: true, persistence: "browser" });
  }

  const { error } = await supabase.from("app_activity_logs").insert({
    id,
    user_id: userId,
    name,
    email,
    role,
    kind,
    target,
    detail,
    created_at: timestamp,
  });

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível registrar atividade na nuvem.", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ success: true, id, persistence: "cloud" }, { status: 201 });
}
