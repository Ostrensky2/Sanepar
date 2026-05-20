import { NextResponse } from "next/server";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import {
  normalizeFieldDiaryEntry,
  type FieldDiaryEntry,
} from "@/lib/field-diary";

export const runtime = "nodejs";

type FieldDiaryRow = {
  id: string;
  campaign_id: string | null;
  campaign_name: string;
  campaign_day: number;
  entry_date: string;
  location_name: string;
  sia: string | null;
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
  daily_summary: string;
  status: string;
  created_by: string | null;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
};

export async function GET() {
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
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para salvar o Diário de Campo." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as { entry?: unknown };
  const entry = normalizeFieldDiaryEntry(payload.entry);

  if (!entry) {
    return NextResponse.json(
      { error: "O registro do Diário de Campo é inválido." },
      { status: 400 },
    );
  }

  let result =
    mode === "insert"
      ? await supabase.from("field_diary_entries").insert(toRow(entry)).select("*").single<FieldDiaryRow>()
      : await supabase.from("field_diary_entries").upsert(toRow(entry), { onConflict: "id" }).select("*").single<FieldDiaryRow>();

  if (isMissingCoordinateColumnError(result.error)) {
    result =
      mode === "insert"
        ? await supabase.from("field_diary_entries").insert(toRow(entry, false)).select("*").single<FieldDiaryRow>()
        : await supabase.from("field_diary_entries").upsert(toRow(entry, false), { onConflict: "id" }).select("*").single<FieldDiaryRow>();
  }

  const { data, error } = result;

  if (error) {
    return NextResponse.json(
      { error: "Não foi possível salvar o registro do Diário de Campo." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    entry: fromRow(data),
    persistence: "cloud",
  });
}

function fromRow(row: FieldDiaryRow): FieldDiaryEntry {
  return {
    id: row.id,
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    campaignDay: row.campaign_day,
    entryDate: row.entry_date,
    locationName: row.location_name,
    sia: row.sia,
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
    dailySummary: row.daily_summary,
    status: row.status as FieldDiaryEntry["status"],
    createdBy: row.created_by,
    createdByName: row.created_by_name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(entry: FieldDiaryEntry, includeCoordinates = true) {
  const row = {
    id: entry.id,
    campaign_id: entry.campaignId,
    campaign_name: entry.campaignName,
    campaign_day: entry.campaignDay,
    entry_date: entry.entryDate,
    location_name: entry.locationName,
    sia: entry.sia || null,
    municipality: entry.municipality,
    activities: entry.activities,
    water_visual_conditions: entry.waterVisualConditions,
    has_occurrence: entry.hasOccurrence,
    occurrence_type: entry.hasOccurrence ? entry.occurrenceType || null : null,
    occurrence_description: entry.hasOccurrence ? entry.occurrenceDescription || null : null,
    requires_follow_up: entry.requiresFollowUp,
    follow_up_notes: entry.followUpNotes || null,
    daily_summary: entry.dailySummary,
    status: entry.status,
    created_by: entry.createdBy || null,
    created_by_name: entry.createdByName || null,
    created_at: entry.createdAt,
    updated_at: new Date().toISOString(),
  };

  return includeCoordinates
    ? {
        ...row,
        latitude: entry.latitude || null,
        longitude: entry.longitude || null,
      }
    : row;
}

function isMissingCoordinateColumnError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const message = "message" in error ? String(error.message) : "";
  const details = "details" in error ? String(error.details) : "";
  return /latitude|longitude/i.test(`${message} ${details}`);
}
