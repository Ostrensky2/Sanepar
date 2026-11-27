import { campaignIdentityKey, normalizeCampaignKey, resolveCanonicalCampaign } from "../../campaign-identity";
import { sha256 } from "./canonical";
import {
  DOCUMENT_LIMIT_BYTES, PHOTO_LIMIT_BYTES, makeItem,
  type Derivation, type Provenance, type WireItem,
} from "./protocol";

/**
 * Projeção dos dados de campo do Yva'e para o protocolo da conexão com o Tape.
 * Funções puras: recebem o retrato bruto lido do banco (uma única consulta) e
 * devolvem as entidades e os arquivos referenciados. Nada aqui consulta rede ou
 * banco, e nada é inventado: valor ausente sai como null, com o motivo anotado.
 */

type Row = Record<string, unknown>;

export type Source = {
  entries: Row[];
  samples: Row[];
  parameters: Row[];
  readings: Row[];
  documents: Row[];
  campaignImports: Row[];
  campaignImportRevisions: Row[];
  campaignManagement: Record<string, Row>;
  pointActions: Row[];
  storageObjects: Row[];
};

export type ObjectState = "pending" | "ready" | "missing" | "too_large" | "changed" | "unsupported";
export type ObjectRef = {
  opaqueId: string;
  bucket: string;
  path: string;
  version: string;
  size: number | null;
  mime: string | null;
  sha256: string | null;
  state: ObjectState;
  reason: string | null;
};

const EXPORTABLE_BUCKETS = new Set(["photos", "documents"]);
// Laboratório, interpretação científica e risco: fora do escopo, mesmo ligados a campanha ou ponto.
const LAB_CATEGORIES = new Set(["resultados", "laudos"]);
// Categorias cuja finalidade de campo vem da própria categoria; ainda exigem vínculo comprovado.
const FIELD_CATEGORIES = new Set(["plano de trabalho", "mapas"]);

