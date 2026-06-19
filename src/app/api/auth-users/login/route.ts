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
  INITIAL_PASSWORD,
  initialAuthUsers,
  type AppUser,
} from "@/lib/auth-users";
import {
  AuthUserRow,
  PRIMARY_ADMIN_EMAIL,
  PRIMARY_ADMIN_ID,
  formatAccessLabel,
  getPrimaryAdminPasswordHash,
  isPrimaryAdminEmail,
  normalizePrimaryAdminRow,
  rowToUser,
} from "@/lib/auth-users-server";
import { hashPassword, verifyPassword } from "@/lib/password";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

const INVALID_CREDENTIALS = "Email ou senha incorretos.";
const LOGIN_MAX_ATTEMPTS = 10;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const INITIAL_PASSWORD_RESET_USER_IDS = new Set(["usr-adriana-de-souza-trigo"]);

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

  const matchedPrimaryAdminPassword = await verifyPrimaryAdminPassword(email, password);
  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    if (matchedPrimaryAdminPassword) {
      clearRateLimit(rateLimitKey);
      return primaryAdminLoginResponse();
    }

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
    if (matchedPrimaryAdminPassword) {
      clearRateLimit(rateLimitKey);
      return primaryAdminLoginResponse();
    }

    return NextResponse.json(
      { error: "Nao foi possivel validar o acesso.", details: errorDetails(error.message) },
      { status: 500 },
    );
  }

  const initialUser = findInitialUserByEmail(email);
  let row = data?.[0];
  let matchedStoredPassword = row ? await verifyPassword(password, row.password) : false;

  if (!row && initialUser && password === INITIAL_PASSWORD) {
    const { data: recoveredRows, error: recoveryError } = await supabase
      .from("auth_users")
      .upsert([await toRecoveredInitialRow(initialUser)], { onConflict: "id" })
      .select("*")
      .returns<AuthUserRow[]>();

    if (recoveryError) {
      return NextResponse.json(
        { error: "Nao foi possivel preparar o acesso inicial.", details: errorDetails(recoveryError.message) },
        { status: 500 },
      );
    }

    row = recoveredRows?.[0] ?? null;
    matchedStoredPassword = Boolean(row);
  } else if (
    row &&
    initialUser &&
    (row.must_change_password || INITIAL_PASSWORD_RESET_USER_IDS.has(initialUser.id)) &&
    !matchedStoredPassword &&
    password === INITIAL_PASSWORD
  ) {
    const { data: repairedRows, error: repairError } = await supabase
      .from("auth_users")
      .update({
        password: await hashPassword(INITIAL_PASSWORD),
        status: "ativo",
        must_change_password: true,
        last_access: "Primeiro acesso pendente",
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .returns<AuthUserRow[]>();

    if (repairError) {
      return NextResponse.json(
        { error: "Nao foi possivel reparar o acesso inicial.", details: errorDetails(repairError.message) },
        { status: 500 },
      );
    }

    row = repairedRows?.[0] ?? row;
    matchedStoredPassword = true;
  }

  if (!row) {
    if (matchedPrimaryAdminPassword) {
      clearRateLimit(rateLimitKey);
      return primaryAdminLoginResponse();
    }

    return NextResponse.json({ error: INVALID_CREDENTIALS }, { status: 401 });
  }

  if (!matchedStoredPassword && !matchedPrimaryAdminPassword) {
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

  clearRateLimit(rateLimitKey);

  const user = rowToUser(normalizedRow);

  return sessionResponse(
    {
      user,
      mustChangePassword: normalizedRow.must_change_password,
    },
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  );
}

function findInitialUserByEmail(email: string) {
  return initialAuthUsers.find((user) => user.email.toLowerCase() === email && user.status === "ativo") ?? null;
}

async function toRecoveredInitialRow(user: AppUser): Promise<AuthUserRow> {
  return {
    id: user.id,
    name: user.name,
    email: user.email.toLowerCase(),
    institution: user.institution,
    role: user.role,
    status: "ativo",
    password: await hashPassword(INITIAL_PASSWORD),
    must_change_password: true,
    created_at_label: user.createdAt,
    last_access: "Primeiro acesso pendente",
    updated_at: new Date().toISOString(),
  };
}

async function verifyPrimaryAdminPassword(email: string, password: string) {
  const primaryAdminHash = getPrimaryAdminPasswordHash();

  if (!primaryAdminHash || !isPrimaryAdminEmail(email)) {
    return false;
  }

  return verifyPassword(password, primaryAdminHash);
}

function primaryAdminLoginResponse() {
  const row = normalizePrimaryAdminRow({
    id: PRIMARY_ADMIN_ID,
    name: "Antonio Ostrensky",
    email: PRIMARY_ADMIN_EMAIL,
    institution: "Admin",
    role: "Admin",
    status: "ativo",
    password: "",
    must_change_password: false,
    created_at_label: "2026-05-19",
    last_access: formatAccessLabel(),
    updated_at: new Date().toISOString(),
  });
  const user = rowToUser(row);

  return sessionResponse(
    {
      user,
      mustChangePassword: false,
    },
    {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  );
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
