import {
  ACCESS_CATEGORY_COOKIE_NAME,
  normalizeUserCategory,
  userCategories,
  type UserCategory,
} from "@/lib/access-control";

export const INITIAL_PASSWORD = "ATGC26";
const LEGACY_INITIAL_PASSWORDS = ["GIA26"];
export const AUTH_USERS_STORAGE_KEY = "yvae:auth-users";
export const AUTH_SESSION_STORAGE_KEY = "yvae:auth-session";

export type AppUser = {
  id: string;
  name: string;
  email: string;
  institution: string;
  role: UserCategory;
  status: "ativo" | "inativo";
  password: string;
  mustChangePassword: boolean;
  createdAt: string;
  lastAccess: string;
};

export type AuthSession = {
  userId: string;
  email: string;
  name: string;
  role: UserCategory;
};

export const initialAuthUsers: AppUser[] = [
  {
    id: "usr-antonio-ostrensky",
    name: "Antonio Ostrensky",
    email: "ostrensky@ufpr.br",
    institution: "UFPR",
    role: "Admin",
    status: "ativo",
    password: INITIAL_PASSWORD,
    mustChangePassword: true,
    createdAt: "2026-05-19",
    lastAccess: "Primeiro acesso pendente",
  },
  {
    id: "usr-aline-horodesky",
    name: "Aline Horodesky",
    email: "aline.horo@yahoo.com.br",
    institution: "ATGC",
    role: "ATGC",
    status: "ativo",
    password: INITIAL_PASSWORD,
    mustChangePassword: true,
    createdAt: "2026-05-19",
    lastAccess: "Primeiro acesso pendente",
  },
  {
    id: "usr-joao-antonio-galiotto-miranda",
    name: "João Antônio Galiotto Miranda",
    email: "joao.galiotto@ufpr.br",
    institution: "ATGC",
    role: "ATGC",
    status: "ativo",
    password: INITIAL_PASSWORD,
    mustChangePassword: true,
    createdAt: "2026-05-19",
    lastAccess: "Primeiro acesso pendente",
  },
  {
    id: "usr-juliana-beltramin-de-biasi",
    name: "Juliana Beltramin De Biasi",
    email: "jubbiasi@gmail.com",
    institution: "ATGC",
    role: "ATGC",
    status: "ativo",
    password: INITIAL_PASSWORD,
    mustChangePassword: true,
    createdAt: "2026-05-19",
    lastAccess: "Primeiro acesso pendente",
  },
  {
    id: "usr-marcio-roberto-pie",
    name: "Marcio Roberto Pie",
    email: "marcio.pie@gmail.com",
    institution: "UFPR",
    role: "UFPR",
    status: "ativo",
    password: INITIAL_PASSWORD,
    mustChangePassword: true,
    createdAt: "2026-05-19",
    lastAccess: "Primeiro acesso pendente",
  },
  {
    id: "usr-raphael-orelis-ribeiro",
    name: "Raphael Orélis Ribeiro",
    email: "raphael.orelis@gmail.com",
    institution: "UFPR",
    role: "UFPR",
    status: "ativo",
    password: INITIAL_PASSWORD,
    mustChangePassword: true,
    createdAt: "2026-05-19",
    lastAccess: "Primeiro acesso pendente",
  },
  {
    id: "usr-paula-valeska-stica",
    name: "Paula Valeska Stica",
    email: "paula.vska@gmail.com",
    institution: "UFPR",
    role: "UFPR",
    status: "ativo",
    password: INITIAL_PASSWORD,
    mustChangePassword: true,
    createdAt: "2026-05-19",
    lastAccess: "Primeiro acesso pendente",
  },
  {
    id: "usr-vilmar-biernaski",
    name: "Vilmar Biernaski",
    email: "vilmarbiernaski@gmail.com",
    institution: "UFPR",
    role: "UFPR",
    status: "ativo",
    password: INITIAL_PASSWORD,
    mustChangePassword: true,
    createdAt: "2026-05-19",
    lastAccess: "Primeiro acesso pendente",
  },
  {
    id: "usr-otto-samuel-madder-neto",
    name: "Otto Samuel Mädder Neto",
    email: "ottomader@gmail.com",
    institution: "ATGC",
    role: "ATGC",
    status: "ativo",
    password: INITIAL_PASSWORD,
    mustChangePassword: true,
    createdAt: "2026-05-19",
    lastAccess: "Primeiro acesso pendente",
  },
  {
    id: "usr-adriana-de-souza-trigo",
    name: "Adriana de Souza Trigo",
    email: "adrianast@sanepar.com.br",
    institution: "Sanepar",
    role: "Sanepar",
    status: "ativo",
    password: INITIAL_PASSWORD,
    mustChangePassword: true,
    createdAt: "2026-05-19",
    lastAccess: "Primeiro acesso pendente",
  },
  {
    id: "usr-raul-alberto-marcon",
    name: "Raul Alberto Marcon",
    email: "ramarcon@sanepar.com.br",
    institution: "Sanepar",
    role: "Sanepar",
    status: "ativo",
    password: INITIAL_PASSWORD,
    mustChangePassword: true,
    createdAt: "2026-05-19",
    lastAccess: "Primeiro acesso pendente",
  },
];

