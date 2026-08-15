import type { UserCategory } from "@/lib/access-control";

export type AppUser = {
  id: string; name: string; email: string; institution: string; role: UserCategory;
  status: "ativo" | "inativo"; mustChangePassword: boolean; createdAt: string; lastAccess: string;
};
export type AuthSession = { userId: string; email: string; name: string; role: UserCategory };

// Compatibilidade temporária para consumidores não-auth. Sessões e usuários nunca
// são reconstruídos de localStorage; a fonte autoritativa é sempre o backend.
export function getStoredSession(): AuthSession | null { return null; }
export function loadAuthUsers(): AppUser[] { return []; }
export async function loadAuthUsersFromSharedStore(): Promise<AppUser[]> {
  const response = await fetch("/api/auth-users", { cache: "no-store" });
  if (!response.ok) return [];
  const payload = await response.json() as { users?: unknown };
  return normalizeAuthUsers(payload.users);
}
export function normalizeAuthUsers(value: unknown): AppUser[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is AppUser => Boolean(item && typeof item === "object" &&
    typeof (item as AppUser).id === "string" && typeof (item as AppUser).email === "string"));
}
