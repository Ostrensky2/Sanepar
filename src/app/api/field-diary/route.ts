import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import {
  fieldDiaryEntryKey,
  normalizeFieldDiaryEntry,
  normalizeGovernanceStatus,
  type FieldDiaryEntry,
} from "@/lib/field-diary";
import { classifyFieldDiaryImport, diffFieldDiaryEntries } from "@/lib/imports/conflict-detection";

export const runtime = "nodejs";

type FieldDiaryRow = {
  id: string;
  campaign_id: string | null;
  campaign_name: string;
  campaign_day: number;
  entry_date: string;
  field_team_name: string | null;
  field_team_members: string[];
  collection_time: string | null;
  location_name: string;
  sia: string | null;
  samples_replicas_edna: string | null;
  zooplankton_id: string | null;
  latitude?: string | null;
  longitude?: string | null;
  municipality: string;
  activities: string[];
  water_visual_conditions: string[];
  has_occurrence: boolean;
  occurrence_type: string | null;
  occurrence_description: string | null;
  requires_follow_up: string;
  follow_up_notes: string | null;
  weather_conditions: string | null;
  point_accessibility: string | null;
  daily_summary: string;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
  photos: unknown;
  governance_status?: string | null;
  collection_order?: number | null;
  missing_in_import?: boolean | null;
};

export async function GET(request: Request) {
  const auth = await requireApiSession(request);

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ entries: [], persistence: "browser" });
  }

  const { data, error } = await supabase
    .from("field_diary_entries")
    .select("*")
    .order("entry_date", { ascending: false })
    .order("updated_at", { ascending: false })
    .returns<FieldDiaryRow[]>();

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível consultar o Diário de Campo." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    entries: data.map(fromRow),
    persistence: "cloud",
  });
}

export async function POST(request: Request) {
  return writeEntry(request, "insert");
}

export async function PUT(request: Request) {
  return writeEntry(request, "upsert");
}

async function writeEntry(request: Request, mode: "insert" | "upsert") {
  const auth = await requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para salvar o Diário de Campo." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as { entry?: unknown };
  const normalized = normalizeFieldDiaryEntry(payload.entry);

  if (!normalized) {
    return NextResponse.json(
      { error: "O registro do Diário de Campo é inválido." },
      { status: 400 },
    );
  }

  // Edição manual no app promove o registro a "corrigido": passa a ter prioridade
  // sobre futuras importações da planilha da campanha.
  const entry: FieldDiaryEntry = { ...normalized, governanceStatus: "corrigido" };

  // Captura o estado anterior (numa edição) para registrar o histórico por campo.
  let previousEntry: FieldDiaryEntry | null = null;
  if (mode === "upsert") {
    const { data: previousRow } = await supabase
      .from("field_diary_entries")
      .select("*")
      .eq("id", entry.id)
      .maybeSingle<FieldDiaryRow>();
    if (previousRow) {
      previousEntry = normalizeFieldDiaryEntry(fromRow(previousRow));
    }
  }

  const rowToSave = mode === "insert" ? await prepareInsertRow(supabase, entry) : toRow(entry);

  if ("error" in rowToSave) {
    return NextResponse.json({ error: rowToSave.error }, { status: rowToSave.status });
  }

  const result =
    mode === "insert"
      ? await supabase.from("field_diary_entries").upsert(rowToSave, { onConflict: "id" }).select("*").single<FieldDiaryRow>()
      : await supabase.from("field_diary_entries").upsert(rowToSave, { onConflict: "id" }).select("*").single<FieldDiaryRow>();

  const { data, error } = result;

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar o registro do Diário de Campo." },
      { status: 500 },
    );
  }

  const savedEntry = fromRow(data);

  // Histórico de alterações da edição manual (origem "app").
  if (previousEntry) {
    const changes = diffFieldDiaryEntries(previousEntry, savedEntry);
    if (changes.length) {
      const changedBy = auth.session?.name || auth.session?.email || null;
      await supabase.from("field_diary_change_log").insert(
        changes.map((change) => ({
          entry_id: entry.id,
          campaign_name: entry.campaignName,
          field_name: String(change.field),
          old_value: change.oldValue,
          new_value: change.newValue,
          origin: "app",
          changed_by: changedBy,
        })),
      );
    }
  }

  return NextResponse.json({
    entry: savedEntry,
    persistence: "cloud",
  });
}