export function loadAuthUsers() {
  const stored = window.localStorage.getItem(AUTH_USERS_STORAGE_KEY);

  if (!stored) {
    persistAuthUsers(initialAuthUsers);
    return initialAuthUsers;
  }

  try {
    const parsed = JSON.parse(stored) as AppUser[];
    const users = parsed.length > 0 ? parsed : initialAuthUsers;
    const normalizedUsers = users.map(normalizeAuthUser);

    if (JSON.stringify(users) !== JSON.stringify(normalizedUsers)) {
      persistAuthUsers(normalizedUsers);
    }

    return normalizedUsers;
  } catch {
    persistAuthUsers(initialAuthUsers);
    return initialAuthUsers;
  }
}

export async function loadAuthUsersFromSharedStore() {
  const localUsers = loadAuthUsers();

  try {
    const response = await fetch("/api/auth-users", { cache: "no-store" });

    if (!response.ok) {
      return localUsers;
    }

    const payload = (await response.json()) as { users?: unknown; persistence?: string };
    const remoteUsers = normalizeAuthUsers(payload.users);

    if (!remoteUsers.length) {
      return localUsers;
    }

    persistAuthUsersLocal(remoteUsers);
    return remoteUsers;
  } catch {
    return localUsers;
  }
}

export function persistAuthUsers(users: AppUser[]) {
  persistAuthUsersLocal(users);
  return persistAuthUsersToSharedStore(users).then((saved) => {
    window.dispatchEvent(new Event("yvae:auth-users-updated"));
    return saved;
  });
}

export async function persistAuthUsersToSharedStore(users: AppUser[]) {
  try {
    const response = await fetch("/api/auth-users", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ users }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export function getStoredSession() {
  const stored = window.localStorage.getItem(AUTH_SESSION_STORAGE_KEY);

  if (!stored) {
    return null;
  }

  try {
    const session = JSON.parse(stored) as AuthSession;

    return {
      ...session,
      role: normalizeUserCategory(session.role),
    };
  } catch {
    window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
    return null;
  }
}

export function persistSession(session: AuthSession) {
  window.localStorage.setItem(AUTH_SESSION_STORAGE_KEY, JSON.stringify(session));
  window.dispatchEvent(new Event("yvae:auth-session-updated"));
}

export function isInitialPassword(password: string) {
  return password === INITIAL_PASSWORD || LEGACY_INITIAL_PASSWORDS.includes(password);
}

export function clearSession() {
  window.localStorage.removeItem(AUTH_SESSION_STORAGE_KEY);
  document.cookie = `${ACCESS_CATEGORY_COOKIE_NAME}=; path=/; max-age=0; SameSite=Lax`;
  void fetch("/api/auth-users/session", { method: "DELETE", keepalive: true }).catch(() => undefined);
  window.dispatchEvent(new Event("yvae:auth-session-updated"));
}

// Confirma se o cookie de sessão do servidor ainda é válido. Em caso de falha
// de rede assume válido para não derrubar o uso offline.
export async function verifyServerSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth-users/session", { cache: "no-store" });
    return response.ok;
  } catch {
    return true;
  }
}

