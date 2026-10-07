import { NextResponse } from "next/server";
import { requireApiSession, requireTrustedOrigin } from "@/lib/api-auth";
import { createAuthAdminClient } from "@/lib/supabase-auth";
import {
  categoryPrivileges,
  privilegeLabels,
  sanitizePrivileges,
  userCategories,
  type PrivilegeKey,
  type UserCategory,
} from "@/lib/access-control";

export const runtime = "nodejs";

type PermissionRow = { role_name: string; permission: string };

const managedPrivileges = Object.keys(privilegeLabels) as PrivilegeKey[];

// A matriz real fica em app_role_permissions; é ela que o banco (RLS) e as APIs consultam.
export async function GET(request: Request) {
  const auth = await requireApiSession(request);
  if (!auth.ok) return auth.response;
  const admin = createAuthAdminClient();
  if (!admin) return unavailable();

  const { data, error } = await admin.from("app_role_permissions").select("role_name, permission");
  if (error) return unavailable();

  return NextResponse.json({ matrix: toMatrix((data ?? []) as PermissionRow[]) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: Request) {
  if (!requireTrustedOrigin(request)) return NextResponse.json({ error: "Origem não autorizada." }, { status: 403 });
  const auth = await requireApiSession(request, "permissions.manage");
  if (!auth.ok) return auth.response;
  if (auth.session.role !== "Admin") return NextResponse.json({ error: "Somente o Admin altera a matriz." }, { status: 403 });
  const admin = createAuthAdminClient();
  if (!admin) return unavailable();

  const body = (await request.json().catch(() => null)) as { matrix?: Partial<Record<UserCategory, unknown>> } | null;
  if (!body?.matrix || typeof body.matrix !== "object") return NextResponse.json({ error: "Matriz inválida." }, { status: 400 });

  for (const category of userCategories) {
    // Admin sempre recebe todas as funções; as demais categorias seguem o que o Admin marcou.
    const requested = category === "Admin" ? managedPrivileges : body.matrix[category];
    if (!Array.isArray(requested)) continue;

    const next = sanitizePrivileges(requested.filter((item): item is PrivilegeKey => typeof item === "string"));
    const removed = managedPrivileges.filter((privilege) => !next.includes(privilege));

    if (removed.length > 0) {
      const { error } = await admin.from("app_role_permissions").delete().eq("role_name", category).in("permission", removed);
      if (error) return unavailable();
    }

    if (next.length > 0) {
      const { error } = await admin
        .from("app_role_permissions")
        .upsert(next.map((permission) => ({ role_name: category, permission })), { onConflict: "role_name,permission", ignoreDuplicates: true });
      if (error) return unavailable();
    }
  }

  const { data, error } = await admin.from("app_role_permissions").select("role_name, permission");
  if (error) return unavailable();
  return NextResponse.json({ matrix: toMatrix((data ?? []) as PermissionRow[]) });
}

function toMatrix(rows: PermissionRow[]) {
  return userCategories.reduce(
    (matrix, category) => {
      const stored = rows
        .filter((row) => row.role_name === category)
        .map((row) => row.permission as PrivilegeKey)
        .filter((permission) => managedPrivileges.includes(permission));

      return {
        ...matrix,
        [category]: category === "Admin" ? categoryPrivileges.Admin : sanitizePrivileges(stored),
      };
    },
    {} as Record<UserCategory, PrivilegeKey[]>,
  );
}

function unavailable() {
  return NextResponse.json({ error: "Não foi possível acessar a matriz de permissões." }, { status: 503 });
}
