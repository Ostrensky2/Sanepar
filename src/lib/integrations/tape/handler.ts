import "server-only";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { checkRateLimit, requireApiSession } from "@/lib/api-auth";
import { createAuthAdminClient } from "@/lib/supabase-auth";
import { digest, sha256 } from "./canonical";
import { buildItems, listObjects, type ObjectRef, type Source } from "./export";
import { SCHEMA_VERSION, totalsOf, type Envelope } from "./protocol";

/**
 * API da conexão Yva'e → Tape (servidor a servidor, somente leitura).
 *
 * - O navegador só participa do consentimento, com a sessão normal do Yva'e.
 * - O servidor do Tape se identifica como cliente registrado (Basic) e usa
 *   tokens de 5 minutos; cada chamada revalida token, concessão, cliente e a
 *   permissão atual de quem autorizou.
 * - A API fica desligada enquanto TAPE_INTEGRATION_ENABLED não for "true".
 */

const PREFIX = "/api/integrations/tape";
// Itens por página; ajustável para ensaio (TAPE_INTEGRATION_PAGE_SIZE), entre 1 e 500.
const PAGE_SIZE = Math.min(500, Math.max(1, Number(process.env.TAPE_INTEGRATION_PAGE_SIZE) || 200));
const PREPARE_BUDGET_MS = 8000;
const HEADERS = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

class ApiError extends Error {
  constructor(readonly code: string, readonly status: number) {
    super(code);
  }
}
const fail = (code: string, status: number): never => {
  throw new ApiError(code, status);
};

type Config = { origin: string; secret: string; db: SupabaseClient };
type Access = { grantId: string; clientId: string; actorId: string; binding: Record<string, string> };

function configuration(): Config {
  const origin = process.env.APP_ORIGIN?.trim();
  const secret = process.env.TAPE_INTEGRATION_SECRET?.trim();
  if (process.env.TAPE_INTEGRATION_ENABLED !== "true" || !origin || !secret || secret.length < 32) {
    return fail("integration_disabled", 403);
  }
  const url = new URL(origin);
  const loopback = url.protocol === "http:" && url.hostname === "127.0.0.1" && process.env.TAPE_INTEGRATION_ALLOW_LOOPBACK === "true";
  if (url.protocol !== "https:" && !loopback) return fail("integration_disabled", 403);
  const db = createAuthAdminClient();
  if (!db) return fail("authorization_unavailable", 503);
  return { origin: url.origin, secret, db };
}

const json = (value: unknown, status = 200) => Response.json(value, { status, headers: HEADERS });
const token = () => randomBytes(32).toString("base64url");
const equal = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};
const sign = (secret: string, ...parts: string[]) => createHmac("sha256", secret).update(parts.join("\0")).digest("hex");

async function rpc<T>(db: SupabaseClient, name: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await db.rpc(name, args);
  if (error) return fail("store_unavailable", 503);
  return data as T;
}
const audit = (db: SupabaseClient, event: string, access: Partial<Access>, detail: Record<string, unknown> = {}) =>
  rpc<void>(db, "tape_audit_add", {
    p_event: event, p_client_id: access.clientId ?? null, p_grant_id: access.grantId ?? null,
    p_actor_id: access.actorId ?? null, p_detail: detail,
  }).catch(() => undefined);

function only(body: Record<string, unknown>, keys: string[]) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some((key) => !keys.includes(key))) {
    fail("invalid_request", 400);
  }
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  const raw = await req.text();
  if (raw.length > 16384) fail("invalid_request", 400);
  try {
    return raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
  } catch {
    return fail("invalid_request", 400);
  }
}

/** Quem autorizou continua ativo e com as permissões de ver e de delegar? */
async function requireActor(db: SupabaseClient, authUserId: string) {
  const { data: profile, error } = await db.from("auth_users")
    .select("auth_user_id, name, role, status, must_change_password").eq("auth_user_id", authUserId).maybeSingle();
  if (error) fail("authorization_unavailable", 503);
  if (!profile || profile.status !== "ativo" || profile.must_change_password) fail("forbidden", 403);
  const { data: permissions, error: permissionError } = await db.from("app_role_permissions")
    .select("permission").eq("role_name", profile!.role).in("permission", ["data.view", "integrations.delegate"]);
  if (permissionError) fail("authorization_unavailable", 503);
  if ((permissions ?? []).length !== 2) fail("forbidden", 403);
  return { id: authUserId, name: String(profile!.name ?? "") };
}