const text = (value: unknown): string | null => (typeof value === "string" ? value : null);
const number = (value: unknown): number | null => {
  const parsed = typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value.trim()) ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) ? (Object.is(parsed, -0) ? 0 : parsed) : null;
};
const flag = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);
const list = (value: unknown): string[] | null =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : null;
const rows = (value: unknown): Row[] =>
  Array.isArray(value) ? value.filter((item): item is Row => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
const norm = (value: unknown) =>
  String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/** Identidade do ponto na origem: o código SIA quando existe; sem ele, o nome do local. */
export function pointKey(code: unknown, name: unknown): string | null {
  const byCode = norm(code);
  // Mesma regra de unicidade do diário de campo: "SIA 12", "sia-12" e "12" são o mesmo ponto.
  if (/^(sia[\s-]*\d+|\d+)$/.test(byCode)) return `sia:${byCode.replace(/\D/g, "").padStart(4, "0")}`;
  if (byCode) return `sia:${byCode}`;
  const byName = norm(name);
  return byName ? `local:${byName}` : null;
}

const campaignKey = (id: unknown, name: unknown): string | null => campaignIdentityKey(id, name) || null;
const opaqueId = (bucket: string, path: string) => `o${sha256(`${bucket}\0${path}`).slice(0, 40)}`;

type FileLink = {
  kind: "photo" | "document";
  sourceId: string;
  parentType: "entry" | "action" | null;
  parentId: string | null;
  bucket: string | null;
  path: string | null;
  row: Row;
  updatedAt: string | null;
};

/**
 * Documento de campo só com finalidade e vínculo comprovados pelos dados:
 * - anexado a uma ação pontual (registro de campo): a finalidade é o próprio anexo;
 * - Plano de trabalho ou Mapas ligados a uma campanha ou a um ponto.
 * A categoria "Relatórios" sozinha não diz se é relatório de atividade de campo,
 * e o título nunca decide: nesses casos o documento sai como indeterminado.
 */
function documentScope(row: Row, campaignId: string | null, pointId: string | null, actionId: string | null) {
  const category = norm(row.type);
  if (LAB_CATEGORIES.has(category)) {
    return { scope: "out_of_scope", reason: "Resultado ou laudo de laboratório: fora do escopo de campo, mesmo ligado a campanha ou ponto." };
  }
  if (actionId) return { scope: "field", reason: null };
  if (FIELD_CATEGORIES.has(category)) {
    return campaignId || pointId
      ? { scope: "field", reason: null }
      : { scope: "undetermined", reason: "Documento sem vínculo comprovado com campanha ou ponto." };
  }
  return {
    scope: "undetermined",
    reason: category === "relatorios"
      ? "A categoria Relatórios não comprova que é relatório de atividade de campo, e o documento não está anexado a um registro de campo."
      : "Categoria não classificada como documento de campo.",
  };
}

/** Documento anexado a cada ação pontual: id do documento → id da ação (só quando é uma única ação). */
function actionDocuments(source: Source) {
  const byDocument = new Map<string, string | null>();
  for (const action of source.pointActions) {
    const document = action.document as Row | null | undefined;
    const id = document && typeof document === "object" ? text(document.id) : null;
    if (!id) continue;
    byDocument.set(id, byDocument.has(id) ? null : String(action.id));
  }
  return byDocument;
}

function fileLinks(source: Source, known: { campaigns: Set<string>; points: Set<string> }): FileLink[] {
  const links: FileLink[] = [];
  const seen = new Set<string>();
  const push = (link: FileLink) => {
    if (seen.has(`${link.kind}:${link.sourceId}`)) return;
    seen.add(`${link.kind}:${link.sourceId}`);
    links.push(link);
  };
  for (const entry of source.entries) {
    for (const photo of rows(entry.photos)) {
      if (!text(photo.id)) continue;
      push({
        kind: "photo", sourceId: `${entry.id}:${photo.id}`, parentType: "entry", parentId: String(entry.id),
        bucket: text(photo.bucket), path: text(photo.path), row: photo, updatedAt: text(entry.updated_at),
      });
    }
  }
  for (const action of source.pointActions) {
    for (const place of rows(action.points)) {
      for (const photo of rows(place.photos)) {
        if (!text(photo.id)) continue;
        push({
          kind: "photo", sourceId: `${action.id}:${photo.id}`, parentType: "action", parentId: String(action.id),
          bucket: text(photo.bucket), path: text(photo.path), row: photo, updatedAt: text(action.updated_at),
        });
      }
    }
  }
  const attached = actionDocuments(source);
  for (const document of source.documents) {
    const resolved = documentLinks(document, known);
    const actionId = attached.get(String(document.id)) ?? null;
    const stored = documentScope(document, resolved.campaignId, resolved.pointId, actionId).scope !== "out_of_scope";
    push({
      kind: "document", sourceId: String(document.id), parentType: actionId ? "action" : null, parentId: actionId,
      bucket: stored ? text(document.storage_bucket) : null, path: stored ? text(document.storage_path) : null,
      row: document, updatedAt: text(document.updated_at),
    });
  }
  return links;
}

function documentLinks(row: Row, known: { campaigns: Set<string>; points: Set<string> }) {
  const campaignLabel = text(row.campaign)?.trim() ?? "";
  const pointLabel = text(row.point)?.trim() ?? "";
  const campaign = campaignLabel ? campaignKey(campaignLabel, campaignLabel) : null;
  const point = pointLabel
    ? [`sia:${norm(pointLabel)}`, `local:${norm(pointLabel)}`].find((key) => known.points.has(key)) ?? null
    : null;
  return { campaignId: campaign && known.campaigns.has(campaign) ? campaign : null, pointId: point };
}

function planningRows(source: Source) {
  const out: { importId: string; importedAt: string | null; campaignId: string; index: number; row: Row }[] = [];
  for (const imported of source.campaignImports) {
    rows(imported.points).forEach((row, index) => {
      // Só linhas de ponto planejado. Linhas de documentos, eventos e resultados
      // que já viveram nesta tabela ficam de fora.
      if ("results" in row || "risk" in row || "taxa" in row || "eventName" in row || "title" in row) return;
      if (!text(row.code)?.trim() && !text(row.point)?.trim()) return;
      const campaignId = campaignKey(text(row.campaign) ?? imported.campaign_key, text(row.campaign) ?? imported.campaign_key);
      if (!campaignId) return;
      out.push({ importId: String(imported.id), importedAt: text(imported.created_at), campaignId, index, row });
    });
  }
  return out;
}

function knownIds(source: Source) {
  const campaigns = new Set<string>();
  const points = new Set<string>();
  for (const entry of source.entries) {
    const campaign = campaignKey(entry.campaign_id, entry.campaign_name);
    if (campaign) campaigns.add(campaign);
    const point = pointKey(entry.sia, entry.location_name);
    if (point) points.add(point);
  }
  for (const planned of planningRows(source)) {
    campaigns.add(planned.campaignId);
    const point = pointKey(planned.row.code, planned.row.point);
    if (point) points.add(point);
  }
  for (const key of Object.keys(source.campaignManagement ?? {})) {
    const campaign = campaignKey(key, key);
    if (campaign) campaigns.add(campaign);
  }
  return { campaigns, points };
}

/** Arquivos referenciados por fotos e documentos elegíveis, uma vez por objeto do Storage. */
export function listObjects(source: Source): ObjectRef[] {
  const stored = new Map(source.storageObjects.map((object) => [`${object.bucket}\0${object.path}`, object]));
  const objects = new Map<string, ObjectRef & { limit: number }>();
  for (const link of fileLinks(source, knownIds(source))) {
    if (!link.bucket || !link.path) continue;
    const id = opaqueId(link.bucket, link.path);
    const limit = link.kind === "photo" ? PHOTO_LIMIT_BYTES : DOCUMENT_LIMIT_BYTES;
    const previous = objects.get(id);
    if (previous) {
      previous.limit = Math.max(previous.limit, limit);
      continue;
    }
    const meta = stored.get(`${link.bucket}\0${link.path}`);
    const base = { opaqueId: id, bucket: link.bucket, path: link.path, sha256: null, limit };
    if (!EXPORTABLE_BUCKETS.has(link.bucket)) {
      objects.set(id, { ...base, version: "unsupported", size: null, mime: null, state: "unsupported", reason: "Arquivo fora das áreas de fotos e documentos da origem." });
    } else if (!meta) {
      objects.set(id, { ...base, version: "absent", size: null, mime: null, state: "missing", reason: "Arquivo não encontrado no armazenamento da origem." });
    } else {
      objects.set(id, {
        ...base, version: String(meta.version ?? "unknown"), size: number(meta.size), mime: text(meta.mime),
        state: "pending", reason: null,
      });
    }
  }
  return [...objects.values()].map(({ limit, ...object }) =>
    object.state === "pending" && (object.size === null || object.size > limit)
      ? {
          ...object,
          state: object.size === null ? "missing" as const : "too_large" as const,
          reason: object.size === null
            ? "Tamanho do arquivo desconhecido na origem."
            : `Arquivo com ${object.size} bytes, acima do limite de ${limit} bytes.`,
        }
      : object,
  );
}

const provenance = (
  sourceEntity: string, sourceFields: string[], identityStatus: Provenance["identityStatus"], derivations: Derivation[] = [],
): Provenance => ({ sourceEntity, sourceFields, identityStatus, derivations });

const unique = <T,>(values: T[]) => [...new Set(values)];

function buildPoints(source: Source): WireItem[] {
  type Acc = {
    codes: string[]; planNames: string[]; entryNames: string[]; planMunicipalities: string[];
    entryMunicipalities: string[]; waterBodies: string[]; coordinates: string[]; missingCoordinates: boolean;
  };
  const points = new Map<string, Acc>();
  const acc = (key: string) => {
    if (!points.has(key)) {
      points.set(key, { codes: [], planNames: [], entryNames: [], planMunicipalities: [], entryMunicipalities: [], waterBodies: [], coordinates: [], missingCoordinates: false });
    }
    return points.get(key)!;
  };
  const add = (target: string[], value: unknown) => {
    const cleaned = text(value)?.trim();
    if (cleaned) target.push(cleaned);
  };
  for (const planned of planningRows(source)) {
    const key = pointKey(planned.row.code, planned.row.point);
    if (!key) continue;
    const a = acc(key);
    add(a.codes, planned.row.code);
    add(a.planNames, planned.row.point);
    add(a.planMunicipalities, planned.row.municipality);
    add(a.waterBodies, planned.row.waterBody);
    const original = planned.row.original as Row | null;
    const lat = number(original?.lat), lon = number(original?.lon);
    if (lat !== null && lon !== null) a.coordinates.push(`${lat},${lon}`);
    else a.missingCoordinates = true;
  }
  for (const entry of source.entries) {
    const key = pointKey(entry.sia, entry.location_name);
    if (!key) continue;
    const a = acc(key);
    add(a.codes, entry.sia);
    add(a.entryNames, entry.location_name);
    add(a.entryMunicipalities, entry.municipality);
  }
  const distinct = (values: string[]) => {
    const byNorm = new Map<string, string>();
    for (const value of values) if (!byNorm.has(norm(value))) byNorm.set(norm(value), value);
    return [...byNorm.values()].sort((a, b) => a.localeCompare(b));
  };
  return [...points.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, a]) => {
    const derivations: Derivation[] = [{
      field: "sourceId",
      rule: key.startsWith("sia:") ? "Código SIA normalizado; a origem não tem cadastro mestre de pontos." : "Nome do local normalizado; ponto sem código SIA na origem.",
      status: "derived",
    }];
    const fromPlanning = a.planNames.length > 0;
    const names = distinct(fromPlanning ? a.planNames : a.entryNames);
    const municipalities = distinct(fromPlanning && a.planMunicipalities.length ? a.planMunicipalities : a.entryMunicipalities);
    const waterBodies = distinct(a.waterBodies);
    const coordinates = unique(a.coordinates);
    if (names.length > 1) derivations.push({ field: "name", rule: "Nomes diferentes para o mesmo código na origem; nenhum escolhido.", status: "pending" });
    if (municipalities.length > 1) derivations.push({ field: "municipality", rule: "Municípios diferentes para o mesmo ponto na origem.", status: "pending" });
    if (municipalities.length === 0) derivations.push({ field: "municipality", rule: "Município não informado na origem.", status: "missing" });
    if (waterBodies.length !== 1) derivations.push({ field: "waterBody", rule: waterBodies.length ? "Corpos hídricos diferentes entre campanhas." : "Corpo hídrico não informado na origem.", status: waterBodies.length ? "pending" : "missing" });
    const fixed = coordinates.length === 1 && !a.missingCoordinates;
    if (!fixed) {
      derivations.push({
        field: "lat/lon",
        rule: coordinates.length > 1 ? "Coordenadas planejadas variam entre campanhas; ver cada item do planejamento." : "Sem coordenada planejada única na origem.",
        status: coordinates.length > 1 ? "derived" : "missing",
      });
    }
    const [lat, lon] = fixed ? coordinates[0].split(",").map(Number) : [null, null];
    const code = key.startsWith("sia:") ? distinct(a.codes)[0] ?? null : null;
    return makeItem("point", key, {
      code, name: names.length === 1 ? names[0] : null, municipality: municipalities.length === 1 ? municipalities[0] : null,
      waterBody: waterBodies.length === 1 ? waterBodies[0] : null, lat, lon,
      coordinateSource: fixed ? "planned" : null, nameVariants: names.length > 1 ? names : null,
    }, provenance(
      fromPlanning ? "campaign_imports.points" : "field_diary_entries",
      fromPlanning ? ["code", "point", "municipality", "waterBody", "original"] : ["sia", "location_name", "municipality"],
      names.length === 1 ? (key.startsWith("sia:") ? "authoritative" : "derived") : "derived-pending", derivations,
    ), null);
  });
}

