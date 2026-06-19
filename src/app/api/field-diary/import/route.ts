import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  fieldDiaryEntryKey,
  normalizeFieldDiaryEntry,
  type FieldDiaryEntry,
  type FieldDiaryPayload,
} from "@/lib/field-diary";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const COL = {
  campaignName: 1,
  campaignDay: 2,
  entryDate: 3,
  createdByName: 4,
  locationName: 5,
  sia: 6,
  latitude: 7,
  longitude: 8,
  municipality: 9,
  activities: 10,
  waterVisualConditions: 11,
  hasOccurrence: 12,
  occurrenceType: 13,
  occurrenceDescription: 14,
  requiresFollowUp: 15,
  followUpNotes: 16,
  dailySummary: 17,
  status: 18,
} as const;

type FieldDiaryImportRow = {
  id: string;
  campaign_id?: string | null;
  campaign_name: string;
  campaign_day: number;
  entry_date: string;
  collection_time?: string | null;
  location_name: string;
  sia?: string | null;
  samples_replicas_edna?: string | null;
  zooplankton_id?: string | null;
  municipality: string;
  activities: string[];
  water_visual_conditions: string[];
  has_occurrence: boolean;
  occurrence_type?: string | null;
  occurrence_description?: string | null;
  requires_follow_up: string;
  follow_up_notes?: string | null;
  weather_conditions?: string | null;
  point_accessibility?: string | null;
  daily_summary: string;
  status: string;
  created_by?: string | null;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
  latitude?: string | null;
  longitude?: string | null;
};

function cellText(row: ExcelJS.Row, col: number): string {
  const v = row.getCell(col).value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) {
    return v.toISOString().slice(0, 10);
  }
  if (typeof v === "object" && "richText" in v) {
    return (v as ExcelJS.CellRichTextValue).richText.map((r) => r.text).join("").trim();
  }
  return String(v).trim();
}

function parseArray(raw: string): string[] {
  return raw
    .split(";")
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseHasOccurrence(raw: string): boolean {
  return raw.toLowerCase() === "sim";
}

function parseDate(raw: string): string {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;
  const br = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (br) return `${br[3]}-${br[2]}-${br[1]}`;
  return "";
}

function hasAnyCellData(row: ExcelJS.Row) {
  return Object.values(COL).some((col) => cellText(row, col));
}

function createEntry(payload: FieldDiaryPayload): FieldDiaryEntry {
  const now = new Date().toISOString();
  const normalized = normalizeFieldDiaryEntry({
    ...payload,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  });

  if (!normalized) {
    throw new Error("Registro inválido.");
  }

  return normalized;
}

export async function POST(request: Request) {
  const auth = requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Nenhum arquivo enviado." }, { status: 400 });
  }

  const arrayBuffer = await file.arrayBuffer();
  const wb = new ExcelJS.Workbook();

  try {
    await wb.xlsx.load(arrayBuffer);
  } catch {
    return NextResponse.json({ error: "Não foi possível ler o arquivo. Verifique se é um .xlsx válido." }, { status: 400 });
  }

  const ws = wb.getWorksheet("Registros") ?? wb.worksheets[0];
  if (!ws) {
    return NextResponse.json({ error: "A planilha não contém a aba 'Registros'." }, { status: 400 });
  }

  const errors: string[] = [];
  const payloads: FieldDiaryPayload[] = [];

  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header

    if (!hasAnyCellData(row)) return;

    const rawDate = cellText(row, COL.entryDate);
    const entryDate = parseDate(rawDate) || new Date().toISOString().slice(0, 10);

    const rawDay = cellText(row, COL.campaignDay);
    const campaignDay = parseInt(rawDay, 10) || 1;

    const activities = parseArray(cellText(row, COL.activities));
    const waterVisualConditions = parseArray(cellText(row, COL.waterVisualConditions));

    const hasOccurrence = parseHasOccurrence(cellText(row, COL.hasOccurrence));

    const rawStatus = cellText(row, COL.status);
    const status = (["Rascunho", "Enviado", "Revisado"].includes(rawStatus) ? rawStatus : "Rascunho") as FieldDiaryPayload["status"];

    const rawFollowUp = cellText(row, COL.requiresFollowUp);
    const requiresFollowUp = (
      ["Não", "Sim", "Avaliar posteriormente"].includes(rawFollowUp) ? rawFollowUp : "Não"
    ) as FieldDiaryPayload["requiresFollowUp"];

    payloads.push({
      campaignName: cellText(row, COL.campaignName),
      campaignDay,
      entryDate,
      collectionTime: "",
      createdByName: cellText(row, COL.createdByName) || null,
      locationName: cellText(row, COL.locationName),
      sia: cellText(row, COL.sia) || null,
      samplesReplicasEdna: "",
      zooplanktonId: "",
      latitude: cellText(row, COL.latitude) || null,
      longitude: cellText(row, COL.longitude) || null,
      municipality: cellText(row, COL.municipality),
      activities,
      waterVisualConditions,
      hasOccurrence,
      occurrenceType: hasOccurrence ? cellText(row, COL.occurrenceType) || null : null,
      occurrenceDescription: hasOccurrence ? cellText(row, COL.occurrenceDescription) || null : null,
      requiresFollowUp,
      followUpNotes: cellText(row, COL.followUpNotes) || null,
      weatherConditions: "",
      pointAccessibility: "",
      dailySummary: cellText(row, COL.dailySummary),
      status,
      createdBy: null,
    });
  });

  if (!payloads.length && !errors.length) {
    return NextResponse.json({ error: "A planilha não contém registros para importar." }, { status: 400 });
  }

  const entries = payloads.map(createEntry);
  const supabase = createOptionalSupabaseClient();
  const allowBrowserFallback = isLocalRequest(request);
  let saved = entries;
  const saveErrors: string[] = [];

  if (!supabase && !allowBrowserFallback) {
    return NextResponse.json(
      { error: "Supabase não configurado para importar o Diário de Campo." },
      { status: 503 },
    );
  }

  if (supabase) {
    const rows = await prepareRowsForUpsert(entries);
    const { error } = await supabase
      .from("field_diary_entries")
      .upsert(rows, { onConflict: "id" });

    if (error) {
      if (!allowBrowserFallback) {
        return NextResponse.json(
          { error: "O banco recusou a importação do Diário de Campo." },
          { status: 500 },
        );
      }

      saved = entries;
      saveErrors.push("O banco recusou a gravação agora, mas os registros foram importados neste navegador.");
    }
  }

  return NextResponse.json({
    saved: saved.length,
    errors: [...errors, ...saveErrors],
    entries: saved,
  });
}

