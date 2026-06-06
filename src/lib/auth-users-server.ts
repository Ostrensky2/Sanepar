import type { AppUser } from "@/lib/auth-users";

export type AuthUserRow = {
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

export const PRIMARY_ADMIN_ID = "usr-antonio-ostrensky";
export const PRIMARY_ADMIN_EMAIL = "ostrensky@ufpr.br";
export const PRIMARY_ADMIN_PASSWORD_HASH =
  "scrypt$primary-admin-20260603$26c3ffe9b7d62ac24a4482a214b813441e8c3b14405f95767853830804bec4edeb9a74cac27ce14f3515b8214d25f16220b7f6d769ccf1f4e9632d70554f0691";

export function rowToUser(row: AuthUserRow): AppUser {
  const normalizedRow = normalizePrimaryAdminRow(row);

  return {
    id: normalizedRow.id,
    name: normalizedRow.name,
    email: normalizedRow.email,
    institution: normalizedRow.institution,
    role: normalizedRow.role,
    status: normalizedRow.status,
    password: "",
    mustChangePassword: normalizedRow.must_change_password,
    createdAt: normalizedRow.created_at_label,
    lastAccess: normalizedRow.last_access,
  };
}

export function isPrimaryAdminEmail(email: string) {
  return email.trim().toLowerCase() === PRIMARY_ADMIN_EMAIL;
}

export function isPrimaryAdminRow(row: Pick<AuthUserRow, "id" | "email">) {
  return row.id === PRIMARY_ADMIN_ID || isPrimaryAdminEmail(row.email);
}

export function normalizePrimaryAdminRow(row: AuthUserRow): AuthUserRow {
  if (!isPrimaryAdminRow(row)) {
    return row;
  }

  return {
    ...row,
    id: PRIMARY_ADMIN_ID,
    email: PRIMARY_ADMIN_EMAIL,
    institution: "Admin",
    role: "Admin",
    status: "ativo",
    must_change_password: false,
  };
}

export function formatAccessLabel(): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}