function buildCampaigns(source: Source): WireItem[] {
  const names = new Map<string, string[]>();
  const note = (key: string | null, name: unknown) => {
    if (!key) return;
    if (!names.has(key)) names.set(key, []);
    const cleaned = text(name)?.trim();
    if (cleaned) names.get(key)!.push(cleaned);
  };
  for (const entry of source.entries) note(campaignKey(entry.campaign_id, entry.campaign_name), entry.campaign_name);
  for (const planned of planningRows(source)) note(planned.campaignId, planned.row.campaign);
  const management = new Map<string, Row>();
  for (const [key, value] of Object.entries(source.campaignManagement ?? {})) {
    const id = campaignKey(key, key);
    if (!id || !value || typeof value !== "object") continue;
    note(id, null);
    management.set(id, value);
  }
  const latest = new Map<string, Row>();
  for (const imported of source.campaignImports) {
    const id = campaignKey(imported.campaign_key, imported.campaign_key);
    if (id) latest.set(id, imported);
  }
  const revisions = new Map<string, number>();
  for (const revision of source.campaignImportRevisions) {
    const id = campaignKey(revision.campaignKey, revision.campaignKey);
    if (id) revisions.set(id, (revisions.get(id) ?? 0) + 1);
  }
  return [...names.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([id, seen]) => {
    const canonical = resolveCanonicalCampaign(id);
    // Número explícito da campanha: da chave, do nome canônico ou dos nomes usados
    // nos registros, e só quando todos os que trazem número concordam.
    const numbers = unique(
      [id, canonical?.name, ...seen].map(normalizeCampaignKey).filter((key) => /^\d+$/.test(key)),
    );
    const managed = management.get(id);
    const imported = latest.get(id);
    const derivations: Derivation[] = [{ field: "sourceId", rule: "Chave de campanha do Yva'e (identidade canônica da campanha).", status: "derived" }];
    if (numbers.length !== 1) derivations.push({ field: "number", rule: "Sem número de campanha explícito e único na origem.", status: "missing" });
    if (!managed) derivations.push({ field: "status", rule: "Campanha sem registro de gestão na origem.", status: "missing" });
    if (!imported) derivations.push({ field: "planningRevisionId", rule: "Campanha sem planilha de planejamento importada na origem.", status: "missing" });
    return makeItem("campaign", id, {
      number: numbers.length === 1 ? Number(numbers[0]) : null,
      name: canonical?.name ?? unique(seen)[0] ?? id,
      status: text(managed?.status) ?? null, period: text(managed?.period) ?? null,
      plannedPointsLabel: text(managed?.plannedPoints) ?? null, note: text(managed?.note) ?? null,
      planningRevisionId: imported ? String(imported.id) : null,
      planningRevisionAt: imported ? text(imported.created_at) : null,
      planningRevisionCount: revisions.get(id) ?? 0,
    }, provenance("campaign_management + campaign_imports", ["status", "period", "plannedPoints", "note", "campaign_key", "created_at"], "authoritative", derivations), null);
  });
}

