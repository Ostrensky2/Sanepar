import { NextResponse } from "next/server";
import { INITIAL_PASSWORD } from "@/lib/auth-users";
import { AuthUserRow, formatAccessLabel, rowToUser } from "@/lib/auth-users-server";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Servidor de acesso indisponivel." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as {
    email?: unknown;
    currentPassword?: unknown;
    newPassword?: unknown;
  };
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const currentPassword =
    typeof payload.currentPassword === "string" ? payload.currentPassword : "";
  const newPassword = typeof payload.newPassword === "string" ? payload.newPassword : "";

  if (newPassword.length < 6) {
    return NextResponse.json(
      { error: "A nova senha deve ter pelo menos 6 caracteres." },
      { status: 400 },
    );
  }

  if (newPassword === INITIAL_PASSWORD) {
    return NextResponse.json(
      { error: `Escolha uma senha diferente da senha provisoria ${INITIAL_PASSWORD}.` },
      { status: 400 },
    );
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

  if (!row || !(await verifyPassword(currentPassword, row.password))) {
    return NextResponse.json({ error: "Email ou senha incorretos." }, { status: 401 });
  }

  const lastAccess = formatAccessLabel();
  const { error: updateError } = await supabase
    .from("auth_users")
    .update({
      password: await hashPassword(newPassword),
      must_change_password: false,
      last_access: lastAccess,
      updated_at: new Date().toISOString(),
    })
    .eq("id", row.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Nao foi possivel salvar a senha.", details: updateError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    user: rowToUser({
      ...row,
      must_change_password: false,
      last_access: lastAccess,
    }),
  });
}
