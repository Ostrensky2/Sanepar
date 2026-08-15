import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { fieldDiaryEntryKey, type FieldDiaryEntry } from "@/lib/field-diary";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

type ImportConflictRow = {
  id: string;
  batch_id: string;
  entity_type: string;
  entity_key: string;
  field_name: string;
  app_value: unknown;
  sheet_value: unknown;
  status: string;
  resolution: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  const auth = await requireApiSession(request);

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ conflicts: [], persistence: "browser" });
  }

  const { data, error } = await supabase
    .from("import_conflicts")
    .select("*")
    .eq("status", "pendente")
    .order("created_at", { ascending: false })
    .returns<ImportConflictRow[]>();

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível consultar as pendências de importação." },
      { status: 500 },
    );
  }

  return NextResponse.json({ conflicts: data, persistence: "cloud" });
}

export async function PATCH(request: Request) {
  const auth = await requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para resolver pendências." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as {
    ids?: string[];
    resolution?: "app" | "planilha";
    resolvedBy?: string;
  };
  const ids = Array.isArray(payload.ids) ? payload.ids.filter(Boolean) : [];

  if (!ids.length || !payload.resolution) {
    return NextResponse.json({ error: "Selecione pendências e uma resolução." }, { status: 400 });
  }

  if (payload.resolution === "planilha") {
    const applyResult = await applySheetValuesToDiary(supabase, ids);
    if (!applyResult.ok) {
      return NextResponse.json({ error: applyResult.error }, { status: 500 });
    }
  }

  const { error } = await supabase
    .from("import_conflicts")
    .update({
      status: "resolvido",
      resolution: payload.resolution,
      resolved_at: new Date().toISOString(),
      resolved_by: payload.resolvedBy ?? null,
    })
    .in("id", ids);

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível resolver as pendências selecionadas." },
      { status: 500 },
    );
  }

  return NextResponse.json({ resolved: ids.length });
}

async function applySheetValuesToDiary(
  supabase: NonNullable<ReturnType<typeof createOptionalSupabaseClient>>,
  ids: string[],
) {
  const { data: conflictRows, error: conflictError } = await supabase
    .from("import_conflicts")
    .select("*")
    .in("id", ids)
    .eq("entity_type", "diario")
    .returns<ImportConflictRow[]>();

  if (conflictError) {
    return { ok: false as const, error: "Não foi possível ler os valores da planilha." };
  }

  if (!conflictRows.length) {
    return { ok: true as const };
  }

  const { data: diaryRows, error: diaryError } = await supabase
    .from("field_diary_entries")
    .select("*")
    .returns<FieldDiaryRow[]>();

  if (diaryError) {
    return { ok: false as const, error: "Não foi possível localizar os registros do Diário." };
  }

  const diaryByKey = new Map<string, FieldDiaryRow>();

  for (const row of diaryRows ?? []) {
    diaryByKey.set(fieldDiaryEntryKey(fieldDiaryRowToEntry(row)), row);
  }

  const conflictsByEntry = new Map<string, ImportConflictRow[]>();

  for (const conflict of conflictRows) {
    const current = conflictsByEntry.get(conflict.entity_key) ?? [];
    conflictsByEntry.set(conflict.entity_key, [...current, conflict]);
  }

  for (const [entityKey, conflicts] of conflictsByEntry) {
    const row = diaryByKey.get(entityKey);

    if (!row) {
      continue;
    }

    const patch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    for (const conflict of conflicts) {
      const column = FIELD_TO_COLUMN[conflict.field_name];
      if (column) {
        patch[column] = conflict.sheet_value;
      }
    }

    const { error } = await supabase
      .from("field_diary_entries")
      .update(patch)
      .eq("id", row.id);

    if (error) {
      return { ok: false as const, error: "Não foi possível aplicar valores da planilha no Diário." };
    }
  }

  return { ok: true as const };
}

type FieldDiaryRow = {
  id: string;
  campaign_id?: string | null;
  campaign_name: string;
  campaign_day: number;
  entry_date: string;
  field_team_name?: string | null;
  field_team_members?: string[];
  collection_time?: string | null;
  location_name: string;
  sia?: string | null;
  samples_replicas_edna?: string | null;
  zooplankton_id?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  municipality: string;
  activities?: string[];
  water_visual_conditions?: string[];
  has_occurrence?: boolean;
  occurrence_type?: string | null;
  occurrence_description?: string | null;
  requires_follow_up?: string;
  follow_up_notes?: string | null;
  weather_conditions?: string | null;
  point_accessibility?: string | null;
  daily_summary?: string;
  status?: string;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at?: string;
  updated_at?: string;
  photos?: unknown;
};

const FIELD_TO_COLUMN: Record<string, string> = {
  campaignDay: "campaign_day",
  entryDate: "entry_date",
  collectionTime: "collection_time",
  createdByName: "created_by_name",
  locationName: "location_name",
  sia: "sia",
  samplesReplicasEdna: "samples_replicas_edna",
  zooplanktonId: "zooplankton_id",
  latitude: "latitude",
  longitude: "longitude",
  municipality: "municipality",
  activities: "activities",
  waterVisualConditions: "water_visual_conditions",
  hasOccurrence: "has_occurrence",
  occurrenceType: "occurrence_type",
  occurrenceDescription: "occurrence_description",
  requiresFollowUp: "requires_follow_up",
  followUpNotes: "follow_up_notes",
  weatherConditions: "weather_conditions",
  pointAccessibility: "point_accessibility",
  dailySummary: "daily_summary",
  status: "status",
  photos: "photos",
};

function fieldDiaryRowToEntry(row: FieldDiaryRow): FieldDiaryEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id ?? null,
    campaignName: row.campaign_name,
    campaignDay: row.campaign_day,
    entryDate: row.entry_date,
    fieldTeamName: row.field_team_name ?? "",
    fieldTeamMembers: row.field_team_members ?? [],
    collectionTime: row.collection_time ?? "",
    locationName: row.location_name,
    sia: row.sia ?? "",
    samplesReplicasEdna: row.samples_replicas_edna ?? "",
    zooplanktonId: row.zooplankton_id ?? "",
    latitude: row.latitude ?? "",
    longitude: row.longitude ?? "",
    municipality: row.municipality,
    activities: row.activities ?? [],
    waterVisualConditions: row.water_visual_conditions ?? [],
    hasOccurrence: Boolean(row.has_occurrence),
    occurrenceType: row.occurrence_type ?? "",
    occurrenceDescription: row.occurrence_description ?? "",
    requiresFollowUp: (row.requires_follow_up ?? "Não") as FieldDiaryEntry["requiresFollowUp"],
    followUpNotes: row.follow_up_notes ?? "",
    weatherConditions: (row.weather_conditions ?? "") as FieldDiaryEntry["weatherConditions"],
    pointAccessibility: (row.point_accessibility ?? "") as FieldDiaryEntry["pointAccessibility"],
    dailySummary: row.daily_summary ?? "",
    status: (row.status ?? "Rascunho") as FieldDiaryEntry["status"],
    createdBy: row.created_by ?? "",
    createdByName: row.created_by_name ?? "",
    createdAt: row.created_at ?? new Date().toISOString(),
    updatedAt: row.updated_at ?? new Date().toISOString(),
    photos: Array.isArray(row.photos) ? row.photos as FieldDiaryEntry["photos"] : [],
  };
}