function buildPlanned(source: Source): WireItem[] {
  const used = new Map<string, number>();
  return planningRows(source).flatMap(({ importId, campaignId, index, row }) => {
    const point = pointKey(row.code, row.point);
    if (!point) return [];
    const base = `${campaignId}|${point}|${text(row.date)?.trim() || "sem-data"}`;
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    const original = row.original as Row | null, effective = row.effective as Row | null;
    return [makeItem("plannedPoint", count === 1 ? base : `${base}#${count}`, {
      campaignId, pointId: point, plannedDate: text(row.date), dayLabel: text(row.day),
      order: number(row.collectionOrder) ?? index + 1, activities: list(row.activities),
      samplesNote: text(row.samplesReplicasEdna), lat: number(original?.lat), lon: number(original?.lon),
      effectiveLat: number(effective?.lat), effectiveLon: number(effective?.lon),
      executionStatus: text(row.executionStatus), revisionId: importId,
    }, provenance("campaign_imports.points", ["code", "point", "campaign", "date", "day", "original", "effective", "activities", "samplesReplicasEdna", "executionStatus"], "derived", [
      { field: "sourceId", rule: "Campanha + ponto + data da planilha vigente; a origem não numera itens de planejamento.", status: "derived" },
      { field: "revisionId", rule: "Planilha mais recente da campanha; revisões anteriores ficam contadas na campanha.", status: "derived" },
    ]), null)];
  });
}

