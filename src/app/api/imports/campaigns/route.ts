import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/api-auth";
import { parseCampaignWorkbook } from "@/lib/imports/campaigns";
import { classifyFieldDiaryImport } from "@/lib/imports/conflict-detection";
import { MAX_IMPORT_FILE_BYTES, previewWorkbook } from "@/lib/imports/excel";
import { campaignPointToFieldDiaryPayload } from "@/lib/imports/field-spreadsheet-to-diary";
import {
  buildImportedPhotoPath,
  fetchAndStorePhotosAsPng,
  splitPhotoLinks,
} from "@/lib/imports/photo-fetch";
import {
  fieldDiaryEntryKey,
  normalizeFieldDiaryEntry,
  type FieldDiaryEntry,
  type FieldDiaryPayload,
} from "@/lib/field-diary";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const auth = requireApiSession(request, "data.import");

  if (!auth.ok) {
    return auth.response;
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: "A planilha Campanhas_ Planilha síntese.xlsx deve ser enviada." },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json(
        { error: "O arquivo enviado está vazio." },
        { status: 400 },
      );
    }

    if (file.size > MAX_IMPORT_FILE_BYTES) {
      return NextResponse.json(
        { error: "A planilha precisa ter até 12 MB para publicação direta." },
        { status: 413 },
      );
    }

    const buffer = await file.arrayBuffer();
    const campaignImport = await parseCampaignWorkbook(buffer, file.name);
    normalizeCampaignKeys(campaignImport.points);
    const preview = await previewWorkbook(buffer, file.name);
    const unifiedImport = await applyUnifiedFieldImport(campaignImport);
    const persistence = await persistCampaignImport(campaignImport);

    if (persistence.mode === "cloud-error") {
      return NextResponse.json(
        {
          error:
            "A planilha foi lida, mas a publicação na nuvem falhou. Os demais usuários NÃO verão estes dados. Tente novamente ou contate o administrador.",
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ...campaignImport,
      preview,
      persistence,
      unifiedImport,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Não foi possível publicar a planilha de campanhas.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function applyUnifiedFieldImport(campaignImport: Awaited<ReturnType<typeof parseCampaignWorkbook>>) {
  const supabase = createOptionalSupabaseClient();
  const summary = {
    novos: 0,
    identicos: 0,
    aditivos: 0,
    conflitos: 0,
    fotos: {
      baixadas: 0,
      avisos: 0,
    },
  };
  const conflicts: Array<{
    entityType: "diario";
    entityKey: string;
    fieldName: string;
    appValue: unknown;
    sheetValue: unknown;
  }> = [];
  const photoWarnings: Array<{ pointId: string; sourceUrl: string; message: string }> = [];

  if (supabase) {
    await attachStoredPhotos(campaignImport, supabase, summary, photoWarnings);
  } else {
    for (const point of campaignImport.points) {
      const warningLinks = splitPhotoLinks([point.photoUrl, point.driveUrl, point.dropboxUrl].join(";"));
      if (warningLinks.length) {
        const message = "Supabase não configurado; fotos por link não foram convertidas para Storage.";
        point.photoWarnings = warningLinks.map((sourceUrl) => `${sourceUrl}: ${message}`);
        photoWarnings.push(...warningLinks.map((sourceUrl) => ({ pointId: point.id, sourceUrl, message })));
      }
    }
  }

  const incomingEntries = campaignImport.points
    .map(campaignPointToFieldDiaryPayload)
    .filter((payload): payload is FieldDiaryPayload => payload !== null)
    .map(createEntry);

  if (!supabase) {
    summary.novos = incomingEntries.length;
    return {
      mode: "browser" as const,
      summary,
      conflicts,
      photoWarnings,
      entries: incomingEntries,
    };
  }

  const existingEntries = await readExistingFieldDiaryEntries(supabase, incomingEntries);
  const rowsToUpsert: FieldDiaryEntry[] = [];
  const batchId = crypto.randomUUID();

  for (const incoming of incomingEntries) {
    const key = fieldDiaryEntryKey(incoming);
    const existing = existingEntries.get(key) ?? null;
    const classification = classifyFieldDiaryImport(incoming, existing, key);

    if (classification.status === "new") {
      summary.novos += 1;
      rowsToUpsert.push(incoming);
    } else if (classification.status === "additive") {
      summary.aditivos += 1;
      rowsToUpsert.push(classification.entry);
    } else if (classification.status === "identical") {
      summary.identicos += 1;
    } else {
      summary.conflitos += 1;
      conflicts.push(
        ...classification.conflicts.map((conflict) => ({
          entityType: conflict.entityType,
          entityKey: conflict.entityKey,
          fieldName: String(conflict.fieldName),
          appValue: conflict.appValue,
          sheetValue: conflict.sheetValue,
        })),
      );
    }
  }

  if (rowsToUpsert.length) {
    const { error } = await supabase
      .from("field_diary_entries")
      .upsert(rowsToUpsert.map(fieldDiaryEntryToRow), { onConflict: "id" });

    if (error) {
      throw new Error("A planilha foi lida, mas o Diário de Campo recusou a gravação.");
    }
  }

  if (conflicts.length) {
    await persistImportConflicts(supabase, batchId, conflicts);
  }

  return {
    mode: "cloud" as const,
    batchId,
    summary,
    conflicts,
    photoWarnings,
  };
}

async function attachStoredPhotos(
  campaignImport: Awaited<ReturnType<typeof parseCampaignWorkbook>>,
  supabase: NonNullable<ReturnType<typeof createOptionalSupabaseClient>>,
  summary: { fotos: { baixadas: number; avisos: number } },
  photoWarnings: Array<{ pointId: string; sourceUrl: string; message: string }>,
) {
  for (const point of campaignImport.points) {
    const sourceLinks = [
      ...splitPhotoLinks(point.photoUrl),
      ...splitPhotoLinks(point.driveUrl),
      ...splitPhotoLinks(point.dropboxUrl),
    ];
    const uniqueLinks = [...new Set(sourceLinks)];

    if (!uniqueLinks.length) {
      continue;
    }

    const result = await fetchAndStorePhotosAsPng(uniqueLinks, {
      supabase,
      storagePathBuilder: (sourceUrl, index) =>
        buildImportedPhotoPath({
          campaign: point.campaign,
          code: point.code,
          pointId: point.id,
          sourceUrl,
          index,
        }),
    });

    if (result.photos.length) {
      point.photos = result.photos.map((photo, index) => ({
        id: photo.id,
        url: photo.url,
        caption: `Foto ${index + 1} - ${point.code}`,
        bucket: photo.bucket,
        path: photo.path,
        fileName: photo.fileName,
        width: photo.width,
        height: photo.height,
        uploadedAt: photo.uploadedAt,
      }));
      point.photoUrl = result.photos[0].url;
      point.driveUrl = "";
      point.dropboxUrl = "";
      summary.fotos.baixadas += result.photos.length;
    }

    if (result.warnings.length) {
      point.photoWarnings = result.warnings.map((warning) => `${warning.sourceUrl}: ${warning.message}`);
      photoWarnings.push(
        ...result.warnings.map((warning) => ({
          pointId: point.id,
          sourceUrl: warning.sourceUrl,
          message: warning.message,
        })),
      );
      summary.fotos.avisos += result.warnings.length;
    }
  }
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
    throw new Error("Registro inválido gerado pela Planilha de Campo.");
  }

  return normalized;
}

async function readExistingFieldDiaryEntries(
  supabase: NonNullable<ReturnType<typeof createOptionalSupabaseClient>>,
  incomingEntries: FieldDiaryEntry[],
) {
  const campaignNames = [...new Set(incomingEntries.map((entry) => entry.campaignName).filter(Boolean))];
  const entries = new Map<string, FieldDiaryEntry>();

  if (!campaignNames.length) {
    return entries;
  }

  const { data, error } = await supabase
    .from("field_diary_entries")
    .select("*")
    .in("campaign_name", campaignNames);

  if (error || !Array.isArray(data)) {
    return entries;
  }

  for (const row of data) {
    const entry = normalizeFieldDiaryEntry(fieldDiaryRowToEntry(row as FieldDiaryRow));
    if (entry) {
      entries.set(fieldDiaryEntryKey(entry), entry);
    }
  }

  return entries;
}

async function persistImportConflicts(
  supabase: NonNullable<ReturnType<typeof createOptionalSupabaseClient>>,
  batchId: string,
  conflicts: Array<{
    entityType: "diario";
    entityKey: string;
    fieldName: string;
    appValue: unknown;
    sheetValue: unknown;
  }>,
) {
  const { error } = await supabase.from("import_conflicts").insert(
    conflicts.map((conflict) => ({
      batch_id: batchId,
      entity_type: conflict.entityType,
      entity_key: conflict.entityKey,
      field_name: conflict.fieldName,
      app_value: conflict.appValue,
      sheet_value: conflict.sheetValue,
      status: "pendente",
    })),
  );

  if (error) {
    throw new Error("Conflitos detectados, mas a área de pendências recusou a gravação.");
  }
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

function fieldDiaryEntryToRow(entry: FieldDiaryEntry) {
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
  };
}

async function persistCampaignImport(campaignImport: Awaited<ReturnType<typeof parseCampaignWorkbook>>) {
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return {
      mode: "browser" as const,
      message: "Supabase não configurado; os dados foram preparados para uso neste navegador.",
    };
  }

  const campaignKey =
    campaignImport.points[0]?.campaign?.trim().toLowerCase() ||
    campaignImport.fileName.trim().toLowerCase();

  const { error } = await supabase.from("campaign_imports").insert({
    file_name: campaignImport.fileName,
    row_count: campaignImport.rowCount,
    point_count: campaignImport.points.length,
    original_point_count: campaignImport.originalPointCount,
    effective_point_count: campaignImport.effectivePointCount,
    missing_fields: campaignImport.missingFields,
    points: campaignImport.points,
    campaign_key: campaignKey,
  });

  if (error) {
    return {
      mode: "cloud-error" as const,
      message: "A nuvem recusou a gravação da planilha de campanhas.",
    };
  }

  return {
    mode: "cloud" as const,
    message: "Planilha publicada no Supabase e pronta para o painel.",
  };
}

// Pontos sem campanha herdariam uma "campanha fantasma" na agregação por
// chave; preenche com a primeira campanha não vazia encontrada na planilha.
function normalizeCampaignKeys(points: Awaited<ReturnType<typeof parseCampaignWorkbook>>["points"]) {
  const fallbackCampaign = points.find((point) => point.campaign?.trim())?.campaign?.trim();

  if (!fallbackCampaign) {
    return;
  }

  for (const point of points) {
    if (!point.campaign?.trim()) {
      point.campaign = fallbackCampaign;
    }
  }
}
