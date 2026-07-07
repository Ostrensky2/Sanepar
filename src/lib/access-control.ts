export type UserCategory =
  | "Admin"
  | "Sanepar"
  | "Tecpar"
  | "UFPR"
  | "ATGC";

export type PrivilegeKey =
  | "nav.home"
  | "nav.campaigns"
  | "nav.results"
  | "nav.data"
  | "nav.documents"
  | "nav.requests"
  | "nav.settings"
  | "nav.help"
  | "dashboard.view"
  | "campaigns.view"
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
  "Tecpar",
  "UFPR",
  "ATGC",
];

const generalViewPrivileges: PrivilegeKey[] = [
  "nav.home",
  "nav.campaigns",
  "nav.results",
  "nav.documents",
  "nav.requests",
  "nav.help",
  "dashboard.view",
  "campaigns.view",
  "documents.view",
];

export const categoryPrivileges: Record<UserCategory, PrivilegeKey[]> = {
  Admin: [
    "nav.home",
    "nav.campaigns",
    "nav.results",
    "nav.data",
    "nav.documents",
    "nav.requests",
    "nav.settings",
    "nav.help",
    "dashboard.view",
    "campaigns.view",
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
    "nav.home",
    "nav.campaigns",
    "nav.results",
    "nav.data",
    "nav.documents",
    "nav.requests",
    "nav.settings",
    "nav.help",
    "dashboard.view",
    "campaigns.view",
    "data.view",
    "documents.view",
    "users.manage",
  ],
  Tecpar: [
    "nav.home",
    "nav.campaigns",
    "nav.results",
    "nav.data",
    "nav.documents",
    "nav.requests",
    "nav.settings",
    "nav.help",
    "dashboard.view",
    "campaigns.view",
    "data.view",
    "documents.view",
    "users.manage",
  ],
  UFPR: [
    "nav.home",
    "nav.campaigns",
    "nav.results",
    "nav.data",
    "nav.documents",
    "nav.requests",
    "nav.help",
    "dashboard.view",
    "campaigns.view",
    "data.view",
    "data.import",
    "documents.view",
    "documents.manage",
  ],
  ATGC: [
    "nav.home",
    "nav.campaigns",
    "nav.results",
    "nav.data",
    "nav.documents",
    "nav.requests",
    "nav.settings",
    "nav.help",
    "dashboard.view",
    "campaigns.view",
    "data.view",
    "data.import",
    "data.delete",
    "documents.view",
    "users.manage",
  ],
};

export const categoryDescriptions: Record<UserCategory, string> = {
  Admin:
    "Controle total do app, incluindo usuários, backups, importações e exclusões.",
  Sanepar:
    "Coordenação institucional Sanepar com leitura operacional, Entrada de dados sem edição e cadastro restrito de usuários Sanepar.",
  Tecpar:
    "Coordenação institucional Tecpar com leitura operacional, Entrada de dados sem edição e cadastro restrito de usuários Tecpar.",
  UFPR:
    "Equipe UFPR com curadoria técnica, importação de dados e gestão documental.",
  ATGC:
    "Equipe ATGC com operação da Entrada de dados e cadastro restrito de usuários ATGC.",
};

export const privilegeLabels: Record<PrivilegeKey, string> = {
  "nav.home": "Módulo: Início",
  "nav.campaigns": "Módulo: Campanhas",
  "nav.results": "Módulo: Resultados",
  "nav.data": "Módulo: Entrada de dados",
  "nav.documents": "Módulo: Documentos",
  "nav.requests": "Módulo: Solicitações",
  "nav.settings": "Módulo: Configurações",
  "nav.help": "Módulo: Ajuda",
  "dashboard.view": "Visualizar Início",
  "campaigns.view": "Visualizar Campanhas",
  "data.view": "Visualizar Dados",
  "data.import": "Importar planilhas",
  "data.delete": "Excluir planilhas",
  "documents.view": "Visualizar Documentos",
  "documents.manage": "Gerenciar Documentos",
  "settings.manage": "Configurações",
  "backups.manage": "Backups",
  "users.manage": "Usuários autorizados",
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

  if (value === "Tecpar") {
    return "Tecpar";
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

  return Array.from(new Set(expandLegacyPrivileges(privileges))).filter((privilege) => allowed.has(privilege));
}

export function normalizePrivilegesForCategory(
  category: UserCategory,
  privileges: PrivilegeKey[] | undefined,
) {
  if (category === "Admin") {
    return categoryPrivileges.Admin;
  }

  return sanitizePrivileges([
    ...generalViewPrivileges,
    ...(privileges ?? categoryPrivileges[category]),
  ]);
}

function expandLegacyPrivileges(privileges: PrivilegeKey[]) {
  const expanded = new Set(privileges);

  expanded.add("nav.help");
  expanded.add("nav.requests");
  expanded.add("nav.home");
  expanded.add("nav.campaigns");
  expanded.add("nav.results");
  expanded.add("nav.documents");
  expanded.add("dashboard.view");
  expanded.add("campaigns.view");
  expanded.add("documents.view");

  if (expanded.has("dashboard.view")) {
    expanded.add("nav.home");
  }

  if (expanded.has("campaigns.view")) {
    expanded.add("nav.campaigns");
    expanded.add("nav.results");
  }

  if (expanded.has("data.view")) {
    expanded.add("nav.data");
  }

  if (expanded.has("documents.view")) {
    expanded.add("nav.documents");
  }

  if (expanded.has("settings.manage")) {
    expanded.add("nav.settings");
  }

  if (
    expanded.has("users.manage") ||
    expanded.has("permissions.manage") ||
    expanded.has("backups.manage") ||
    expanded.has("settings.buildSync") ||
    expanded.has("settings.activity") ||
    expanded.has("settings.rules") ||
    expanded.has("settings.diagnostics")
  ) {
    expanded.add("nav.settings");
  }

  return Array.from(expanded);
}

function writeCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=2592000; SameSite=Lax`;
}