function buildEntries(source: Source): WireItem[] {
  return source.entries.map((row) => {
    const derivations: Derivation[] = [];
    const point = pointKey(row.sia, row.location_name);
    const campaign = campaignKey(row.campaign_id, row.campaign_name);
    if (!point) derivations.push({ field: "pointId", rule: "Registro sem código SIA nem nome de local.", status: "missing" });
    if (number(row.latitude) === null) derivations.push({ field: "lat/lon", rule: "Coordenada não informada no registro.", status: "missing" });
    derivations.push({ field: "authorName", rule: "Quem lançou o registro no Yva'e; não indica executor nem coletor.", status: "derived" });
    return makeItem("entry", String(row.id), {
      campaignId: campaign, campaignName: text(row.campaign_name), campaignDay: number(row.campaign_day), pointId: point,
      sia: text(row.sia), locationName: text(row.location_name), municipality: text(row.municipality),
      entryDate: text(row.entry_date), collectionTime: text(row.collection_time),
      collectionStartedAt: text(row.collection_started_at), executionStatus: text(row.execution_status),
      editorialStatus: text(row.status), governanceStatus: text(row.governance_status),
      lat: number(row.latitude), lon: number(row.longitude), coordinateSource: text(row.coordinate_source),
      gpsAccuracyM: number(row.gps_accuracy_m), activities: list(row.activities),
      waterVisualConditions: list(row.water_visual_conditions), weatherConditions: text(row.weather_conditions),
      pointAccessibility: text(row.point_accessibility), dailySummary: text(row.daily_summary),
      hasOccurrence: flag(row.has_occurrence), occurrenceType: text(row.occurrence_type),
      occurrenceDescription: text(row.occurrence_description), requiresFollowUp: text(row.requires_follow_up),
      followUpNotes: text(row.follow_up_notes), relocationReason: text(row.relocation_reason),
      collectionOrder: number(row.collection_order), missingInImport: flag(row.missing_in_import),
      teamName: text(row.field_team_name), teamMembers: list(row.field_team_members),
      authorName: text(row.created_by_name), samplesNote: text(row.samples_replicas_edna),
      zooplanktonId: text(row.zooplankton_id), createdAt: text(row.created_at),
    }, provenance("field_diary_entries", ["id"], "authoritative", derivations), text(row.updated_at));
  });
}