async function sessionActor(db: SupabaseClient, req: Request) {
  const result = await requireApiSession(req, "data.view");
  if (!result.ok) return { response: result.response as Response };
  if (result.session.localDirect) fail("forbidden", 403);
  return { actor: await requireActor(db, result.session.authUserId) };
}

async function requireClient(db: SupabaseClient, req: Request) {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Basic ")) fail("client_required", 401);
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const separator = decoded.indexOf(":");
  if (separator < 1) fail("client_required", 401);
  const clientId = decoded.slice(0, separator), secret = decoded.slice(separator + 1);
  const client = await rpc<{ clientId: string; secretSha256: string; active: boolean } | null>(db, "tape_client_read", { p_client_id: clientId });
  if (!client || !equal(sha256(secret), client.secretSha256)) fail("client_required", 401);
  if (!client!.active) fail("client_not_registered", 403);
  return clientId;
}

async function requireAccess(db: SupabaseClient, req: Request): Promise<Access> {
  const header = req.headers.get("authorization") ?? "";
  if (!header.startsWith("Bearer ")) fail("invalid_token", 401);
  const access = await rpc<Access & { error?: string }>(db, "tape_access", { p_access_sha256: sha256(header.slice(7)) });
  if (!access || access.error) fail(access?.error ?? "invalid_token", access?.error === "forbidden" ? 403 : 401);
  try {
    await requireActor(db, access.actorId);
  } catch (error) {
    await audit(db, "access_denied", access, { reason: "actor" });
    throw error;
  }
  return access;
}

function envelopeBase(config: Config, access: Access, snapshotId: string, asOf: string, source: Source): Omit<Envelope, "totals"> {
  return {
    schemaVersion: SCHEMA_VERSION, issuer: config.origin, scopeId: access.binding.scopeId,
    sourceProjectId: access.binding.sourceProjectId, destinationProjectId: access.binding.destinationProjectId,
    destinationContractId: access.binding.destinationContractId, snapshotId, asOf,
    highWatermark: `sha256:${digest(source as unknown as Record<string, unknown>)}`,
  };
}

type SnapshotRow = {
  snapshotId: string; state: "preparing" | "ready"; expiresAt: string; createdAt: string; expired: boolean;
  itemCount: number; source: Source | null; objects: ObjectRef[] | null; objectsTotal: number; objectsPending: number;
};

async function readSnapshot(db: SupabaseClient, access: Access, id: string, withSource: boolean) {
  const snapshot = await rpc<SnapshotRow | null>(db, "tape_snapshot_read", { p_id: id, p_grant_id: access.grantId, p_with_source: withSource });
  if (!snapshot) fail("snapshot_scope", 403);
  if (snapshot!.expired) fail("snapshot_expired", 410);
  return snapshot!;
}

const snapshotStatus = (snapshot: SnapshotRow) => ({
  snapshotId: snapshot.snapshotId, state: snapshot.state, expiresAt: snapshot.expiresAt,
  objects: { total: Number(snapshot.objectsTotal), pending: Number(snapshot.objectsPending) },
});

/** SHA-256 do arquivo lido em pedaços: o conteúdo não é copiado de novo para a memória. */
async function blobSha256(blob: Blob) {
  const hash = createHash("sha256");
  const reader = blob.stream().getReader();
  for (let part = await reader.read(); !part.done; part = await reader.read()) hash.update(part.value);
  return hash.digest("hex");
}

