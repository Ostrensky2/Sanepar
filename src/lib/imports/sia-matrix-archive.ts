import { resolveMatrixCollection, type DiarySnapshot, type MatrixPackage } from "./sia-matrices";

export const MATRIX_ARCHIVE_MAX_BYTES = 4_000_000;
export type MatrixScope = [number, string, string, "16S" | "COI", string, "familias" | "generos", "matrix" | "associations"];
export type ArchiveSheet = { campaign: number; marker: "16S" | "COI"; run: string; rank: "familias" | "generos"; sheet: "matrix" | "associations"; headers: string[]; rows: Array<{ sia: string; collection: string; values: number[] }> };
export type ArchivePlan = { planDigest: string; payloadHash: string; new: number; changed: number; unchanged: number; details: Array<{ scope: MatrixScope; expectedVersion: number | null; changes: Record<string, [number | null, number]> | null }> };
export type ArchiveGroup = { scope: MatrixScope; counts: Record<string, number>; version: number };
export type ArchiveRequest = { mode: "preview" | "apply"; sheets: ArchiveSheet[]; request?: string; expected?: string };
export type ArchiveBatch = { sheets: ArchiveSheet[]; plan: ArchivePlan; request: string; state: "confirmado" | "verificar" | "não enviado"; conflict?: boolean; receipt?: Pick<ArchivePlan, "planDigest" | "payloadHash" | "new" | "changed" | "unchanged"> };
export class ArchiveRequestError extends Error { constructor(message: string, public status: number) { super(message); } }
const validDigest = (value: unknown): value is string => typeof value === "string" && /^[a-f\d]{64}$/i.test(value);
function validatePlanHashes(plan: ArchivePlan) {
  if (!validDigest(plan.planDigest) || !validDigest(plan.payloadHash)) throw new Error("Resposta sem hashes SHA-256 válidos; confirmação não presumida.");
}

