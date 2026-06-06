import { NextResponse } from "next/server";
import { INITIAL_PASSWORD } from "@/lib/auth-users";
import { createOptionalSupabaseClient } from "@/lib/supabase";
import { hashPassword } from "@/lib/password";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Servidor de acesso indisponivel." },
      { status: 503 },
    );
  }

  const payload = (await request.json()) as { userId?: unknown };
  const userId = typeof payload.userId === "string" ? payload.userId : "";

  if (!userId) {
    return NextResponse.json({ error: "Usuario invalido." }, { status: 400 });
  }

  const { error } = await supabase
    .from("auth_users")
    .update({
      password: await hashPassword(INITIAL_PASSWORD),
      must_change_password: true,
      last_access: "Primeiro acesso pendente",
      updated_at: new Date().toISOString(),
    })
    .eq("id", userId);

  if (error) {
    return NextResponse.json(
      { error: "Nao foi possivel redefinir a senha.", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
