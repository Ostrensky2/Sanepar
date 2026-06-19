import { NextResponse } from "next/server";
import { errorDetails, requireApiSession, type ApiSession } from "@/lib/api-auth";
import {
  INITIAL_PASSWORD,
  initialAuthUsers,
  normalizeAuthUsers,
  type AppUser,
} from "@/lib/auth-users";
import { isPrimaryAdminRow, normalizePrimaryAdminRow } from "@/lib/auth-users-server";
import { hashPassword, isHashedPassword } from "@/lib/password";
import { createOptionalSupabaseClient } from "@/lib/supabase";

export const runtime = "nodejs";

type AuthUserRow = {
  id: string;
  name: string;
  email: string;
  institution: string;
  role: AppUser["role"];
  status: AppUser["status"];
  password: string;
  must_change_password: boolean;
  created_at_label: string;
  last_access: string;
  updated_at: string;
};

export async function GET(request: Request) {
  const auth = requireApiSession(request);

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();

  if (!supabase) {
    return NextResponse.json({ users: [], persistence: "browser" });
  }

  const { data, error } = await supabase
    .from("auth_users")
    .select("*")
    .order("name", { ascending: true })
    .returns<AuthUserRow[]>();

  if (error) {
    return NextResponse.json(
      { error: "Nao foi possivel consultar usuarios autorizados.", details: errorDetails(error.message) },
      { status: 500 },
    );
  }

  if (!data?.length) {
    if (process.env.AUTH_USERS_ALLOW_SEED !== "true") {
      return NextResponse.json({ users: [], persistence: "cloud" });
    }

    const seededRows = await Promise.all(
      initialAuthUsers.map(async (user) => ({
        ...toRow(user),
        password: await hashPassword(user.password),
      })),
    );
    const { error: seedError } = await supabase
      .from("auth_users")
      .upsert(seededRows, { onConflict: "id" });

    if (seedError) {
      return NextResponse.json(
        { error: "Nao foi possivel preparar usuarios autorizados na nuvem.", details: errorDetails(seedError.message) },
        { status: 500 },
      );
    }

    return NextResponse.json({
      users: stripPasswords(scopeVisibleUsersForSession(initialAuthUsers, auth.session)),
      persistence: "cloud",
    });
  }

  const legacyRows = data.filter((row) => !isHashedPassword(row.password));

  if (legacyRows.length) {
    const migratedRows = await Promise.all(
      legacyRows.map(async (row) => ({
        ...row,
        password: await hashPassword(row.password),
        updated_at: new Date().toISOString(),
      })),
    );
    const { error: migrationError } = await supabase
      .from("auth_users")
      .upsert(migratedRows, { onConflict: "id" });

    if (migrationError) {
      return NextResponse.json(
        { error: "Nao foi possivel proteger as senhas existentes.", details: errorDetails(migrationError.message) },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({
    users: stripPasswords(scopeVisibleUsersForSession(normalizeAuthUsers(data.map(fromRow)), auth.session)),
    persistence: "cloud",
  });
}

export async function PUT(request: Request) {
  const auth = requireApiSession(request, "users.manage");

  if (!auth.ok) {
    return auth.response;
  }

  const supabase = createOptionalSupabaseClient();
  const payload = (await request.json()) as { users?: unknown };
  const users = normalizeAuthUsers(payload.users);

  if (!Array.isArray(payload.users) || !users.length) {
    return NextResponse.json(
      { error: "A lista de usuarios autorizados e invalida." },
      { status: 400 },
    );
  }

  if (!supabase) {
    return NextResponse.json({ users: stripPasswords(users), persistence: "browser" });
  }

  const { data: existingRows, error: readError } = await supabase
    .from("auth_users")
    .select("*")
    .returns<AuthUserRow[]>();

  if (readError) {
    return NextResponse.json(
      { error: "Nao foi possivel verificar usuarios atuais.", details: errorDetails(readError.message) },
      { status: 500 },
    );
  }

  const existingById = new Map((existingRows ?? []).map((row) => [row.id, row]));
  const scopedUsers = scopeUsersForSession(users, existingRows ?? [], auth.session);
  const initialPasswordHash = await hashPassword(INITIAL_PASSWORD);

  const rows = scopedUsers.map((user) => {
    const existing = existingById.get(user.id);
    const baseRow = toRow(user);

    if (existing) {
      return {
        ...baseRow,
        password: existing.password,
        must_change_password: existing.must_change_password,
      };
    }

    return {
      ...baseRow,
      password: initialPasswordHash,
      must_change_password: true,
    };
  });

  const { error } = await supabase
    .from("auth_users")
    .upsert(rows, { onConflict: "id" });

  if (error) {
    return NextResponse.json(
      { error: "Nao foi possivel salvar usuarios autorizados na nuvem.", details: errorDetails(error.message) },
      { status: 500 },
    );
  }

  const nextIds = new Set(scopedUsers.map((user) => user.id));
  const deletedIds = (existingRows ?? [])
    .filter((row) => !nextIds.has(row.id) && !isPrimaryAdminRow(row))
    .map((row) => row.id);

  if (deletedIds.length) {
    const { error: deleteError } = await supabase
      .from("auth_users")
      .delete()
      .in("id", deletedIds);

    if (deleteError) {
      return NextResponse.json(
        { error: "Nao foi possivel remover usuarios autorizados na nuvem.", details: errorDetails(deleteError.message) },
        { status: 500 },
      );
    }
  }

  return NextResponse.json({ users: stripPasswords(scopedUsers), persistence: "cloud" });
}

function scopeUsersForSession(
  submittedUsers: AppUser[],
  existingRows: AuthUserRow[],
  session: ApiSession | null,
) {
  if (!session || session.role === "Admin") {
    return submittedUsers;
  }

  if (session.role !== "Sanepar" && session.role !== "ATGC") {
    return normalizeAuthUsers(existingRows.map(fromRow));
  }

  const existingUsers = normalizeAuthUsers(existingRows.map(fromRow));
  const existingIds = new Set(existingUsers.map((user) => user.id));
  const newScopedUsers = submittedUsers
    .filter((user) => !existingIds.has(user.id) && user.role === session.role)
    .map((user) => ({
      ...user,
      role: session.role,
      institution: session.role,
    }));

  return [...newScopedUsers, ...existingUsers];
}

function scopeVisibleUsersForSession(users: AppUser[], session: ApiSession | null) {
  if (!session || session.role === "Admin") {
    return users;
  }

  if (session.role !== "Sanepar" && session.role !== "ATGC") {
    return [];
  }

  return users.filter((user) => user.role === session.role);
}

function stripPasswords(users: AppUser[]): AppUser[] {
  return users.map((user) => ({ ...user, password: "" }));
}

function fromRow(row: AuthUserRow): AppUser {
  const normalizedRow = normalizePrimaryAdminRow(row);

  return {
    id: normalizedRow.id,
    name: normalizedRow.name,
    email: normalizedRow.email,
    institution: normalizedRow.institution,
    role: normalizedRow.role,
    status: normalizedRow.status,
    password: normalizedRow.password,
    mustChangePassword: normalizedRow.must_change_password,
    createdAt: normalizedRow.created_at_label,
    lastAccess: normalizedRow.last_access,
  };
}

function toRow(user: AppUser): AuthUserRow {
  return {
    id: user.id,
    name: user.name,
    email: user.email.toLowerCase(),
    institution: user.institution,
    role: user.role,
    status: user.status,
    password: user.password,
    must_change_password: user.mustChangePassword,
    created_at_label: user.createdAt,
    last_access: user.lastAccess,
    updated_at: new Date().toISOString(),
  };
}