function isLocalRequest(request: Request) {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

async function prepareRowsForUpsert(entries: FieldDiaryEntry[]) {
  const rows = entries.map((entry) => toRow(entry));
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return rows;
  }

  const campaignNames = [...new Set(entries.map((entry) => entry.campaignName).filter(Boolean))];

  if (!campaignNames.length) {
    return rows;
  }

  const { data, error } = await supabase
    .from("field_diary_entries")
    .select("*")
    .in("campaign_name", campaignNames)
    .returns<FieldDiaryImportRow[]>();

  if (error || !data?.length) {
    return rows;
  }

  const existingByKey = new Map<string, FieldDiaryImportRow>();

  for (const row of data) {
    const key = rowKey(row);
    const existing = existingByKey.get(key);
    existingByKey.set(key, existing ? mergeRows(existing, row) : row);
  }

  return rows.map((row) => {
    const existing = existingByKey.get(rowKey(row));
    return existing ? mergeRows(existing, { ...row, id: existing.id }) : row;
  });
}

function toRow(entry: FieldDiaryEntry): FieldDiaryImportRow {
  return {
    id: entry.id,
    campaign_id: entry.campaignId,
    campaign_name: entry.campaignName,
    campaign_day: entry.campaignDay,
    entry_date: entry.entryDate,
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
    updated_at: entry.updatedAt,
  };
}

function rowKey(row: Pick<FieldDiaryImportRow, "campaign_name" | "entry_date" | "location_name" | "sia">) {
  return fieldDiaryEntryKey({
    campaignName: row.campaign_name,
    entryDate: row.entry_date,
    locationName: row.location_name,
    sia: row.sia,
  });
}

function mergeRows(existing: FieldDiaryImportRow, incoming: FieldDiaryImportRow): FieldDiaryImportRow {
  return {
    ...existing,
    ...incoming,
    id: existing.id,
    campaign_id: incoming.campaign_id || existing.campaign_id,
    campaign_name: incoming.campaign_name || existing.campaign_name,
    campaign_day: incoming.campaign_day || existing.campaign_day,
    entry_date: incoming.entry_date || existing.entry_date,
    collection_time: incoming.collection_time || existing.collection_time,
    location_name: incoming.location_name || existing.location_name,
    sia: incoming.sia || existing.sia,
    samples_replicas_edna: incoming.samples_replicas_edna || existing.samples_replicas_edna,
    zooplankton_id: incoming.zooplankton_id || existing.zooplankton_id,
    latitude: incoming.latitude || existing.latitude,
    longitude: incoming.longitude || existing.longitude,
    municipality: incoming.municipality || existing.municipality,
    activities: incoming.activities?.length ? incoming.activities : existing.activities,
    water_visual_conditions: incoming.water_visual_conditions?.length
      ? incoming.water_visual_conditions
      : existing.water_visual_conditions,
    has_occurrence: incoming.has_occurrence || existing.has_occurrence,
    occurrence_type: incoming.occurrence_type || existing.occurrence_type,
    occurrence_description: incoming.occurrence_description || existing.occurrence_description,
    requires_follow_up: incoming.requires_follow_up || existing.requires_follow_up,
    follow_up_notes: incoming.follow_up_notes || existing.follow_up_notes,
    weather_conditions: incoming.weather_conditions || existing.weather_conditions,
    point_accessibility: incoming.point_accessibility || existing.point_accessibility,
    daily_summary: incoming.daily_summary || existing.daily_summary,
    status: incoming.status || existing.status,
    created_by: incoming.created_by || existing.created_by,
    created_by_name: incoming.created_by_name || existing.created_by_name,
    created_at: existing.created_at || incoming.created_at,
    updated_at: incoming.updated_at,
  };
}

