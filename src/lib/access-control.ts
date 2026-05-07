export type UserCategory = "Administradores" | "Sanepar" | "Usuários";

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
  | "users.manage";

export const ACCESS_CATEGORY_STORAGE_KEY = "yvae:access-category";

export const userCategories: UserCategory[] = [
  "Administradores",
  "Sanepar",
  "Usuários",
];

export const categoryPrivileges: Record<UserCategory, PrivilegeKey[]> = {
  Administradores: [
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
  ],
  Sanepar: [
    "dashboard.view",
    "campaigns.view",
    "points.view",
    "data.view",
    "data.import",
    "documents.view",
  ],
  Usuários: [
    "dashboard.view",
    "campaigns.view",
    "points.view",
    "data.view",
    "documents.view",
  ],
};

export const categoryDescriptions: Record<UserCategory, string> = {
  Administradores:
    "Controle total do app, incluindo usuários, backups, importações e exclusões.",
  Sanepar:
    "Operação institucional com consulta ampla e importação de dados, sem exclusões.",
  Usuários:
    "Consulta operacional aos painéis, campanhas, pontos, dados e documentos publicados.",
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
};

export function hasPrivilege(category: UserCategory, privilege: PrivilegeKey) {
  return categoryPrivileges[category].includes(privilege);
}

export function normalizeUserCategory(value: string | null | undefined): UserCategory {
  return userCategories.find((category) => category === value) ?? "Administradores";
}
