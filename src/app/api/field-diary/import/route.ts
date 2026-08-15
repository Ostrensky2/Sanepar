import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import {
  fieldDiaryEntryKey,
  normalizeFieldDiaryEntry,
  normalizeGovernanceStatus,
  type FieldDiaryEntry,
  type FieldDiaryPayload,
} from "@/lib/field-diary";
import { classifyFieldDiaryImport, diffFieldDiaryEntries } from "@/lib/imports/conflict-detection";
import { parseCampaignWorkbook } from "@/lib/imports/campaigns";
import { campaignPointToFieldDiaryPayload } from "@/lib/imports/field-spreadsheet-to-diary";
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
  field_team_name?: string | null;
  field_team_members?: string[];
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
  photos?: unknown;
  governance_status?: string | null;
  collection_order?: number | null;
  missing_in_import?: boolean | null;
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
  const auth = await requireApiSession(request, "data.import");

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

  const ws = wb.getWorksheet("Registros") ?? wb.getWorksheet("Campanhas") ?? wb.worksheets[0];
  if (!ws) {
    return NextResponse.json({ error: "A planilha não contém a aba 'Registros' ou 'Campanhas'." }, { status: 400 });
  }

  const errors: string[] = [];
  let payloads: FieldDiaryPayload[] = [];

  if (ws.name === "Campanhas") {
    try {
      const campaignImport = await parseCampaignWorkbook(arrayBuffer, file.name);
      payloads = campaignImport.points
        .map(campaignPointToFieldDiaryPayload)
        .filter((payload): payload is FieldDiaryPayload => payload !== null);
      if (campaignImport.missingFields.length) {
        errors.push(`Campos esperados ausentes na planilha: ${campaignImport.missingFields.join(", ")}`);
      }
    } catch (err) {
      return NextResponse.json({ error: err instanceof Error ? err.message : "Erro ao processar planilha de campo." }, { status: 400 });
    }
  } else {
    // Sequência de coleta = ordem das linhas da planilha dentro de cada dia da
    // campanha. Preservá-la é o que faz o traçado do percurso sair na ordem certa.
    const orderCounters = new Map<string, number>();

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

      const campaignName = cellText(row, COL.campaignName);
      const orderKey = `${campaignName}|${campaignDay}`;
      const collectionOrder = (orderCounters.get(orderKey) ?? 0) + 1;
      orderCounters.set(orderKey, collectionOrder);

      payloads.push({
        campaignName,
        campaignDay,
        collectionOrder,
        governanceStatus: "importado",
        entryDate,
        fieldTeamName: "",
        fieldTeamMembers: [],
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
        photos: [],
      });
    });
  }

  if (!payloads.length && !errors.length) {
    return NextResponse.json({ error: "A planilha não contém registros para importar." }, { status: 400 });
  }

  const incomingPlan = dedupeIncomingEntries(payloads.map(createEntry));
  const entries = incomingPlan.entries;
  errors.push(...incomingPlan.warnings);
  const supabase = createOptionalSupabaseClient();
  const allowBrowserFallback = isLocalRequest(request);
  const mode = String(formData.get("mode") ?? "apply");
  const force = String(formData.get("force") ?? "") === "true";
  let saved = entries;
  let report: ImportReport = { ...emptyReport(), novos: entries.length };
  let conflicts: ImportConflictDetail[] = [];
  const saveErrors: string[] = [];

  if (!supabase && !allowBrowserFallback) {
    return NextResponse.json(
      { error: "Supabase não configurado para importar o Diário de Campo." },
      { status: 503 },
    );
  }

  if (supabase) {
    const importPlan = await prepareRowsForUpsert(entries, force);
    const rows = importPlan.rows;
    report = importPlan.report;
    conflicts = importPlan.conflicts;

    // PRÉVIA (dry-run): calcula o plano e devolve o relatório SEM gravar nada.
    if (mode === "preview") {
      return NextResponse.json({
        preview: true,
        wouldWrite: rows.length,
        errors: [...errors, ...importPlan.warnings],
        report,
        conflicts,
      });
    }

    errors.push(...importPlan.warnings);
    saved = rows.map(fromRow);

    if (rows.length) {
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
      } else if (importPlan.changes.length) {
        // Histórico de alterações (regra 9): valor anterior/novo, origem, quem, quando.
        const changedBy = auth.session?.name || auth.session?.email || null;
        const logRows = importPlan.changes.map((change) => ({
          entry_id: change.entryId,
          campaign_name: change.campaignName,
          field_name: change.field,
          old_value: change.oldValue,
          new_value: change.newValue,
          origin: change.origin,
          changed_by: changedBy,
        }));
        await supabase.from("field_diary_change_log").insert(logRows);
      }
    }
  }

  return NextResponse.json({
    saved: report.novos + report.atualizados + report.forcados,
    errors: [...errors, ...saveErrors],
    entries: saved,
    report,
    conflicts,
  });
}

