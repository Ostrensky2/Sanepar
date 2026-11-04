import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import {
  fieldDiaryEntryKey,
  normalizeFieldDiaryEntry,
  normalizeGovernanceStatus,
  type FieldDiaryEntry,
} from "@/lib/field-diary";
import {
  FieldDiaryValidationError,
  fieldDiaryRuleColumns,
  fieldDiaryRuleErrors,
  fieldDiaryRuleFields,
} from "@/lib/field-diary-validation";
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
  latitude?: number | string | null;
  longitude?: number | string | null;
  execution_status?: string | null;
  relocation_reason?: string | null;
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
      { error: "Não foi possível consultar o Diário de campo." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    entries: data.map(fromRow),
    persistence: "cloud",
  });
}

export async function POST(request: Request) {
  return writeEntrySafely(request, "insert");
}

export async function PUT(request: Request) {
  return writeEntrySafely(request, "upsert");
}

async function writeEntrySafely(request: Request, mode: "insert" | "upsert") {
  try {
    return await writeEntry(request, mode);
  } catch (error) {
    if (error instanceof FieldDiaryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[field-diary] falha inesperada ao gravar", {
      mode,
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Não foi possível salvar o registro do Diário de campo por uma falha no servidor." },
      { status: 500 },
    );
  }
}

async function writeEntry(request: Request, mode: "insert" | "upsert") {
  const auth = await requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Supabase não configurado para salvar o Diário de campo." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as { entry?: unknown };
  const rawExecutionStatus = payload.entry && typeof payload.entry === "object" && "executionStatus" in payload.entry
    ? payload.entry.executionStatus
    : undefined;
  const normalized = normalizeFieldDiaryEntry(payload.entry);

  if (!normalized) {
    return NextResponse.json(
      { error: "O registro do Diário de campo é inválido." },
      { status: 400 },
    );
  }

  // Mesmas regras que o banco confere: coordenada numérica em par e dentro da
  // faixa; ponto "realocado" só com motivo. Recusa com mensagem em português.
  // A situação original precisa ser conferida: a normalização descarta termos
  // desconhecidos, que não podem virar uma situação inferida na gravação.
  const ruleErrors = fieldDiaryRuleErrors({ ...normalized, executionStatus: rawExecutionStatus });

  if (ruleErrors.length) {
    return NextResponse.json({ error: ruleErrors.join(" ") }, { status: 400 });
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

  let rowToSave: Awaited<ReturnType<typeof prepareInsertRow>>;

  try {
    rowToSave = mode === "insert" ? await prepareInsertRow(supabase, entry) : toRow(entry);
  } catch (error) {
    if (error instanceof FieldDiaryValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  if ("error" in rowToSave) {
    return NextResponse.json({ error: rowToSave.error }, { status: rowToSave.status });
  }

  const result =
    mode === "insert"
      ? await supabase.from("field_diary_entries").upsert(rowToSave, { onConflict: "id" }).select("*").single<FieldDiaryRow>()
      : await supabase.from("field_diary_entries").upsert(rowToSave, { onConflict: "id" }).select("*").single<FieldDiaryRow>();

  const { data, error } = result;

  if (error) {
    // Fica no log da Vercel: sem isto não há como saber depois por que o banco recusou.
    console.error("[field-diary] gravação recusada pelo banco", {
      mode,
      entryId: entry.id,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      { error: describeDatabaseError(error) },
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

function describeDatabaseError(error: { code?: string; message?: string }) {
  const base = "Não foi possível salvar o registro do Diário de campo.";
  switch (error.code) {
    case "23514":
      return `${base} O banco recusou um dos valores (coordenada, situação do ponto ou motivo da realocação).`;
    case "23505":
      return `${base} Já existe um registro igual para este ponto e data.`;
    case "22P02":
    case "22003":
      return `${base} Um dos campos tem formato inválido.`;
    default:
      return base;
  }
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
    ...fieldDiaryRuleFields(row),
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
    ...fieldDiaryRuleColumns(entry),
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