function buildFiles(source: Source, objects: ObjectRef[]): WireItem[] {
  const known = knownIds(source);
  const byId = new Map(objects.map((object) => [object.opaqueId, object]));
  return fileLinks(source, known).map((link) => {
    const object = link.bucket && link.path ? byId.get(opaqueId(link.bucket, link.path)) : undefined;
    const file = object
      ? {
          opaqueId: object.opaqueId, size: object.size, mime: object.mime, sha256: object.state === "ready" ? object.sha256 : null,
          objectState: object.state, objectReason: object.reason,
        }
      : { opaqueId: null, size: null, mime: null, sha256: null, objectState: "not_stored", objectReason: null as string | null };
    if (link.kind === "photo") {
      if (!object) file.objectReason = "Foto registrada só por endereço externo; não há arquivo no armazenamento da origem.";
      return makeItem("photo", link.sourceId, {
        parentType: link.parentType, parentId: link.parentId, caption: text(link.row.caption),
        originalName: text(link.row.fileName), width: number(link.row.width), height: number(link.row.height),
        uploadedAt: text(link.row.uploadedAt), ...file,
      }, provenance(link.parentType === "entry" ? "field_diary_entries.photos" : "point_actions.points.photos", ["id", "bucket", "path", "caption", "fileName", "width", "height", "uploadedAt"], "authoritative", [
        { field: "capturedAt", rule: "A origem não guarda a data de captura da foto, só a de envio.", status: "missing" },
      ]), link.updatedAt);
    }
    const row = link.row;
    const resolved = documentLinks(row, known);
    const actionId = link.parentType === "action" ? link.parentId : null;
    const scope = documentScope(row, resolved.campaignId, resolved.pointId, actionId);
    if (!object) {
      file.objectReason = scope.scope === "out_of_scope"
        ? "Arquivo não exportado: documento fora do escopo de campo."
        : "Documento registrado como link externo; não há arquivo no armazenamento da origem.";
    }
    return makeItem("document", link.sourceId, {
      title: text(row.title), category: text(row.type), status: text(row.status), campaignLabel: text(row.campaign),
      pointLabel: text(row.point), campaignId: resolved.campaignId, pointId: resolved.pointId, actionId,
      referenceDateLabel: text(row.date_label), sourceType: text(row.source), originalName: text(row.original_name),
      ...file, fieldScope: scope.scope, fieldScopeReason: scope.reason,
    }, provenance("app_documents", ["id", "title", "type", "status", "campaign", "point", "date_label", "source", "original_name", "storage_bucket", "storage_path"], "authoritative", [
      { field: "campaignId/pointId", rule: "Vínculo resolvido pelo rótulo de campanha e de ponto do documento, só quando o rótulo corresponde a uma única campanha ou ponto.", status: "derived" },
      { field: "actionId", rule: "Ação pontual que traz este documento como anexo (point_actions.document), só quando é uma única ação.", status: "derived" },
      { field: "fieldScope", rule: "Campo só com finalidade e vínculo comprovados; categoria Relatórios ou título, sozinhos, não bastam.", status: "derived" },
    ]), link.updatedAt);
  });
}

