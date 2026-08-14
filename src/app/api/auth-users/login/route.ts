import { NextResponse } from "next/server";
import {
  applySessionCookie,
  checkRateLimit,
  clearRateLimit,
  createSessionToken,
  errorDetails,
  getClientKey,
} from "@/lib/api-auth";
import {
  AuthUserRow,
  formatAccessLabel,
  rowToUser,
} from "@/lib/auth-users-server";
import { isHashedPassword, verifyPassword } from "@/lib/password";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const INVALID_CREDENTIALS = "Email ou senha incorretos.";
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;

export async function POST(request: Request) {
  const payload = (await request.json()) as { email?: unknown; password?: unknown };
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  const password = typeof payload.password === "string" ? payload.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  const rateLimitKey = `login:${getClientKey(request)}:${email}`;

  if (!checkRateLimit(rateLimitKey, LOGIN_MAX_ATTEMPTS, LOGIN_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Muitas tentativas de acesso. Aguarde 15 minutos e tente novamente." },
      { status: 429 },
    );
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json(
      { error: "Servidor de acesso indisponivel." },
      { status: 503 },
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
      { error: "Nao foi possivel validar o acesso.", details: errorDetails(error.message) },
      { status: 500 },
    );
  }

  const row = data?.[0];

  if (!row) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  if (!isHashedPassword(row.password) || !(await verifyPassword(password, row.password))) {
    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  if (row.status !== "ativo") {
    return NextResponse.json(
      { error: "Este acesso esta inativo. Solicite reativacao a um administrador." },
      { status: 403 },
    );
  }

  if (!row.must_change_password) {
    const lastAccess = formatAccessLabel();
    await supabase
      .from("auth_users")
      .update({ last_access: lastAccess, updated_at: new Date().toISOString() })
      .eq("id", row.id);
    row.last_access = lastAccess;
  }

  clearRateLimit(rateLimitKey);

  const user = toLoginUser(row);

  return sessionResponse(
    {
      user,
      mustChangePassword: row.must_change_password,
    },
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  );
}

function toLoginUser(row: AuthUserRow) {
  const user = rowToUser(row);

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    institution: user.institution,
    role: user.role,
    status: user.status,
    mustChangePassword: row.must_change_password,
    createdAt: user.createdAt,
    lastAccess: row.last_access,
  };
}

function sessionResponse(
  body: Record<string, unknown>,
  session: { userId: string; email: string; name: string; role: ReturnType<typeof rowToUser>["role"] },
) {
  const response = NextResponse.json(body);
  const token = createSessionToken(session);

  if (token) {
    applySessionCookie(response, token);
  }

  return response;
}
