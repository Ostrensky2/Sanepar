import { NextResponse } from "next/server";
import {
  AuthUserRow,
  PRIMARY_ADMIN_PASSWORD_HASH,
  formatAccessLabel,
  isPrimaryAdminEmail,
  normalizePrimaryAdminRow,
  rowToUser,
} from "@/lib/auth-users-server";
import { verifyPassword } from "@/lib/password";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const INVALID_CREDENTIALS = "Email ou senha incorretos.";

export async function POST(request: Request) {
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Servidor de acesso indisponivel." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as { email?: unknown; password?: unknown };
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("auth_users")
    .select("*")
    .eq("email", email)
    .limit(1)
    .returns<AuthUserRow[]>();

  if (error) {
    return NextResponse.json(
      { error: "Nao foi possivel validar o acesso.", details: error.message },
      { status: 500 },
    );
  }

  const row = data?.[0];
  const isPrimaryAdmin = isPrimaryAdminEmail(email);
  const matchedStoredPassword = row ? await verifyPassword(password, row.password) : false;
  const matchedPrimaryAdminPassword =
    isPrimaryAdmin && (await verifyPassword(password, PRIMARY_ADMIN_PASSWORD_HASH));

  if (!row || (!matchedStoredPassword && !matchedPrimaryAdminPassword)) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  const normalizedRow = normalizePrimaryAdminRow(row);

  if (normalizedRow.status !== "ativo") {
    return NextResponse.json(
      { error: "Este acesso esta inativo. Solicite reativacao a um administrador." },
      { status: 403 },
    );
  }

  if (!normalizedRow.must_change_password && !matchedPrimaryAdminPassword) {
    const lastAccess = formatAccessLabel();
    await supabase
      .from("auth_users")
      .update({ last_access: lastAccess, updated_at: new Date().toISOString() })
      .eq("id", normalizedRow.id);
    normalizedRow.last_access = lastAccess;
  } else if (matchedPrimaryAdminPassword) {
    normalizedRow.last_access = formatAccessLabel();
  }

  return NextResponse.json({
    user: rowToUser(normalizedRow),
    mustChangePassword: normalizedRow.must_change_password,
  });
}