/** Calcula o hash dos arquivos ainda pendentes (dentro de um tempo curto) e, ao terminar, congela os itens. */
async function prepareSnapshot(config: Config, access: Access, id: string) {
  const { db } = config;
  let snapshot = await readSnapshot(db, access, id, true);
  if (snapshot.state === "ready") return snapshotStatus(snapshot);
  const source = snapshot.source!;
  await rpc<void>(db, "tape_snapshot_objects_init", {
    p_id: id, p_grant_id: access.grantId,
    p_objects: listObjects(source).map((object) => ({
      opaque_id: object.opaqueId, bucket: object.bucket, path: object.path, version: object.version,
      size: object.size, mime: object.mime, state: object.state, reason: object.reason,
    })),
  });
  const started = Date.now();
  while (Date.now() - started < PREPARE_BUDGET_MS) {
    const pending = await rpc<{ opaqueId: string; bucket: string; path: string; size: number }[]>(db, "tape_snapshot_objects_pending", { p_id: id, p_grant_id: access.grantId, p_limit: 4 });
    if (!pending.length) break;
    for (const object of pending) {
      const done = (state: string, hash: string | null, reason: string | null) => rpc<void>(db, "tape_snapshot_object_done", {
        p_id: id, p_grant_id: access.grantId, p_opaque_id: object.opaqueId, p_state: state, p_sha256: hash, p_reason: reason,
      });
      const { data, error } = await db.storage.from(object.bucket).download(object.path);
      if (error || !data) {
        await done("missing", null, "Arquivo não pôde ser lido no armazenamento da origem.");
        continue;
      }
      if (data.size !== Number(object.size)) await done("changed", null, "Tamanho lido difere do registrado; arquivo alterado durante a leitura.");
      else await done("ready", await blobSha256(data), null);
      if (Date.now() - started >= PREPARE_BUDGET_MS) break;
    }
  }
  snapshot = await readSnapshot(db, access, id, true);
  if (Number(snapshot.objectsPending) > 0) return snapshotStatus(snapshot);
  const items = buildItems(source, snapshot.objects ?? []);
  const envelope: Envelope = { ...envelopeBase(config, access, id, snapshot.createdAt, source), totals: totalsOf(items) };
  const finalized = await rpc<{ error?: string }>(db, "tape_snapshot_finalize", { p_id: id, p_grant_id: access.grantId, p_envelope: envelope, p_items: items });
  if (finalized?.error) fail(finalized.error, 409);
  await audit(db, "snapshot_ready", access, { snapshotId: id, totals: envelope.totals });
  return snapshotStatus(await readSnapshot(db, access, id, false));
}

