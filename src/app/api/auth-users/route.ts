import { NextResponse } from "next/server";
import {
  initialAuthUsers,
  normalizeAuthUsers,
  type AppUser,
} from "@/lib/auth-users";
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

export async function GET() {
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
      { error: "Nao foi possivel consultar usuarios autorizados.", details: error.message },
      { status: 500 },
    );
  }

  if (!data?.length) {
    const { error: seedError } = await supabase
      .from("auth_users")
      .upsert(initialAuthUsers.map(toRow), { onConflict: "id" });

    if (seedError) {
      return NextResponse.json(
        { error: "Nao foi possivel preparar usuarios autorizados na nuvem.", details: seedError.message },
        { status: 500 },
      );
    }

    return NextResponse.json({ users: initialAuthUsers, persistence: "cloud" });
  }

  return NextResponse.json({
    users: normalizeAuthUsers(data.map(fromRow)),
    persistence: "cloud",
  });
}

export async function PUT(request: Request) {
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
    return NextResponse.json({ users, persistence: "browser" });
  }

  const { error } = await supabase
    .from("auth_users")
    .upsert(users.map(toRow), { onConflict: "id" });

  if (error) {
    return NextResponse.json(
      { error: "Nao foi possivel salvar usuarios autorizados na nuvem.", details: error.message },
      { status: 500 },
    );
  }

  return NextResponse.json({ users, persistence: "cloud" });
}

function fromRow(row: AuthUserRow): AppUser {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    institution: row.institution,
    role: row.role,
    status: row.status,
    password: row.password,
    mustChangePassword: row.must_change_password,
    createdAt: row.created_at_label,
    lastAccess: row.last_access,
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