/** Whole groups only, in stable scope order. Reserve space for apply credentials. */
export function partitionArchiveSheets(sheets: ArchiveSheet[]): ArchiveSheet[][] {
  if (!sheets.length || new Set(sheets.map((sheet) => sheet.campaign)).size !== 1) throw new Error("ONE_CAMPAIGN_REQUIRED");
  const seen = new Set<string>();
  for (const sheet of sheets) {
    validateArchiveRequest({ mode: "preview", sheets: [sheet] });
    for (const row of sheet.rows) {
      const key = JSON.stringify([sheet.campaign, row.sia, row.collection, sheet.marker, sheet.run, sheet.rank, sheet.sheet]);
      if (seen.has(key)) throw new Error("DUPLICATE_GROUP");
      seen.add(key);
    }
  }
  const groups = sheets.flatMap((s) => s.rows.map((row) => ({ ...s, rows: [row] }))).sort((a, b) => {
    const key = (s: ArchiveSheet) => JSON.stringify([s.campaign, s.rows[0].sia, s.rows[0].collection, s.marker, s.run, s.rank, s.sheet]);
    return key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;
  });
  const batches: ArchiveSheet[][] = []; let batch: ArchiveSheet[] = [], cells = 0;
  const fits = (items: ArchiveSheet[]) => new TextEncoder().encode(JSON.stringify({ mode: "apply", sheets: items, request: "0".repeat(36), expected: "0".repeat(64) })).byteLength <= MATRIX_ARCHIVE_MAX_BYTES;
  for (const group of groups) {
    if (group.headers.length > 16000 || !fits([group])) throw new Error("Grupo individual excede o limite; nenhuma divisão taxonômica será feita.");
    if (batch.length && (batch.length === 32 || cells + group.headers.length > 16000 || !fits([...batch, group]))) { batches.push(batch); batch = []; cells = 0; }
    batch.push(group); cells += group.headers.length;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export async function previewArchiveBatches(sheets: ArchiveSheet[], request = requestArchivePlan): Promise<ArchiveBatch[]> {
  const result: ArchiveBatch[] = [];
  for (const batch of partitionArchiveSheets(sheets)) {
    const plan = await request({ mode: "preview", sheets: batch });
    validatePlanHashes(plan);
    result.push({ sheets: batch, plan, request: crypto.randomUUID(), state: "não enviado" });
  }
  return result;
}

/** Stops at first failure. Indeterminate retries preserve the exact closed request. */
export async function applyArchiveBatches(batches: ArchiveBatch[], request = requestArchivePlan, progress?: (batches: ArchiveBatch[]) => void): Promise<ArchiveBatch[]> {
  const result = batches.map((batch) => ({ ...batch }));
  for (const batch of result) {
    if (batch.state === "confirmado") continue;
    if (batch.conflict) break;
    try {
      validatePlanHashes(batch.plan);
      const receipt = await request({ mode: "apply", sheets: batch.sheets, request: batch.request, expected: batch.plan.planDigest });
      validatePlanHashes(receipt);
      if (receipt.planDigest !== batch.plan.planDigest || receipt.payloadHash !== batch.plan.payloadHash) throw new Error("Recibo divergente; confirmação não presumida.");
      batch.receipt = { planDigest: receipt.planDigest, payloadHash: receipt.payloadHash, new: receipt.new, changed: receipt.changed, unchanged: receipt.unchanged };
      batch.state = "confirmado";
      progress?.(result.map((item) => ({ ...item })));
    } catch (error) {
      batch.state = "verificar";
      batch.conflict = error instanceof ArchiveRequestError && error.status >= 400 && error.status < 500;
      progress?.(result.map((item) => ({ ...item })));
      break;
    }
  }
  return result;
}

export function encodeArchiveRequest(request: ArchiveRequest) {
  const body = JSON.stringify(request);
  if (new TextEncoder().encode(body).byteLength > MATRIX_ARCHIVE_MAX_BYTES) throw new Error("Campanha excede 4.000.000 bytes. Selecione menos grupos para revisão; nenhuma aplicação parcial foi feita.");
  return body;
}

/** Raw bytes are bounded BEFORE JSON parsing; Content-Length is not trusted. */
export async function readArchiveRequest(request: Request): Promise<ArchiveRequest> {
  if (!request.body || !request.headers.get("content-type")?.startsWith("application/json")) throw new Error("INVALID_INPUT");
  const reader = request.body.getReader(), decoder = new TextDecoder("utf-8", { fatal: true });
  let bytes = 0, text = "";
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > MATRIX_ARCHIVE_MAX_BYTES) { await reader.cancel(); throw new Error("PAYLOAD_TOO_LARGE"); }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally { reader.releaseLock(); }
  const input = JSON.parse(text) as ArchiveRequest;
  validateArchiveRequest(input);
  return input;
}

export function validateArchiveRequest(input: ArchiveRequest) {
  if (!input || !["preview", "apply"].includes(input.mode) || !Array.isArray(input.sheets) || !input.sheets.length || input.sheets.length > 64) throw new Error("INVALID_INPUT");
  if (input.mode === "apply" && (!/^[a-f\d]{64}$/.test(input.expected ?? "") || !/^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(input.request ?? ""))) throw new Error("CONFIRMATION_REQUIRED");
  const campaigns = new Set<number>(), keys = new Set<string>();
  for (const s of input.sheets) {
    if (!Number.isInteger(s.campaign) || s.campaign < 1 || s.campaign > 9 || !["16S", "COI"].includes(s.marker) || !["familias", "generos"].includes(s.rank) || !["matrix", "associations"].includes(s.sheet) || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(s.run)) throw new Error("INVALID_SHEET");
    campaigns.add(s.campaign);
    if (!Array.isArray(s.headers) || !s.headers.length || s.headers.length > 6000 || s.headers.some((h) => typeof h !== "string" || !h.trim() || h.length > 512) || new Set(s.headers).size !== s.headers.length) throw new Error("INVALID_HEADERS");
    if (!Array.isArray(s.rows) || !s.rows.length || s.rows.length > 2000) throw new Error("INVALID_ROW");
    for (const row of s.rows) {
      if (!/^SIA-\d{4,16}$/.test(row.sia) || typeof row.collection !== "string" || !row.collection.trim() || row.collection.length > 160 || !Array.isArray(row.values) || row.values.length !== s.headers.length || row.values.some((v) => typeof v !== "number" || !Number.isSafeInteger(v) || v < 0)) throw new Error("INVALID_ROW");
      const key = JSON.stringify([s.campaign, row.sia, row.collection, s.marker, s.run, s.rank, s.sheet]);
      if (keys.has(key)) throw new Error("DUPLICATE_GROUP"); keys.add(key);
    }
  }
  if (campaigns.size !== 1) throw new Error("ONE_CAMPAIGN_REQUIRED");
}

export function prepareArchiveSheets(pkg: MatrixPackage, diary: DiarySnapshot, campaign: number, runs: Record<string, string>, excludedSias: string[] = []): ArchiveSheet[] {
  const sheets: ArchiveSheet[] = [];
  for (const source of pkg.sources.filter((s) => s.campaign === campaign)) {
    const run = runs[source.name]?.trim();
    if (!run || !/^[a-z0-9][a-z0-9._-]{0,79}$/.test(run)) throw new Error(`Informe a corrida estável de ${source.name} (letras minúsculas, números, ponto, hífen ou sublinhado).`);
    for (const sheet of ["matrix", "associations"] as const) {
      const table = source[sheet];
      const rows = table.rows.filter((row) => !excludedSias.includes(row.sia)).map((row) => {
        const resolved = resolveMatrixCollection(diary, campaign, row.sia);
        if (!resolved.entry) throw new Error(`${row.sia}: ${resolved.status}. Corrija/confirme a coleta no Diário antes de incorporar este grupo.`);
        if (row.values.some((value) => value === null)) throw new Error("Grupo parcial do acervo: reimporte a fonte original para comparar, sem converter ausência em zero.");
        return { ...row, values: row.values as number[], collection: resolved.entry.id };
      });
      if (rows.length) sheets.push({ campaign, marker: source.marker, run, rank: source.rank, sheet, headers: table.headers, rows });
    }
  }
  validateArchiveRequest({ mode: "preview", sheets });
  return sheets;
}

export function selectArchiveGroups(sheets: ArchiveSheet[], scopes: MatrixScope[]): ArchiveSheet[] {
  const selected = new Set(scopes.map((scope) => JSON.stringify(scope)));
  return sheets.map((s) => ({ ...s, rows: s.rows.filter((row) => selected.has(JSON.stringify([s.campaign, row.sia, row.collection, s.marker, s.run, s.rank, s.sheet]))) })).filter((s) => s.rows.length);
}

export async function requestArchivePlan(input: ArchiveRequest): Promise<ArchivePlan> {
  const response = await fetch("/api/imports/sia-matrices", { method: "POST", headers: { "content-type": "application/json" }, body: encodeArchiveRequest(input) });
  const value = await response.json();
  if (!response.ok) throw new ArchiveRequestError(typeof value.error === "string" ? value.error : "Acervo indisponível.", response.status);
  if (!validDigest(value.planDigest) || !validDigest(value.payloadHash) || !Array.isArray(value.details) || ![value.new, value.changed, value.unchanged].every((n) => Number.isSafeInteger(n) && n >= 0)) throw new Error("Resposta do acervo incompatível. Nenhuma confirmação presumida.");
  return value as ArchivePlan;
}

export async function readArchiveCampaign(campaign: number): Promise<ArchiveGroup[]> {
  const groups: ArchiveGroup[] = [], cursors = new Set<string>();
  let after: MatrixScope | undefined;
  let revision: string | undefined;
  do {
    const params = new URLSearchParams({ campaign: String(campaign) });
    if (after) params.set("after", JSON.stringify(after));
    if (revision) params.set("revision", revision);
    const response = await fetch(`/api/imports/sia-matrices?${params}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok || !Array.isArray(result.groups) || !/^[a-f\d]{64}$/.test(result.revision)) throw new Error(result.error || "Não foi possível ler o acervo.");
    if (revision && revision !== result.revision) throw new Error("O acervo mudou durante a paginação. Consulte novamente.");
    revision = result.revision;
    groups.push(...result.groups); after = result.next ?? undefined;
    if (groups.length > 20000 || (after && cursors.has(JSON.stringify(after)))) throw new Error("Paginação inconsistente; acervo não foi considerado completo.");
    if (after) cursors.add(JSON.stringify(after));
  } while (after);
  return groups;
}

/** Rebuild the preparatory view only; scientific publications are never touched. */
export async function archivePackage(groups: ArchiveGroup[], diary: DiarySnapshot): Promise<MatrixPackage> {
  const datasets = new Map<string, ArchiveGroup[]>();
  for (const group of groups) {
    const [campaign, sia, collection, marker, run, rank] = group.scope;
    if (resolveMatrixCollection(diary, campaign, sia).entry?.id !== collection) throw new Error(`${sia}: vínculo do acervo não corresponde à coleta única atual. Revise o Diário.`);
    const key = JSON.stringify([campaign, marker, run, rank]);
    datasets.set(key, [...(datasets.get(key) ?? []), group]);
  }
  const sources: MatrixPackage["sources"] = [];
  for (const [key, records] of datasets) {
    const [campaign, marker, run, rank] = JSON.parse(key);
    const table = (kind: "matrix" | "associations") => {
      const selected = records.filter((record) => record.scope[6] === kind);
      const headers = [...new Set(selected.flatMap((record) => Object.keys(record.counts)))].sort();
      const seen = new Set<string>();
      return { headers, rows: selected.map((record) => {
        if (seen.has(record.scope[1])) throw new Error("Acervo com mais de uma coleta para o mesmo SIA; revisão necessária.");
        seen.add(record.scope[1]);
        return { sia: record.scope[1], values: headers.map((header) => Object.hasOwn(record.counts, header) ? record.counts[header] : null) };
      }) };
    };
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(records)));
    const hash = Array.from(new Uint8Array(digest), (n) => n.toString(16).padStart(2, "0")).join("");
    sources.push({ name: `Acervo C${campaign} ${marker} ${run} ${rank}`, hash, campaign, marker, run, rank, matrix: table("matrix"), associations: table("associations") });
  }
  return { sources, notes: ["Fonte: acervo interno versionado, não publicação científica. Hash identifica o conjunto de grupos/versionamento lido. Célula vazia é táxon ausente; nunca convertido em zero."] };
}
