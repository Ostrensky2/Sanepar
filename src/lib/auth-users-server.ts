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

// Aceita o hash bruto ou em base64 — arquivos .env passam por expansão de
// variáveis ($...) que corrompe o formato scrypt$salt$hash se for usado bruto.
export function getPrimaryAdminPasswordHash(): string | null {
  const raw = process.env.PRIMARY_ADMIN_PASSWORD_HASH?.trim();

  if (!raw) {
    return null;
  }

  if (raw.startsWith("scrypt$")) {
    return raw;
  }

  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8").trim();
    return decoded.startsWith("scrypt$") ? decoded : null;
  } catch {
    return null;
  }
}

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