function isLocalRequest(request: Request) {
  const host = new URL(request.url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

export type ImportReport = {
  novos: number;
  atualizados: number;
  inalterados: number;
  conflitantes: number;
  forcados: number;
  ausentes: number;
  detalhes: {
    conflitantes: string[];
    ausentes: string[];
  };
};

export type ImportConflictDetail = {
  key: string;
  location: string;
  day: number;
  date: string;
  fields: Array<{ field: string; app: string; sheet: string }>;
};

type ImportChange = {
  entryId: string;
  campaignName: string;
  field: string;
  oldValue: string;
  newValue: string;
  origin: string;
};

function emptyReport(): ImportReport {
  return {
    novos: 0,
    atualizados: 0,
    inalterados: 0,
    conflitantes: 0,
    forcados: 0,
    ausentes: 0,
    detalhes: { conflitantes: [], ausentes: [] },
  };
}

function stringifyConflictValue(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item ?? "")).join("; ");
  }
  if (value === null || value === undefined) {
    return "";
  }
  return String(value);
}

function buildUpdatedRow(
  entry: FieldDiaryEntry,
  existingRow: FieldDiaryImportRow,
  base: FieldDiaryEntry,
): FieldDiaryImportRow {
  return {
    ...toRow({ ...base, id: existingRow.id }),
    collection_order: entry.collectionOrder ?? existingRow.collection_order ?? null,
    governance_status: normalizeGovernanceStatus(existingRow.governance_status),
    missing_in_import: false,
    created_at: existingRow.created_at,
  };
}

async function prepareRowsForUpsert(entries: FieldDiaryEntry[], force = false) {
  const rows = entries.map((entry) => toRow(entry));
  const supabase = createOptionalSupabaseClient();
  const warnings: string[] = [];
  const report = emptyReport();
  const conflicts: ImportConflictDetail[] = [];
  const changes: ImportChange[] = [];

  if (!supabase) {
    report.novos = rows.length;
    return { rows, warnings, report, conflicts, changes };
  }

  const campaignNames = [...new Set(entries.map((entry) => entry.campaignName).filter(Boolean))];

  if (!campaignNames.length) {
    report.novos = rows.length;
    return { rows, warnings, report, conflicts, changes };
  }

  const { data, error } = await supabase
    .from("field_diary_entries")
    .select("*")
    .in("campaign_name", campaignNames)
    .returns<FieldDiaryImportRow[]>();

  if (error) {
    report.novos = rows.length;
    return { rows, warnings, report, conflicts, changes };
  }

  const existingByKey = new Map<string, FieldDiaryImportRow>();

  for (const row of data ?? []) {
    const key = rowKey(row);
    const existing = existingByKey.get(key);
    existingByKey.set(key, existing ? mergeRows(existing, row) : row);
  }

  const plannedRows: FieldDiaryImportRow[] = [];
  const seenKeys = new Set<string>();

  for (const entry of entries) {
    const key = fieldDiaryEntryKey(entry);
    seenKeys.add(key);
    const existingRow = existingByKey.get(key);

    // Registro novo: entra como preliminar ("importado").
    if (!existingRow) {
      plannedRows.push(toRow(entry));
      report.novos += 1;
      continue;
    }

    const existingEntry = normalizeFieldDiaryEntry(fromRow(existingRow));
    const classification = classifyFieldDiaryImport(entry, existingEntry, key);

    // Protegido (consolidado/revisado/corrigido) e divergente: por padrão mantém
    // o app e gera pendência. Se o usuário forçar, a planilha sobrescreve.
    if (classification.status === "conflict") {
      report.conflitantes += 1;
      report.detalhes.conflitantes.push(
        `${entry.locationName || entry.sia || "ponto"} · Dia ${entry.campaignDay} · ${entry.entryDate}`,
      );
      conflicts.push({
        key,
        location: entry.locationName || entry.sia || "ponto",
        day: entry.campaignDay,
        date: entry.entryDate,
        fields: classification.conflicts.map((conflict) => ({
          field: String(conflict.fieldName),
          app: stringifyConflictValue(conflict.appValue),
          sheet: stringifyConflictValue(conflict.sheetValue),
        })),
      });

      if (force && existingEntry) {
        const forced = classifyFieldDiaryImport(entry, existingEntry, key, { force: true });
        const forcedEntry = forced.status === "additive" ? forced.entry : existingEntry;
        plannedRows.push(buildUpdatedRow(entry, existingRow, forcedEntry));
        report.forcados += 1;

        for (const change of diffFieldDiaryEntries(existingEntry, forcedEntry)) {
          changes.push({
            entryId: existingRow.id,
            campaignName: entry.campaignName,
            field: String(change.field),
            oldValue: change.oldValue,
            newValue: change.newValue,
            origin: "planilha (forçado)",
          });
        }
      } else {
        warnings.push(
          `Conflito para ${entry.locationName || entry.sia} em ${entry.entryDate}. ` +
            "O dado revisado/consolidado no aplicativo foi mantido; resolva a pendência manualmente.",
        );
        if (existingRow.missing_in_import) {
          plannedRows.push({ ...existingRow, missing_in_import: false });
        }
      }
      continue;
    }

    // Preliminar: a planilha da campanha atualiza o registro (mantém a sequência
    // de coleta vinda da planilha e limpa a marca de ausente).
    const base = classification.status === "additive" ? classification.entry : existingEntry ?? entry;
    plannedRows.push(buildUpdatedRow(entry, existingRow, base));

    if (classification.status === "additive") {
      report.atualizados += 1;

      if (existingEntry) {
        for (const change of diffFieldDiaryEntries(existingEntry, base)) {
          changes.push({
            entryId: existingRow.id,
            campaignName: entry.campaignName,
            field: String(change.field),
            oldValue: change.oldValue,
            newValue: change.newValue,
            origin: "planilha",
          });
        }
      }
    } else {
      report.inalterados += 1;
    }
  }

  // Linhas que existem no app mas não vieram nesta planilha: NUNCA apagamos —
  // marcamos como "ausente na importação" para revisão do usuário.
  for (const [key, row] of existingByKey) {
    if (seenKeys.has(key) || row.missing_in_import) {
      continue;
    }

    plannedRows.push({ ...row, missing_in_import: true });
    report.ausentes += 1;
    report.detalhes.ausentes.push(
      `${row.location_name || row.sia || "ponto"} · Dia ${row.campaign_day} · ${row.entry_date}`,
    );
  }

  return { rows: plannedRows, warnings, report, conflicts, changes };
}