export type LoginResult =
  | { ok: true; user: AppUser; mustChangePassword: boolean }
  | { ok: false; error: string };

export async function requestLogin(email: string, password: string): Promise<LoginResult> {
  try {
    const response = await fetch("/api/auth-users/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const payload = (await response.json()) as {
      user?: unknown;
      mustChangePassword?: boolean;
      error?: string;
    };

    if (!response.ok || !payload.user) {
      return { ok: false, error: payload.error ?? "Nao foi possivel entrar." };
    }

    const [user] = normalizeAuthUsers([payload.user]);

    if (!user) {
      return { ok: false, error: "Resposta de login invalida." };
    }

    return { ok: true, user, mustChangePassword: Boolean(payload.mustChangePassword) };
  } catch {
    return { ok: false, error: "Sem conexao com o servidor de acesso." };
  }
}

export async function requestPasswordChange(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<LoginResult> {
  try {
    const response = await fetch("/api/auth-users/change-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, currentPassword, newPassword }),
    });
    const payload = (await response.json()) as { user?: unknown; error?: string };

    if (!response.ok || !payload.user) {
      return { ok: false, error: payload.error ?? "Nao foi possivel salvar a senha." };
    }

    const [user] = normalizeAuthUsers([payload.user]);

    if (!user) {
      return { ok: false, error: "Resposta invalida ao salvar a senha." };
    }

    return { ok: true, user, mustChangePassword: false };
  } catch {
    return { ok: false, error: "Sem conexao com o servidor de acesso." };
  }
}

export async function requestPasswordReset(userId: string): Promise<boolean> {
  try {
    const response = await fetch("/api/auth-users/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

function normalizeAuthUser(user: AppUser): AppUser {
  const normalizedRole = normalizeStoredRole(user.role, user.institution);

  return {
    ...user,
    role: normalizedRole,
    institution: normalizeInstitution(user.institution, normalizedRole),
  };
}

export function normalizeAuthUsers(value: unknown): AppUser[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isAppUserLike)
    .map((user) =>
      normalizeAuthUser({
        ...user,
        email: user.email.trim().toLowerCase(),
        password: typeof user.password === "string" ? user.password : "",
        mustChangePassword: Boolean(user.mustChangePassword),
        createdAt: user.createdAt || new Date().toISOString().slice(0, 10),
        lastAccess: user.lastAccess || "Primeiro acesso pendente",
      }),
    );
}

function persistAuthUsersLocal(users: AppUser[]) {
  window.localStorage.setItem(AUTH_USERS_STORAGE_KEY, JSON.stringify(users));
}

function isAppUserLike(value: unknown): value is AppUser {
  if (!value || typeof value !== "object") {
    return false;
  }

  const user = value as Partial<AppUser>;

  return Boolean(
    user.id &&
      user.name &&
      user.email &&
      user.institution &&
      user.role &&
      user.status &&
      typeof user.password === "string",
  );
}

function normalizeStoredRole(role: UserCategory | string, institution: string): UserCategory {
  const normalized = normalizeUserCategory(role);

  if (role === "Usuário" || role === "Usuario" || role === "Usuários") {
    return institutionToCategory(institution) ?? "ATGC";
  }

  return normalized;
}

function institutionToCategory(institution: string): UserCategory | null {
  const normalizedInstitution = institution.trim().toLowerCase();

  return userCategories.find((category) => category.toLowerCase() === normalizedInstitution) ?? null;
}

function normalizeInstitution(institution: string, role: UserCategory) {
  if (role === "Admin") {
    return institution.trim() || "Admin";
  }

  return institutionToCategory(institution) ?? role;
}
