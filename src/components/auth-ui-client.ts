import type { UserCategory } from "@/lib/access-control";

export const AUTH_SESSION_UPDATED_EVENT = "yvae:auth-session-updated";
export const GENERIC_RECOVERY_MESSAGE =
  "Se o e-mail estiver cadastrado, enviaremos as instruções para redefinição da senha.";

export type AuthUiSession = {
  userId: string;
  name: string;
  email: string;
  role: UserCategory;
};

export type ManagedAuthUser = {
  id: string;
  name: string;
  email: string;
  institution: string;
  role: UserCategory;
  status: "ativo" | "inativo";
  authStatus: "convidado" | "ativo" | "bloqueado";
  createdAt: string;
  lastAccess: string;
};

type SessionPayload = {
  session?: AuthUiSession | null;
  purpose?: "invite" | "recovery" | "authenticated" | null;
  canSetPassword?: boolean;
  mustChangePassword?: boolean;
};

export async function readAuthSession(): Promise<SessionPayload> {
  try {
    const response = await fetch("/api/auth-users/session", { cache: "no-store" });
    if (!response.ok) return { session: null, canSetPassword: false };
    return (await response.json()) as SessionPayload;
  } catch {
    return { session: null, canSetPassword: false };
  }
}

export async function signInWithPassword(email: string, password: string) {
  try {
    const response = await fetch("/api/auth-users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
    });
    const payload = (await response.json().catch(() => ({}))) as SessionPayload;
    return response.ok && payload.session
      ? {
          ok: true as const,
          session: payload.session,
          mustSetPassword: payload.mustChangePassword === true,
        }
      : { ok: false as const };
  } catch {
    return { ok: false as const };
  }
}

export async function requestPasswordRecovery(email: string) {
  try {
    await fetch("/api/auth-users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: email.trim().toLowerCase() }),
    });
  } catch {
    // A resposta pública permanece idêntica para impedir enumeração de contas.
  }
  return GENERIC_RECOVERY_MESSAGE;
}

export async function updateRecoveryPassword(newPassword: string) {
  try {
    const response = await fetch("/api/auth-users/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword }),
    });
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    return response.ok ? { ok: true as const } : { ok: false as const, error: payload.error ?? "Não foi possível atualizar a senha." };
  } catch {
    return { ok: false as const, error: "Não foi possível atualizar a senha." };
  }
}

export async function signOutAuthSession() {
  try {
    await fetch("/api/auth-users/session", { method: "DELETE" });
  } finally {
    window.dispatchEvent(new Event(AUTH_SESSION_UPDATED_EVENT));
  }
}

export async function loadManagedAuthUsers(): Promise<ManagedAuthUser[]> {
  try {
    const response = await fetch("/api/auth-users", { cache: "no-store" });
    if (!response.ok) return [];
    const payload = (await response.json()) as { users?: ManagedAuthUser[] };
    return Array.isArray(payload.users) ? payload.users : [];
  } catch {
    return [];
  }
}

type AdminAuthCommand =
  | { action: "invite"; user: Pick<ManagedAuthUser, "name" | "email" | "role" | "status"> }
  | { action: "resend-invite"; userId: string }
  | { action: "update"; userId: string; patch: Partial<Pick<ManagedAuthUser, "name" | "email" | "role" | "status">> }
  | { action: "delete"; userId: string };

export async function sendAdminAuthCommand(command: AdminAuthCommand) {
  try {
    const response = await fetch("/api/auth-users", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(command),
    });
    return response.ok;
  } catch {
    return false;
  }
}