async function prepareInsertRow(
  supabase: NonNullable<ReturnType<typeof createOptionalSupabaseClient>>,
  entry: FieldDiaryEntry,
) {
  const { data, error } = await supabase
    .from("field_diary_entries")
    .select("*")
    .eq("entry_date", entry.entryDate)
    .returns<FieldDiaryRow[]>();

  if (error || !Array.isArray(data)) {
    return toRow(entry);
  }

  const existing = data
    .map(fromRow)
    .find((candidate) => fieldDiaryEntryKey(candidate) === fieldDiaryEntryKey(entry));

  if (!existing) {
    return toRow(entry);
  }

  const classification = classifyFieldDiaryImport(entry, existing, fieldDiaryEntryKey(entry));

  if (classification.status === "conflict") {
    return {
      error: "Já existe um registro para este ponto e data com dados diferentes. O registro do aplicativo foi mantido.",
      status: 409,
    } as const;
  }

  return toRow({ ...classification.entry, id: existing.id });
}

function fromRow(row: FieldDiaryRow): FieldDiaryEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    campaignDay: row.campaign_day,
    entryDate: row.entry_date,
    fieldTeamName: row.field_team_name ?? "",
    fieldTeamMembers: row.field_team_members ?? [],
    collectionTime: row.collection_time ?? "",
    locationName: row.location_name,
    sia: row.sia,
    samplesReplicasEdna: row.samples_replicas_edna ?? "",
    zooplanktonId: row.zooplankton_id ?? "",
    latitude: row.latitude,
    longitude: row.longitude,
    municipality: row.municipality,
    activities: row.activities,
    waterVisualConditions: row.water_visual_conditions,
    hasOccurrence: row.has_occurrence,
    occurrenceType: row.occurrence_type,
    occurrenceDescription: row.occurrence_description,
    requiresFollowUp: row.requires_follow_up as FieldDiaryEntry["requiresFollowUp"],
    followUpNotes: row.follow_up_notes,
    weatherConditions: (row.weather_conditions ?? "") as FieldDiaryEntry["weatherConditions"],
    pointAccessibility: (row.point_accessibility ?? "") as FieldDiaryEntry["pointAccessibility"],
    dailySummary: row.daily_summary,
    status: row.status as FieldDiaryEntry["status"],
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos: Array.isArray(row.photos) ? row.photos as FieldDiaryEntry["photos"] : [],
    governanceStatus: normalizeGovernanceStatus(row.governance_status),
    collectionOrder: row.collection_order ?? null,
    missingInImport: Boolean(row.missing_in_import),
  };
}

function toRow(entry: FieldDiaryEntry) {
  return {
    id: entry.id,
    campaign_id: entry.campaignId,
    campaign_name: entry.campaignName,
    campaign_day: entry.campaignDay,
    entry_date: entry.entryDate,
    field_team_name: entry.fieldTeamName || null,
    field_team_members: entry.fieldTeamMembers,
    collection_time: entry.collectionTime || null,
    location_name: entry.locationName,
    sia: entry.sia || null,
    samples_replicas_edna: entry.samplesReplicasEdna || null,
    zooplankton_id: entry.zooplanktonId || null,
    latitude: entry.latitude || null,
    longitude: entry.longitude || null,
    municipality: entry.municipality,
    activities: entry.activities,
    water_visual_conditions: entry.waterVisualConditions,
    has_occurrence: entry.hasOccurrence,
    occurrence_type: entry.hasOccurrence ? entry.occurrenceType || null : null,
    occurrence_description: entry.hasOccurrence ? entry.occurrenceDescription || null : null,
    requires_follow_up: entry.requiresFollowUp,
    follow_up_notes: entry.followUpNotes || null,
    weather_conditions: entry.weatherConditions || null,
    point_accessibility: entry.pointAccessibility || null,
    daily_summary: entry.dailySummary,
    status: entry.status,
    created_by: entry.createdBy || null,
    created_by_name: entry.createdByName || null,
    created_at: entry.createdAt,
    updated_at: new Date().toISOString(),
    photos: entry.photos,
    // Edição/salvamento manual no app: o registro passa a ter prioridade sobre
    // futuras importações de planilha (ver import-governance).
    governance_status: normalizeGovernanceStatus(entry.governanceStatus),
    collection_order: entry.collectionOrder ?? null,
    missing_in_import: entry.missingInImport ?? false,
  };
}
