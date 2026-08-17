import { randomBytes, randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { requireApiSession, requireTrustedOrigin } from "@/lib/api-auth";
import { createAuthAdminClient } from "@/lib/supabase-auth";
import { normalizeUserCategory, userCategories } from "@/lib/access-control";

export const runtime = "nodejs";
type Command =
  | { action: "invite"; user?: unknown }
  | { action: "resend-invite"; userId?: unknown }
  | { action: "update"; userId?: unknown; patch?: unknown }
  | { action: "delete"; userId?: unknown };

export async function GET(request: Request) {
  const auth = await requireApiSession(request, "users.manage");
  if (!auth.ok) return auth.response;
  const admin = createAuthAdminClient(); if (!admin) return unavailable();
  const query = admin.from("auth_users").select("id,auth_user_id,name,email,institution,role,status,must_change_password,created_at_label,last_access").order("name");
  const { data, error } = auth.session.role === "Admin" ? await query : await query.eq("role", auth.session.role);
  if (error) return unavailable();
  return NextResponse.json({ users: (data ?? []).map(toManagedUser) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!requireTrustedOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireApiSession(request, "users.manage"); if (!auth.ok) return auth.response;
  const admin = createAuthAdminClient(); const appOrigin = process.env.APP_ORIGIN?.trim();
  if (!admin || !appOrigin) return unavailable();
  const command = await request.json().catch(() => null) as Command | null;
  if (!command) return invalid();

  if (command.action === "invite") {
    const user = validateUser(command.user, auth.session.role); if (!user) return invalid();
    const { data: invited, error } = await admin.auth.admin.createUser({ email: user.email, email_confirm: true,
      password: `${randomBytes(32).toString("base64url")}Aa1!`, user_metadata: { display_name: user.name } }).catch(() => ({ data: { user: null }, error: new Error("create failed") }));
    if (error || !invited.user) return NextResponse.json({ error: "Não foi possível criar o convite." }, { status: 502 });
    const now = new Date().toISOString();
    let profileError: unknown = null;
    try {
      const result = await admin.from("auth_users").insert({ id: randomUUID(), auth_user_id: invited.user.id,
        name: user.name, email: user.email, institution: user.role, role: user.role, status: user.status,
        must_change_password: true, created_at_label: now.slice(0, 10), last_access: "Convite pendente", updated_at: now });
      profileError = result.error;
    } catch { profileError = new Error("insert failed"); }
    if (profileError) { await discardInvite(admin, invited.user.id, true); return unavailable(); }
    const { error: deliveryError } = await admin.auth.resetPasswordForEmail(user.email, {
      redirectTo: `${appOrigin}/auth/callback?type=recovery&next=/definir-senha`,
    }).catch(() => ({ error: new Error("delivery failed") }));
    if (deliveryError) { await discardInvite(admin, invited.user.id, true); return NextResponse.json({ error: "Não foi possível enviar o convite." }, { status: 502 }); }
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  const userId = typeof command.userId === "string" ? command.userId : ""; if (!userId) return invalid();
  const { data: current } = await admin.from("auth_users").select("*").eq("id", userId).maybeSingle();
  if (!current || (auth.session.role !== "Admin" && current.role !== auth.session.role)) return NextResponse.json({ error: "Operação não autorizada." }, { status: 403 });

  if (command.action === "resend-invite") {
    if (!current.must_change_password || typeof current.auth_user_id !== "string" || !current.auth_user_id) return NextResponse.json({ error: "Este convite não pode ser reenviado." }, { status: 400 });
    const { error } = await admin.auth.resetPasswordForEmail(current.email, { redirectTo: `${appOrigin}/auth/callback?type=recovery&next=/definir-senha` }).catch(() => ({ error: new Error("delivery failed") }));
    return error ? NextResponse.json({ error: "Não foi possível reenviar o convite." }, { status: 502 }) : NextResponse.json({ ok: true });
  }
  if (command.action === "update") {
    const patch = validatePatch(command.patch, auth.session.role); if (!patch) return invalid();
    if (patch.email && current.auth_user_id) {
      const { error } = await admin.auth.admin.updateUserById(current.auth_user_id, { email: patch.email });
      if (error) return NextResponse.json({ error: "Não foi possível atualizar a conta." }, { status: 502 });
    }
    const { error } = await admin.from("auth_users").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", userId);
    return error ? unavailable() : NextResponse.json({ ok: true });
  }
  if (command.action === "delete") {
    if (current.id === auth.session.userId) return NextResponse.json({ error: "A conta atual não pode ser removida." }, { status: 400 });
    const { error: removeProfile } = await admin.from("auth_users").delete().eq("id", userId); if (removeProfile) return unavailable();
    const { error: removeAuth } = current.auth_user_id ? await admin.auth.admin.deleteUser(current.auth_user_id) : { error: null };
    if (removeAuth) { await admin.from("auth_users").insert(current); return unavailable(); }
    return NextResponse.json({ ok: true });
  }
  return invalid();
}

function validateUser(value: unknown, actorRole: string) {
  if (!value || typeof value !== "object") return null; const v = value as Record<string, unknown>;
  const email = typeof v.email === "string" ? v.email.trim().toLowerCase() : ""; const name = typeof v.name === "string" ? v.name.trim() : "";
  const requestedRole = normalizeUserCategory(typeof v.role === "string" ? v.role : ""); const role = actorRole === "Admin" ? requestedRole : normalizeUserCategory(actorRole);
  if (!email || email.length > 254 || !name || name.length > 160 || !userCategories.includes(role)) return null;
  return { email, name, role, status: v.status === "inativo" ? "inativo" : "ativo" } as const;
}
function validatePatch(value: unknown, actorRole: string) {
  if (!value || typeof value !== "object") return null; const v = value as Record<string, unknown>; const patch: Record<string, string> = {};
  if (typeof v.name === "string" && v.name.trim()) patch.name = v.name.trim().slice(0, 160);
  if (typeof v.email === "string" && v.email.includes("@")) patch.email = v.email.trim().toLowerCase().slice(0, 254);
  if (v.status === "ativo" || v.status === "inativo") patch.status = v.status;
  if (actorRole === "Admin" && typeof v.role === "string") { const role = normalizeUserCategory(v.role); patch.role = role; patch.institution = role; }
  return Object.keys(patch).length ? patch : null;
}
function toManagedUser(row: Record<string, unknown>) { return { id: row.id, name: row.name, email: row.email, institution: row.institution,
  role: normalizeUserCategory(String(row.role)), status: row.status, authStatus: row.status === "inativo" ? "bloqueado" : row.must_change_password ? "convidado" : "ativo",
  createdAt: row.created_at_label, lastAccess: row.last_access }; }
function invalid() { return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 }); }
function unavailable() { return NextResponse.json({ error: "Serviço de usuários indisponível." }, { status: 503 }); }

async function discardInvite(admin: NonNullable<ReturnType<typeof createAuthAdminClient>>, authUserId: string, removeProfile: boolean) {
  if (removeProfile) {
    try { await admin.from("auth_users").delete().eq("auth_user_id", authUserId); } catch { /* confirmar abaixo */ }
    try {
      const { data, error } = await admin.from("auth_users").select("id").eq("auth_user_id", authUserId).maybeSingle();
      if (error || data) { console.error("auth invite cleanup failed"); return; }
    } catch { console.error("auth invite cleanup failed"); return; }
  }
  try { const { error } = await admin.auth.admin.deleteUser(authUserId); if (error) console.error("auth invite cleanup failed"); }
  catch { console.error("auth invite cleanup failed"); }
}