async function handle(req: Request): Promise<Response> {
  const config = configuration();
  const { db, origin, secret } = config;
  const url = new URL(req.url);
  const route = url.pathname.slice(PREFIX.length);
  const method = req.method;

  // --- Navegador, com a sessão normal do Yva'e --------------------------------
  if (route === "/consent-info" && method === "GET") {
    const session = await sessionActor(db, req);
    if (session.response) return session.response;
    const requestId = url.searchParams.get("requestId") ?? "";
    const request = await rpc<{ clientId: string; expiresAt: string } | null>(db, "tape_request_read", { p_id_sha256: sha256(requestId) });
    if (!request) fail("invalid_request", 400);
    const source = await rpc<Source>(db, "tape_field_export", {});
    const totals = totalsOf(buildItems(source, listObjects(source)));
    return json({
      requestId, csrf: sign(secret, "consent", session.actor.id, requestId), destination: "Tape",
      scope: "field:read", expiresAt: request!.expiresAt, userName: session.actor.name, summary: totals.rowsByEntityType,
    });
  }
  if (route === "/consents" && method === "POST") {
    const session = await sessionActor(db, req);
    if (session.response) return session.response;
    const body = await readBody(req);
    only(body, ["requestId", "csrf", "decision"]);
    const requestId = String(body.requestId ?? "");
    if (!equal(String(body.csrf ?? ""), sign(secret, "consent", session.actor.id, requestId))) fail("forbidden", 403);
    if (body.decision !== "approve" && body.decision !== "deny") fail("invalid_request", 400);
    const code = token();
    const result = await rpc<{ error?: string; callback: string; state: string; approved: boolean }>(db, "tape_consent", {
      p_id_sha256: sha256(requestId), p_actor_id: session.actor.id, p_approve: body.decision === "approve", p_code_sha256: sha256(code),
    });
    if (result.error) fail(result.error, result.error === "invalid_request" ? 400 : 403);
    const params: Record<string, string> = result.approved ? { code, state: result.state } : { error: "access_denied", state: result.state };
    return json({ redirectTo: `${result.callback}?${new URLSearchParams(params)}` });
  }
  if (route === "/grants" && method === "GET") {
    const session = await sessionActor(db, req);
    if (session.response) return session.response;
    const grants = await rpc<{ grantId: string }[]>(db, "tape_grants_for_actor", { p_actor_id: session.actor.id });
    return json({ grants: grants.map((grant) => ({ ...grant, csrf: sign(secret, "revoke", session.actor.id, grant.grantId) })) });
  }
  const userRevoke = /^\/grants\/([A-Za-z0-9_-]{20,64})$/.exec(route);
  if (userRevoke && method === "DELETE") {
    const session = await sessionActor(db, req);
    if (session.response) return session.response;
    if (!equal(req.headers.get("x-csrf-token") ?? "", sign(secret, "revoke", session.actor.id, userRevoke[1]))) fail("forbidden", 403);
    const revoked = await rpc<boolean>(db, "tape_revoke", { p_grant_id: userRevoke[1], p_client_id: null, p_actor_id: session.actor.id, p_reason: "user" });
    if (!revoked) fail("forbidden", 403);
    return new Response(null, { status: 204, headers: HEADERS });
  }

  // --- Servidor do Tape, como cliente registrado ------------------------------
  if (route === "/requests" && method === "POST") {
    const clientId = await requireClient(db, req);
    const limit = await checkRateLimit("tape-requests", req, clientId, 60, 60);
    if (limit.unavailable) fail("authorization_unavailable", 503);
    if (!limit.allowed) fail("rate_limited", 429);
    const body = await readBody(req);
    only(body, ["clientId", "callback", "state", "codeChallenge", "codeChallengeMethod", "scope"]);
    if (body.clientId !== clientId || body.scope !== "field:read" || body.codeChallengeMethod !== "S256"
      || typeof body.callback !== "string" || !/^[A-Za-z0-9_-]{22,128}$/.test(String(body.state))
      || !/^[A-Za-z0-9_-]{43}$/.test(String(body.codeChallenge))) fail("invalid_request", 400);
    const requestId = token();
    const created = await rpc<{ error?: string }>(db, "tape_request_create", {
      p_id_sha256: sha256(requestId), p_client_id: clientId, p_callback: body.callback, p_state: body.state, p_challenge: body.codeChallenge,
    });
    if (created.error) fail(created.error, 403);
    return json({ requestId, authorizeUrl: `${origin}/integrations/tape/consent?requestId=${requestId}` }, 201);
  }
  if (route === "/token" && method === "POST") {
    const clientId = await requireClient(db, req);
    const limit = await checkRateLimit("tape-token", req, clientId, 240, 60);
    if (limit.unavailable) fail("authorization_unavailable", 503);
    if (!limit.allowed) fail("rate_limited", 429);
    const body = await readBody(req);
    only(body, ["grant_type", "clientId", "callback", "code", "codeVerifier", "refreshToken", "grantId"]);
    if (body.clientId !== clientId) fail("client_required", 401);
    const accessToken = token(), refreshToken = token();
    let pair: { error?: string; grantId: string; actorId: string; scopeId: string; expiresIn: number; grantExpiresAt: string };
    if (body.grant_type === "authorization_code") {
      const verifier = String(body.codeVerifier ?? "");
      if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) fail("invalid_grant", 400);
      const codeHash = sha256(String(body.code ?? ""));
      const actorId = await rpc<string | null>(db, "tape_code_actor", { p_code_sha256: codeHash });
      if (!actorId) fail("invalid_grant", 400);
      await requireActor(db, actorId!);
      pair = await rpc(db, "tape_exchange_code", {
        p_code_sha256: codeHash, p_client_id: clientId, p_callback: String(body.callback ?? ""),
        p_challenge: pkceChallenge(verifier), p_grant_id: token(), p_access_sha256: sha256(accessToken), p_refresh_sha256: sha256(refreshToken),
      });
    } else if (body.grant_type === "refresh_token") {
      const grant = await rpc<{ actorId: string } | null>(db, "tape_grant_read", { p_grant_id: String(body.grantId ?? ""), p_client_id: clientId });
      if (!grant) fail("invalid_grant", 400);
      await requireActor(db, grant!.actorId);
      pair = await rpc(db, "tape_refresh", {
        p_refresh_sha256: sha256(String(body.refreshToken ?? "")), p_client_id: clientId, p_grant_id: String(body.grantId),
        p_access_sha256: sha256(accessToken), p_new_refresh_sha256: sha256(refreshToken),
      });
    } else {
      return fail("unsupported_grant_type", 400);
    }
    if (pair.error) fail(pair.error, pair.error === "forbidden" || pair.error === "client_not_registered" ? 403 : 400);
    return json({
      accessToken, refreshToken, tokenType: "Bearer", expiresIn: pair.expiresIn, grantId: pair.grantId, issuer: origin,
      scopeId: pair.scopeId, audience: "tape", scope: "field:read", grantExpiresAt: pair.grantExpiresAt,
    });
  }
  const clientRevoke = /^\/grants\/([A-Za-z0-9_-]{20,64})\/revoke$/.exec(route);
  if (clientRevoke && method === "POST") {
    // Funciona mesmo depois de quem autorizou perder o acesso.
    const clientId = await requireClient(db, req);
    const revoked = await rpc<boolean>(db, "tape_revoke", { p_grant_id: clientRevoke[1], p_client_id: clientId, p_actor_id: null, p_reason: "client" });
    if (!revoked) fail("forbidden", 403);
    return new Response(null, { status: 204, headers: HEADERS });
  }

  // --- Leitura do retrato, com token de acesso --------------------------------
  const access = await requireAccess(db, req);
  if (route === "/snapshots" && method === "POST") {
    const key = req.headers.get("idempotency-key") ?? "";
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) fail("invalid_idempotency_key", 400);
    const created = await rpc<{ error?: string; snapshotId: string; replayed: boolean }>(db, "tape_snapshot_create", {
      p_id: token(), p_grant_id: access.grantId, p_idempotency_key: key,
    });
    if (created.error) fail(created.error, created.error === "snapshot_expired" ? 410 : 403);
    return json(await prepareSnapshot(config, access, created.snapshotId), created.replayed ? 200 : 201);
  }
  const prepare = /^\/snapshots\/([A-Za-z0-9_-]{20,64})\/prepare$/.exec(route);
  if (prepare && method === "POST") return json(await prepareSnapshot(config, access, prepare[1]));

  const items = /^\/snapshots\/([A-Za-z0-9_-]{20,64})\/items$/.exec(route);
  if (items && method === "GET") {
    const cursor = url.searchParams.get("cursor");
    let offset = 0;
    if (cursor) {
      const [position, signature] = cursor.split(".");
      if (!/^\d{1,9}$/.test(position ?? "") || !equal(signature ?? "", sign(secret, "cursor", items[1], access.grantId, position))) fail("invalid_cursor", 400);
      offset = Number(position);
    }
    const page = await rpc<{ envelope: Envelope | null; total: number; state: string; expired: boolean; items: unknown[] } | null>(db, "tape_snapshot_page", {
      p_id: items[1], p_grant_id: access.grantId, p_offset: offset, p_limit: PAGE_SIZE,
    });
    if (!page) fail("snapshot_scope", 403);
    if (page!.expired) fail("snapshot_expired", 410);
    if (page!.state !== "ready" || !page!.envelope) fail("snapshot_preparing", 409);
    const next = offset + PAGE_SIZE;
    const complete = next >= page!.total;
    return json({
      ...page!.envelope, items: page!.items, complete,
      nextCursor: complete ? null : `${next}.${sign(secret, "cursor", items[1], access.grantId, String(next))}`,
    });
  }
  const file = /^\/snapshots\/([A-Za-z0-9_-]{20,64})\/objects\/(o[a-f0-9]{40})$/.exec(route);
  if (file && method === "GET") {
    const object = await rpc<(ObjectRef & { snapshotState: string; expired: boolean }) | null>(db, "tape_snapshot_object", {
      p_id: file[1], p_grant_id: access.grantId, p_opaque_id: file[2],
    });
    if (!object) fail("object_scope", 403);
    if (object!.expired) fail("snapshot_expired", 410);
    if (object!.snapshotState !== "ready" || object!.state !== "ready" || !object!.sha256) fail("object_pending", 409);
    const { data, error } = await db.storage.from(object!.bucket).download(object!.path);
    if (error || !data) fail("object_unavailable", 409);
    // O arquivo entregue é o do retrato: mesmo tamanho e mesmo hash, ou nada.
    if (data!.size !== Number(object!.size) || (await blobSha256(data!)) !== object!.sha256) {
      await audit(db, "object_changed", access, { snapshotId: file[1], opaqueId: file[2] });
      fail("object_changed", 409);
    }
    // O mesmo conteúdo conferido segue na resposta, sem outra cópia.
    return new Response(data!, {
      status: 200,
      headers: {
        ...HEADERS, "Content-Type": object!.mime || "application/octet-stream", "Content-Length": String(data!.size),
        "X-Content-SHA256": object!.sha256!,
      },
    });
  }
  return json({ schemaVersion: SCHEMA_VERSION, code: "not_found", retryable: false }, 404);
}

/** Desafio PKCE (S256) calculado a partir do verificador enviado na troca. */
function pkceChallenge(verifier: string) {
  return Buffer.from(sha256(verifier), "hex").toString("base64url");
}

export async function tapeHandler(req: Request): Promise<Response> {
  try {
    return await handle(req);
  } catch (error) {
    if (error instanceof ApiError) {
      return json({ schemaVersion: SCHEMA_VERSION, code: error.code, retryable: error.status === 503 || error.status === 429 }, error.status);
    }
    console.error("[tape-integration]", error instanceof Error ? error.message : "erro desconhecido");
    return json({ schemaVersion: SCHEMA_VERSION, code: "internal_error", retryable: false }, 500);
  }
}