function toRow(entry: FieldDiaryEntry): FieldDiaryImportRow {
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
    updated_at: entry.updatedAt,
    photos: entry.photos,
    governance_status: entry.governanceStatus ?? "importado",
    collection_order: entry.collectionOrder ?? null,
    missing_in_import: entry.missingInImport ?? false,
  };
}

function fromRow(row: FieldDiaryImportRow): FieldDiaryEntry {
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
    activities: row.activities,
    waterVisualConditions: row.water_visual_conditions,
    hasOccurrence: row.has_occurrence,
    occurrenceType: row.occurrence_type ?? "",
    occurrenceDescription: row.occurrence_description ?? "",
    requiresFollowUp: row.requires_follow_up as FieldDiaryEntry["requiresFollowUp"],
    followUpNotes: row.follow_up_notes ?? "",
    weatherConditions: (row.weather_conditions ?? "") as FieldDiaryEntry["weatherConditions"],
    pointAccessibility: (row.point_accessibility ?? "") as FieldDiaryEntry["pointAccessibility"],
    dailySummary: row.daily_summary,
    status: row.status as FieldDiaryEntry["status"],
    createdBy: row.created_by ?? "",
    createdByName: row.created_by_name ?? "",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    photos: Array.isArray(row.photos) ? row.photos as FieldDiaryEntry["photos"] : [],
    governanceStatus: normalizeGovernanceStatus(row.governance_status),
    collectionOrder: row.collection_order ?? null,
    missingInImport: Boolean(row.missing_in_import),
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

function dedupeIncomingEntries(entries: FieldDiaryEntry[]) {
  const entriesByKey = new Map<string, FieldDiaryEntry>();
  const warnings: string[] = [];

  for (const entry of entries) {
    const key = fieldDiaryEntryKey(entry);
    const existing = entriesByKey.get(key);

    if (!existing) {
      entriesByKey.set(key, entry);
      continue;
    }

    const classification = classifyFieldDiaryImport(entry, existing, key);

    if (classification.status === "conflict") {
      warnings.push(
        `Duplicidade contraditória na planilha para ${entry.locationName || entry.sia} em ${entry.entryDate}. ` +
          "O registro já existente no aplicativo/primeira linha foi mantido e a linha repetida não foi gravada.",
      );
      continue;
    }

    entriesByKey.set(key, classification.entry);
  }

  return {
    entries: [...entriesByKey.values()],
    warnings,
  };
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
    field_team_name: incoming.field_team_name || existing.field_team_name,
    field_team_members: incoming.field_team_members?.length
      ? incoming.field_team_members
      : existing.field_team_members,
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
    photos: Array.isArray(incoming.photos) && incoming.photos.length ? incoming.photos : existing.photos,
  };
}

