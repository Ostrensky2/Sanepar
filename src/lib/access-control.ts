export type UserCategory =
  | "Admin"
  | "Sanepar"
  | "UFPR"
  | "ATGC";

export type PrivilegeKey =
  | "dashboard.view"
  | "campaigns.view"
  | "points.view"
  | "data.view"
  | "data.import"
  | "data.delete"
  | "documents.view"
  | "documents.manage"
  | "settings.manage"
  | "backups.manage"
  | "users.manage"
  | "permissions.manage"
  | "settings.buildSync"
  | "settings.activity"
  | "settings.rules"
  | "settings.diagnostics";

export const ACCESS_CATEGORY_STORAGE_KEY = "yvae:access-category";
export const ACCESS_PRIVILEGE_MATRIX_STORAGE_KEY = "yvae:access-privilege-matrix";
export const ACCESS_CATEGORY_COOKIE_NAME = "yvae_access_category";
export const ACCESS_PRIVILEGE_MATRIX_COOKIE_NAME = "yvae_access_privilege_matrix";

export const userCategories: UserCategory[] = [
  "Admin",
  "Sanepar",
  "UFPR",
  "ATGC",
];

export const categoryPrivileges: Record<UserCategory, PrivilegeKey[]> = {
  Admin: [
    "dashboard.view",
    "campaigns.view",
    "points.view",
    "data.view",
    "data.import",
    "data.delete",
    "documents.view",
    "documents.manage",
    "settings.manage",
    "backups.manage",
    "users.manage",
    "permissions.manage",
    "settings.buildSync",
    "settings.activity",
    "settings.rules",
    "settings.diagnostics",
  ],
  Sanepar: [
    "dashboard.view",
    "campaigns.view",
    "points.view",
    "data.view",
    "data.import",
    "documents.view",
    "documents.manage",
    "settings.manage",
    "users.manage",
    "settings.activity",
    "settings.diagnostics",
  ],
  UFPR: [
    "dashboard.view",
    "campaigns.view",
    "points.view",
    "data.view",
    "data.import",
    "documents.view",
    "documents.manage",
  ],
  ATGC: [
    "dashboard.view",
    "campaigns.view",
    "points.view",
    "data.view",
    "documents.view",
  ],
};

export const categoryDescriptions: Record<UserCategory, string> = {
  Admin:
    "Controle total do app, incluindo usuários, backups, importações e exclusões.",
  Sanepar:
    "Coordenação institucional Sanepar com operação ampla, cadastro de pessoas e gestão documental.",
  UFPR:
    "Equipe UFPR com curadoria técnica, importação de dados e gestão documental.",
  ATGC:
    "Equipe ATGC com consulta operacional aos painéis, campanhas, pontos, dados e documentos publicados.",
};

export const privilegeLabels: Record<PrivilegeKey, string> = {
  "dashboard.view": "Visualizar Início",
  "campaigns.view": "Visualizar Campanhas",
  "points.view": "Visualizar Pontos",
  "data.view": "Visualizar Dados",
  "data.import": "Importar planilhas",
  "data.delete": "Excluir planilhas",
  "documents.view": "Visualizar Documentos",
  "documents.manage": "Gerenciar Documentos",
  "settings.manage": "Configurações",
  "backups.manage": "Backups",
  "users.manage": "Usuários e permissões",
  "permissions.manage": "Alterar matriz de permissões",
  "settings.buildSync": "Build e sincronização",
  "settings.activity": "Atividade dos membros",
  "settings.rules": "Regras operacionais",
  "settings.diagnostics": "Diagnóstico",
};

export function hasPrivilege(category: UserCategory, privilege: PrivilegeKey) {
  return getPrivilegeMatrix()[category].includes(privilege);
}

export function getPrivilegeMatrix(): Record<UserCategory, PrivilegeKey[]> {
  if (typeof window === "undefined") {
    return categoryPrivileges;
  }

  const stored = window.localStorage.getItem(ACCESS_PRIVILEGE_MATRIX_STORAGE_KEY);

  if (!stored) {
    return categoryPrivileges;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<Record<UserCategory, PrivilegeKey[]>>;

    return userCategories.reduce(
      (matrix, category) => ({
        ...matrix,
        [category]: normalizePrivilegesForCategory(category, parsed[category]),
      }),
      {} as Record<UserCategory, PrivilegeKey[]>,
    );
  } catch {
    return categoryPrivileges;
  }
}

export function savePrivilegeMatrix(matrix: Record<UserCategory, PrivilegeKey[]>) {
  window.localStorage.setItem(ACCESS_PRIVILEGE_MATRIX_STORAGE_KEY, JSON.stringify(matrix));
  writeCookie(ACCESS_PRIVILEGE_MATRIX_COOKIE_NAME, encodeURIComponent(JSON.stringify(matrix)));
  window.dispatchEvent(new Event("yvae:access-privileges-updated"));
}

export function resetPrivilegeMatrix() {
  window.localStorage.removeItem(ACCESS_PRIVILEGE_MATRIX_STORAGE_KEY);
  writeCookie(ACCESS_PRIVILEGE_MATRIX_COOKIE_NAME, encodeURIComponent(JSON.stringify(categoryPrivileges)));
  window.dispatchEvent(new Event("yvae:access-privileges-updated"));
}

export function syncPrivilegeMatrixCookie() {
  writeCookie(ACCESS_PRIVILEGE_MATRIX_COOKIE_NAME, encodeURIComponent(JSON.stringify(getPrivilegeMatrix())));
}

export function persistAccessCategory(category: UserCategory) {
  window.localStorage.setItem(ACCESS_CATEGORY_STORAGE_KEY, category);
  writeCookie(ACCESS_CATEGORY_COOKIE_NAME, category);
  window.dispatchEvent(new Event("yvae:access-category-updated"));
}

export function normalizeUserCategory(value: string | null | undefined): UserCategory {
  if (value === "Administradores" || value === "Adm Master" || value === "Admin") {
    return "Admin";
  }

  if (value === "Coordenador" || value === "Sanepar") {
    return "Sanepar";
  }

  if (value === "Curador" || value === "UFPR") {
    return "UFPR";
  }

  if (value === "Usuários" || value === "Usuario" || value === "Usuário" || value === "Laboratório" || value === "ATGC") {
    return "ATGC";
  }

  return userCategories.find((category) => category === value) ?? "Admin";
}

export function sanitizePrivileges(privileges: PrivilegeKey[]) {
  const allowed = new Set(Object.keys(privilegeLabels));

  return privileges.filter((privilege) => allowed.has(privilege));
}

export function normalizePrivilegesForCategory(
  category: UserCategory,
  privileges: PrivilegeKey[] | undefined,
) {
  if (category === "Admin") {
    return categoryPrivileges.Admin;
  }

  return sanitizePrivileges(privileges ?? categoryPrivileges[category]);
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=2592000; SameSite=Lax`;
}
