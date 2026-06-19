import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  createOptionalSupabaseClient,
  POINT_ACTIONS_SNAPSHOT_FILE_NAME,
} from "@/lib/supabase";
import type { PointActionEvent } from "@/lib/point-actions";

export const runtime = "nodejs";

type PointActionRow = {
  id: string;
  event_name: string;
  objectives: string;
  document: PointActionEvent["document"];
  created_at_label: string;
  points: PointActionEvent["points"];
  updated_at: string;
};

type PointActionSnapshotRow = {
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
    return NextResponse.json({ actions: [], persistence: "browser" });
  }

  const { data, error } = await supabase
    .from("point_actions")
    .select("*")
    .order("updated_at", { ascending: false })
    .returns<PointActionRow[]>();

  if (error) {
    return readActionsFromCampaignSnapshot(supabase);
  }

  return NextResponse.json({
    actions: data.map(fromRow),
    persistence: "cloud",
  });
}

export async function PUT(request: Request) {
  const auth = requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para salvar ações pontuais." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as { actions?: unknown };
  const actions = Array.isArray(payload.actions)
    ? payload.actions.filter(isPointActionEvent)
    : null;

  if (!actions) {
    return NextResponse.json(
      { error: "A lista de ações pontuais é inválida." },
      { status: 400 },
    );
  }

  const { data: existingRows, error: readError } = await supabase
    .from("point_actions")
    .select("id")
    .returns<{ id: string }[]>();

  if (readError) {
    return NextResponse.json(
      { error: "Não foi possível ler as ações pontuais na nuvem." },
      { status: 500 },
    );
  }

  const nextIds = new Set(actions.map((action) => action.id));
  const removedIds = (existingRows ?? [])
    .map((row) => row.id)
    .filter((id) => !nextIds.has(id));

  if (removedIds.length) {
    const { error: deleteError } = await supabase
      .from("point_actions")
      .delete()
      .in("id", removedIds);

    if (deleteError) {
      return NextResponse.json(
        { error: "Não foi possível remover ações pontuais na nuvem." },
        { status: 500 },
      );
    }
  }

  if (actions.length) {
    const { error: upsertError } = await supabase.from("point_actions").upsert(
      actions.map((action) => ({
        id: action.id,
        event_name: action.eventName,
        objectives: action.objectives,
        document: action.document,
        created_at_label: action.createdAt,
        points: action.points,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "id" },
    );

    if (upsertError) {
      return NextResponse.json(
        { error: "Não foi possível salvar ações pontuais na nuvem." },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ actions, persistence: "cloud" });
}

async function readActionsFromCampaignSnapshot(
  supabase: NonNullable<ReturnType<typeof createOptionalSupabaseClient>>,
) {
  const { data, error } = await supabase
    .from("campaign_imports")
    .select("points, created_at")
    .eq("file_name", POINT_ACTIONS_SNAPSHOT_FILE_NAME)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PointActionSnapshotRow>();

  if (error) {
    return NextResponse.json({ actions: [], persistence: "browser" });
  }

  const actions = Array.isArray(data?.points)
    ? data.points.filter(isPointActionEvent)
    : [];

  return NextResponse.json({
    actions,
    persistence: "cloud-snapshot",
  });
}

function fromRow(row: PointActionRow): PointActionEvent {
  return {
    id: row.id,
    eventName: row.event_name,
    objectives: row.objectives,
    document: row.document,
    createdAt: row.created_at_label,
    points: row.points,
  };
}

function isPointActionEvent(value: unknown): value is PointActionEvent {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<PointActionEvent>;

  return Boolean(
    candidate.id &&
      candidate.eventName &&
      typeof candidate.objectives === "string" &&
      typeof candidate.createdAt === "string" &&
      Array.isArray(candidate.points),
  );
}