/** Todas as entidades do retrato, em ordem estável (pais antes dos filhos). */
export function buildItems(source: Source, objects: ObjectRef[]): WireItem[] {
  const simple = (sourceEntity: string) => provenance(sourceEntity, ["id"], "authoritative");
  const parameters = source.parameters.map((row) => makeItem("parameter", String(row.id), {
    label: text(row.label), unit: text(row.unit), min: number(row.min_value), max: number(row.max_value),
    usesDepth: flag(row.uses_depth), active: flag(row.active), appliesTo: list(row.applies_to), isBase: flag(row.is_base),
  }, simple("field_parameters"), text(row.updated_at)));
  const samples = source.samples.map((row) => makeItem("sample", String(row.id), {
    entryId: text(row.entry_id), sampleCode: text(row.sample_code), projectCode: text(row.project_code),
    sampleType: text(row.sample_type), sequence: number(row.sequence), depthM: number(row.depth_m),
    quantity: number(row.quantity), quantityUnit: text(row.quantity_unit), specification: text(row.specification),
    conservation: text(row.conservation), packaging: text(row.packaging), preservative: text(row.preservative),
    boxPosition: text(row.box_position),
  }, simple("field_diary_samples"), text(row.updated_at)));
  const readings = source.readings.map((row) => makeItem("reading", String(row.id), {
    entryId: text(row.entry_id), parameterId: text(row.parameter_id), value: number(row.value), unit: text(row.unit),
    depthM: number(row.depth_m), measuredTime: text(row.measured_time), equipment: text(row.equipment),
  }, simple("field_parameter_readings"), text(row.updated_at)));
  const actions = source.pointActions.map((row) => makeItem("action", String(row.id), {
    eventName: text(row.event_name), objectives: text(row.objectives), createdAtLabel: text(row.created_at_label),
    places: rows(row.points).map((place) =>
      [text(place.waterBody), text(place.municipality), text(place.dates)].filter((part) => part && part.trim()).join(" · ")),
  }, provenance("point_actions", ["id", "event_name", "objectives", "created_at_label", "points"], "authoritative", [
    { field: "places", rule: "Só corpo hídrico, município e datas de cada local; o campo de resultados não é exportado.", status: "derived" },
  ]), text(row.updated_at)));
  return [
    ...buildPoints(source), ...buildCampaigns(source), ...buildPlanned(source), ...parameters,
    ...buildEntries(source), ...samples, ...readings, ...actions, ...buildFiles(source, objects),
  ];
}
